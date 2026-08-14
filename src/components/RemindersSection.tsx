import { useCallback, useEffect, useState } from 'react'
import type { Reminder } from '../../shared/types'

const harness = window.harness

function fmt(ts: number): string {
  return new Date(ts).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** 定时提醒：桌面端实现，到点后以用户消息注入会话。 */
export default function RemindersSection() {
  const [items, setItems] = useState<Reminder[]>([])
  const [kind, setKind] = useState<'after' | 'at' | 'every' | 'daily' | 'weekly'>('after')
  const [text, setText] = useState('')
  const [after, setAfter] = useState('60')
  const [atTime, setAtTime] = useState('')
  const [every, setEvery] = useState('300')
  const [dailyTime, setDailyTime] = useState('09:00')
  const [weeklyDay, setWeeklyDay] = useState('1')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    const res = await harness.listReminders()
    if (res.ok) setItems(res.value!)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = async () => {
    const t = text.trim()
    if (!t) return setMsg({ type: 'err', text: '请填写提醒内容' })
    let input: Omit<Reminder, 'id' | 'nextAt'> = { text: t, kind }
    if (kind === 'after') {
      const s = Number(after)
      if (!s || s < 1) return setMsg({ type: 'err', text: '延迟秒数需 ≥ 1' })
      input.afterSeconds = s
    } else if (kind === 'at') {
      const ms = new Date(atTime).getTime()
      if (!atTime || Number.isNaN(ms)) return setMsg({ type: 'err', text: '请选择触发时间' })
      input.at = ms
    } else if (kind === 'every') {
      const s = Number(every)
      if (!s || s < 300) return setMsg({ type: 'err', text: '固定间隔需 ≥ 300 秒（5 分钟）' })
      input.everySeconds = s
    } else if (kind === 'daily') {
      if (!dailyTime) return setMsg({ type: 'err', text: '请选择每日触发时间' })
      input.dailyTime = dailyTime
    } else {
      input.weeklyDay = Number(weeklyDay)
      input.dailyTime = dailyTime
    }
    const res = await harness.createReminder(input)
    if (res.ok) {
      setMsg({ type: 'ok', text: '提醒已创建' })
      setText('')
      void refresh()
    } else {
      setMsg({ type: 'err', text: res.error?.message ?? '创建失败' })
    }
  }

  const remove = async (id: string) => {
    await harness.deleteReminder(id)
    void refresh()
  }

  return (
    <section>
      <h3>定时提醒</h3>
      <p className="hint" style={{ marginBottom: 8 }}>
        到点后提醒会以用户消息进入会话，交由 Agent 处理。
      </p>
      <div className="setting-input-row" style={{ marginBottom: 8 }}>
        <input
          className="input"
          placeholder="提醒内容，如：检查一下今天的进度"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="reminder-form">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="after">延迟 N 秒后</option>
          <option value="at">指定时间</option>
          <option value="every">固定间隔（≥5 分钟）</option>
          <option value="daily">每日定时</option>
          <option value="weekly">每周定时</option>
        </select>
        {kind === 'after' && (
          <input className="input mono" type="number" min={1} value={after} onChange={(e) => setAfter(e.target.value)} placeholder="秒" />
        )}
        {kind === 'at' && (
          <input className="input mono" type="datetime-local" value={atTime} onChange={(e) => setAtTime(e.target.value)} />
        )}
        {kind === 'every' && (
          <input className="input mono" type="number" min={300} value={every} onChange={(e) => setEvery(e.target.value)} placeholder="秒" />
        )}
        {kind === 'daily' && (
          <input className="input mono" type="time" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} />
        )}
        {kind === 'weekly' && (
          <>
            <select className="input" value={weeklyDay} onChange={(e) => setWeeklyDay(e.target.value)}>
              <option value="0">周日</option>
              <option value="1">周一</option>
              <option value="2">周二</option>
              <option value="3">周三</option>
              <option value="4">周四</option>
              <option value="5">周五</option>
              <option value="6">周六</option>
            </select>
            <input className="input mono" type="time" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} />
          </>
        )}
        <button className="btn primary small" onClick={create}>
          创建提醒
        </button>
      </div>

      {items.length > 0 && (
        <div className="reminder-list">
          {items.map((r) => (
            <div key={r.id} className="reminder-item">
              <div className="reminder-info">
                <span className="reminder-text">{r.text}</span>
                <span className="reminder-meta mono">
                  {r.kind === 'after'
                    ? `${r.afterSeconds}s 后`
                    : r.kind === 'at'
                      ? `@ ${fmt(r.at!)}`
                      : r.kind === 'every'
                        ? `每 ${Math.round((r.everySeconds ?? 0) / 60)} 分钟`
                        : r.kind === 'daily'
                          ? `每日 ${r.dailyTime}`
                          : `每周周${'日一二三四五六'[r.weeklyDay ?? 0]} ${r.dailyTime}`}
                  {' · '}
                  {fmt(r.nextAt)}
                </span>
              </div>
              <button className="btn danger small" onClick={() => remove(r.id)}>
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      {msg && <div className={`settings-msg ${msg.type}`}>{msg.text}</div>}
    </section>
  )
}
