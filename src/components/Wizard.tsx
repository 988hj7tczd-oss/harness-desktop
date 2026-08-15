import { useEffect, useState } from 'react'
import type { ModelGroup } from '../../shared/types'
import WhaleLogo from './WhaleLogo'

const harness = window.harness

interface Props {
  dshReady: boolean
  onComplete: (workspaceCwd: string | null) => void
  onSkip: () => void
}

export default function Wizard({ dshReady, onComplete, onSkip }: Props) {
  const [step, setStep] = useState(1)
  const [models, setModels] = useState<ModelGroup[]>([])
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [keyMsg, setKeyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!dshReady) return
    ;(async () => {
      const m = await harness.listModels()
      if (m.ok) setModels(m.value!)
    })()
  }, [dshReady])

  const canNext1 = true
  const canNext2 = apiKey.trim().length > 0
  const stepLabel = `第 ${step} 步 / 共 4 步`

  const testKey = async () => {
    const key = apiKey.trim()
    if (!key) {
      setKeyMsg({ type: 'err', text: '请输入 API Key' })
      return
    }
    setTesting(true)
    setKeyMsg(null)
    const res = await harness.testApiKey(key)
    setTesting(false)
    setKeyMsg(res.ok ? { type: 'ok', text: res.value!.message } : { type: 'err', text: res.error?.message ?? '测试失败' })
  }

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
    setBusy(true)
    setError(null)
    try {
      // 有工作区则验证可创建会话；无工作区直接完成（用引擎默认 cwd）
      if (workspace) {
        const probe = await harness.createSession(workspace)
        if (!probe.ok) {
          setError(probe.error?.message ?? '工作区创建失败')
          setBusy(false)
          return
        }
      }
      onComplete(workspace ?? null)
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
          <p>装完即用的 AI 助手工作台</p>
        </div>

        <div className="wizard-progress">
          <span className={step >= 1 ? 'active' : ''}>欢迎</span>
          <span className={step >= 2 ? 'active' : ''}>配置 API Key</span>
          <span className={step >= 3 ? 'active' : ''}>选择工作区</span>
          <span className={step >= 4 ? 'active' : ''}>完成</span>
        </div>

        <div className="wizard-body">
          {!dshReady ? (
            <div className="wizard-loading">正在初始化引擎…</div>
          ) : (
            <>
              {step === 1 && (
                <div className="wizard-step">
                  <h2>开始吧</h2>
                  <p className="subtitle">
                    harness-desktop 内置 DeepSeek Harness 引擎：聊天、读文件、写代码、执行命令，一个窗口全搞定。
                    <br />
                    只需三步：配置 API Key → 选择工作区 → 开始对话。
                  </p>
                  <div className="hint" style={{ marginTop: 12 }}>
                    默认模型：{models.find((g) => g.models.length > 0)?.models.map((m) => m.name).join(' · ') ?? 'DeepSeek-V4-Flash'}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="wizard-step">
                  <h2>配置 API Key</h2>
                  <p className="subtitle">
                    Key 只保存在本机（safeStorage 加密 + dsh 凭据库），不会上传。
                  </p>
                  <input
                    type="password"
                    className="input"
                    placeholder="sk-...（YOUR_API_KEY）"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value)
                      setKeyMsg(null)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && canNext2 && goNext2()}
                    autoFocus
                  />
                  <div className="wizard-actions" style={{ marginTop: 10 }}>
                    <button className="btn secondary" onClick={testKey} disabled={testing || !canNext2}>
                      {testing ? '测试中…' : '测试连接'}
                    </button>
                  </div>
                  {keyMsg && <div className={`wizard-key-msg ${keyMsg.type}`}>{keyMsg.text}</div>}
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
                    Agent 将在这个文件夹中读写文件、执行命令。推荐用专门的空文件夹，也可以稍后跳过在设置里改。
                  </p>
                  <button className="btn secondary" onClick={pickWorkspace} disabled={picking}>
                    {picking ? '选择中…' : workspace ? '重新选择…' : '选择文件夹'}
                  </button>
                  {workspace && <div className="workspace-path">{workspace}</div>}
                </div>
              )}

              {step === 4 && (
                <div className="wizard-step">
                  <h2>准备就绪</h2>
                  <p className="subtitle">
                    配置完成！点击「开始使用」进入聊天，或稍后在设置中调整。
                  </p>
                  <div className="hint" style={{ marginTop: 12 }}>
                    已配置：API Key {apiKey ? '已保存' : '（未配置）'} · 工作区 {workspace ?? '（未选择）'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {error && <div className="wizard-error">{error}</div>}

        <div className="wizard-footer">
          <span className="wizard-step-label">{stepLabel}</span>
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
              <button className="btn primary" disabled={!canNext1} onClick={() => setStep(2)}>
                下一步
              </button>
            )}
            {step === 2 && (
              <button className="btn primary" disabled={!canNext2 || savingKey} onClick={goNext2}>
                {savingKey ? '保存中…' : '下一步'}
              </button>
            )}
            {step === 3 && (
              <button className="btn primary" disabled={busy} onClick={() => setStep(4)}>
                下一步
              </button>
            )}
            {step === 4 && (
              <button className="btn primary" disabled={busy} onClick={finish}>
                {busy ? '创建会话中…' : '开始使用'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
