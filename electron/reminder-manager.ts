/**
 * electron/reminder-manager.ts —— 桌面端定时提醒。
 *
 * dsh 的 schedule 是 agent 工具（无公开 RPC），这里在桌面端实现：
 * 到点后用 session.prompt 把提醒作为用户消息注入目标会话。
 * 数据存 app-settings.json（reminders 字段）。
 */
import type { AppSettings, Reminder } from '../shared/types.js'
import type { DshAdapter } from '../adapter/index.js'

const TICK_MS = 10_000

/** 计算下一个每日触发时刻（HH:MM）。 */
function nextDaily(hhmm: string, now: number): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h || 9, m || 0, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** 计算下一个每周触发时刻（星期 + HH:MM，周日=0）。 */
function nextWeekly(day: number, hhmm: string, now: number): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h || 9, m || 0, 0, 0)
  while (d.getDay() !== ((day % 7) + 7) % 7 || d.getTime() <= now) {
    d.setDate(d.getDate() + 1)
  }
  return d.getTime()
}

export class ReminderManager {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private getSettings: () => AppSettings,
    private persist: (reminders: Reminder[]) => void,
    private getAdapter: () => DshAdapter | null,
    private onFired?: (r: Reminder, sessionId: string) => void,
  ) {}

  start() {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    void this.tick()
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  list(): Reminder[] {
    return this.getSettings().reminders ?? []
  }

  create(input: Omit<Reminder, 'id' | 'nextAt'>): Reminder {
    const now = Date.now()
    const id = `rem-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const nextAt =
      input.kind === 'after'
        ? now + (input.afterSeconds ?? 0) * 1000
        : input.kind === 'at'
          ? (input.at ?? now)
          : input.kind === 'every'
            ? now + (input.everySeconds ?? 300) * 1000
            : input.kind === 'daily'
              ? nextDaily(input.dailyTime ?? '09:00', now)
              : nextWeekly(input.weeklyDay ?? 0, input.dailyTime ?? '09:00', now)
    const reminder: Reminder = { ...input, id, nextAt }
    this.persist([...this.list(), reminder])
    return reminder
  }

  delete(id: string): void {
    this.persist(this.list().filter((r) => r.id !== id))
  }

  private async tick() {
    const now = Date.now()
    const reminders = this.list()
    const due = reminders.filter((r) => r.nextAt <= now)
    if (due.length === 0) return
    for (const r of due) {
      await this.fire(r)
    }
    const remaining: Reminder[] = []
    for (const r of reminders) {
      if (r.nextAt > now) {
        remaining.push(r)
      } else if (r.kind === 'every' && r.everySeconds) {
        remaining.push({ ...r, nextAt: now + r.everySeconds * 1000 })
      } else if (r.kind === 'daily') {
        remaining.push({ ...r, nextAt: nextDaily(r.dailyTime ?? '09:00', now) })
      } else if (r.kind === 'weekly') {
        remaining.push({ ...r, nextAt: nextWeekly(r.weeklyDay ?? 0, r.dailyTime ?? '09:00', now) })
      }
    }
    this.persist(remaining)
  }

  private async fire(r: Reminder) {
    const adapter = this.getAdapter()
    if (!adapter) return
    try {
      const sessions = await adapter.listSessions()
      const target = sessions.find((s) => s.sessionId === r.sessionId) ?? sessions[0]
      if (target) {
        await adapter.sendMessage(target.sessionId, `[定时提醒] ${r.text}`)
        this.onFired?.(r, target.sessionId)
      }
    } catch {
      // 会话不可用则跳过，下次 tick 重试（不再安排）
    }
  }
}
