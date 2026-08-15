import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../shared/types'
import MessageBubble from './MessageBubble'

interface Props {
  messages: ChatMessage[]
  running: boolean
  loading: boolean
  onEdit?: (messageId: string, newText: string) => void
  onRegenerate?: (messageId: string) => void
}

const STEP = 200
const HARD_CAP = 500

export default function MessageList({ messages, running, loading, onEdit, onRegenerate }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  // 可视窗口起点：默认只看最近一批，超长会话防止 DOM 爆炸
  const [windowStart, setWindowStart] = useState(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, running])

  if (loading) {
    return (
      <div className="message-list">
        <div className="chat-hint">加载历史…</div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="message-list">
        <div className="chat-hint">
          我是基于 DeepSeek Harness 的智能助手。
          <br />
          可以帮你写代码、读文件、执行命令、处理项目。
        </div>
      </div>
    )
  }

  const total = messages.length
  // 渲染上限：最多渲染最近 HARD_CAP 条；加上"加载更早"增量回看
  const maxStart = Math.max(0, total - HARD_CAP)
  const start = Math.min(windowStart, maxStart)
  const visible = messages.slice(start)
  const hiddenBefore = total - visible.length

  const loadEarlier = () => {
    setWindowStart((cur) => Math.max(0, cur - STEP))
  }

  return (
    <div className="message-list">
      {hiddenBefore > 0 && (
        <button className="load-earlier-btn" onClick={loadEarlier}>
          显示更早消息（还有 {hiddenBefore} 条）
        </button>
      )}
      {visible.map((m) => (
        <MessageBubble key={m.id} message={m} onEdit={onEdit} onRegenerate={onRegenerate} />
      ))}
      {running && (
        <div className="typing-indicator">
          <span />
          <span />
          <span />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
