import { useCallback, useEffect, useState } from 'react'
import type { CredentialStatus } from '../../shared/types'

const harness = window.harness

/** 凭证统一管理：列出全部 provider 凭据状态，可设置/清除。 */
export default function CredentialsSection() {
  const [items, setItems] = useState<CredentialStatus[]>([])
  const [selected, setSelected] = useState<CredentialStatus | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    const res = await harness.listCredentials()
    if (res.ok) {
      setItems(res.value!)
      setSelected((cur) => cur && res.value!.some((c) => c.ref === cur.ref) ? cur : null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const choose = (item: CredentialStatus) => {
    setSelected(item)
    setValue('')
    setMsg(null)
  }

  const save = async () => {
    if (!selected || !value.trim()) return
    setSaving(true)
    setMsg(null)
    const res = await harness.setCredential(selected.ref, value.trim())
    setSaving(false)
    if (res.ok) {
      setValue('')
      setMsg({ type: 'ok', text: '已保存' })
      void refresh()
    } else {
      setMsg({ type: 'err', text: res.error?.message ?? '保存失败' })
    }
  }

  const clear = async () => {
    if (!selected) return
    setMsg(null)
    const res = await harness.clearCredential(selected.ref)
    if (res.ok) {
      setMsg({ type: 'ok', text: '已清除' })
      void refresh()
    } else {
      setMsg({ type: 'err', text: res.error?.message ?? '清除失败' })
    }
  }

  return (
    <section>
      <h3>凭证管理</h3>
      <p className="hint" style={{ marginBottom: 8 }}>
        各模型的 API Key 统一在这里管理，只存本机（引用式存储）。
      </p>
      <div className="cred-list">
        {items.map((c) => (
          <button
            key={c.ref}
            className={`cred-item ${selected?.ref === c.ref ? 'active' : ''}`}
            onClick={() => choose(c)}
          >
            <span className="cred-label">{c.label}</span>
            <span className={`cred-ref mono ${c.configured ? 'status-ok' : 'status-warn'}`}>
              {c.configured ? '● 已配置' : '○ 未配置'}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="cred-editor">
          <div className="setting-row">
            <span className="mono">{selected.ref}</span>
            <span className={selected.configured ? 'status-ok' : 'status-warn'}>
              {selected.configured ? '已配置' : '未配置'}
            </span>
          </div>
          <div className="setting-input-row">
            <input
              type="password"
              className="input"
              placeholder={selected.configured ? '输入以更新（留空不动）' : 'sk-...'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <button className="btn primary small" onClick={save} disabled={saving || !value.trim()}>
              {saving ? '保存…' : '保存'}
            </button>
            {selected.configured && (
              <button className="btn danger small" onClick={clear}>
                清除
              </button>
            )}
          </div>
        </div>
      )}

      {msg && <div className={`settings-msg ${msg.type}`}>{msg.text}</div>}
    </section>
  )
}
