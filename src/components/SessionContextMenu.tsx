import { useEffect, useState } from 'react'
import { SESSION_COLORS } from '../../shared/types'

interface Props {
  x: number
  y: number
  pinned: boolean
  color: string | undefined
  onClose: () => void
  onRename: () => void
  onTogglePin: () => void
  onSetColor: (color: string) => void
  onCopyId: () => void
  onFork: () => void
  onExport: () => void
  onArchive: () => void
  onDelete: () => void
}

type View = 'main' | 'colors' | 'confirm-archive' | 'confirm-delete'

export default function SessionContextMenu({
  x,
  y,
  pinned,
  color,
  onClose,
  onRename,
  onTogglePin,
  onSetColor,
  onCopyId,
  onFork,
  onExport,
  onArchive,
  onDelete,
}: Props) {
  const [view, setView] = useState<View>('main')

  // 点击外部 / Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      const el = document.getElementById('session-ctx-menu')
      if (el && !el.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y, window.innerHeight - 340)

  const item = (label: string, onClick: () => void, danger = false) => (
    <button
      className={`ctx-item ${danger ? 'danger' : ''}`}
      onClick={() => {
        onClick()
        onClose()
      }}
    >
      <span>{label}</span>
    </button>
  )

  return (
    <div id="session-ctx-menu" className="ctx-menu" style={{ left, top }}>
      {view === 'main' && (
        <>
          {item('重命名', onRename)}
          {item(pinned ? '取消置顶' : '置顶', onTogglePin)}
          <button className="ctx-item" onClick={() => setView('colors')}>
            <span>外观</span>
            <span className="ctx-arrow">›</span>
          </button>
          {item('复制 ID', onCopyId)}
          <div className="ctx-sep" />
          {item('分支', onFork)}
          {item('导出', onExport)}
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => setView('confirm-archive')}>
            <span>归档</span>
          </button>
          <button className="ctx-item danger" onClick={() => setView('confirm-delete')}>
            <span>删除</span>
          </button>
        </>
      )}

      {view === 'colors' && (
        <>
          <div className="ctx-title">选择标签颜色</div>
          <div className="ctx-colors">
            <button
              className={`ctx-swatch ${color === undefined ? 'active' : ''}`}
              style={{ background: 'transparent', borderColor: 'var(--dsw-border-l2)' }}
              title="无颜色"
              onClick={() => {
                onSetColor('')
                onClose()
              }}
            >
              ✕
            </button>
            {SESSION_COLORS.map((c) => (
              <button
                key={c}
                className={`ctx-swatch ${color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => {
                  onSetColor(c)
                  onClose()
                }}
              />
            ))}
          </div>
          <button className="ctx-item" onClick={() => setView('main')}>
            <span>返回</span>
          </button>
        </>
      )}

      {view === 'confirm-archive' && (
        <>
          <div className="ctx-title">归档会话？</div>
          <div className="ctx-note">归档后从列表隐藏，数据保留，可恢复。</div>
          <div className="ctx-actions">
            <button className="btn small" onClick={() => setView('main')}>
              取消
            </button>
            <button
              className="btn small secondary"
              onClick={() => {
                onArchive()
                onClose()
              }}
            >
              归档
            </button>
          </div>
        </>
      )}

      {view === 'confirm-delete' && (
        <>
          <div className="ctx-title">删除会话？</div>
          <div className="ctx-note">会话日志将被永久移除，无法恢复。</div>
          <div className="ctx-actions">
            <button className="btn small" onClick={() => setView('main')}>
              取消
            </button>
            <button
              className="btn small danger"
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              删除
            </button>
          </div>
        </>
      )}
    </div>
  )
}
