import type { SessionStreamEvent, TaskRecord } from '../shared/types'

/**
 * src/tasks.ts —— 任务存储（renderer 侧）。
 * 任务 = 用户/定时/通道发起的 prompt。状态从会话事件流推导：
 *   assistant-start → running；assistant-end → done（error → failed）；
 *   tool-call → 步骤。
 */
export class TaskStore {
  private tasks: TaskRecord[] = []
  private listeners: ((tasks: TaskRecord[]) => void)[] = []
  private onDone: ((task: TaskRecord) => void) | null = null

  constructor(private persist: (tasks: TaskRecord[]) => void) {}

  setOnDone(cb: (task: TaskRecord) => void) {
    this.onDone = cb
  }

  load(tasks: TaskRecord[]) {
    this.tasks = tasks ?? []
    this.notify()
  }

  get(): TaskRecord[] {
    return [...this.tasks]
  }

  subscribe(cb: (tasks: TaskRecord[]) => void): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb)
    }
  }

  /** 发起一个任务（chat/schedule/channel）。 */
  startTask(sessionId: string, title: string, source: TaskRecord['source'] = 'chat'): string {
    const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const task: TaskRecord = {
      id,
      sessionId,
      title: title.slice(0, 80),
      status: 'queued',
      startedAt: Date.now(),
      steps: [],
      source,
    }
    // 同一会话已有运行中的任务 → 覆盖为新任务
    this.tasks = [task, ...this.tasks.filter((t) => t.status === 'running' || t.sessionId !== sessionId)]
    this.commit()
    return id
  }

  /** 处理会话事件流，更新任务状态。 */
  handleEvent(evt: SessionStreamEvent) {
    const running = this.tasks.find(
      (t) => t.sessionId === evt.sessionId && (t.status === 'queued' || t.status === 'running'),
    )
    if (!running) return
    switch (evt.kind) {
      case 'assistant-start':
        if (running.status === 'queued') {
          running.status = 'running'
          running.startedAt = Date.now()
        }
        break
      case 'assistant-delta': {
        // 不逐字更新，避免频繁提交；仅确保在 running
        break
      }
      case 'assistant-end': {
        running.status = evt.error ? 'failed' : 'done'
        running.endedAt = Date.now()
        if (!evt.error) {
          const text = evt.message.blocks.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('')
          running.summary = text.slice(0, 200)
          // 触发复盘（C1）
          this.onDone?.({ ...running })
        } else {
          running.summary = evt.error
        }
        break
      }
      case 'tool-call': {
        running.steps = [...running.steps, { name: evt.name, status: 'running', at: Date.now() }]
        break
      }
      case 'tool-result': {
        running.steps = running.steps.map((s, i) =>
          i === running.steps.length - 1 && s.name
            ? { ...s, status: evt.isError ? 'failed' : 'done' }
            : s,
        )
        break
      }
      default:
        break
    }
    this.commit()
  }

  /** 重试失败任务：返回要重发的标题。 */
  retry(taskId: string): { sessionId: string; title: string } | null {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return null
    this.tasks = this.tasks.filter((t) => t.id !== taskId)
    this.commit()
    return { sessionId: task.sessionId, title: task.title }
  }

  private commit() {
    this.persist(this.tasks)
    this.notify()
  }

  private notify() {
    for (const cb of this.listeners) cb([...this.tasks])
  }
}
