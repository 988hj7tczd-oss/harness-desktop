import { useEffect, useState } from 'react'
import type { AppSettings, DshStatus, ModelGroup } from '../../shared/types'
import CustomProviders from './CustomProviders'
import CredentialsSection from './CredentialsSection'
import RemindersSection from './RemindersSection'
import MemorySection from './MemorySection'
import ConsoleSection from './ConsoleSection'
import MessageChannelsSection from './MessageChannelsSection'
import SkillsSection from './SkillsSection'
import AppearanceSection from './AppearanceSection'

const harness = window.harness

interface Props {
  appSettings: AppSettings
  dshStatus: DshStatus | null
  activeSessionId: string | null
  planActive: boolean
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<{ ok: boolean; error?: { message?: string } }>
  onClose: () => void
  onWorkspaceChanged: () => void
  onProvidersChanged: () => void
  onPlanToggle: (active: boolean) => void
  skillSuggestions: { type: string; count: number }[]
  onGenerateSkill: (sessionId: string, type: string) => void
}

type NavKey = 'general' | 'models' | 'automation' | 'memory' | 'skills' | 'channels' | 'advanced'

const NAV: { key: NavKey; label: string }[] = [
  { key: 'general', label: '通用' },
  { key: 'models', label: '模型与凭证' },
  { key: 'automation', label: '提醒与自动化' },
  { key: 'memory', label: '记忆' },
  { key: 'skills', label: '技能' },
  { key: 'channels', label: '消息通道' },
  { key: 'advanced', label: '高级' },
]

export default function SettingsModal({
  appSettings,
  dshStatus,
  activeSessionId,
  planActive,
  onUpdateSettings,
  onClose,
  onWorkspaceChanged,
  onProvidersChanged,
  onPlanToggle,
  skillSuggestions,
  onGenerateSkill,
}: Props) {
  const [active, setActive] = useState<NavKey>('general')
  const [picking, setPicking] = useState(false)
  const [models, setModels] = useState<ModelGroup[]>([])
  const [model, setModel] = useState(appSettings.model ?? '')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      const res = await harness.listModels()
      if (res.ok) {
        setModels(res.value!)
        if (!model) {
          const first = res.value!.find((g) => g.models.length > 0)?.models[0]
          if (first) setModel(first.id)
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pickWorkspace = async () => {
    setPicking(true)
    setMsg(null)
    const res = await harness.pickDirectory()
    setPicking(false)
    if (res.ok && res.value) {
      await onUpdateSettings({ workspaceCwd: res.value })
      onWorkspaceChanged()
      setMsg({ type: 'ok', text: '工作区已更新' })
    }
  }

  const saveModel = async () => {
    setMsg(null)
    const res = await onUpdateSettings({ model })
    if (res.ok) setMsg({ type: 'ok', text: '默认模型已保存' })
    else setMsg({ type: 'err', text: res.error?.message ?? '保存失败' })
  }

  const refreshModels = async () => {
    const res = await harness.listModels()
    if (res.ok) setModels(res.value!)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-nav">
          <div className="settings-nav-title">设置</div>
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`settings-nav-item ${active === n.key ? 'active' : ''}`}
              onClick={() => setActive(n.key)}
            >
              <span>{n.label}</span>
            </button>
          ))}
          <button className="settings-nav-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-pane">
          {active === 'general' && (
            <>
              <section>
                <h3>引擎状态</h3>
                <div className="setting-row">
                  <span>服务</span>
                  <span className={dshStatus?.ready ? 'status-ok' : 'status-wait'}>
                    {dshStatus?.ready ? '运行中' : '启动中…'}
                  </span>
                </div>
                {dshStatus?.ready && (
                  <div className="setting-row">
                    <span>端口 / 版本</span>
                    <span className="mono">
                      127.0.0.1:{dshStatus.port} · v{dshStatus.version}
                    </span>
                  </div>
                )}
              </section>

              <section>
                <h3>工作区</h3>
                <div className="setting-row">
                  <span className="mono workspace-value">{appSettings.workspaceCwd ?? '未选择'}</span>
                  <button className="btn secondary small" onClick={pickWorkspace} disabled={picking}>
                    {picking ? '选择中…' : '更换'}
                  </button>
                </div>
              </section>

              <section>
                <h3>快捷键</h3>
                <div className="setting-row">
                  <span>新建会话</span>
                  <span className="mono">⌘N / Ctrl+N</span>
                </div>
                <div className="setting-row">
                  <span>打开设置</span>
                  <span className="mono">⌘, / Ctrl+,</span>
                </div>
                <div className="setting-row">
                  <span>切换开发者工具</span>
                  <span className="mono">⌘⌥I / Ctrl+Shift+I</span>
                </div>
                <div className="setting-row">
                  <span>关闭窗口</span>
                  <span className="mono">⌘W / Ctrl+W</span>
                </div>
              </section>

              <AppearanceSection
                appearance={appSettings.appearance}
                onUpdate={onUpdateSettings}
              />
            </>
          )}

          {active === 'models' && (
            <>
              <section>
                <h3>默认模型</h3>
                <div className="setting-input-row">
                  <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                    {models.flatMap((g) => g.models).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn primary small" onClick={saveModel}>
                    保存
                  </button>
                </div>
              </section>

              <CredentialsSection />
              <CustomProviders
                onChanged={() => {
                  void refreshModels()
                  onProvidersChanged()
                }}
              />
            </>
          )}

          {active === 'automation' && <RemindersSection />}

          {active === 'memory' && (
            <MemorySection evolution={appSettings.evolution} onUpdateSettings={onUpdateSettings} />
          )}

          {active === 'skills' && (
            <SkillsSection
              sessionId={activeSessionId}
              suggestions={skillSuggestions}
              onGenerateSkill={onGenerateSkill}
            />
          )}

          {active === 'channels' && (
            <MessageChannelsSection
              appSettings={appSettings}
              onUpdateSettings={onUpdateSettings}
            />
          )}

          {active === 'advanced' && (
            <ConsoleSection
              sessionId={activeSessionId}
              planActive={planActive}
              onPlanToggle={onPlanToggle}
            />
          )}

          {msg && <div className={`settings-msg ${msg.type}`}>{msg.text}</div>}
        </div>
      </div>
    </div>
  )
}
