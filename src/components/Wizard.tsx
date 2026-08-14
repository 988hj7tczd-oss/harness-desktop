import { useEffect, useState } from 'react'
import type { ModelGroup, ProviderInfo } from '../../shared/types'
import WhaleLogo from './WhaleLogo'

const harness = window.harness

interface Props {
  dshReady: boolean
  onComplete: (workspaceCwd: string) => void
  onSkip: () => void
}

export default function Wizard({ dshReady, onComplete, onSkip }: Props) {
  const [step, setStep] = useState(1)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [models, setModels] = useState<ModelGroup[]>([])
  const [provider, setProvider] = useState<string>('deepseek-official')
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!dshReady) return
    ;(async () => {
      const [p, m] = await Promise.all([harness.listProviders(), harness.listModels()])
      if (p.ok) setProviders(p.value!)
      if (m.ok) setModels(m.value!)
    })()
  }, [dshReady])

  const modelOptions =
    models.find((g) => g.id === provider)?.models ??
    models.flatMap((g) => g.models)

  const stepLabel = () => (step === 1 ? '第 1 步 / 共 3 步' : step === 2 ? '第 2 步 / 共 3 步' : '第 3 步 / 共 3 步')

  const canNext1 = provider.length > 0
  const canNext2 = apiKey.trim().length > 0

  const goNext1 = () => setStep(2)

  const goNext2 = async () => {
    setSavingKey(true)
    setError(null)
    try {
      const res = await harness.setApiKey(apiKey.trim())
      if (res.ok) setStep(3)
      else setError(res.error?.message ?? '保存失败')
    } finally {
      setSavingKey(false)
    }
  }

  const pickWorkspace = async () => {
    setPicking(true)
    try {
      const res = await harness.pickDirectory()
      if (res.ok && res.value) setWorkspace(res.value)
    } finally {
      setPicking(false)
    }
  }

  const finish = async () => {
    if (!workspace) return
    setBusy(true)
    setError(null)
    try {
      // 先建一个会话验证配置可用
      const probe = await harness.createSession(workspace)
      if (probe.ok) {
        onComplete(workspace)
      } else {
        setError(probe.error?.message ?? '工作区创建失败')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wizard-backdrop">
      <div className="wizard-card">
        <div className="wizard-header">
          <WhaleLogo className="wizard-logo" />
          <h1>欢迎使用 harness-desktop</h1>
          <p>DeepSeek Harness 的开箱即用桌面客户端</p>
        </div>

        <div className="wizard-progress">
          <span className={step >= 1 ? 'active' : ''}>1 选择模型</span>
          <span className={step >= 2 ? 'active' : ''}>2 填写 API Key</span>
          <span className={step >= 3 ? 'active' : ''}>3 选择工作区</span>
        </div>

        <div className="wizard-body">
          {!dshReady ? (
            <div className="wizard-loading">正在初始化引擎…</div>
          ) : (
            <>
              {step === 1 && (
                <div className="wizard-step">
                  <h2>选择模型提供商</h2>
                  <div className="provider-grid">
                    {providers.map((p) => (
                      <button
                        key={p.id}
                        className={`provider-card ${provider === p.id ? 'selected' : ''}`}
                        onClick={() => setProvider(p.id)}
                      >
                        <span className="provider-name">{p.name}</span>
                        <span className="provider-id">{p.id}</span>
                      </button>
                    ))}
                    {providers.length === 0 && (
                      <div className="hint">未发现可用提供商，请检查配置。</div>
                    )}
                  </div>
                  {modelOptions.length > 0 && (
                    <div className="hint" style={{ marginTop: 12 }}>
                      可用模型：{modelOptions.map((m) => m.name).join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="wizard-step">
                  <h2>输入 DeepSeek API Key</h2>
                  <p className="subtitle">
                    Key 只保存在本机（DSH 凭据库），不会上传。
                  </p>
                  <input
                    type="password"
                    className="input"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canNext2 && goNext2()}
                    autoFocus
                  />
                  <div className="hint">
                    没有 Key？前往{' '}
                    <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">
                      platform.deepseek.com
                    </a>{' '}
                    获取。
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="wizard-step">
                  <h2>选择工作区文件夹</h2>
                  <p className="subtitle">
                    Agent 将在这个文件夹中读写文件、执行命令。推荐用专门的空文件夹。
                  </p>
                  <button className="btn secondary" onClick={pickWorkspace} disabled={picking}>
                    {picking ? '选择中…' : workspace ? '重新选择…' : '选择文件夹'}
                  </button>
                  {workspace && (
                    <div className="workspace-path">{workspace}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {error && <div className="wizard-error">{error}</div>}

        <div className="wizard-footer">
          <span className="wizard-step-label">{stepLabel()}</span>
          <div className="wizard-actions">
            {step > 1 && (
              <button className="btn" onClick={() => setStep((s) => s - 1)}>
                上一步
              </button>
            )}
            <button className="btn wizard-skip" onClick={onSkip}>
              稍后配置
            </button>
            {step === 1 && (
              <button className="btn primary" disabled={!canNext1} onClick={goNext1}>
                下一步
              </button>
            )}
            {step === 2 && (
              <button className="btn primary" disabled={!canNext2 || savingKey} onClick={goNext2}>
                {savingKey ? '保存中…' : '下一步'}
              </button>
            )}
            {step === 3 && (
              <button className="btn primary" disabled={!workspace || busy} onClick={finish}>
                {busy ? '创建会话中…' : '开始使用'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
