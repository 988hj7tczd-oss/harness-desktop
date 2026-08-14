/**
 * src/chatReducer.ts —— 把 adapter 的稳定 SessionStreamEvent 折叠成聊天消息列表。
 *
 * 这里的输入词汇（SessionStreamEvent / MessageBlock）来自 shared/types.ts，
 * 不依赖 dsh 的任何原始字段。dsh 上游变更只会改 adapter。
 */
import type { ChatMessage, MessageBlock, SessionStreamEvent } from '../shared/types'

export interface ChatState {
  messages: ChatMessage[]
  title: string
  running: boolean
  /** 自增序号，用于给新建消息分配稳定唯一 id（避免 turn/step 重复导致 key 冲突）。 */
  msgSeq: number
}

export const emptyChat: ChatState = {
  messages: [],
  title: '新会话',
  running: false,
  msgSeq: 0,
}

function keyOf(turn: number, step: number): string {
  return `${turn}:${step}`
}

/** 当前正在流式输出的 assistant 消息（同一时刻只有一个）。 */
function streamingMessage(state: ChatState): ChatMessage | undefined {
  return [...state.messages].reverse().find((m) => m.role === 'assistant' && m.status === 'streaming')
}

/** 最近一条乐观用户消息（id 以 opt- 开头）；有则替换为真实消息避免重复。 */
function latestOptimisticUser(state: ChatState): ChatMessage | undefined {
  return [...state.messages].reverse().find((m) => m.role === 'user' && m.id.startsWith('opt-'))
}

function updateStreamingBlock(
  blocks: MessageBlock[],
  reasoning: boolean,
  delta: string,
): MessageBlock[] {
  const targetType = reasoning ? 'reasoning' : 'text'
  const idx = blocks.findIndex((b) => b.type === targetType)
  if (idx === -1) {
    return [...blocks, { type: targetType, text: delta }]
  }
  const target = blocks[idx]
  if (target.type !== targetType) return blocks
  const next = [...blocks]
  next[idx] = { ...target, text: target.text + delta }
  return next
}

export function chatReducer(state: ChatState, evt: SessionStreamEvent): ChatState {
  switch (evt.kind) {
    case 'user-message': {
      const real: ChatMessage = {
        id: evt.message.id,
        role: 'user',
        blocks: evt.message.blocks.length ? evt.message.blocks : [{ type: 'text', text: '' }],
        status: 'complete',
      }
      // 乐观用户消息去重：存在 opt- 消息则替换（同一轮发送），否则 append
      const optimistic = latestOptimisticUser(state)
      if (optimistic) {
        const idx = state.messages.findIndex((m) => m.id === optimistic.id)
        const next = [...state.messages]
        next[idx] = real
        return { ...state, messages: next }
      }
      return { ...state, messages: [...state.messages, real] }
    }

    case 'optimistic-user': {
      const msg: ChatMessage = {
        id: evt.id,
        role: 'user',
        blocks: [{ type: 'text', text: evt.text }],
        status: 'complete',
      }
      return { ...state, messages: [...state.messages, msg] }
    }

    case 'assistant-start': {
      const key = keyOf(evt.turn, evt.step)
      // 同一 turn/step 已处于流式输出 → 幂等
      const existing = streamingMessage(state)
      if (existing && existing.id.startsWith(`a-${key}-`)) return { ...state, running: true }
      const msg: ChatMessage = {
        id: `a-${key}-${state.msgSeq}`,
        role: 'assistant',
        blocks: [{ type: 'text', text: '' }],
        status: 'streaming',
      }
      return { ...state, messages: [...state.messages, msg], running: true, msgSeq: state.msgSeq + 1 }
    }

    case 'assistant-delta': {
      const msg = streamingMessage(state)
      if (!msg) return state
      const blocks = updateStreamingBlock(msg.blocks, evt.reasoning ?? false, evt.text)
      const idx = state.messages.findIndex((m) => m.id === msg.id)
      const next = [...state.messages]
      next[idx] = { ...msg, blocks }
      return { ...state, messages: next }
    }

    case 'assistant-end': {
      const msg = streamingMessage(state)
      const finalBlocks = evt.message.blocks.length ? evt.message.blocks : []
      let blocks = finalBlocks
      if (evt.error) {
        blocks = [...blocks, { type: 'text' as const, text: `\n\n错误：${evt.error}` }]
      }
      if (!msg) {
        const newMsg: ChatMessage = {
          id: `a-${state.msgSeq}`,
          role: 'assistant',
          blocks: blocks.length ? blocks : [{ type: 'text', text: '' }],
          status: evt.error ? 'error' : 'complete',
          error: evt.error,
        }
        return { ...state, messages: [...state.messages, newMsg], running: false, msgSeq: state.msgSeq + 1 }
      }
      const idx = state.messages.findIndex((m) => m.id === msg.id)
      const next = [...state.messages]
      next[idx] = {
        ...msg,
        blocks: blocks.length ? blocks : msg.blocks,
        status: evt.error ? 'error' : 'complete',
        error: evt.error,
      }
      return { ...state, messages: next, running: false }
    }

    case 'tool-call': {
      const block: MessageBlock = {
        type: 'tool-call',
        id: evt.callId,
        name: evt.name,
        arguments: evt.arguments,
      }
      const msg = state.messages[state.messages.length - 1]
      if (!msg || msg.role !== 'assistant') {
        return {
          ...state,
          messages: [
            ...state.messages,
            { id: `t-${evt.callId}-${state.msgSeq}`, role: 'assistant', blocks: [block], status: 'streaming' },
          ],
          msgSeq: state.msgSeq + 1,
        }
      }
      const next = [...state.messages]
      next[next.length - 1] = { ...msg, blocks: [...msg.blocks, block] }
      return { ...state, messages: next }
    }

    case 'tool-result': {
      const callId = evt.callId
      const idx = state.messages.findIndex((m) =>
        m.blocks.some((b) => b.type === 'tool-call' && b.id === callId),
      )
      if (idx === -1) return state
      const msg = state.messages[idx]
      const blocks = [...msg.blocks]
      const callIdx = blocks.findIndex((b) => b.type === 'tool-call' && b.id === callId)
      const resultBlock: MessageBlock = {
        type: 'tool-result',
        callId,
        content: evt.content,
        isError: evt.isError,
      }
      blocks.splice(callIdx + 1, 0, resultBlock)
      const next = [...state.messages]
      next[idx] = { ...msg, blocks }
      return { ...state, messages: next }
    }

    case 'title':
      return { ...state, title: evt.title || state.title }

    case 'running':
      return { ...state, running: evt.running }

    case 'session-subscribed':
    case 'projection':
    default:
      return state
  }
}
