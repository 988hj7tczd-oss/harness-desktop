import { describe, expect, it } from 'vitest'
import { TrajectoryBuilder } from '../trajectory'
import type { SessionStreamEvent } from '../../shared/types'

/** 构造一个回合的事件序列（真实事件：turn/start 无 step 字段，归一化后 step=1）。 */
function turnSequence(turn: number, opts: { steps?: number; tools?: number; userText?: string } = {}): SessionStreamEvent[] {
  const evts: SessionStreamEvent[] = []
  if (opts.userText) {
    evts.push({ kind: 'user-message', sessionId: 's1', seq: 1, message: { id: `u-${turn}`, blocks: [{ type: 'text', text: opts.userText }] } })
  }
  // turn/start → assistant-start（归一化 step=1）
  evts.push({ kind: 'assistant-start', sessionId: 's1', seq: 2, turn, step: 1 })
  for (let s = 1; s <= (opts.steps ?? 1); s++) {
    if (s > 1) evts.push({ kind: 'assistant-start', sessionId: 's1', seq: 2 + s, turn, step: s })
    if (opts.tools) {
      for (let t = 0; t < opts.tools; t++) {
        evts.push({ kind: 'tool-call', sessionId: 's1', seq: 50, callId: `c-${turn}-${s}-${t}`, name: 'bash', arguments: 'ls' })
      }
    }
    evts.push({ kind: 'step-end', sessionId: 's1', seq: 60, turn, step: s, time: Date.now() })
  }
  evts.push({ kind: 'assistant-delta', sessionId: 's1', seq: 70, turn, step: 1, text: '回复' })
  evts.push({ kind: 'turn-end', sessionId: 's1', seq: 80, turn, time: Date.now(), reason: 'completed' })
  return evts
}

describe('TrajectoryBuilder', () => {
  it('回合 1 用户消息 + 回合结束归属正确', () => {
    const b = new TrajectoryBuilder()
    for (const e of turnSequence(1, { userText: '你好' })) b.push(e)
    const turns = b.all()
    expect(turns).toHaveLength(1)
    expect(turns[0].turn).toBe(1)
    const types = turns[0].nodes.map((n) => n.type)
    expect(types).toContain('user')
    expect(types).toContain('reply')
  })

  it('步骤计数不多 1（turn/start 只记回合开始，不记幻影步骤）', () => {
    const b = new TrajectoryBuilder()
    // 2 个真实 step：turn/start(step=1) + step2/start(step=2) + step3/start(step=3)
    const evts = [
      { kind: 'assistant-start' as const, sessionId: 's1', seq: 1, turn: 1, step: 1 },
      { kind: 'assistant-start' as const, sessionId: 's1', seq: 2, turn: 1, step: 2 },
      { kind: 'step-end' as const, sessionId: 's1', seq: 3, turn: 1, step: 2, time: 1 },
      { kind: 'assistant-start' as const, sessionId: 's1', seq: 4, turn: 1, step: 3 },
      { kind: 'step-end' as const, sessionId: 's1', seq: 5, turn: 1, step: 3, time: 2 },
      { kind: 'assistant-delta' as const, sessionId: 's1', seq: 6, turn: 1, step: 1, text: 'x' },
      { kind: 'turn-end' as const, sessionId: 's1', seq: 7, turn: 1, time: 3, reason: 'completed' as const },
    ]
    for (const e of evts) b.push(e)
    const turns = b.all()
    // 3 个 assistant-start：第 1 个是 turn/start（不记步骤），第 2/3 是 step/start → 2 步
    expect(turns[0].stepCount).toBe(2)
    const stepNodes = turns[0].nodes.filter((n) => n.type === 'step')
    expect(stepNodes).toHaveLength(2)
  })

  it('工具节点归属当前回合', () => {
    const b = new TrajectoryBuilder()
    for (const e of turnSequence(2, { steps: 1, tools: 2 })) b.push(e)
    const turns = b.all()
    const t2 = turns.find((t) => t.turn === 2)
    expect(t2?.toolCount).toBe(2)
    expect(t2?.nodes.some((n) => n.type === 'tool')).toBe(true)
  })

  it('多回合：用户消息归各自下一回合', () => {
    const b = new TrajectoryBuilder()
    for (const e of turnSequence(1, { userText: '第一问' })) b.push(e)
    for (const e of turnSequence(2, { userText: '第二问' })) b.push(e)
    const turns = b.all()
    expect(turns).toHaveLength(2)
    expect(turns[0].nodes.some((n) => n.type === 'user' && n.summary === '第一问')).toBe(true)
    expect(turns[1].nodes.some((n) => n.type === 'user' && n.summary === '第二问')).toBe(true)
  })

  it('reset 清空状态', () => {
    const b = new TrajectoryBuilder()
    for (const e of turnSequence(1, { userText: 'hi' })) b.push(e)
    expect(b.all()).toHaveLength(1)
    b.reset()
    expect(b.all()).toHaveLength(0)
    // reset 后新回合 step 计数正确（seenTurns 已清）
    for (const e of turnSequence(1, { userText: 'again' })) b.push(e)
    expect(b.all()).toHaveLength(1)
  })
})
