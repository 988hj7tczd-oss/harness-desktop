import { useState } from 'react'
import type { TaskRecord } from '../../shared/types'
import WhaleLogo from './WhaleLogo'

interface Props {
  tasks: TaskRecord[]
  onRetry: (taskId: string) => void
  onReview: (sessionId: string, title: string) => void
}

const STATUS_LABEL: Record<TaskRecord['status'], string> = {
  queued: '排队中',
  running: '进行中',
  done: '已完成',
  failed: '失败',
}

function fmtTime(ts: number | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function duration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 6000) / 10}min`
}

/** 任务面板：任务追踪 / 进展 / 摘要 / 重试 / 复盘。 */
export default function TaskPanel({ tasks, onRetry, onReview }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (tasks.length === 0) {
    return (
      <main className="task-panel">
        <header className="task-header">
          <div className="task-title">任务</div>
          <span className="hint">任务 → 完成 → 复盘 → 技能沉淀</span>
        </header>
        <div className="task-empty">
          <WhaleLogo className="task-empty-logo" />
          <h2>还没有任务</h2>
          <p>在聊天区发一句话就是一个任务，例如：</p>
          <div className="task-suggestion">试试对我说：整理这个项目的 TODO</div>
        </div>
      </main>
    )
  }

  return (
    <main className="task-panel">
      <header className="task-header">
        <div className="task-title">任务</div>
        <span className="hint">{tasks.length} 个任务</span>
      </header>
      <div className="task-list">
        {tasks.map((t) => (
          <div key={t.id} className={`task-card ${t.status}`}>
            <div className="task-card-main">
              <div className="task-card-top">
                <span className={`task-status task-status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                <span className="task-title-text">{t.title}</span>
              </div>
              <div className="task-meta mono">
                {fmtTime(t.startedAt)}
                {t.endedAt ? ` · 耗时 ${duration(t.endedAt - t.startedAt)}` : ''}
                {t.source === 'schedule' ? ' · 定时' : t.source === 'channel' ? ' · 通道' : ''}
              </div>
              {t.status === 'running' && (
                <div className="task-progress">
                  {t.steps.length > 0 ? (
                    <span className="task-step-live">
                      {t.steps[t.steps.length - 1].name ? `正在执行：${t.steps[t.steps.length - 1].name}` : '正在生成…'}
                    </span>
                  ) : (
                    <span className="task-step-live">正在思考…</span>
                  )}
                </div>
              )}
              {t.summary && t.status !== 'running' && (
                <div className={`task-summary ${t.status === 'failed' ? 'failed' : ''}`}>
                  {t.summary.slice(0, 160)}
                </div>
              )}
            </div>
            <div className="task-actions">
              {t.status === 'failed' && (
                <button className="btn small secondary" onClick={() => onRetry(t.id)}>
                  重试
                </button>
              )}
              <button className="btn small ghost" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                {expanded === t.id ? '收起' : '轨迹'}
              </button>
              {t.status === 'done' && (
                <button className="btn small ghost" onClick={() => onReview(t.sessionId, t.title)}>
                  复盘
                </button>
              )}
            </div>
            {expanded === t.id && (
              <div className="task-trajectory">
                {t.steps.length === 0 && <div className="hint">无工具调用轨迹。</div>}
                {t.steps.map((s, i) => (
                  <div key={i} className={`trajectory-step ${s.status}`}>
                    <span className="trajectory-dot" />
                    <span>{s.name}</span>
                    <span className="trajectory-status">{s.status === 'done' ? '成功' : s.status === 'failed' ? '失败' : '…'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
