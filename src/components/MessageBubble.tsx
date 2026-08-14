import { useState } from 'react'
import type { ChatMessage, MessageBlock } from '../../shared/types'

function BlockView({ block, streaming }: { block: MessageBlock; streaming: boolean }) {
  switch (block.type) {
    case 'text':
      return <div className="block-text">{renderInline(block.text)}</div>
    case 'reasoning':
      return (
        <div className={`block-reasoning ${streaming ? 'streaming' : ''}`}>
          <span className="reasoning-label">思考中</span>
          {block.text}
        </div>
      )
    case 'tool-call':
      return <ToolCallCard name={block.name} arguments={block.arguments} />
    case 'tool-result':
      return (
        <details className="tool-result-card" open={false}>
          <summary>
            {block.isError ? '工具执行失败' : '工具返回'}
          </summary>
          <pre className="tool-result-body">
            {block.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n').slice(0, 2000)}
          </pre>
        </details>
      )
    default:
      return null
  }
}

function renderInline(text: string) {
  return text
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

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-bubble">
        {message.blocks.map((b, i) => (
          <BlockView key={i} block={b} streaming={message.status === 'streaming'} />
        ))}
        {message.status === 'streaming' && <span className="stream-caret" />}
      </div>
    </div>
  )
}
