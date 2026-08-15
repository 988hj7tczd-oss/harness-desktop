import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, DshStatus, SessionSummary, TaskRecord } from '../../shared/types'
import { subscribeAll } from '../bus'
import { TaskStore } from '../tasks'
import Brand from './Brand'
import Sidebar from './Sidebar'
import ChatView from './ChatView'
import TaskPanel from './TaskPanel'
import SettingsModal from './SettingsModal'

const harness = window.harness

interface Props {
  appSettings: AppSettings
  dshStatus: DshStatus | null
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<{ ok: boolean; error?: { message?: string } }>
  sessionListVersion: number
  onSessionListTick: () => void
}

export default function MainView({
  appSettings,
  dshStatus,
  onUpdateSettings,
  sessionListVersion,
  onSessionListTick,
}: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [creating, setCreating] = useState(false)
  const [modelsTick, setModelsTick] = useState(0)
  const [mode, setMode] = useState('standard')
  const [apiKeyMissing, setApiKeyMissing] = useState(false)
  const [keyTick, setKeyTick] = useState(0)
  const [view, setView] = useState<'chat' | 'tasks'>('chat')
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const listRefreshRef = useRef(() => {})

  // 任务存储：从会话事件推导任务状态
  const taskStoreRef = useRef<TaskStore | null>(null)
  if (!taskStoreRef.current) {
    taskStoreRef.current = new TaskStore((next) => {
      void onUpdateSettings({ tasks: next })
    })
  }
  useEffect(() => {
    const unsub = taskStoreRef.current!.subscribe((t) => setTasks(t))
    taskStoreRef.current!.load(appSettings.tasks ?? [])
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 任务事件流 → 更新任务状态
  useEffect(() => {
    return subscribeAll((evt) => {
      taskStoreRef.current?.handleEvent(evt)
    })
  }, [])

  // 定时提醒触发 → 自动创建任务（E）
  useEffect(() => {
    return harness.onReminderFired(({ sessionId, text }) => {
      taskStoreRef.current?.startTask(sessionId, `[定时提醒] ${text}`, 'schedule')
    })
  }, [])

  const startTask = useCallback((sessionId: string, title: string) => {
    taskStoreRef.current?.startTask(sessionId, title, 'chat')
  }, [])

  // A1 复盘：走独立隐藏会话（已归档，不出现在会话列表），用户聊天界面干净
  const reviewTask = useCallback(
    async (_sessionId: string, title: string) => {
      const auto = appSettings.evolution?.autoReview ?? true
      if (!auto) return
      const prompt = [
        '【复盘】请回顾并提炼值得长期记住的内容（你面对的是一个已完成的任务，任务目标：' + title + '）：',
        '1. 用户偏好（如喜欢简洁/中文/特定风格）→ 用 memory_save 保存，tag: preference',
        '2. 项目约定（如用 pnpm/目录规范）→ 用 memory_save 保存，tag: project',
        '3. 成功做法（如"处理这类任务先搜索再动手"）→ 用 memory_save 保存，tag: practice',
        '每条记忆用一句话，简明扼要。若没有值得记住的，回复"无"。',
      ].join('\n')
      try {
        // 确保存在隐藏复盘会话
        let reviewId = appSettings.reviewSessionId ?? null
        if (!reviewId) {
          const created = await harness.createSession(appSettings.workspaceCwd ?? undefined)
          if (created.ok) {
            reviewId = created.value!.sessionId
            await harness.archiveSession(reviewId)
            await onUpdateSettings({ reviewSessionId: reviewId })
          }
        }
        if (reviewId) await harness.sendMessage(reviewId, prompt)
      } catch {
        // 复盘失败不阻塞
      }
    },
    [appSettings.evolution, appSettings.workspaceCwd, appSettings.reviewSessionId, onUpdateSettings],
  )

  // 自动复盘：任务完成时触发
  useEffect(() => {
    taskStoreRef.current?.setOnDone((task) => {
      void reviewTask(task.sessionId, task.title)
    })
  }, [reviewTask])

  const retryTask = useCallback((taskId: string) => {
    const info = taskStoreRef.current?.retry(taskId)
    if (info) {
      setActiveId(info.sessionId)
      setView('chat')
      // 重试 = 重新发同一 prompt
      void harness.sendMessage(info.sessionId, info.title)
    }
  }, [])

  // D1/A2：已完成任务按标题相似度聚类，≥3 次建议/自动提炼技能
  const skillClusters = useMemo(() => clusterTasks(tasks), [tasks])
  const skillSuggestions = useMemo(
    () =>
      skillClusters
        .filter((c) => c.count >= 3)
        .map((c) => ({ type: c.label, count: c.count })),
    [skillClusters],
  )

  // A2：同类 ≥3 次 → 自动触发技能提炼（走隐藏复盘会话，agent 写 SKILL.md）
  useEffect(() => {
    if (skillSuggestions.length === 0) return
    const generated = appSettings.generatedSkillTypes ?? []
    const pending = skillSuggestions.filter((s) => !generated.includes(s.type))
    if (pending.length === 0) return
    void (async () => {
      let reviewId = appSettings.reviewSessionId ?? null
      if (!reviewId) {
        const created = await harness.createSession(appSettings.workspaceCwd ?? undefined)
        if (created.ok) {
          reviewId = created.value!.sessionId
          await harness.archiveSession(reviewId)
          await onUpdateSettings({ reviewSessionId: reviewId })
        }
      }
      for (const s of pending) {
        if (reviewId) {
          await harness.sendMessage(reviewId, buildSkillPrompt(s.type))
        }
        await onUpdateSettings({ generatedSkillTypes: [...generated, s.type] })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillSuggestions])

  // A2：手动生成技能按钮
  const generateSkill = useCallback(
    async (sessionId: string, type: string) => {
      await harness.sendMessage(sessionId, buildSkillPrompt(type))
      const generated = appSettings.generatedSkillTypes ?? []
      await onUpdateSettings({ generatedSkillTypes: [...generated, type] })
    },
    [appSettings.generatedSkillTypes, onUpdateSettings],
  )

  // 检测 DeepSeek API Key 是否配置（用于输入区提示条；设置关闭后重新检测）
  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await harness.hasApiKey()
      if (alive) setApiKeyMissing(!res.ok || !res.value)
    })()
    return () => {
      alive = false
    }
  }, [keyTick])

  // 置顶会话排最前（按置顶先后），其余按 updatedAt 降序
  const pinnedSessionIds = appSettings.pinnedSessionIds ?? []
  const sessionColors = appSettings.sessionColors ?? {}
  const displaySessions = useMemo(() => {
    // 去重保险（sessionId 唯一），避免侧栏出现同一会话两行
    const uniq = sessions.filter((s, i, arr) => arr.findIndex((x) => x.sessionId === s.sessionId) === i)
    const pinnedSet = new Set(pinnedSessionIds)
    const pinned = pinnedSessionIds
      .map((id) => uniq.find((s) => s.sessionId === id))
      .filter((s): s is SessionSummary => Boolean(s))
    const rest = uniq.filter((s) => !pinnedSet.has(s.sessionId))
    return [...pinned, ...rest]
  }, [sessions, pinnedSessionIds])

  const refreshSessions = useCallback(async () => {
    const res = await harness.listSessions()
    if (!res.ok) return
    const items = res.value!
    // 保留侧边栏已收到的 running 状态（bus 实时事件为准），
    // 避免 session.list 的延迟/竞态把转圈状态覆盖掉
    setSessions((prev) => {
      const runningById = new Map(prev.map((s) => [s.sessionId, s.running]))
      return items.map((s) => ({
        ...s,
        running: runningById.get(s.sessionId) ?? s.running,
      }))
    })
    // 激活一个会话：优先保持当前，否则第一个非空白会话
    if (activeId) {
      const stillThere = items.some((s) => s.sessionId === activeId)
      if (!stillThere) {
        const next = items.find((s) => !s.blank) ?? items[0]
        setActiveId(next?.sessionId ?? null)
      }
    } else {
      const next = items.find((s) => !s.blank) ?? items[0]
      setActiveId(next?.sessionId ?? null)
    }
    setLoadingList(false)
  }, [activeId])

  useEffect(() => {
    void refreshSessions()
  }, [sessionListVersion])

  // 会话 running 状态即时更新（无需等 session.list 往返），让侧边栏转圈即时生效
  const runningTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  useEffect(() => {
    return subscribeAll((evt) => {
      if (evt.kind !== 'running') return
      const { sessionId, running } = evt
      if (running) {
        // 新的工作状态：取消可能挂起的「停止」计时器，立即转圈
        const timers = runningTimersRef.current
        const pending = timers.get(sessionId)
        if (pending) {
          clearTimeout(pending)
          timers.delete(sessionId)
        }
        setSessions((prev) =>
          prev.map((s) => (s.sessionId === sessionId ? { ...s, running: true } : s)),
        )
      } else {
        // 停止：延迟 MIN_RUNNING_MS 生效，保证转圈至少可见一小段（短任务也有反馈）
        const timers = runningTimersRef.current
        const existing = timers.get(sessionId)
        if (existing) clearTimeout(existing)
        const timer = setTimeout(() => {
          timers.delete(sessionId)
          setSessions((prev) =>
            prev.map((s) => (s.sessionId === sessionId ? { ...s, running: false } : s)),
          )
        }, 800)
        timers.set(sessionId, timer)
      }
    })
  }, [])

  useEffect(() => {
    listRefreshRef.current = refreshSessions
  }, [refreshSessions])

  const newChat = useCallback(async () => {
    setCreating(true)
    try {
      const res = await harness.createSession(appSettings.workspaceCwd ?? undefined, mode)
      if (res.ok) {
        setActiveId(res.value!.sessionId)
        await refreshSessions()
      }
    } finally {
      setCreating(false)
    }
  }, [appSettings.workspaceCwd, refreshSessions, mode])

  // 空状态首页直接发送：会话已由 ChatView 创建，这里只激活 + 刷新列表
  const activateSession = useCallback(
    async (sessionId: string) => {
      setActiveId(sessionId)
      setView('chat')
      await refreshSessions()
    },
    [refreshSessions],
  )

  // 菜单快捷键：Cmd+N 新会话 / Cmd+, 设置
  useEffect(() => {
    return harness.onMenuEvent((action) => {
      if (action === 'new-chat') void newChat()
      else if (action === 'open-settings') setSettingsOpen(true)
    })
  }, [newChat])

  const selectSession = useCallback((id: string) => {
    setActiveId(id)
    // 切换会话时同步模式为该会话的 agent preset
    const s = sessions.find((x) => x.sessionId === id)
    if (s?.agentPreset) setMode(s.agentPreset)
    onSessionListTick()
  }, [sessions, onSessionListTick])

  const changeWorkspace = useCallback(async () => {
    const res = await harness.pickDirectory()
    if (!res.ok || !res.value) return
    await onUpdateSettings({ workspaceCwd: res.value })
    onSessionListTick()
  }, [onUpdateSettings, onSessionListTick])

  // ---- 会话管理操作 ----

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      if (!title.trim()) return false
      const res = await harness.renameSession(sessionId, title.trim())
      if (res.ok) onSessionListTick()
      return res.ok
    },
    [onSessionListTick],
  )

  const togglePin = useCallback(
    async (sessionId: string) => {
      const current = appSettings.pinnedSessionIds ?? []
      const next = current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId]
      await onUpdateSettings({ pinnedSessionIds: next })
    },
    [appSettings.pinnedSessionIds, onUpdateSettings],
  )

  const setSessionColor = useCallback(
    async (sessionId: string, color: string) => {
      const current = appSettings.sessionColors ?? {}
      await onUpdateSettings({ sessionColors: { ...current, [sessionId]: color } })
    },
    [appSettings.sessionColors, onUpdateSettings],
  )

  const forkSession = useCallback(
    async (sessionId: string) => {
      const res = await harness.forkSession(sessionId)
      if (res.ok) {
        setActiveId(res.value!.sessionId)
        await refreshSessions()
      }
      return res.ok
    },
    [refreshSessions],
  )

  const archiveSession = useCallback(
    async (sessionId: string) => {
      const res = await harness.archiveSession(sessionId)
      if (res.ok) {
        setActiveId((cur) => (cur === sessionId ? null : cur))
        await refreshSessions()
      }
      return res.ok
    },
    [refreshSessions],
  )

  const hardDeleteSession = useCallback(
    async (sessionId: string, cwd?: string) => {
      const res = await harness.hardDeleteSession(sessionId, cwd)
      if (res.ok) {
        setActiveId((cur) => (cur === sessionId ? null : cur))
        await refreshSessions()
      }
      return res.ok
    },
    [refreshSessions],
  )

  const exportSession = useCallback(async (sessionId: string, format: 'zip' | 'markdown' = 'zip') => {
    await harness.exportSession(sessionId, format)
  }, [])

  const copySessionId = useCallback(async (sessionId: string) => {
    await harness.copyText(sessionId)
  }, [])

  return (
    <div className="app-shell">
      <header className="brand-bar">
        <Brand />
      </header>
      <div className="app-body">
        <Sidebar
          sessions={displaySessions}
          activeId={activeId}
          loading={loadingList}
          creating={creating}
          pinnedSessionIds={pinnedSessionIds}
          sessionColors={sessionColors}
          view={view}
          onSwitchView={setView}
          onNewChat={newChat}
          onSelect={selectSession}
          onOpenSettings={() => setSettingsOpen(true)}
          onRefresh={() => {
            setLoadingList(true)
            void refreshSessions()
          }}
          onRename={renameSession}
          onTogglePin={togglePin}
          onSetColor={setSessionColor}
          onFork={forkSession}
          onArchive={archiveSession}
          onDelete={hardDeleteSession}
          onExport={exportSession}
          onCopyId={copySessionId}
        />
        {view === 'chat' ? (
          <ChatView
            sessionId={activeId}
            onTitleChange={() => onSessionListTick()}
            modelsTick={modelsTick}
            workspaceCwd={appSettings.workspaceCwd}
            mode={mode}
            onModeChange={setMode}
            onChangeWorkspace={changeWorkspace}
            apiKeyMissing={apiKeyMissing}
            onOpenSettings={() => setSettingsOpen(true)}
            onTaskCreated={startTask}
            onSessionCreated={(id) => void activateSession(id)}
          />
        ) : (
          <TaskPanel
            tasks={tasks}
            onRetry={retryTask}
            onReview={reviewTask}
            onCancel={(sessionId) => void harness.cancelTurn(sessionId)}
          />
        )}
      </div>
      {settingsOpen && (
        <SettingsModal
          appSettings={appSettings}
          dshStatus={dshStatus}
          activeSessionId={activeId}
          planActive={sessions.find((s) => s.sessionId === activeId)?.planActive ?? false}
          onUpdateSettings={onUpdateSettings}
          onClose={() => {
            setSettingsOpen(false)
            setKeyTick((t) => t + 1)
          }}
          onWorkspaceChanged={() => onSessionListTick()}
          onProvidersChanged={() => setModelsTick((t) => t + 1)}
          onPlanToggle={(active) => {
            // 乐观更新当前会话计划模式状态
            setSessions((prev) =>
              prev.map((s) => (s.sessionId === activeId ? { ...s, planActive: active } : s)),
            )
          }}
          skillSuggestions={skillSuggestions}
          onGenerateSkill={generateSkill}
        />
      )}
    </div>
  )
}

/** 标题字符双元组集合（用于相似度）。 */
function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

/** Jaccard 相似度（0-1）。 */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

interface SkillCluster {
  label: string
  count: number
  sessionIds: string[]
}

/** 已完成任务按标题相似度聚类（简单字符串相似度，无需 ML）。 */
function clusterTasks(tasks: TaskRecord[]): SkillCluster[] {
  const done = tasks.filter((t) => t.status === 'done' && t.title)
  const clusters: { label: string; items: TaskRecord[] }[] = []
  const normalize = (t: string) => t.replace(/[，。！？!?,.、\s]/g, '')
  for (const t of done) {
    const n = normalize(t.title)
    const found = clusters.find((c) => similarity(normalize(c.label), n) >= 0.45)
    if (found) {
      found.items.push(t)
    } else {
      clusters.push({ label: n.slice(0, 8) || t.title, items: [t] })
    }
  }
  return clusters
    .filter((c) => c.items.length >= 1)
    .map((c) => ({
      label: c.label,
      count: c.items.length,
      sessionIds: [...new Set(c.items.map((i) => i.sessionId))],
    }))
}

/** 技能名安全化（kebab-case）。 */
function sanitizeName(type: string): string {
  return (
    type
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'skill'
  )
}

/** 生成技能提炼 prompt（让 agent 写 SKILL.md 到技能目录）。 */
function buildSkillPrompt(type: string): string {
  const name = sanitizeName(type)
  return [
    `请把「${type}」这类任务提炼成一个技能（SKILL），写到用户技能目录 \`$DSH_HOME/skills/${name}/SKILL.md\`（用你的文件工具创建目录和文件）。`,
    'SKILL.md 用 YAML frontmatter：name（kebab-case）、description、when_to_use。',
    '内容包含：任务类型、标准步骤（结合你处理这类任务的经验总结）、常见坑、验证方式。',
    '写完回复 "已创建技能 /' + name + '"。',
  ].join('\n')
}
