import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentPresetInfo, ModelGroup, PickedFile } from '../../shared/types'
import { chatReducer, emptyChat, type ChatState } from '../chatReducer'
import { subscribeSession } from '../bus'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import WhaleLogo from './WhaleLogo'

const harness = window.harness

interface Props {
  sessionId: string | null
  onTitleChange: () => void
  modelsTick?: number
  workspaceCwd: string | null
  mode: string
  onModeChange: (mode: string) => void
  onChangeWorkspace: () => void
  apiKeyMissing: boolean
  onOpenSettings: () => void
  onTaskCreated: (sessionId: string, title: string) => void
  /** 空状态创建会话成功后通知父级激活（setActiveId + 刷新列表）。 */
  onSessionCreated: (sessionId: string) => void
}

export default function ChatView({ sessionId, onTitleChange, modelsTick, workspaceCwd, mode, onModeChange, onChangeWorkspace, apiKeyMissing, onOpenSettings, onTaskCreated, onSessionCreated }: Props) {
  const [chat, setChat] = useState<ChatState>(emptyChat)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<ModelGroup[]>([])
  const [selection, setSelection] = useState<{ provider: string; model: string } | null>(null)
  const [presets, setPresets] = useState<AgentPresetInfo[]>([])
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState<PickedFile[]>([])
  const chatRef = useRef(chat)
  chatRef.current = chat

  // 模型目录 + 预设（不依赖会话：空状态首页也要用；modelsTick 变化时刷新）
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [modelRes, presetRes] = await Promise.all([
        harness.listModels(),
        harness.listAgentPresets(),
      ])
      if (!alive) return
      if (modelRes.ok) {
        setModels(modelRes.value!)
        setSelection((prev) => {
          if (prev) return prev
          const group = modelRes.value!.find((g) => g.models.length > 0)
          const first = group?.models[0]
          return group && first ? { provider: group.id, model: first.id } : null
        })
      }
      if (presetRes.ok) setPresets(presetRes.value!)
    })()
    return () => {
      alive = false
    }
  }, [modelsTick])

  // 加载历史 + 订阅事件
  useEffect(() => {
    if (!sessionId) {
      setChat(emptyChat)
      setAttachments([])
      return
    }
    let alive = true
    setChat(emptyChat)
    setAttachments([])
    setLoading(true)
    setError(null)

    ;(async () => {
      const histRes = await harness.getHistory(sessionId)
      if (!alive) return
      if (histRes.ok) {
        let state = emptyChat
        for (const evt of histRes.value!.events) state = chatReducer(state, evt)
        setChat(state)
      } else {
        setError(histRes.error?.message ?? '历史加载失败')
      }
      setLoading(false)
    })()

    const off = subscribeSession(sessionId, (evt) => {
      setChat((prev) => chatReducer(prev, evt))
      if (evt.kind === 'title') onTitleChange()
    })
    return () => {
      alive = false
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const sendMessage = useCallback(
    async (text: string, files: PickedFile[]) => {
      if (!sessionId || sending) return
      // 乐观 UI：用户消息立即上屏（dsh 的 user-message 到达后由 reducer 替换，避免重复）
      const optId = `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      setChat((prev) =>
        chatReducer(prev, { kind: 'optimistic-user', sessionId, id: optId, text }),
      )
      setSending(true)
      setError(null)
      // 一条消息 = 一个任务（即时出现在任务面板）
      onTaskCreated(sessionId, text)
      const res = await harness.sendMessage(sessionId, text, files)
      if (!res.ok) setError(res.error?.message ?? '发送失败')
      setSending(false)
    },
    [sessionId, sending, onTaskCreated],
  )

  // 空状态一步完成：创建会话 → 激活 → 发消息
  const sendFromEmpty = useCallback(
    async (text: string, files: PickedFile[]) => {
      if (sending) return
      setSending(true)
      setError(null)
      try {
        const created = await harness.createSession(workspaceCwd ?? undefined, mode)
        if (!created.ok) {
          setError(created.error?.message ?? '创建会话失败')
          setSending(false)
          return
        }
        const newId = created.value!.sessionId
        // 应用空状态选中的模型（尽力而为）
        if (selection) {
          try {
            await harness.selectModel(newId, selection.provider, selection.model)
          } catch {
            // 模型应用失败不阻塞
          }
        }
        onSessionCreated(newId)
        onTaskCreated(newId, text)
        // 乐观 UI：切到新会话后立即上屏用户消息
        const optId = `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
        setChat((prev) =>
          chatReducer(prev, { kind: 'optimistic-user', sessionId: newId, id: optId, text }),
        )
        await harness.sendMessage(newId, text, files)
      } catch (err) {
        setError((err as Error).message ?? '发送失败')
      }
      setSending(false)
    },
    [sending, workspaceCwd, mode, selection, onSessionCreated, onTaskCreated],
  )

  const cancelTurn = useCallback(async () => {
    if (!sessionId) return
    await harness.cancelTurn(sessionId)
  }, [sessionId])

  const onSelectModel = useCallback(
    async (provider: string, model: string) => {
      if (!sessionId) return
      setSelection({ provider, model })
      await harness.selectModel(sessionId, provider, model)
    },
    [sessionId],
  )

  const onSelectMode = useCallback(
    async (nextMode: string) => {
      if (!sessionId || nextMode === mode) return
      setError(null)
      const res = await harness.selectAgentPreset(sessionId, nextMode)
      if (res.ok) {
        onModeChange(nextMode)
      } else {
        setError(res.error?.message ?? '切换模式失败')
      }
    },
    [sessionId, mode, onModeChange],
  )

  if (!sessionId) {
    return (
      <main className="chat-empty">
        <div className="chat-empty-hero">
          <WhaleLogo className="chat-empty-logo" />
          <h2>开始对话</h2>
          <p>点击下方输入框直接开始，或左侧「新会话」新建会话。</p>
        </div>
        <div className="chat-empty-composer">
          <ChatInput
            onSend={sendFromEmpty}
            disabled={sending}
            running={false}
            modelGroups={models}
            selection={selection}
            onSelectModel={(provider, model) => setSelection({ provider, model })}
            presets={presets}
            mode={mode}
            onSelectMode={(nextMode) => onModeChange(nextMode)}
            workspaceCwd={workspaceCwd}
            onChangeWorkspace={onChangeWorkspace}
            apiKeyMissing={apiKeyMissing}
            onOpenSettings={onOpenSettings}
            attachments={attachments}
            onAddFiles={(files) => setAttachments((prev) => [...prev, ...files])}
            onRemoveFile={(path) => setAttachments((prev) => prev.filter((f) => f.path !== path))}
          />
          {error && <div className="chat-error">{error}</div>}
        </div>
      </main>
    )
  }

  return (
    <main className="chat-view">
      <header className="chat-header">
        <div className="chat-title">{chat.title || '新会话'}</div>
        <div className="chat-header-right">
          {chat.running && (
            <button className="btn danger small" onClick={cancelTurn}>
              停止
            </button>
          )}
        </div>
      </header>

      {error && <div className="chat-error">{error}</div>}

      <MessageList messages={chat.messages} running={chat.running} loading={loading} />

      <ChatInput
        onSend={sendMessage}
        disabled={sending}
        running={chat.running}
        modelGroups={models}
        selection={selection}
        onSelectModel={onSelectModel}
        presets={presets}
        mode={mode}
        onSelectMode={onSelectMode}
        workspaceCwd={workspaceCwd}
        onChangeWorkspace={onChangeWorkspace}
        apiKeyMissing={apiKeyMissing}
        onOpenSettings={onOpenSettings}
        attachments={attachments}
        onAddFiles={(files) => setAttachments((prev) => [...prev, ...files])}
        onRemoveFile={(path) => setAttachments((prev) => prev.filter((f) => f.path !== path))}
      />
    </main>
  )
}
