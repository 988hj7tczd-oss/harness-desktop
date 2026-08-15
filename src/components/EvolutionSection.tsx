import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, MemoryItem, SkillInfo, TaskRecord } from '../../shared/types'

const harness = window.harness

interface Props {
  appSettings: AppSettings
  activeSessionId: string | null
}

interface TimelineEvent {
  time: number
  type: 'task' | 'memory' | 'skill'
  label: string
  summary?: string
}

/** Agent 进化：时间线展示任务完成 → 记忆沉淀 → 技能提炼，直观展示"学了多少"。 */
export default function EvolutionSection({ appSettings, activeSessionId }: Props) {
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const tasks: TaskRecord[] = appSettings.tasks ?? []

  const refresh = useCallback(async () => {
    const [m, s] = await Promise.all([
      harness.listMemories(),
      activeSessionId ? harness.listSkills(activeSessionId) : Promise.resolve({ ok: false } as never),
    ])
    if (m.ok) setMemories(m.value!)
    if (s && (s as { ok?: boolean }).ok) setSkills((s as { value?: SkillInfo[] }).value ?? [])
  }, [activeSessionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 组装时间线：任务 + 记忆 + 技能，按时间倒序
  const events: TimelineEvent[] = [
    ...tasks.map((t) => ({
      time: t.endedAt ?? t.startedAt,
      type: 'task' as const,
      label: `任务${t.status === 'done' ? '完成' : t.status === 'failed' ? '失败' : '进行中'}`,
      summary: t.title,
    })),
    ...memories.map((m) => ({
      time: m.updatedAt,
      type: 'memory' as const,
      label: '记忆沉淀',
      summary: m.text.slice(0, 80),
    })),
    // 技能无可靠时间戳（Date.now() 会让时间线排序失真）→ 不进时间线，仅计入统计数
  ].sort((a, b) => b.time - a.time)

  const typeColor = (t: TimelineEvent['type']) => `evo-dot-${t}`

  return (
    <section>
      <h3>Agent 进化</h3>
      <p className="hint" style={{ marginBottom: 8 }}>
        agent 持续学习：完成任务沉淀记忆，同类任务提炼成技能。
      </p>

      <div className="evo-stats">
        <div className="evo-stat">
          <span className="evo-stat-num">{tasks.length}</span>
          <span className="evo-stat-label">任务</span>
        </div>
        <div className="evo-stat">
          <span className="evo-stat-num">{memories.length}</span>
          <span className="evo-stat-label">记忆</span>
        </div>
        <div className="evo-stat">
          <span className="evo-stat-num">{skills.length}</span>
          <span className="evo-stat-label">技能</span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="empty-hint">
          <div>还没有进化记录</div>
          <div className="hint">发一条消息让 agent 干活，完成后它会复盘沉淀记忆。</div>
        </div>
      ) : (
        <div className="evo-timeline">
          {events.slice(0, 50).map((e, i) => (
            <div key={i} className="evo-event">
              <span className={`evo-dot ${typeColor(e.type)}`} />
              <div className="evo-event-main">
                <div className="evo-event-head">
                  <span className="evo-event-type">{e.label}</span>
                  <span className="evo-event-time mono">{new Date(e.time).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {e.summary && <div className="evo-event-summary">{e.summary}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
