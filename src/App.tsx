import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, DshStatus } from '../shared/types'
import Wizard from './components/Wizard'
import MainView from './components/MainView'
import WhaleLogo from './components/WhaleLogo'
import { emit } from './bus'

const harness = window.harness

export default function App() {
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [dshStatus, setDshStatus] = useState<DshStatus | null>(null)
  const [booting, setBooting] = useState(true)
  const [fatal, setFatal] = useState<string | null>(null)
  const [sessionListVersion, setSessionListVersion] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [stateRes, statusRes] = await Promise.all([harness.getAppState(), harness.ensureDsh()])
        if (!alive) return
        if (stateRes.ok) setAppSettings(stateRes.value!)
        if (statusRes.ok) setDshStatus(statusRes.value!)
        else if (statusRes.error) setFatal(statusRes.error.message)
      } catch (e) {
        if (alive) setFatal((e as Error).message)
      } finally {
        if (alive) setBooting(false)
      }
    })()

    const offEvent = harness.onSessionEvent((evt) => {
      emit(evt)
      if (evt.kind === 'title' || evt.kind === 'running' || evt.kind === 'session-subscribed') {
        setSessionListVersion((v) => v + 1)
      }
    })
    const offStatus = harness.onDshStatus((s) => {
      if (alive) setDshStatus(s)
    })
    return () => {
      alive = false
      offEvent()
      offStatus()
    }
  }, [])

  const onUpdateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const res = await harness.updateAppSettings(patch)
    if (res.ok) setAppSettings(res.value!)
    return res
  }, [])

  const onCompleteWizard = useCallback(
    async (workspaceCwd: string) => {
      const res = await harness.updateAppSettings({ onboarded: true, workspaceCwd })
      if (res.ok) setAppSettings(res.value!)
    },
    [],
  )

  const onSkipWizard = useCallback(async () => {
    const res = await harness.updateAppSettings({ onboarded: true })
    if (res.ok) setAppSettings(res.value!)
  }, [])

  // 外观：主题 / 主题色 / 字体 / 密度 通过 html 属性驱动 CSS 变量，即时生效
  useEffect(() => {
    const appearance = appSettings?.appearance
    if (!appearance) return
    const root = document.documentElement
    root.setAttribute('data-theme', appearance.theme)
    root.setAttribute('data-accent', appearance.accent)
    root.setAttribute('data-font-size', appearance.fontSize)
    root.setAttribute('data-density', appearance.density)
  }, [appSettings?.appearance])

  if (booting) {
    return (
      <div className="boot-screen">
        <WhaleLogo className="boot-logo" />
        <div className="boot-text">正在启动 DeepSeek Harness 引擎…</div>
      </div>
    )
  }

  if (fatal) {
    return (
      <div className="boot-screen">
        <div className="boot-text">{fatal}</div>
        <button className="btn primary" onClick={() => window.location.reload()}>
          重试
        </button>
      </div>
    )
  }

  if (!appSettings?.onboarded) {
    return (
      <Wizard
        dshReady={dshStatus?.ready ?? false}
        onComplete={onCompleteWizard}
        onSkip={onSkipWizard}
      />
    )
  }

  return (
    <MainView
      appSettings={appSettings}
      dshStatus={dshStatus}
      onUpdateSettings={onUpdateSettings}
      sessionListVersion={sessionListVersion}
      onSessionListTick={() => setSessionListVersion((v) => v + 1)}
    />
  )
}
