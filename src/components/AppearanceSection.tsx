import { useCallback, useState } from 'react'
import type { AppearanceConfig, AppSettings } from '../../shared/types'

const harness = window.harness

interface Props {
  appearance: AppearanceConfig | undefined
  onUpdate: (patch: Partial<AppSettings>) => Promise<{ ok: boolean; error?: { message?: string } }>
}

const THEME_OPTIONS = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
  { value: 'system', label: '跟随系统' },
]

const ACCENT_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek 蓝' },
  { value: 'green', label: '绿色' },
  { value: 'purple', label: '紫色' },
  { value: 'orange', label: '橙色' },
]

const FONT_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
]

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: '舒适' },
  { value: 'compact', label: '紧凑' },
]

/** 设置 → 通用 → 外观：主题/主题色/字体/密度/启动行为，即时生效并持久化。 */
export default function AppearanceSection({ appearance, onUpdate }: Props) {
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const current = appearance ?? {
    theme: 'dark',
    accent: 'deepseek',
    fontSize: 'medium',
    density: 'comfortable',
    autoLaunch: false,
    launchMinimized: false,
  }

  const apply = useCallback(
    async (patch: Partial<AppearanceConfig>) => {
      const next = { ...current, ...patch }
      const res = await onUpdate({ appearance: next })
      setMsg(res.ok ? { type: 'ok', text: '外观已保存' } : { type: 'err', text: res.error?.message ?? '保存失败' })
      if (patch.autoLaunch !== undefined) {
        await harness.setAutoLaunch(Boolean(patch.autoLaunch))
      }
    },
    [current, onUpdate],
  )

  return (
    <section>
      <h3>外观</h3>
      <div className="setting-row">
        <span>主题模式</span>
        <select className="input" style={{ maxWidth: 180 }} value={current.theme} onChange={(e) => void apply({ theme: e.target.value as AppearanceConfig['theme'] })}>
          {THEME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <span>主题色</span>
        <select className="input" style={{ maxWidth: 180 }} value={current.accent} onChange={(e) => void apply({ accent: e.target.value as AppearanceConfig['accent'] })}>
          {ACCENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <span>字体大小</span>
        <select className="input" style={{ maxWidth: 180 }} value={current.fontSize} onChange={(e) => void apply({ fontSize: e.target.value as AppearanceConfig['fontSize'] })}>
          {FONT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <span>消息密度</span>
        <select className="input" style={{ maxWidth: 180 }} value={current.density} onChange={(e) => void apply({ density: e.target.value as AppearanceConfig['density'] })}>
          {DENSITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <span>开机自启</span>
        <button className={`toggle-btn ${current.autoLaunch ? 'on' : ''}`} onClick={() => void apply({ autoLaunch: !current.autoLaunch })}>
          <span className="toggle-knob" />
        </button>
      </div>
      <div className="setting-row">
        <span>启动时最小化到后台</span>
        <button className={`toggle-btn ${current.launchMinimized ? 'on' : ''}`} onClick={() => void apply({ launchMinimized: !current.launchMinimized })}>
          <span className="toggle-knob" />
        </button>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        主题/颜色/字体/密度切换即时生效，重启后保留。
      </p>
      {msg && <div className={`settings-msg ${msg.type}`}>{msg.text}</div>}
    </section>
  )
}
