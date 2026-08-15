import { useEffect, useState } from 'react'

const harness = window.harness

type UpdateStatus = { state: string; version?: string; percent?: number; message?: string }

/** 设置 → 通用 → 关于：检查更新 + 状态显示（021 自动更新）。 */
export default function UpdateSection() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    void window.__desktop__.getVersion().then((v) => setAppVersion(v))
    const off = harness.onUpdateStatus((s) => {
      setStatus(s)
      if (s.state !== 'downloading') setChecking(false)
    })
    return off
  }, [])

  const check = async () => {
    setChecking(true)
    setStatus(null)
    const res = await harness.checkForUpdates()
    if (!res.ok) {
      setChecking(false)
      setStatus({ state: 'error', message: res.error?.message ?? '检查更新失败' })
    }
  }

  const install = async () => {
    await harness.quitAndInstall()
  }

  return (
    <section>
      <h3>关于与更新</h3>
      <div className="setting-row">
        <span>当前版本</span>
        <span className="mono">v{appVersion || '0.1.0'}</span>
      </div>
      <div className="setting-row">
        <span>项目</span>
        <span>harness-desktop · 开箱即用的 DeepSeek Harness 桌面客户端</span>
      </div>
      <div className="setting-row">
        <span>平台</span>
        <span className="topics-row">
          <span className="topic-tag">macOS</span>
          <span className="topic-tag">Windows</span>
          <span className="topic-tag">Linux</span>
        </span>
      </div>
      <div className="setting-row">
        <span>话题</span>
        <span className="topics-row">
          {['deepseek-harness', 'electron', 'desktop-app', 'ai-agent', 'react', 'typescript', 'llm'].map((t) => (
            <span key={t} className="topic-tag">
              {t}
            </span>
          ))}
        </span>
      </div>
      <div className="setting-input-row">
        <button className="btn secondary small" onClick={check} disabled={checking}>
          {checking ? '检查中…' : '检查更新'}
        </button>
      </div>
      {status && (
        <div className={`settings-msg ${status.state === 'error' ? 'err' : 'ok'}`} style={{ marginTop: 8 }}>
          {status.state === 'checking' && '正在检查更新…'}
          {status.state === 'available' && `发现新版本 v${status.version}，正在下载…`}
          {status.state === 'downloading' && `正在下载更新 ${status.percent ?? 0}%`}
          {status.state === 'downloaded' && (
            <span>
              新版本 v{status.version} 已下载{' '}
              <button className="link-btn" onClick={install}>
                立即重启更新
              </button>
            </span>
          )}
          {status.state === 'error' && `检查更新失败：${status.message ?? '未知错误'}`}
          {status.state === 'up-to-date' && '已是最新版本'}
        </div>
      )}
    </section>
  )
}
