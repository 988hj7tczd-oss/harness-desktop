import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings, MemoryItem } from '../../shared/types'

const harness = window.harness

const TAG_GROUPS: { key: string; label: string; match: string[] }[] = [
  { key: 'preference', label: '用户偏好', match: ['preference', '偏好'] },
  { key: 'project', label: '项目约定', match: ['project', '约定'] },
  { key: 'practice', label: '成功做法', match: ['practice', '做法'] },
]

function groupOf(tags: string[]): string {
  for (const g of TAG_GROUPS) {
    if (tags.some((t) => g.match.includes(t.toLowerCase()))) return g.key
  }
  return 'other'
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: 'numeric', day: 'numeric' })
}

interface Props {
  evolution: AppSettings['evolution']
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<unknown>
}

/** 记忆管理：按 tag 分组、来源、编辑/删除、进化开关。 */
export default function MemorySection({ evolution, onUpdateSettings }: Props) {
  const [items, setItems] = useState<MemoryItem[]>([])
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const refresh = useCallback(async () => {
    const res = await harness.listMemories()
    if (res.ok) setItems(res.value!)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = useMemo(
    () =>
      query
        ? items.filter((m) => m.text.toLowerCase().includes(query.toLowerCase()) || m.tags.some((t) => t.includes(query)))
        : items,
    [items, query],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, MemoryItem[]>()
    for (const m of filtered) {
      const g = groupOf(m.tags)
      map.set(g, [...(map.get(g) ?? []), m])
    }
    return [...map.entries()].map(([key, list]) => ({
      key,
      label: TAG_GROUPS.find((g) => g.key === key)?.label ?? '其他',
      items: list,
    }))
  }, [filtered])

  const add = async () => {
    const t = text.trim()
    if (!t) return setMsg({ type: 'err', text: '请填写记忆内容' })
    const tagList = tags.split(/[,，\s]+/).filter(Boolean)
    const res = await harness.addMemory(t, tagList)
    if (res.ok) {
      setMsg({ type: 'ok', text: '已添加（下次对话生效）' })
      setText('')
      setTags('')
      void refresh()
    } else {
      setMsg({ type: 'err', text: res.error?.message ?? '添加失败' })
    }
  }

  const remove = async (id: string) => {
    await harness.deleteMemory(id)
    void refresh()
  }

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return
    // 直接改存储文件：删除旧的 + 加新的（保持简单）
    await harness.deleteMemory(id)
    const item = items.find((m) => m.id === id)
    await harness.addMemory(editText.trim(), item?.tags ?? [])
    setEditing(null)
    void refresh()
  }

  const clearAll = async () => {
    await harness.clearMemories()
    void refresh()
  }

  const toggleAutoReview = async () => {
    await onUpdateSettings({ evolution: { ...(evolution ?? {}), autoReview: !(evolution?.autoReview ?? true) } })
  }
  const toggleAutoInject = async () => {
    await onUpdateSettings({ evolution: { ...(evolution ?? {}), autoInjectMemory: !(evolution?.autoInjectMemory ?? true) } })
  }

  return (
    <section>
      <h3>记忆</h3>
      <p className="hint" style={{ marginBottom: 8 }}>
        记忆会自动注入系统提示供跨会话召回。桌面端修改会在 dsh 重启后完整生效。
      </p>

      <div className="setting-row">
        <span>自动复盘</span>
        <button className={`btn small ${evolution?.autoReview ?? true ? 'secondary' : ''}`} onClick={toggleAutoReview}>
          {(evolution?.autoReview ?? true) ? '开' : '关'}
        </button>
      </div>
      <div className="setting-row">
        <span>自动注入记忆</span>
        <button className={`btn small ${evolution?.autoInjectMemory ?? true ? 'secondary' : ''}`} onClick={toggleAutoInject}>
          {(evolution?.autoInjectMemory ?? true) ? '开' : '关'}
        </button>
      </div>

      <div className="setting-input-row" style={{ marginBottom: 8, marginTop: 8 }}>
        <input className="input" placeholder="搜索记忆…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {items.length > 0 && (
          <button className="btn danger small" onClick={clearAll}>
            清空
          </button>
        )}
      </div>
      <div className="setting-input-row" style={{ marginBottom: 8 }}>
        <input className="input" placeholder="新记忆内容" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn primary small" onClick={add} disabled={!text.trim()}>
          添加
        </button>
      </div>
      <input
        className="input"
        placeholder="标签（可选，逗号分隔；preference/project/practice 用于分组）"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      {filtered.length === 0 && (
        <div className="empty-hint">
          <div>还没有记忆</div>
          <div className="hint">任务完成后自动复盘会沉淀记忆，也可以手动添加。</div>
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.key} className="memory-group">
          <div className="memory-group-label">{g.label} · {g.items.length}</div>
          {g.items.map((m) => (
            <div key={m.id} className="memory-item">
              <div className="memory-info">
                {editing === m.id ? (
                  <input
                    className="input"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => saveEdit(m.id)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(m.id)}
                    autoFocus
                  />
                ) : (
                  <span className="memory-text">{m.text}</span>
                )}
                <span className="memory-meta">
                  {m.tags.map((t) => (
                    <span key={t} className="memory-tag">
                      {t}
                    </span>
                  ))}
                  {m.tags.includes('important') && <span className="memory-tag">重要</span>}
                  <span className="memory-time">{fmt(m.updatedAt)}</span>
                </span>
              </div>
              <div className="memory-actions">
                <button
                  className="btn ghost small"
                  onClick={() => {
                    setEditing(m.id)
                    setEditText(m.text)
                  }}
                >
                  编辑
                </button>
                <button className="btn danger small" onClick={() => remove(m.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {msg && <div className={`settings-msg ${msg.type}`}>{msg.text}</div>}
    </section>
  )
}
