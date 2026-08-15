import { useState } from 'react'
import type { TrajectoryTurn } from '../trajectory'

interface Props {
  turns: TrajectoryTurn[]
}

function fmtMs(ms?: number): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  return `${Math.round(ms / 1000)}s`
}

function NodeIcon({ type }: { type: string }) {
  // 纯 CSS 色点，不用 emoji
  return <span className={`traj-node-icon traj-node-${type}`} />
}

function TrajectoryNodeView({ node }: { node: TrajectoryTurn['nodes'][number] }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasDetail = Boolean(node.detail)
  const copyText = node.detail ?? node.summary ?? node.label

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className={`traj-node ${node.status ?? ''} ${node.isError ? 'error' : ''}`}>
      <NodeIcon type={node.type} />
      <div className="traj-node-main">
        <div className="traj-node-head">
          <span className="traj-node-label">{node.label}</span>
          {node.status === 'failed' && <span className="traj-node-status failed">失败</span>}
          {node.status === 'done' && node.type === 'tool' && <span className="traj-node-status ok">成功</span>}
        </div>
        {node.summary && <div className="traj-node-summary">{node.summary.slice(0, 200)}</div>}
        <div className="traj-node-actions">
          <button className="traj-node-action" onClick={copy}>
            {copied ? '已复制' : '复制'}
          </button>
          {hasDetail && (
            <button className="traj-node-action" onClick={() => setOpen((o) => !o)}>
              {open ? '收起' : '展开'}
            </button>
          )}
        </div>
        {open && hasDetail && <pre className="traj-node-detail">{node.detail}</pre>}
      </div>
    </div>
  )
}

function TrajectoryTurnView({ turn }: { turn: TrajectoryTurn }) {
  const [open, setOpen] = useState(turn.nodes.length > 0 && turn.result === undefined)
  const duration = turn.startAt && turn.endAt ? turn.endAt - turn.startAt : undefined
  return (
    <div className="traj-turn">
      <button className="traj-turn-head" onClick={() => setOpen((o) => !o)}>
        <span className="traj-turn-label">回合 {turn.turn}</span>
        <span className="traj-turn-meta mono">
          {turn.nodes.length} 节点 · {turn.toolCount} 工具 · {turn.stepCount} 步
          {duration ? ` · ${fmtMs(duration)}` : ''}
          {turn.result === 'error' ? ' · 错误' : turn.result === 'stopped' ? ' · 已停止' : ''}
        </span>
      </button>
      {open && (
        <div className="traj-turn-body">
          {turn.nodes.map((n, i) => (
            <TrajectoryNodeView key={i} node={n} />
          ))}
          {turn.error && <div className="traj-turn-error">错误：{turn.error}</div>}
          {turn.usage && (turn.usage.inputTokens !== undefined || turn.usage.outputTokens !== undefined) && (
            <div className="traj-turn-usage mono">
              tokens：入 {turn.usage.inputTokens ?? '-'} / 出 {turn.usage.outputTokens ?? '-'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 会话轨迹面板：按回合展示 agent 执行时间线。 */
export default function TrajectoryPanel({ turns }: Props) {
  if (turns.length === 0) {
    return (
      <div className="traj-panel traj-empty">
        <div>还没有执行轨迹</div>
        <div className="hint">发送一条消息，这里会展示 agent 的思考 / 步骤 / 工具调用过程。</div>
      </div>
    )
  }
  return (
    <div className="traj-panel">
      {turns.map((t) => (
        <TrajectoryTurnView key={t.turn} turn={t} />
      ))}
    </div>
  )
}
