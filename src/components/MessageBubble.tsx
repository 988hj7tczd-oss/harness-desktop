import { useState } from 'react'
import type { ChatMessage, MessageBlock } from '../../shared/types'

function BlockView({ block, streaming }: { block: MessageBlock; streaming: boolean }) {
  switch (block.type) {
    case 'text':
      return <div className="block-text">{renderInline(block.text)}</div>
    case 'reasoning':
      return <ReasoningRow text={block.text} streaming={streaming} />
    case 'tool-call':
      return <ToolCallCard name={block.name} arguments={block.arguments} />
    case 'tool-result':
      return (
        <details className="tool-result-card" open={false}>
          <summary>{block.isError ? '工具执行失败' : '工具返回'}</summary>
          <pre className="tool-result-body">
            {block.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n').slice(0, 2000)}
          </pre>
        </details>
      )
    default:
      return null
  }
}

/** 思考行：紧凑折叠（对齐官方 ReasoningRow 的 Think disclosure）。 */
function ReasoningRow({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false)
  const firstLine = text.trim().split('\n')[0] ?? ''
  const summary = streaming ? text.trim().slice(-60) : firstLine
  return (
    <div className={`reasoning-row ${streaming ? 'running' : ''}`} data-open={open || undefined}>
      <button className="reasoning-row-head" onClick={() => setOpen((o) => !o)}>
        <span className="reasoning-row-icon" />
        <span className="reasoning-row-title">思考{streaming ? '中' : ''}</span>
        <span className="reasoning-row-summary">{summary}</span>
      </button>
      {open && <div className="reasoning-row-body">{text}</div>}
    </div>
  )
}

/** 轻量 markdown：代码块 + 行内代码 + 粗体/链接，不引库。 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  // 代码块 ```lang ... ```
  const codeBlockRe = /```([\w+-]*)\n([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = codeBlockRe.exec(text)) !== null) {
    if (m.index > last) parts.push(renderInlineText(text.slice(last, m.index)))
    parts.push(
      <pre key={`cb${key++}`} className="md-code-block">
        <code>{m[2]}</code>
      </pre>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(renderInlineText(text.slice(last)))
  return <>{parts}</>
}

function renderInlineText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  // 行内代码 `...`
  const inlineRe = /`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = inlineRe.exec(text)) !== null) {
    if (m.index > last) parts.push(renderBoldAndLink(text.slice(last, m.index)))
    parts.push(
      <code key={`ic${k++}`} className="md-inline-code">
        {m[1]}
      </code>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(renderBoldAndLink(text.slice(last)))
  return <>{parts}</>
}

function renderBoldAndLink(text: string): React.ReactNode {
  // 粗体 **...**
  const parts: React.ReactNode[] = []
  const boldRe = /\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <strong key={`b${k}`}>{m[1]}</strong>,
    )
    last = m.index + m[0].length
    k++
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function ToolCallCard({ name, arguments: args }: { name: string; arguments: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="tool-call-card">
      <button className="tool-call-header" onClick={() => setOpen((o) => !o)}>
        <span className="tool-call-name">{name}</span>
        <span className="tool-call-toggle">{open ? '收起' : '展开'}</span>
      </button>
      {open && <pre className="tool-call-args">{args}</pre>}
    </div>
  )
}

/** 整条消息的纯文本（含代码块）。用于复制。 */
function messageText(message: ChatMessage): string {
  const lines: string[] = []
  for (const b of message.blocks) {
    if (b.type === 'text' || b.type === 'reasoning') lines.push(b.text)
    else if (b.type === 'tool-call') lines.push(`[工具] ${b.name}\n${b.arguments}`)
    else if (b.type === 'tool-result') {
      const txt = b.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n')
      lines.push(`[工具结果] ${txt.slice(0, 2000)}`)
    }
  }
  return lines.join('\n')
}

interface Props {
  message: ChatMessage
  onEdit?: (messageId: string, newText: string) => void
  onRegenerate?: (messageId: string) => void
}

export default function MessageBubble({ message, onEdit, onRegenerate }: Props) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.blocks.find((b) => b.type === 'text')?.text ?? '')
  const [editError, setEditError] = useState<string | null>(null)
  const streaming = message.status === 'streaming'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(messageText(message))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const confirmEdit = () => {
    const t = editText.trim()
    if (!t) {
      setEditError('内容不能为空')
      return
    }
    setEditError(null)
    onEdit?.(message.id, t)
    setEditText(t)
    setEditing(false)
  }

  const cancelEdit = () => {
    setEditText(message.blocks.find((b) => b.type === 'text')?.text ?? '')
    setEditError(null)
    setEditing(false)
  }

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-bubble">
        {editing && isUser ? (
          <div className="message-edit-box">
            <textarea
              className="message-edit-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              autoFocus
            />
            {editError && <div className="message-edit-error">{editError}</div>}
            <div className="message-edit-actions">
              <button className="btn primary small" onClick={confirmEdit}>
                保存
              </button>
              <button className="btn small" onClick={cancelEdit}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            {message.blocks.map((b, i) => (
              <BlockView key={i} block={b} streaming={streaming} />
            ))}
            {streaming && <span className="stream-caret" />}
            {message.status === 'error' && message.error && (
              <div className="message-error-line">错误：{message.error}</div>
            )}
          </>
        )}
      </div>

      {!editing && (
        <div className={`message-actions ${isUser ? 'left' : ''}`}>
          <button className="msg-action-btn" title="复制" onClick={copy}>
            {copied ? '已复制' : '复制'}
          </button>
          {isUser && onEdit && message.status !== 'streaming' && (
            <button className="msg-action-btn" title="编辑" onClick={() => setEditing(true)}>
              编辑
            </button>
          )}
          {!isUser && onRegenerate && message.status !== 'streaming' && (
            <button className="msg-action-btn" title="重新生成" onClick={() => onRegenerate(message.id)}>
              重新生成
            </button>
          )}
        </div>
      )}
    </div>
  )
}
