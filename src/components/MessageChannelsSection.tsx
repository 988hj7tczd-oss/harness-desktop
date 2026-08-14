import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, ChannelAccessConfig } from '../../shared/types'
import {
  PLATFORMS,
  ALL_CHANNEL_REFS,
  platformConfigured,
  defaultMode,
  type ChannelPlatform,
  type ChannelMode,
} from '../channelRegistry'

const harness = window.harness

const POLICY_LABELS: Record<string, string> = {
  open: '开放（所有用户可用）',
  allowlist: '白名单（仅允许列表）',
  disabled: '禁用',
}

interface PlatformState {
  configured: boolean
  saving: boolean
  testing: boolean
  savingAccess: boolean
  msg?: string
  msgType?: 'ok' | 'err'
}

interface Props {
  appSettings: AppSettings
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<{ ok: boolean; error?: { message?: string } }>
}

/**
 * 消息通道：竖排平台列表 + accordion 展开配置表单。
 * 每个平台可含多种"接入方式"（radio 切换），并有"访问控制"区
 * （DM/群聊策略 + 白名单，镜像存 AppSettings 供预填，同步写 credentials 供 gateway 校验）。
 * 状态圆点用 CSS（不用 emoji），链接走 shell.openExternal。
 */
export default function MessageChannelsSection({ appSettings, onUpdateSettings }: Props) {
  const [states, setStates] = useState<Record<string, PlatformState>>({})
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [modes, setModes] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [configuredRefs, setConfiguredRefs] = useState<Set<string>>(new Set())
  const [access, setAccess] = useState<Record<string, ChannelAccessConfig>>({})

  const savedAccess = appSettings.channelAccess ?? {}

  const refresh = useCallback(async () => {
    const res = await harness.describeCredentialRefs(ALL_CHANNEL_REFS)
    if (!res.ok) return
    const refs = new Set(Object.entries(res.value ?? {}).filter(([, ok]) => ok).map(([r]) => r))
    setConfiguredRefs(refs)
    setStates((prev) => {
      const next: Record<string, PlatformState> = { ...prev }
      for (const p of PLATFORMS) {
        const cur = next[p.id] ?? { configured: false, saving: false, testing: false, savingAccess: false }
        next[p.id] = { ...cur, configured: platformConfigured(p, refs) }
      }
      return next
    })
    // 访问控制预填：从 AppSettings 读取
    setAccess((prev) => {
      const next: Record<string, ChannelAccessConfig> = { ...prev }
      for (const p of PLATFORMS) {
        if (p.access && savedAccess[p.id] && !prev[p.id]) {
          next[p.id] = { ...savedAccess[p.id] }
        }
      }
      return next
    })
  }, [savedAccess])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const toggle = (id: string) => {
    setExpanded((cur) => {
      if (cur === id) return null
      // 展开时默认选中已配置的方式（无则第一个）
      setModes((prev) => {
        const p = PLATFORMS.find((x) => x.id === id)!
        return { ...prev, [id]: prev[id] ?? defaultMode(p, configuredRefs).id }
      })
      return id
    })
  }

  const mode = (p: ChannelPlatform): ChannelMode => {
    const mid = modes[p.id] ?? defaultMode(p, configuredRefs).id
    return p.modes.find((m) => m.id === mid) ?? p.modes[0]
  }

  const setField = (platformId: string, fieldId: string, val: string) => {
    setValues((prev) => ({
      ...prev,
      [platformId]: { ...(prev[platformId] ?? {}), [fieldId]: val },
    }))
    setStates((prev) => ({
      ...prev,
      [platformId]: { ...(prev[platformId] ?? { configured: false, saving: false, testing: false, savingAccess: false }), msg: undefined },
    }))
  }

  const patch = (platformId: string, partial: Partial<PlatformState>) => {
    setStates((prev) => ({
      ...prev,
      [platformId]: {
        ...(prev[platformId] ?? { configured: false, saving: false, testing: false, savingAccess: false }),
        ...partial,
      },
    }))
  }

  const save = async (p: ChannelPlatform, m: ChannelMode) => {
    const vals = values[p.id] ?? {}
    const missing = m.fields.filter((f) => !vals[f.id]?.trim())
    if (missing.length > 0) {
      patch(p.id, { msg: `请填写：${missing.map((f) => f.label).join('、')}`, msgType: 'err' })
      return
    }
    patch(p.id, { saving: true, msg: undefined })
    try {
      for (const f of m.fields) {
        const r = await harness.setCredential(f.ref, vals[f.id]!.trim())
        if (!r.ok) throw new Error(r.error?.message ?? `保存 ${f.label} 失败`)
      }
      // 触发 dsh 凭据重连（adapter 会重新 resolve token）
      await new Promise((r) => setTimeout(r, 300))
      patch(p.id, { saving: false, msg: '已保存', msgType: 'ok' })
      setValues((prev) => ({ ...prev, [p.id]: {} }))
      await refresh()
    } catch (err) {
      patch(p.id, { saving: false, msg: (err as Error).message ?? '保存失败', msgType: 'err' })
    }
  }

  const disconnect = async (p: ChannelPlatform, m: ChannelMode) => {
    for (const f of m.fields) {
      await harness.clearCredential(f.ref)
    }
    patch(p.id, { msg: '已断开', msgType: 'ok' })
    await refresh()
  }

  const test = async (p: ChannelPlatform, m: ChannelMode) => {
    const vals = values[p.id] ?? {}
    patch(p.id, { testing: true, msg: undefined })
    const res = await harness.testChannel(p.id, m.id, vals)
    patch(p.id, {
      testing: false,
      msg: res.ok ? res.value!.message : res.error?.message ?? '测试失败',
      msgType: res.ok ? 'ok' : 'err',
    })
  }

  const setAccessField = (platformId: string, key: keyof ChannelAccessConfig, val: string) => {
    setAccess((prev) => ({
      ...prev,
      [platformId]: {
        ...(prev[platformId] ?? { dmPolicy: 'open', allowedUsers: '', groupPolicy: 'open', allowedGroups: '' }),
        [key]: val,
      },
    }))
    patch(platformId, { msg: undefined })
  }

  const saveAccess = async (p: ChannelPlatform) => {
    if (!p.access) return
    const a = access[p.id] ?? { dmPolicy: 'open', allowedUsers: '', groupPolicy: 'open', allowedGroups: '' }
    patch(p.id, { savingAccess: true, msg: undefined })
    try {
      // 同步写 credentials（gateway 用 ctx.credentials.resolve 读取校验）
      const writes = [
        harness.setCredential(p.access.dmPolicyRef, a.dmPolicy),
        harness.setCredential(p.access.allowedUsersRef, a.allowedUsers),
        harness.setCredential(p.access.groupPolicyRef, a.groupPolicy),
        harness.setCredential(p.access.allowedGroupsRef, a.allowedGroups),
      ]
      for (const w of writes) {
        const r = await w
        if (!r.ok) throw new Error(r.error?.message ?? '保存访问控制失败')
      }
      // 镜像到 AppSettings（UI 重启后预填）
      const r = await onUpdateSettings({
        channelAccess: { ...(appSettings.channelAccess ?? {}), [p.id]: a },
      })
      if (!r.ok) throw new Error(r.error?.message ?? '保存访问控制失败')
      await new Promise((res) => setTimeout(res, 300))
      patch(p.id, { savingAccess: false, msg: '访问控制已保存', msgType: 'ok' })
      await refresh()
    } catch (err) {
      patch(p.id, { savingAccess: false, msg: (err as Error).message ?? '保存失败', msgType: 'err' })
    }
  }

  const openGuide = (url: string) => {
    void harness.openExternal(url)
  }

  const anyConfigured = Object.values(states).some((s) => s.configured)

  return (
    <section>
      <h3>消息通道</h3>
      <p className="hint" style={{ marginBottom: 8 }}>
        让 Agent 接入即时通讯平台，消息会进入对应会话并由 Agent 回复。凭证只存本机凭据库。
      </p>

      {!anyConfigured && (
        <div className="channel-empty">
          连接一个消息平台，随时和你的 Agent 对话。
        </div>
      )}

      <div className="channel-list">
        {PLATFORMS.map((p) => {
          const st = states[p.id] ?? { configured: false, saving: false, testing: false, savingAccess: false }
          const open = expanded === p.id
          const vals = values[p.id] ?? {}
          const m = mode(p)
          const multi = p.modes.length > 1
          const a = access[p.id] ?? { dmPolicy: 'open', allowedUsers: '', groupPolicy: 'open', allowedGroups: '' }
          return (
            <div key={p.id} className={`channel-row ${open ? 'open' : ''}`}>
              <button className="channel-row-head" onClick={() => toggle(p.id)}>
                <span className={`channel-dot ${st.configured ? 'on' : 'off'}`} />
                <span className="channel-name">{p.name}</span>
                <span className={`channel-status ${st.configured ? 'status-ok' : 'status-warn'}`}>
                  {st.configured ? '已配置' : '配置'}
                </span>
              </button>

              {open && (
                <div className="channel-body">
                  {multi && (
                    <div className="channel-modes">
                      {p.modes.map((mm) => (
                        <button
                          key={mm.id}
                          className={`channel-mode ${m.id === mm.id ? 'active' : ''}`}
                          onClick={() => {
                            setModes((prev) => ({ ...prev, [p.id]: mm.id }))
                            setValues((prev) => ({ ...prev, [p.id]: {} }))
                            patch(p.id, { msg: undefined })
                          }}
                        >
                          <span className="channel-mode-radio" />
                          <span className="channel-mode-main">
                            <span className="channel-mode-label">{mm.label}</span>
                            <span className="channel-mode-desc">{mm.description}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {m.guide.length > 0 && (
                    <div className="channel-guide">
                      <div className="channel-guide-title">如何获取</div>
                      {m.guide.map((step, i) => (
                        <div key={i} className="channel-guide-step">
                          <span className="channel-guide-num">{i + 1}</span>
                          <span className="channel-guide-text">
                            {step.text}
                            {step.url && (
                              <button className="link-btn" onClick={() => openGuide(step.url!)}>
                                {step.urlLabel ?? step.url}
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {m.fields.map((f) => (
                    <div key={f.id} className="setting-input-row" style={{ marginBottom: 8 }}>
                      <input
                        type={f.type}
                        className="input mono"
                        placeholder={f.placeholder}
                        value={vals[f.id] ?? ''}
                        onChange={(e) => setField(p.id, f.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && save(p, m)}
                      />
                      <label className="channel-field-label">{f.label}</label>
                    </div>
                  ))}

                  {p.id === 'webhooks' && (
                    <div className="channel-webhook-url">
                      <span className="channel-webhook-url-label">入站 URL</span>
                      <code className="mono">
                        http://127.0.0.1:{vals.port?.trim() || '<port>'}/webhook/{vals.token?.trim() || '<token>'}
                      </code>
                      <span className="hint">
                        {st.configured
                          ? '已保存（保存后表单清空，URL 用保存时的端口与 token）'
                          : '填写端口与 token 并保存后生效'}
                      </span>
                    </div>
                  )}

                  <div className="channel-actions">
                    <button
                      className="btn primary small"
                      onClick={() => save(p, m)}
                      disabled={st.saving}
                    >
                      {st.saving ? '保存…' : '保存'}
                    </button>
                    {m.testable && (
                      <button className="btn secondary small" onClick={() => test(p, m)} disabled={st.testing}>
                        {st.testing ? '测试中…' : '测试连接'}
                      </button>
                    )}
                    {st.configured && (
                      <button className="btn danger small" onClick={() => disconnect(p, m)}>
                        断开
                      </button>
                    )}
                  </div>

                  {st.msg && <div className={`settings-msg ${st.msgType ?? 'ok'}`}>{st.msg}</div>}
                  <p className="hint" style={{ marginTop: 6 }}>
                    {p.note}
                    {p.reserved ? '（预留）' : ''}
                  </p>

                  {p.access && (
                    <div className="channel-access">
                      <div className="channel-access-title">访问控制</div>
                      <div className="setting-row">
                        <span>私聊（DM）策略</span>
                        <select
                          className="input"
                          value={a.dmPolicy}
                          onChange={(e) => setAccessField(p.id, 'dmPolicy', e.target.value)}
                        >
                          <option value="open">开放</option>
                          <option value="allowlist">白名单</option>
                          <option value="disabled">禁用</option>
                        </select>
                      </div>
                      <div className="setting-input-row" style={{ marginBottom: 6 }}>
                        <input
                          className="input mono"
                          placeholder="允许用户 ID，逗号分隔"
                          value={a.allowedUsers}
                          onChange={(e) => setAccessField(p.id, 'allowedUsers', e.target.value)}
                        />
                        <span className="channel-access-hint">{POLICY_LABELS[a.dmPolicy]}</span>
                      </div>
                      <div className="setting-row">
                        <span>群聊策略</span>
                        <select
                          className="input"
                          value={a.groupPolicy}
                          onChange={(e) => setAccessField(p.id, 'groupPolicy', e.target.value)}
                        >
                          <option value="open">开放</option>
                          <option value="allowlist">白名单</option>
                          <option value="disabled">禁用</option>
                        </select>
                      </div>
                      <div className="setting-input-row" style={{ marginBottom: 6 }}>
                        <input
                          className="input mono"
                          placeholder="允许群 ID，逗号分隔"
                          value={a.allowedGroups}
                          onChange={(e) => setAccessField(p.id, 'allowedGroups', e.target.value)}
                        />
                        <span className="channel-access-hint">{POLICY_LABELS[a.groupPolicy]}</span>
                      </div>
                      <div className="channel-actions">
                        <button className="btn secondary small" onClick={() => saveAccess(p)} disabled={st.savingAccess}>
                          {st.savingAccess ? '保存中…' : '保存访问控制'}
                        </button>
                      </div>
                      <p className="hint" style={{ marginTop: 6 }}>
                        白名单生效后，不在列表的用户/群发来的消息会被拒绝并收到提示。
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
