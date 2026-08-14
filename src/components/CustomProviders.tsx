import { useCallback, useEffect, useState } from 'react'
import type {
  CustomProviderApi,
  CustomProviderConfig,
  CustomProviderListItem,
  CustomProviderModel,
} from '../../shared/types'

const harness = window.harness

const API_OPTIONS: { value: CustomProviderApi; label: string }[] = [
  { value: 'openai-completions', label: 'OpenAI 兼容（/chat/completions）' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic 兼容（/v1/messages）' },
]

const API_LABELS: Record<string, string> = Object.fromEntries(API_OPTIONS.map((o) => [o.value, o.label]))

interface Props {
  onChanged: () => void
}

/** 从显示名生成 provider id（小写、连字符）。中文名会得到空串，需手填。 */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface FormState {
  displayName: string
  id: string
  api: CustomProviderApi
  baseURL: string
  apiKey: string
  apiKeyEnv: string
  models: CustomProviderModel[]
  idTouched: boolean
}

const emptyForm: FormState = {
  displayName: '',
  id: '',
  api: 'openai-completions',
  baseURL: '',
  apiKey: '',
  apiKeyEnv: '',
  models: [{ id: '', name: '' }],
  idTouched: false,
}

export default function CustomProviders({ onChanged }: Props) {
  const [items, setItems] = useState<CustomProviderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    const res = await harness.listCustomProviders()
    if (res.ok) setItems(res.value!)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const startAdd = () => {
    setForm(emptyForm)
    setMsg(null)
    setShowForm(true)
  }

  const startEdit = (item: CustomProviderListItem) => {
    setForm({
      displayName: item.displayName,
      id: item.id,
      api: (['openai-completions', 'openai-responses', 'anthropic-messages'] as CustomProviderApi[]).includes(
        item.api as CustomProviderApi,
      )
        ? (item.api as CustomProviderApi)
        : 'openai-completions',
      baseURL: item.baseURL,
      apiKey: '',
      apiKeyEnv: item.apiKeyEnv ?? '',
      models: item.models.length ? item.models.map((m) => ({ id: m.id, name: m.name })) : [{ id: '', name: '' }],
      idTouched: true,
    })
    setMsg(null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setForm(emptyForm)
    setMsg(null)
  }

  const remove = async (id: string) => {
    const res = await harness.removeCustomProvider(id)
    if (res.ok) {
      setMsg({ type: 'ok', text: '已删除' })
      void refresh()
      onChanged()
    } else {
      setMsg({ type: 'err', text: res.error?.message ?? '删除失败' })
    }
  }

  const updateForm = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  const onNameChange = (name: string) => {
    const idAuto = form.idTouched ? form.id : slugify(name)
    updateForm({ displayName: name, id: idAuto })
  }

  const updateModel = (idx: number, patch: Partial<CustomProviderModel>) => {
    const models = form.models.map((m, i) => (i === idx ? { ...m, ...patch } : m))
    updateForm({ models })
  }

  const addModel = () => updateForm({ models: [...form.models, { id: '', name: '' }] })
  const removeModel = (idx: number) =>
    updateForm({ models: form.models.filter((_, i) => i !== idx) })

  const save = async () => {
    const displayName = form.displayName.trim()
    const id = form.id.trim()
    const baseURL = form.baseURL.trim()
    const models = form.models
      .map((m) => ({ id: m.id.trim(), name: m.name?.trim() }))
      .filter((m) => m.id.length > 0)

    if (!displayName) return setMsg({ type: 'err', text: '请填写供应商名称' })
    if (!/^[a-z][a-z0-9_-]*$/.test(id)) return setMsg({ type: 'err', text: 'Provider ID 需以小写字母开头，仅含小写字母/数字/-/_' })
    if (!baseURL) return setMsg({ type: 'err', text: '请填写 Base URL' })
    if (models.length === 0) return setMsg({ type: 'err', text: '请至少添加一个模型' })

    setSaving(true)
    setMsg(null)
    const config: CustomProviderConfig = {
      id,
      displayName,
      api: form.api,
      baseURL,
      models,
    }
    if (form.apiKeyEnv) config.apiKeyEnv = form.apiKeyEnv
    const saveRes = await harness.saveCustomProvider(config)
    if (!saveRes.ok) {
      setSaving(false)
      return setMsg({ type: 'err', text: saveRes.error?.message ?? '保存失败' })
    }
    // 若填写了 Key，写入凭据库（引用式存储）
    if (form.apiKey.trim()) {
      const keyRes = await harness.setProviderApiKey(form.apiKeyEnv || `${id.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`, form.apiKey.trim())
      if (!keyRes.ok) {
        setSaving(false)
        return setMsg({ type: 'err', text: `供应商已保存，但 Key 写入失败：${keyRes.error?.message ?? ''}` })
      }
    }
    setSaving(false)
    setMsg({ type: 'ok', text: '已保存' })
    setShowForm(false)
    setForm(emptyForm)
    void refresh()
    onChanged()
  }

  return (
    <section>
      <div className="setting-row" style={{ marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>自定义接入</h3>
        <button className="btn primary small" onClick={startAdd} disabled={showForm}>
          + 添加自定义供应商
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 8 }}>
        接入 OpenAI / Anthropic 兼容端点（自建网关、中转等）。配置保存在本机 dsh 设置中。
      </p>

      {loading && <div className="hint">加载中…</div>}

      {!loading && items.length > 0 && (
        <div className="custom-provider-list">
          {items.map((item) => (
            <div key={item.id} className="custom-provider-item">
              <div className="custom-provider-info">
                <div className="custom-provider-title">
                  {item.displayName}
                  <span className={item.active ? 'status-ok' : 'status-warn'}>
                    {item.active ? ' ● 可用' : ' ○ 未激活'}
                  </span>
                </div>
                <div className="custom-provider-meta">
                  <span className="mono">{item.id}</span> · {API_LABELS[item.api] ?? item.api}
                </div>
                <div className="custom-provider-meta mono">
                  {item.baseURL}
                  <span className="custom-provider-models">
                    {item.models.map((m) => m.name || m.id).join(', ')}
                  </span>
                </div>
              </div>
              <div className="custom-provider-actions">
                <button className="btn ghost small" onClick={() => startEdit(item)}>
                  编辑
                </button>
                <button className="btn danger small" onClick={() => remove(item.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && !showForm && (
        <div className="hint">还没有自定义供应商。点击上方按钮添加一个 OpenAI 兼容端点。</div>
      )}

      {showForm && (
        <div className="custom-provider-form">
          <h4>{form.apiKeyEnv && items.some((i) => i.id === form.id) ? '编辑供应商' : '添加自定义供应商'}</h4>

          <label className="field">
            <span>供应商名称（显示名）</span>
            <input
              className="input"
              value={form.displayName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="如：我的公司网关"
            />
          </label>

          <label className="field">
            <span>Provider ID（小写唯一 ID）</span>
            <input
              className="input mono"
              value={form.id}
              disabled={form.idTouched}
              onChange={(e) => updateForm({ id: e.target.value, idTouched: true })}
              placeholder="如：my-gateway"
            />
          </label>

          <label className="field">
            <span>Base URL</span>
            <input
              className="input mono"
              value={form.baseURL}
              onChange={(e) => updateForm({ baseURL: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </label>

          <label className="field">
            <span>API 协议</span>
            <select className="input" value={form.api} onChange={(e) => updateForm({ api: e.target.value as CustomProviderApi })}>
              {API_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>API Key {form.apiKeyEnv ? <em className="hint">（{form.apiKeyEnv}）</em> : null}</span>
            <input
              type="password"
              className="input"
              value={form.apiKey}
              onChange={(e) => updateForm({ apiKey: e.target.value })}
              placeholder={form.apiKeyEnv ? '留空则不修改 Key' : 'sk-...'}
            />
          </label>

          <div className="field">
            <span>模型列表</span>
            {form.models.map((m, idx) => (
              <div key={idx} className="model-row">
                <input
                  className="input mono"
                  value={m.id}
                  onChange={(e) => updateModel(idx, { id: e.target.value })}
                  placeholder="模型 ID，如 gpt-4o"
                />
                <input
                  className="input"
                  value={m.name ?? ''}
                  onChange={(e) => updateModel(idx, { name: e.target.value })}
                  placeholder="显示名（可选）"
                />
                <button className="btn danger small" onClick={() => removeModel(idx)} disabled={form.models.length === 1}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn secondary small" onClick={addModel}>
              + 添加模型
            </button>
          </div>

          {msg && <div className={`settings-msg ${msg.type}`}>{msg.text}</div>}

          <div className="custom-provider-form-actions">
            <button className="btn" onClick={closeForm}>
              取消
            </button>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
