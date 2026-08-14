import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelGroup } from '../../shared/types'

interface Props {
  groups: ModelGroup[]
  selection: { provider: string; model: string } | null
  onSelect: (provider: string, model: string) => void
}

/**
 * 输入区右下角的模型显示：简洁显示「供应商 · 型号」，
 * 点击后弹出供应商/模型两级选择。
 */
export default function ModelDisplay({ groups, selection, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const providerGroups = useMemo(() => groups.filter((g) => g.models.length > 0), [groups])

  const currentProvider =
    providerGroups.find((g) => g.id === selection?.provider) ??
    providerGroups.find((g) => g.models.some((m) => m.id === selection?.model)) ??
    providerGroups[0]
  const currentModel =
    currentProvider?.models.find((m) => m.id === selection?.model) ?? currentProvider?.models[0]

  const providerName = currentProvider?.name || '—'
  const modelName = currentModel?.name || currentModel?.id || '—'

  // 点击外部关闭弹层
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const pick = (provider: string, model: string) => {
    onSelect(provider, model)
    setOpen(false)
  }

  return (
    <div className="model-display" ref={ref}>
      <button
        className="model-display-trigger"
        onClick={() => setOpen((o) => !o)}
        title="切换模型"
      >
        <span className="model-display-label">
          {providerName} · {modelName}
        </span>
      </button>
      {open && (
        <div className="model-display-popover">
          <div className="model-display-row">
            <select
              className="input"
              value={currentProvider?.id ?? ''}
              onChange={(e) => {
                const g = providerGroups.find((p) => p.id === e.target.value)
                const m = g?.models[0]
                if (g && m) pick(g.id, m.id)
              }}
            >
              {providerGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.id}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={currentModel?.id ?? ''}
              onChange={(e) => {
                if (currentProvider) pick(currentProvider.id, e.target.value)
              }}
            >
              {(currentProvider?.models ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
