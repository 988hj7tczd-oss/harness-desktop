/**
 * src/trajectory.ts —— 会话轨迹：把事件流折叠成"回合 → 节点"的时间线。
 *
 * 轨迹 = agent 在一轮对话中的透明执行过程（思考 / 步骤 / 工具调用 / 结果 / 回复）。
 * 纯前端组装，不落盘（会话历史已有）。
 */
import type { SessionStreamEvent } from '../shared/types'

export type TrajectoryNodeType = 'user' | 'reasoning' | 'step' | 'tool' | 'tool-result' | 'reply'

export interface TrajectoryNode {
  type: TrajectoryNodeType
  label: string
  summary?: string
  detail?: string
  isError?: boolean
  at?: number
  status?: 'running' | 'done' | 'failed'
}

export interface TrajectoryTurn {
  turn: number
  startAt?: number
  endAt?: number
  nodes: TrajectoryNode[]
  result?: 'completed' | 'error' | 'stopped'
  error?: string
  usage?: { inputTokens?: number; outputTokens?: number }
  toolCount: number
  stepCount: number
}

const emptyTurn = (turn: number): TrajectoryTurn => ({
  turn,
  nodes: [],
  toolCount: 0,
  stepCount: 0,
})

/** 增量轨迹构建器：喂事件，产出按 turn 分组的时间线。 */
export class TrajectoryBuilder {
  private turns = new Map<number, TrajectoryTurn>()
  /** 当前进行中的 step（turn, step）。 */
  private activeStep: { turn: number; step: number } | null = null
  /** 当前进行中的 turn 起始时间。 */
  private turnStartAt: { turn: number; at: number } | null = null
  /** 已见过的最大 turn 号（用户消息归属下一回合用）。 */
  private maxTurn = 0
  /**
   * 已处理过 turn/start 的回合集合。
   * dsh 的 turn/start 与 step/start 都归一化成 assistant-start（step 都 >=1），
   * 用每个 turn 的"第一个 assistant-start"代表 turn/start（只记回合开始），
   * 之后的 assistant-start 才是 step/start（记步骤节点）。
   */
  private seenTurns = new Set<number>()

  /** 喂一个事件，返回当前完整轨迹。 */
  push(evt: SessionStreamEvent): TrajectoryTurn[] {
    const getTurn = (turn: number): TrajectoryTurn => {
      if (turn > this.maxTurn) this.maxTurn = turn
      let t = this.turns.get(turn)
      if (!t) {
        t = emptyTurn(turn)
        this.turns.set(turn, t)
      }
      return t
    }

    switch (evt.kind) {
      case 'user-message': {
        // 归属：优先当前进行中的回合；无进行中回合 → 归入"下一回合"（maxTurn+1）
        const turn = this.currentTurn() ?? this.maxTurn + 1
        const t = getTurn(turn)
        t.nodes.push({
          type: 'user',
          label: '用户',
          summary: textOf(evt.message.blocks),
          at: Date.now(),
        })
        break
      }
      case 'assistant-start': {
        const t = getTurn(evt.turn)
        const isTurnStart = !this.seenTurns.has(evt.turn)
        if (isTurnStart) this.seenTurns.add(evt.turn)
        if (this.turnStartAt?.turn !== evt.turn) this.turnStartAt = { turn: evt.turn, at: Date.now() }
        t.startAt = this.turnStartAt.at
        if (!isTurnStart) {
          // 该回合的后续 assistant-start = step/start → 记步骤节点
          this.activeStep = { turn: evt.turn, step: evt.step }
          t.stepCount += 1
          t.nodes.push({ type: 'step', label: `步骤 ${t.stepCount}`, status: 'running', at: Date.now() })
        }
        break
      }
      case 'assistant-delta': {
        const t = getTurn(evt.turn)
        const type: TrajectoryNodeType = evt.reasoning ? 'reasoning' : 'reply'
        const open = t.nodes.find((n) => n.type === type && n.status === 'running')
        if (open) {
          open.summary = (open.summary ?? '') + evt.text
        } else {
          t.nodes.push({ type, label: evt.reasoning ? '思考' : '回复', summary: evt.text, status: 'running', at: Date.now() })
        }
        break
      }
      case 'assistant-end': {
        const t = getTurn(evt.turn)
        for (const n of t.nodes) {
          if (n.status === 'running' && (n.type === 'reply' || n.type === 'reasoning')) n.status = 'done'
        }
        break
      }
      case 'step-end': {
        const t = getTurn(evt.turn)
        const open = t.nodes.find((n) => n.type === 'step' && n.status === 'running')
        if (open) open.status = 'done'
        this.activeStep = null
        break
      }
      case 'tool-call': {
        const t = getTurn(this.activeStep?.turn ?? this.currentTurn() ?? 1)
        t.toolCount += 1
        t.nodes.push({ type: 'tool', label: evt.name, summary: evt.name, detail: evt.arguments, status: 'running', at: Date.now() })
        break
      }
      case 'tool-result': {
        const t = getTurn(this.activeStep?.turn ?? this.currentTurn() ?? 1)
        const tool = [...t.nodes].reverse().find((n) => n.type === 'tool' && n.status === 'running')
        const resultText = textOf(evt.content).slice(0, 300)
        if (tool) {
          tool.status = evt.isError ? 'failed' : 'done'
          tool.isError = evt.isError
          tool.detail = `${tool.detail ?? ''}\n\n结果：${resultText}`
          t.nodes.push({ type: 'tool-result', label: '工具结果', summary: resultText, isError: evt.isError, at: Date.now() })
        }
        break
      }
      case 'turn-end': {
        const t = getTurn(evt.turn)
        t.endAt = evt.time
        t.result = evt.reason
        t.error = evt.error
        t.usage = evt.usage
        this.turnStartAt = null
        this.activeStep = null
        break
      }
      default:
        break
    }
    return this.all()
  }

  private currentTurn(): number | null {
    return this.turnStartAt?.turn ?? this.activeStep?.turn ?? null
  }

  /** 全部轨迹（按 turn 排序）。 */
  all(): TrajectoryTurn[] {
    return [...this.turns.values()].sort((a, b) => a.turn - b.turn)
  }

  /** 重置（切换会话时）。 */
  reset() {
    this.turns.clear()
    this.activeStep = null
    this.turnStartAt = null
    this.maxTurn = 0
    this.seenTurns.clear()
  }
}

function textOf(blocks: { type: string; text?: string }[]): string {
  return (blocks ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}

export function trajectoryStats(turns: TrajectoryTurn[]): { turns: number; tools: number; steps: number } {
  let tools = 0
  let steps = 0
  for (const t of turns) {
    tools += t.toolCount
    steps += t.stepCount
  }
  return { turns: turns.length, tools, steps }
}
