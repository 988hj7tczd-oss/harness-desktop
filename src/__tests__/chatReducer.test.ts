import { describe, expect, it } from 'vitest'
import { chatReducer, emptyChat } from '../chatReducer'
import type { SessionStreamEvent } from '../../shared/types'

describe('chatReducer', () => {
  describe('乐观消息去重', () => {
    it('乐观 user 消息先上屏，dsh user-message 到达后替换不重复', () => {
      let state = emptyChat
      state = chatReducer(state, {
        kind: 'optimistic-user',
        sessionId: 's1',
        id: 'opt-abc',
        text: '你好',
      })
      expect(state.messages).toHaveLength(1)
      expect(state.messages[0].id).toBe('opt-abc')
      expect(state.messages[0].role).toBe('user')

      state = chatReducer(state, {
        kind: 'user-message',
        sessionId: 's1',
        seq: 1,
        message: { id: 'real-1', blocks: [{ type: 'text', text: '你好' }] },
      })
      // 替换而非新增
      expect(state.messages).toHaveLength(1)
      expect(state.messages[0].id).toBe('real-1')
      expect(state.messages[0].role).toBe('user')
    })

    it('无乐观消息时 user-message 直接追加', () => {
      let state = emptyChat
      state = chatReducer(state, {
        kind: 'user-message',
        sessionId: 's1',
        seq: 1,
        message: { id: 'real-1', blocks: [{ type: 'text', text: 'hi' }] },
      })
      expect(state.messages).toHaveLength(1)
      expect(state.messages[0].id).toBe('real-1')
    })

    it('replace-user-text 本地替换用户消息文本', () => {
      let state = emptyChat
      state = chatReducer(state, {
        kind: 'user-message',
        sessionId: 's1',
        seq: 1,
        message: { id: 'u1', blocks: [{ type: 'text', text: '原文本' }] },
      })
      state = chatReducer(state, {
        kind: 'replace-user-text',
        sessionId: 's1',
        messageId: 'u1',
        text: '编辑后文本',
      })
      expect(state.messages[0].blocks[0]).toMatchObject({ type: 'text', text: '编辑后文本' })
      expect(state.messages).toHaveLength(1)
    })

    it('编辑重发去重：末条用户消息文本相同则替换不新增（#8）', () => {
      let state = emptyChat
      // 编辑后重发，dsh 产生新 user-message（新 id 同文本）
      state = chatReducer(state, {
        kind: 'user-message',
        sessionId: 's1',
        seq: 1,
        message: { id: 'u1', blocks: [{ type: 'text', text: '改后的内容' }] },
      })
      state = chatReducer(state, {
        kind: 'user-message',
        sessionId: 's1',
        seq: 5,
        message: { id: 'u2', blocks: [{ type: 'text', text: '改后的内容' }] },
      })
      expect(state.messages).toHaveLength(1)
      expect(state.messages[0].id).toBe('u2')
    })
  })

  describe('assistant 流式归并', () => {
    it('start → delta(逐字) → end 归并为一条 complete 消息', () => {
      let state = emptyChat
      state = chatReducer(state, {
        kind: 'assistant-start',
        sessionId: 's1',
        seq: 2,
        turn: 1,
        step: 1,
      })
      expect(state.running).toBe(true)
      expect(state.messages).toHaveLength(1)
      expect(state.messages[0].status).toBe('streaming')

      state = chatReducer(state, {
        kind: 'assistant-delta',
        sessionId: 's1',
        seq: 3,
        turn: 1,
        step: 1,
        text: '你',
      })
      state = chatReducer(state, {
        kind: 'assistant-delta',
        sessionId: 's1',
        seq: 4,
        turn: 1,
        step: 1,
        text: '好',
      })
      const streaming = state.messages[0]
      const text = streaming.blocks.find((b) => b.type === 'text')
      expect(text?.type === 'text' && text.text).toBe('你好')

      state = chatReducer(state, {
        kind: 'assistant-end',
        sessionId: 's1',
        seq: 5,
        turn: 1,
        step: 1,
        message: { id: 'a-1-1', blocks: [{ type: 'text', text: '你好' }] },
      })
      expect(state.running).toBe(false)
      expect(state.messages[0].status).toBe('complete')
    })

    it('reasoning delta 进 reasoning 块', () => {
      let state = emptyChat
      state = chatReducer(state, { kind: 'assistant-start', sessionId: 's1', seq: 1, turn: 1, step: 1 })
      state = chatReducer(state, {
        kind: 'assistant-delta',
        sessionId: 's1',
        seq: 2,
        turn: 1,
        step: 1,
        text: '思考中',
        reasoning: true,
      })
      const blocks = state.messages[0].blocks
      expect(blocks.some((b) => b.type === 'reasoning' && b.text === '思考中')).toBe(true)
    })

    it('错误事件 → 消息标 error', () => {
      let state = emptyChat
      state = chatReducer(state, { kind: 'assistant-start', sessionId: 's1', seq: 1, turn: 1, step: 1 })
      state = chatReducer(state, {
        kind: 'assistant-end',
        sessionId: 's1',
        seq: 2,
        turn: 1,
        step: 1,
        message: { id: 'a-1-1', blocks: [] },
        error: '模型不可用',
      })
      expect(state.messages[0].status).toBe('error')
    })
  })

  describe('工具调用卡片', () => {
    it('tool-call 追加卡片，tool-result 跟结果', () => {
      let state = emptyChat
      state = chatReducer(state, { kind: 'assistant-start', sessionId: 's1', seq: 1, turn: 1, step: 1 })
      state = chatReducer(state, {
        kind: 'tool-call',
        sessionId: 's1',
        seq: 2,
        callId: 'c1',
        name: 'bash',
        arguments: 'ls',
      })
      const hasCall = state.messages[0].blocks.some((b) => b.type === 'tool-call' && b.id === 'c1')
      expect(hasCall).toBe(true)

      state = chatReducer(state, {
        kind: 'tool-result',
        sessionId: 's1',
        seq: 3,
        callId: 'c1',
        content: [{ type: 'text', text: '文件列表' }],
        isError: false,
      })
      const hasResult = state.messages[0].blocks.some(
        (b) => b.type === 'tool-result' && b.callId === 'c1' && !b.isError,
      )
      expect(hasResult).toBe(true)
    })
  })

  it('title / running 事件更新状态', () => {
    let state = emptyChat
    state = chatReducer(state, { kind: 'title', sessionId: 's1', seq: 1, title: '新标题' })
    expect(state.title).toBe('新标题')
    state = chatReducer(state, { kind: 'running', sessionId: 's1', running: true })
    expect(state.running).toBe(true)
  })

  it('未识别事件安全忽略', () => {
    const evt = { kind: 'projection', sessionId: 's1', seq: 1, key: 'x', value: 1 } as SessionStreamEvent
    const state = chatReducer(emptyChat, evt)
    expect(state).toEqual(emptyChat)
  })
})
