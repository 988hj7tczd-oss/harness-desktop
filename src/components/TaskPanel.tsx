import { useMemo, useState } from 'react'
import type { TaskRecord, TaskType } from '../../shared/types'
import WhaleLogo from './WhaleLogo'

interface Props {
  tasks: TaskRecord[]
  onRetry: (taskId: string) => void
  onReview: (sessionId: string, title: string) => void
  onCancel?: (sessionId: string) => void
}

const STATUS_LABEL: Record<TaskRecord['status'], string> = {
  queued: '排队中',
  running: '进行中',
  done: '已完成',
  failed: '失败',
}

const TYPE_LABEL: Record<TaskType, string> = {
  code: '代码',
  writing: '写作',
  query: '查询',
  analysis: '分析',
  other: '其他',
}

type FilterKey = 'all' | 'running' | 'done' | 'failed'

function fmtTime(ts: number | undefined): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function duration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 6000) / 10}min`
}

/** 任务面板：类型过滤 / 进度 / 展开步骤 / 重试 / 复盘。 */
export default function TaskPanel({ tasks, onRetry, onReview, onCancel }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return tasks
    return tasks.filter((t) => t.status === filter)
  }, [tasks, filter])

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

  const counts: Record<FilterKey, number> = {
    all: tasks.length,
    running: tasks.filter((t) => t.status === 'running' || t.status === 'queued').length,
    done: tasks.filter((t) => t.status === 'done').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  }

  const copySummary = async (t: TaskRecord) => {
    if (!t.summary) return
    try {
      await navigator.clipboard.writeText(t.summary)
      setCopied(t.id)
      setTimeout(() => setCopied((c) => (c === t.id ? null : c)), 2000)
    } catch {
      // ignore
    }
  }

  const typeCounts = useMemo(() => {
    const map = new Map<TaskType, number>()
    for (const t of tasks) {
      const ty = t.type ?? 'other'
      map.set(ty, (map.get(ty) ?? 0) + 1)
    }
    return [...map.entries()]
  }, [tasks])

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: `全部 ${counts.all}` },
    { key: 'running', label: `进行中 ${counts.running}` },
    { key: 'done', label: `已完成 ${counts.done}` },
    { key: 'failed', label: `失败 ${counts.failed}` },
  ]

  return (
    <main className="task-panel">
      <header className="task-header">
        <div className="task-title">任务</div>
        <span className="hint">
          {tasks.length} 个任务 · {typeCounts.map(([k, n]) => `${TYPE_LABEL[k]}${n}`).join(' / ')}
        </span>
      </header>
      <div className="task-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`task-filter ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="task-list">
        {filtered.length === 0 && (
          <div className="task-empty-small">该分类下没有任务。</div>
        )}
        {filtered.map((t) => {
          const isOpen = expanded === t.id
          const doneSteps = t.steps.filter((s) => s.status === 'done').length
          const progress = t.steps.length > 0 ? Math.round((doneSteps / t.steps.length) * 100) : 0
          return (
            <div key={t.id} className={`task-card ${t.status}`}>
              <div className="task-card-main" onClick={() => setExpanded(isOpen ? null : t.id)}>
                <div className="task-card-top">
                  <span className={`task-status task-status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                  <span className={`task-type-badge task-type-${t.type ?? 'other'}`}>{TYPE_LABEL[t.type ?? 'other']}</span>
                  <span className="task-title-text">{t.title}</span>
                </div>
                <div className="task-meta mono">
                  {fmtTime(t.startedAt)}
                  {t.endedAt ? ` · 耗时 ${duration(t.endedAt - t.startedAt)}` : ''}
                  {t.source === 'schedule' ? ' · 定时' : ''}
                </div>
                {t.status === 'running' && (
                  <div className="task-progress">
                    {t.steps.length > 0 && (
                      <div className="task-progress-bar">
                        <div className="task-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                    <span className="task-step-live">
                      {t.steps.length > 0
                        ? `正在执行：${t.steps[t.steps.length - 1].name}（${doneSteps}/${t.steps.length}）`
                        : '正在思考…'}
                    </span>
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
                {(t.status === 'running' || t.status === 'queued') && onCancel && (
                  <button className="btn small ghost" onClick={() => onCancel(t.sessionId)}>
                    取消
                  </button>
                )}
                <button
                  className="btn small ghost"
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                >
                  {isOpen ? '收起' : '轨迹'}
                </button>
                {t.status === 'done' && (
                  <button className="btn small ghost" onClick={() => onReview(t.sessionId, t.title)}>
                    复盘
                  </button>
                )}
                {t.status === 'done' && t.summary && (
                  <button className="btn small ghost" onClick={() => copySummary(t)}>
                    {copied === t.id ? '已复制' : '复制摘要'}
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="task-trajectory">
                  {t.steps.length === 0 && <div className="hint">无工具调用轨迹。</div>}
                  {t.steps.map((s, i) => (
                    <div key={i} className={`trajectory-step ${s.status}`}>
                      <span className="trajectory-dot" />
                      <span className="trajectory-name">{s.name}</span>
                      <span className="trajectory-status">
                        {s.status === 'done' ? '成功' : s.status === 'failed' ? '失败' : s.status === 'running' ? '进行中' : '等待'}
                      </span>
                      {s.error && <span className="trajectory-error">{s.error}</span>}
                    </div>
                  ))}
                  {t.steps.length > 0 && (
                    <div className="trajectory-summary">
                      共 {t.steps.length} 步 · {t.steps.filter((s) => s.status === 'done').length} 成功
                      {t.steps.some((s) => s.status === 'failed') ? ` · ${t.steps.filter((s) => s.status === 'failed').length} 失败` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
