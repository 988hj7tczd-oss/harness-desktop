import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '../../shared/types'
import SessionContextMenu from './SessionContextMenu'

interface Props {
  sessions: SessionSummary[]
  activeId: string | null
  loading: boolean
  creating: boolean
  pinnedSessionIds: string[]
  sessionColors: Record<string, string>
  view: 'chat' | 'tasks'
  onSwitchView: (v: 'chat' | 'tasks') => void
  onNewChat: () => void
  onSelect: (id: string) => void
  onOpenSettings: () => void
  onRefresh: () => void
  onRename: (id: string, title: string) => Promise<boolean>
  onTogglePin: (id: string) => void
  onSetColor: (id: string, color: string) => void
  onFork: (id: string) => Promise<boolean>
  onArchive: (id: string) => Promise<boolean>
  onDelete: (id: string, cwd?: string) => Promise<boolean>
  onExport: (id: string) => void
  onCopyId: (id: string) => void
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })
}

interface MenuState {
  sessionId: string
  x: number
  y: number
}

export default function Sidebar({
  sessions,
  activeId,
  loading,
  creating,
  pinnedSessionIds,
  sessionColors,
  view,
  onSwitchView,
  onNewChat,
  onSelect,
  onOpenSettings,
  onRefresh,
  onRename,
  onTogglePin,
  onSetColor,
  onFork,
  onArchive,
  onDelete,
  onExport,
  onCopyId,
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const pinnedSet = new Set(pinnedSessionIds)

  const startRename = useCallback((session: SessionSummary) => {
    setEditingId(session.sessionId)
    setEditValue(session.title === '新会话' ? '' : session.title)
    setMenu(null)
  }, [])

  // 三点下拉：锚定到按钮位置弹出右键菜单
  const openMenuAt = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ sessionId, x: rect.right - 180, y: rect.bottom + 4 })
  }, [])

  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  const commitRename = async () => {
    if (editingId) {
      await onRename(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  const menuSession = menu ? sessions.find((s) => s.sessionId === menu.sessionId) ?? null : null

  return (
    <aside className="sidebar">
      <div className="sidebar-actions">
        <button className="new-chat-btn" onClick={onNewChat} disabled={creating}>
          <span className="new-chat-icon">{creating ? '⋯' : '+'}</span>
          {creating ? '创建中…' : '新会话'}
        </button>
        <button
          className={`tasks-btn ${view === 'tasks' ? 'active' : ''}`}
          onClick={() => onSwitchView(view === 'tasks' ? 'chat' : 'tasks')}
        >
          <span>{view === 'tasks' ? '返回会话' : '任务'}</span>
        </button>
      </div>

      <div className="session-list">
        {loading && <div className="sidebar-hint">加载会话…</div>}
        {!loading && sessions.length === 0 && (
          <div className="sidebar-hint">
            还没有会话
            <br />
            点击「新会话」开始
          </div>
        )}
        {sessions.map((s) => {
          const isActive = s.sessionId === activeId
          const isPinned = pinnedSet.has(s.sessionId)
          const color = sessionColors[s.sessionId] || undefined
          const isEditing = editingId === s.sessionId
          return (
            <div
              key={s.sessionId}
              className={`session-row ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (!isEditing) onSelect(s.sessionId)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ sessionId: s.sessionId, x: e.clientX, y: e.clientY })
              }}
            >
              {color && <span className="session-color-strip" style={{ background: color }} />}
              <button className="session-item" title={s.title}>
                <span className="session-item-top">
                  <span className="session-indicator" aria-hidden>
                    {s.running ? <span className="session-spinner" /> : <span className="session-dot" />}
                  </span>
                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      className="session-rename-input"
                      value={editValue}
                      placeholder="会话标题"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => void commitRename()}
                    />
                  ) : (
                    <span
                      className="session-title"
                      title={s.title || '新会话'}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startRename(s)
                      }}
                    >
                      {isPinned && <span className="pin-mark">顶</span>}
                      {s.title || '新会话'}
                    </span>
                  )}
                </span>
                <span className="session-meta">{formatTime(s.updatedAt)}</span>
              </button>
              {!isEditing && (
                <span className="session-quick-actions">
                  <button
                    className="session-more-btn"
                    title="更多"
                    onClick={(e) => openMenuAt(e, s.sessionId)}
                  >
                    ⋯
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="sidebar-footer">
        <button className="settings-btn" onClick={onOpenSettings} title="设置">
          <span>设置</span>
        </button>
        <button className="sidebar-icon-btn" onClick={onRefresh} title="刷新列表">
          ↻
        </button>
      </div>

      {menu && menuSession && (
        <SessionContextMenu
          x={menu.x}
          y={menu.y}
          pinned={pinnedSet.has(menuSession.sessionId)}
          color={sessionColors[menuSession.sessionId] || undefined}
          onClose={() => setMenu(null)}
          onRename={() => startRename(menuSession)}
          onTogglePin={() => onTogglePin(menuSession.sessionId)}
          onSetColor={(c) => onSetColor(menuSession.sessionId, c)}
          onCopyId={() => onCopyId(menuSession.sessionId)}
          onFork={() => void onFork(menuSession.sessionId)}
          onExport={() => onExport(menuSession.sessionId)}
          onArchive={() => void onArchive(menuSession.sessionId)}
          onDelete={() => void onDelete(menuSession.sessionId, menuSession.cwd)}
        />
      )}
    </aside>
  )
}
