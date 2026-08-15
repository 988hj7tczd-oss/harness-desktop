/**
 * 共享 IPC 契约类型（renderer ↔ main）。
 *
 * 注意：renderer 永远不直接接触 dsh 的 wire 格式 —— 它只通过 IPC 调用
 * `window.harness.*`（见 src/types/ipc.ts），主进程再用 adapter 与 dsh 通信。
 * dsh 上游 API 变更时只需改 adapter，本文件保持不变。
 */

/** dsh 引擎运行状态。 */
export interface DshStatus {
  running: boolean
  ready: boolean
  port: number | null
  version: string | null
  cwd: string | null
  provider: string | null
  model: string | null
  error?: string
}

/** 应用级设置（存储在 userData 下，与 dsh 数据分开）。 */
export interface AppSettings {
  /** 是否已完成首启向导。 */
  onboarded: boolean
  /** 用户选择的工作区文件夹。 */
  workspaceCwd: string | null
  /** 已配置的默认 provider。 */
  provider: string | null
  /** 已配置的默认 model。 */
  model: string | null
  /** 置顶的会话 id 列表（app 本地，dsh 无原生支持）。 */
  pinnedSessionIds?: string[]
  /** 会话标签颜色（app 本地，sessionId → 颜色值）。 */
  sessionColors?: Record<string, string>
  /** 桌面端定时提醒（app 本地，触发时注入会话）。 */
  reminders?: Reminder[]
  /** 任务记录（app 本地，从会话事件推导）。 */
  tasks?: TaskRecord[]
  /** 自进化开关。 */
  evolution?: { autoReview?: boolean; autoInjectMemory?: boolean }
  /** 复盘用的隐藏会话（已归档，不出现在会话列表，复盘不污染聊天）。 */
  reviewSessionId?: string
  /** 已生成技能的聚类类型（避免重复生成）。 */
  generatedSkillTypes?: string[]
  /** 外观配置（011）。 */
  appearance?: AppearanceConfig
}

/** 外观配置（主题/主题色/字体/密度/启动行为）。 */
export interface AppearanceConfig {
  /** 主题模式：dark / light / system。 */
  theme: 'dark' | 'light' | 'system'
  /** 主题色（品牌色）：deepseek / green / purple / orange。 */
  accent: 'deepseek' | 'green' | 'purple' | 'orange'
  /** 字体大小：small / medium / large。 */
  fontSize: 'small' | 'medium' | 'large'
  /** 消息密度：comfortable / compact。 */
  density: 'comfortable' | 'compact'
  /** 开机自启。 */
  autoLaunch: boolean
  /** 启动时最小化到托盘（不显示主窗口）。 */
  launchMinimized: boolean
}

/** 任务类型（从标题推断，用于面板分类）。 */
export type TaskType = 'code' | 'writing' | 'query' | 'analysis' | 'other'

/** 一个任务的执行步骤（从 tool/* 事件推导）。 */
export interface TaskStep {
  name: string
  status: 'pending' | 'running' | 'done' | 'failed'
  at: number
  /** 失败时的错误信息。 */
  error?: string
}

/** 一条任务记录（用户发起的 prompt 或定时触发的任务）。 */
export interface TaskRecord {
  id: string
  sessionId: string
  title: string
  status: 'queued' | 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
  steps: TaskStep[]
  summary?: string
  source?: 'chat' | 'schedule'
  /** 任务类型分类（code/writing/query/analysis/other）。 */
  type?: TaskType
}

/** 一条凭据的状态。 */
export interface CredentialStatus {
  ref: string
  label: string
  configured: boolean
  source?: string
}

/** 定时提醒（桌面端实现：到点后以用户消息注入会话）。 */
export interface Reminder {
  id: string
  text: string
  /** after=延迟秒数 / at=绝对时间(epoch ms) / every=固定间隔秒(>=300) / daily=每日 / weekly=每周 */
  kind: 'after' | 'at' | 'every' | 'daily' | 'weekly'
  afterSeconds?: number
  at?: number
  everySeconds?: number
  /** daily/weekly 触发时刻 "HH:MM" */
  dailyTime?: string
  /** weekly 触发星期 0-6（周日=0） */
  weeklyDay?: number
  nextAt: number
  sessionId?: string
  /** 触发失败顺延重试次数（上限 10 次后丢弃）。 */
  retries?: number
}

/** 一条记忆（harness-memory 插件 memories 表）。 */
export interface MemoryItem {
  id: string
  text: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

/** Web 搜索配置。 */
export interface WebSearchConfig {
  apiKeyEnv: string
  model: string
  apiVersion: string
  baseURL?: string
  maxUses?: number
}

/** 一个技能（skill.list 的归一化视图）。 */
export interface SkillInfo {
  name: string
  description: string
  whenToUse?: string
  modelInvocable: boolean
}

/** 会话摘要（来自 session.list 的归一化视图）。 */
export interface SessionSummary {
  sessionId: string
  title: string
  updatedAt: number
  running: boolean
  blank: boolean
  cwd?: string
  agentPreset?: string
  planActive?: boolean
}

/** 一条归一化的消息块。 */
export type MessageBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'tool-result'; callId: string; content: MessageBlock[]; isError?: boolean }

/** 一条会话消息。 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: MessageBlock[]
  status: 'streaming' | 'complete' | 'error'
  error?: string
}

/** 模型目录（llm.models 的归一化视图）。 */
export interface ModelGroup {
  id: string
  name: string
  models: { id: string; name: string; description?: string }[]
}

/** 可配置的模型提供商。 */
export interface ProviderInfo {
  id: string
  name: string
}

/** dsh llm-pi-ai 自定义 provider 的协议。 */
export type CustomProviderApi = 'openai-completions' | 'openai-responses' | 'anthropic-messages'

/** 自定义 provider 中的一个模型。 */
export interface CustomProviderModel {
  id: string
  name?: string
}

/** 自定义 provider 配置（保存到 dsh settings llm-pi-ai 命名空间）。 */
export interface CustomProviderConfig {
  id: string
  displayName: string
  apiKeyEnv?: string
  api: CustomProviderApi
  baseURL: string
  models: CustomProviderModel[]
}

/** 自定义 provider 的列表项（含活跃状态，供设置页展示/编辑）。 */
export interface CustomProviderListItem {
  id: string
  displayName: string
  apiKeyEnv?: string
  api: string
  baseURL: string
  models: CustomProviderModel[]
  active: boolean
}

/** Agent 预设（模式）信息。 */
export interface AgentPresetInfo {
  id: string
  name: string
  description?: string
  isDefault: boolean
}

/** 通过文件选择器附加的文件。图片带 base64 data，其他文件仅路径。 */
export interface PickedFile {
  path: string
  name: string
  mediaType?: string
  data?: string
  /** 文件大小（字节）。 */
  size?: number
}

/** 会话标签可选颜色。 */
export const SESSION_COLORS = [
  '#4f8cff',
  '#a855f7',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#38bdf8',
] as const

/**
 * 会话事件流（由 adapter 把 dsh 的 SessionEvent 归一化成稳定词汇，
 * 让 renderer 只依赖这个稳定词汇）。
 */
export type SessionStreamEvent =
  | { kind: 'session-subscribed'; sessionId: string; lastSeq: number }
  | {
      kind: 'user-message'
      sessionId: string
      seq: number
      message: { id: string; blocks: MessageBlock[] }
    }
  | {
      kind: 'assistant-start'
      sessionId: string
      seq: number
      turn: number
      step: number
    }
  | {
      kind: 'assistant-delta'
      sessionId: string
      seq: number
      turn: number
      step: number
      text: string
      reasoning?: boolean
    }
  | {
      kind: 'assistant-end'
      sessionId: string
      seq: number
      turn: number
      step: number
      message: { id: string; blocks: MessageBlock[] }
      error?: string
    }
  | {
      kind: 'tool-call'
      sessionId: string
      seq: number
      callId: string
      name: string
      arguments: string
    }
  | {
      kind: 'tool-result'
      sessionId: string
      seq: number
      callId: string
      content: MessageBlock[]
      isError?: boolean
      name?: string
    }
  | { kind: 'title'; sessionId: string; seq: number; title: string }
  | { kind: 'projection'; sessionId: string; seq: number; key: string; value: unknown }
  | { kind: 'running'; sessionId: string; running: boolean }
  | {
      /** 执行步骤结束（轨迹用）：step 号 + 结束时间 + 结果。 */
      kind: 'step-end'
      sessionId: string
      seq: number
      turn: number
      step: number
      time: number
    }
  | {
      /** 回合结束（轨迹用）：turn 号 + 结束时间 + 结果。 */
      kind: 'turn-end'
      sessionId: string
      seq: number
      turn: number
      time: number
      reason?: 'completed' | 'error' | 'stopped'
      error?: string
      usage?: { inputTokens?: number; outputTokens?: number }
    }
  | {
      /** 乐观用户消息（renderer 本地，立即上屏；dsh 的 user-message 到达后去重替换）。 */
      kind: 'optimistic-user'
      sessionId: string
      id: string
      text: string
    }
  | {
      /** 编辑用户消息：本地替换文本（乐观，真实消息随后由事件流补上）。 */
      kind: 'replace-user-text'
      sessionId: string
      messageId: string
      text: string
    }

/** 会话历史页（session.history 归一化）。 */
export interface SessionHistory {
  events: SessionStreamEvent[]
  hasMore: boolean
}

/** IPC 请求结果封装。 */
export interface IpcResult<T> {
  ok: boolean
  value?: T
  error?: { code: string; message: string }
}

/** renderer 通过 preload 暴露的 API。 */
export interface HarnessApi {
  getAppState(): Promise<IpcResult<AppSettings>>
  updateAppSettings(patch: Partial<AppSettings>): Promise<IpcResult<AppSettings>>
  setAutoLaunch(enabled: boolean): Promise<IpcResult<void>>
  getDshStatus(): Promise<IpcResult<DshStatus>>
  ensureDsh(): Promise<IpcResult<DshStatus>>
  shutdownDsh(): Promise<IpcResult<void>>
  describe(): Promise<IpcResult<DshStatus>>

  // ---- 021 自动更新 ----
  checkForUpdates(): Promise<IpcResult<unknown>>
  quitAndInstall(): Promise<IpcResult<unknown>>
  onUpdateStatus(cb: (status: { state: string; version?: string; percent?: number; message?: string }) => void): () => void

  listSessions(): Promise<IpcResult<SessionSummary[]>>
  createSession(cwd?: string, agentPreset?: string): Promise<IpcResult<{ sessionId: string }>>
  getHistory(sessionId: string): Promise<IpcResult<SessionHistory>>
  sendMessage(sessionId: string, text: string, files?: PickedFile[]): Promise<IpcResult<{ accepted: boolean }>>
  cancelTurn(sessionId: string): Promise<IpcResult<{ accepted: boolean }>>
  renameSession(sessionId: string, title: string): Promise<IpcResult<{ title: string }>>
  forkSession(sessionId: string): Promise<IpcResult<{ sessionId: string }>>
  archiveSession(sessionId: string): Promise<IpcResult<{ archivedSessionIds: string[] }>>
  hardDeleteSession(sessionId: string, cwd?: string): Promise<IpcResult<void>>
  copyText(text: string): Promise<IpcResult<void>>

  listAgentPresets(): Promise<IpcResult<AgentPresetInfo[]>>
  selectAgentPreset(sessionId: string, agentPreset: string): Promise<IpcResult<{ agentPreset: string }>>
  pickFiles(): Promise<IpcResult<PickedFile[]>>

  listModels(): Promise<IpcResult<ModelGroup[]>>
  listProviders(): Promise<IpcResult<ProviderInfo[]>>
  selectModel(sessionId: string, provider: string, model: string): Promise<IpcResult<unknown>>

  listCustomProviders(): Promise<IpcResult<CustomProviderListItem[]>>
  saveCustomProvider(config: CustomProviderConfig): Promise<IpcResult<unknown>>
  removeCustomProvider(id: string): Promise<IpcResult<unknown>>
  setProviderApiKey(apiKeyEnv: string, key: string): Promise<IpcResult<void>>

  setApiKey(key: string): Promise<IpcResult<void>>
  hasApiKey(): Promise<IpcResult<boolean>>
  testApiKey(key: string): Promise<IpcResult<{ ok: boolean; message: string }>>
  pickDirectory(): Promise<IpcResult<string | null>>

  // ---- Part A：设置控制台 ----
  listCredentials(): Promise<IpcResult<CredentialStatus[]>>
  setCredential(ref: string, value: string): Promise<IpcResult<void>>
  clearCredential(ref: string): Promise<IpcResult<void>>
  listReminders(): Promise<IpcResult<Reminder[]>>
  createReminder(input: Omit<Reminder, 'id' | 'nextAt'>): Promise<IpcResult<Reminder>>
  deleteReminder(id: string): Promise<IpcResult<void>>
  listMemories(): Promise<IpcResult<MemoryItem[]>>
  addMemory(text: string, tags?: string[]): Promise<IpcResult<MemoryItem>>
  deleteMemory(id: string): Promise<IpcResult<void>>
  clearMemories(): Promise<IpcResult<void>>
  togglePlanMode(sessionId: string): Promise<IpcResult<void>>
  getWebSearchConfig(): Promise<IpcResult<WebSearchConfig>>
  setWebSearchConfig(config: Partial<WebSearchConfig>): Promise<IpcResult<WebSearchConfig>>
  exportSession(sessionId: string, format: 'zip' | 'json' | 'markdown'): Promise<IpcResult<{ saved: boolean; path?: string }>>
  listSkills(sessionId: string): Promise<IpcResult<SkillInfo[]>>

  onSessionEvent(cb: (evt: SessionStreamEvent) => void): () => void
  onDshStatus(cb: (status: DshStatus) => void): () => void
  onMenuEvent(cb: (action: 'new-chat' | 'open-settings') => void): () => void
  onReminderFired(cb: (payload: { sessionId: string; text: string }) => void): () => void
}
