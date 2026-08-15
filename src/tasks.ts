import type { SessionStreamEvent, TaskRecord, TaskType } from '../shared/types'

/** 从任务标题推断类型（关键词匹配，简单规则）。 */
export function inferTaskType(title: string): TaskType {
  const t = title.toLowerCase()
  const has = (words: string[]) => words.some((w) => t.includes(w))
  // 写作类优先：明确写作对象（文章/报告/文案/邮件/总结/翻译/标题/润色）
  if (has(['作文', '报告', '文案', '邮件', '总结', '翻译', '润色', '标题', '文章', '随笔', '简历', 'story', 'essay', 'review', 'blog', '稿'])) return 'writing'
  // 代码类：明确代码词
  if (has(['代码', '重构', '实现', '函数', '组件', '脚本', 'sql', 'api', 'bug', '调试', 'deploy', 'docker', 'git', '测试', 'build', '修一下', '修一个', '写个函数', '写一个函数', '写个脚本', '写个组件', '写个工具', '编程', '编码', '开发', '部署', '接口', '报错', '错误'])) return 'code'
  if (has(['查', '搜索', '什么', '是多少', '多少', '知道', 'who', 'what', 'when', 'where', '找一下', '帮我找'])) return 'query'
  if (has(['分析', '比较', '对比', '评估', '方案', '决策', '优化', '为什么', '如何', '利弊', '趋势', 'forecast', '建议', '规划'])) return 'analysis'
  return 'other'
}

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
      type: inferTaskType(title),
    }
    // 保留同会话历史任务：只移除同会话的 running/queued（被新任务替代），
    // 已完成/失败任务保留（任务面板过滤 tab 与复盘依赖它们）；列表上限 50 条。
    const filtered = this.tasks.filter(
      (t) => !(t.sessionId === sessionId && (t.status === 'running' || t.status === 'queued')),
    )
    this.tasks = [task, ...filtered].slice(0, 50)
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
            ? {
                ...s,
                status: evt.isError ? 'failed' : 'done',
                error: evt.isError
                  ? evt.content.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('').slice(0, 300)
                  : undefined,
              }
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
