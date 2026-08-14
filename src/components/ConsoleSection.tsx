import { useCallback, useEffect, useState } from 'react'
import type { WebSearchConfig } from '../../shared/types'

const harness = window.harness

interface Props {
  sessionId: string | null
  planActive: boolean
  onPlanToggle: (active: boolean) => void
}

/** 控制台杂项：计划模式 / Web 搜索 / 会话导出。 */
export default function ConsoleSection({ sessionId, planActive, onPlanToggle }: Props) {
  const [web, setWeb] = useState<WebSearchConfig | null>(null)
  const [model, setModel] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    const res = await harness.getWebSearchConfig()
    if (res.ok) {
      setWeb(res.value!)
      setModel(res.value!.model)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const togglePlan = async () => {
    if (!sessionId) {
      setMsg({ type: 'err', text: '请先创建/打开一个会话' })
      return
    }
    const next = !planActive
    onPlanToggle(next)
    await harness.togglePlanMode(sessionId)
  }

  const saveWebSearch = async () => {
    setMsg(null)
    const res = await harness.setWebSearchConfig({ model })
    if (res.ok) {
      setWeb(res.value!)
      setMsg({ type: 'ok', text: 'Web 搜索配置已保存' })
    } else {
      setMsg({ type: 'err', text: res.error?.message ?? '保存失败' })
    }
  }

  const exportSession = async (format: 'json' | 'markdown') => {
    if (!sessionId) {
      setMsg({ type: 'err', text: '请先创建/打开一个会话' })
      return
    }
    const res = await harness.exportSession(sessionId, format)
    if (res.ok && res.value?.saved) setMsg({ type: 'ok', text: `已导出：${res.value.path}` })
    else if (res.ok) setMsg({ type: 'ok', text: '已取消导出' })
    else setMsg({ type: 'err', text: res.error?.message ?? '导出失败' })
  }

  return (
    <section>
      <h3>计划模式</h3>
      <div className="setting-row">
        <span>当前会话计划模式</span>
        <button className={`btn ${planActive ? 'secondary' : 'primary'} small`} onClick={togglePlan}>
          {planActive ? '退出计划模式' : '进入计划模式'}
        </button>
      </div>
      <p className="hint">计划模式下 Agent 先产出执行计划，经你确认后再执行（/plan 命令）。</p>

      <div style={{ marginTop: 12 }}>
        <h3>Web 搜索</h3>
        <p className="hint" style={{ marginBottom: 8 }}>
          配置 Web 搜索提供商（web-search-deepseek）。
        </p>
        <div className="setting-row">
          <span>提供商</span>
          <span className="mono">{web?.apiKeyEnv ?? 'DEEPSEEK_API_KEY'}</span>
        </div>
        <div className="setting-input-row">
          <input
            className="input mono"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="模型，如 deepseek-v4-flash"
          />
          <button className="btn primary small" onClick={saveWebSearch}>
            保存
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <h3>会话导出</h3>
        <p className="hint" style={{ marginBottom: 8 }}>
          导出当前会话内容。
        </p>
        <div className="setting-input-row">
          <button className="btn secondary small" onClick={() => exportSession('markdown')}>
            导出 Markdown
          </button>
          <button className="btn secondary small" onClick={() => exportSession('json')}>
            导出 JSON
          </button>
        </div>
      </div>

      {msg && <div className={`settings-msg ${msg.type}`}>{msg.text}</div>}
    </section>
  )
}
