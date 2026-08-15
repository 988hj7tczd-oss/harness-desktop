import { describe, expect, it, vi } from 'vitest'
import { TaskStore, inferTaskType } from '../tasks'

function makeStore() {
  const persist = vi.fn()
  const store = new TaskStore(persist)
  return { store, persist }
}

describe('TaskStore 状态机', () => {
  it('queued → running → done（assistant-end 无 error）', () => {
    const { store } = makeStore()
    store.startTask('s1', '写代码', 'chat')
    let tasks = store.get()
    expect(tasks[0].status).toBe('queued')

    store.handleEvent({ kind: 'assistant-start', sessionId: 's1', seq: 1, turn: 1, step: 1 })
    tasks = store.get()
    expect(tasks[0].status).toBe('running')

    store.handleEvent({
      kind: 'assistant-end',
      sessionId: 's1',
      seq: 2,
      turn: 1,
      step: 1,
      message: { id: 'a-1', blocks: [{ type: 'text', text: '完成' }] },
    })
    tasks = store.get()
    expect(tasks[0].status).toBe('done')
    expect(tasks[0].summary).toContain('完成')
  })

  it('queued → running → failed（assistant-end 带 error）', () => {
    const { store } = makeStore()
    store.startTask('s1', '任务', 'chat')
    store.handleEvent({ kind: 'assistant-start', sessionId: 's1', seq: 1, turn: 1, step: 1 })
    store.handleEvent({
      kind: 'assistant-end',
      sessionId: 's1',
      seq: 2,
      turn: 1,
      step: 1,
      message: { id: 'a-1', blocks: [] },
      error: '超时',
    })
    expect(store.get()[0].status).toBe('failed')
    expect(store.get()[0].summary).toContain('超时')
  })

  it('tool-call 记录步骤，tool-result 更新为 done', () => {
    const { store } = makeStore()
    store.startTask('s1', '任务', 'chat')
    store.handleEvent({ kind: 'tool-call', sessionId: 's1', seq: 1, callId: 'c1', name: 'bash', arguments: 'ls' })
    expect(store.get()[0].steps).toHaveLength(1)
    expect(store.get()[0].steps[0].status).toBe('running')

    store.handleEvent({
      kind: 'tool-result',
      sessionId: 's1',
      seq: 2,
      callId: 'c1',
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    })
    expect(store.get()[0].steps[0].status).toBe('done')
  })

  it('任务完成触发 onDone（复盘）', () => {
    const { store } = makeStore()
    const onDone = vi.fn()
    store.setOnDone(onDone)
    store.startTask('s1', '任务', 'chat')
    store.handleEvent({ kind: 'assistant-start', sessionId: 's1', seq: 1, turn: 1, step: 1 })
    store.handleEvent({
      kind: 'assistant-end',
      sessionId: 's1',
      seq: 2,
      turn: 1,
      step: 1,
      message: { id: 'a-1', blocks: [{ type: 'text', text: 'ok' }] },
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('失败不触发复盘', () => {
    const { store } = makeStore()
    const onDone = vi.fn()
    store.setOnDone(onDone)
    store.startTask('s1', '任务', 'chat')
    store.handleEvent({ kind: 'assistant-start', sessionId: 's1', seq: 1, turn: 1, step: 1 })
    store.handleEvent({
      kind: 'assistant-end',
      sessionId: 's1',
      seq: 2,
      turn: 1,
      step: 1,
      message: { id: 'a-1', blocks: [] },
      error: 'x',
    })
    expect(onDone).not.toHaveBeenCalled()
  })

  it('同会话新任务保留已完成/失败历史（#5）', () => {
    const { store } = makeStore()
    // 第一个任务完成
    store.startTask('s1', '任务一', 'chat')
    store.handleEvent({ kind: 'assistant-start', sessionId: 's1', seq: 1, turn: 1, step: 1 })
    store.handleEvent({
      kind: 'assistant-end',
      sessionId: 's1',
      seq: 2,
      turn: 1,
      step: 1,
      message: { id: 'a-1', blocks: [{ type: 'text', text: 'ok' }] },
    })
    expect(store.get()).toHaveLength(1)
    // 同会话第二个任务
    store.startTask('s1', '任务二', 'chat')
    const tasks = store.get()
    expect(tasks).toHaveLength(2)
    expect(tasks[0].title).toBe('任务二')
    expect(tasks[1].title).toBe('任务一')
    expect(tasks[1].status).toBe('done')
  })

  it('tool-result 失败记录错误信息', () => {
    const { store } = makeStore()
    store.startTask('s1', '任务', 'chat')
    store.handleEvent({ kind: 'tool-call', sessionId: 's1', seq: 1, callId: 'c1', name: 'bash', arguments: 'ls' })
    store.handleEvent({
      kind: 'tool-result',
      sessionId: 's1',
      seq: 2,
      callId: 'c1',
      content: [{ type: 'text', text: 'command not found' }],
      isError: true,
    })
    const step = store.get()[0].steps[0]
    expect(step.status).toBe('failed')
    expect(step.error).toContain('command not found')
  })
})

describe('inferTaskType', () => {
  it('代码类', () => {
    expect(inferTaskType('帮我写一个 Python 脚本')).toBe('code')
    expect(inferTaskType('修复这个 bug')).toBe('code')
  })
  it('写作类', () => {
    expect(inferTaskType('写一篇报告')).toBe('writing')
    expect(inferTaskType('帮我润色这段文案')).toBe('writing')
  })
  it('查询类', () => {
    expect(inferTaskType('查一下今天天气')).toBe('query')
  })
  it('分析类', () => {
    expect(inferTaskType('分析一下这个方案的利弊')).toBe('analysis')
  })
  it('其他', () => {
    expect(inferTaskType('你好')).toBe('other')
  })
})
