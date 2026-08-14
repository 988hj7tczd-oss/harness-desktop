/**
 * adapter —— dsh API 隔离层。
 *
 * 这个目录是唯一直接感知 dsh wire 协议（JSON-RPC 信封 + SSE/WebSocket 事件流）
 * 的代码。dsh 上游 API 变更时，只需要改这个目录；renderer / 主进程的 IPC
 * 契约保持不变。
 */

export interface RpcRequest {
  type: 'client-request'
  rpcId: string
  method: string
  payload: Record<string, unknown>
}

export interface RpcResponse<T = unknown> {
  type: 'server-response'
  rpcId: string
  result: RpcResult<T>
}

export interface RpcResult<T> {
  ok: boolean
  value?: T
  error?: { code: string; message: string }
}

export interface RpcMessage {
  type: 'server-request' | 'server-response' | 'client-request' | 'client-response'
  rpcId: string
  method?: string
  payload?: Record<string, unknown>
  result?: RpcResult<unknown>
}

export class DshTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshTransportError'
  }
}

export interface MuxFrame {
  type: string
  sessionId?: string
  seq?: number
  event?: unknown
  [key: string]: unknown
}

let rpcCounter = 0
export function nextRpcId(): string {
  rpcCounter += 1
  return `hd-${Date.now().toString(36)}-${rpcCounter}`
}

/**
 * 低层传输客户端：负责 JSON-RPC 信封的 HTTP POST 与事件流 WebSocket。
 * 不包含任何业务语义。
 */
export class DshClient {
  private baseUrl: string
  private socket: WebSocket | null = null
  private listeners: ((frame: Record<string, unknown>) => void)[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(port: number) {
    this.baseUrl = `http://127.0.0.1:${port}`
  }

  get port(): number {
    return Number(new URL(this.baseUrl).port)
  }

  private async request<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const rpcId = nextRpcId()
    const body: RpcRequest = { type: 'client-request', rpcId, method, payload }
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err) {
      throw new DshTransportError(`dsh 通信失败（${method}）: ${(err as Error).message}`)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new DshTransportError(`dsh HTTP ${res.status} for ${method}: ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as RpcResponse<T>
    if (data.type !== 'server-response') {
      throw new DshTransportError(`dsh 返回了意外的消息类型: ${data.type}`)
    }
    if (!data.result.ok) {
      const err = data.result.error ?? { code: 'unknown', message: '未知错误' }
      const e = new Error(err.message) as Error & { code?: string }
      ;(e as { code?: string }).code = err.code
      throw e
    }
    return data.result.value as T
  }

  /** 轮询就绪检测用：发起一次 host.describe 而不抛错。 */
  async probeDescribe(): Promise<RpcResult<{ version: string; cwd: string }> | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/host.describe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: nextRpcId(), method: 'host.describe', payload: {} }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as RpcResponse<unknown>
      if (data.type !== 'server-response' || !data.result?.ok) return null
      return data.result as RpcResult<{ version: string; cwd: string }>
    } catch {
      return null
    }
  }

  // ---- 业务方法（薄封装，纯透传） ----

  describeHost(): Promise<{ version: string; cwd: string; provider?: string; model?: string; attachedSessions: number; canOpenPath: boolean }> {
    return this.request('host.describe', {})
  }

  listSessions(): Promise<{ items: unknown[] }> {
    return this.request('session.list', {})
  }

  createSession(payload: { workspaceId?: string; cwd?: string; sessionId?: string; agentPreset?: string }): Promise<{ sessionId: string; agentPreset?: string }> {
    return this.request('session.create', payload)
  }

  history(payload: { sessionId: string; beforeSeq?: number; maxMessages?: number }): Promise<{ events: unknown[]; hasMore: boolean }> {
    return this.request('session.history', payload)
  }

  prompt(payload: { sessionId: string; mode: 'queue' | 'steer'; content: unknown[]; clientTimeZone?: string }): Promise<{ accepted: boolean }> {
    return this.request('session.prompt', payload)
  }

  cancel(payload: { sessionId: string }): Promise<{ accepted: boolean }> {
    return this.request('session.cancel', payload)
  }

  rename(payload: { sessionId: string; title: string }): Promise<{ title: string; seq: number }> {
    return this.request('session.rename', payload)
  }

  fork(payload: { sessionId: string; atSeq?: number }): Promise<{ sessionId: string }> {
    return this.request('session.fork', payload)
  }

  workspaceList(): Promise<{ items: unknown[]; archivedSessionIds: string[] }> {
    return this.request('workspace.list', {})
  }

  archiveSession(payload: { sessionId: string }): Promise<{ archivedSessionIds: string[] }> {
    return this.request('workspace.archiveSession', payload)
  }

  models(payload: { sessionId: string }): Promise<unknown> {
    return this.request('session.models', payload)
  }

  selectModel(payload: { sessionId: string; provider: string; model: string; reasoningEffort?: string }): Promise<unknown> {
    return this.request('session.selectModel', payload)
  }

  llmProviders(): Promise<{ providers: unknown[] }> {
    return this.request('llm.providers', {})
  }

  llmModels(): Promise<{ groups: unknown[]; failures: unknown[] }> {
    return this.request('llm.models', {})
  }

  credentialsDescribe(payload: { refs: string[] }): Promise<{ credentials: Record<string, { configured: boolean }> }> {
    return this.request('credentials.describe', payload)
  }

  credentialsSet(payload: { ref: string; value: string }): Promise<Record<string, never>> {
    return this.request('credentials.set', payload)
  }

  credentialsUnset(payload: { ref: string }): Promise<Record<string, never>> {
    return this.request('credentials.unset', payload)
  }

  settingsDescribe(): Promise<{
    writable: boolean
    namespaces: Array<{ ns: string; value: Record<string, unknown>; secrets: unknown[] }>
  }> {
    return this.request('settings.describe', {})
  }

  settingsUpdate(payload: { ns: string; patch: object }): Promise<unknown> {
    return this.request('settings.update', payload)
  }

  settingsMutate(payload: { ns: string; ops: unknown[] }): Promise<unknown> {
    return this.request('settings.mutate', payload)
  }

  agentPresetList(): Promise<{ presets: unknown[] }> {
    return this.request('agentPreset.list', {})
  }

  agentPresetSelect(payload: { sessionId: string; agentPreset: string }): Promise<{ agentPreset: string }> {
    return this.request('agentPreset.select', payload)
  }

  skillsList(payload: { sessionId: string }): Promise<{ skills: unknown[] }> {
    return this.request('skill.list', payload)
  }

  pickDirectory(): Promise<{ path: string | null }> {
    return this.request('host.pickDirectory', {})
  }

  // ---- 事件流 ----

  /** 订阅 /api/events.mux 的 WebSocket 帧。返回取消函数。 */
  subscribeMux(onFrame: (frame: Record<string, unknown>) => void): () => void {
    this.listeners.push(onFrame)
    if (this.socket === null) this.openMux()
    return () => {
      this.listeners = this.listeners.filter((l) => l !== onFrame)
    }
  }

  private openMux() {
    if (this.stopped) return
    const wsUrl = `ws://127.0.0.1:${this.port}/api/events.mux`
    const ws = new WebSocket(wsUrl)
    this.socket = ws

    ws.onopen = () => {
      // noop：mux 建立即开始推送帧
    }

    ws.onmessage = (ev) => {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(ev.data as string)
      } catch {
        return
      }
      for (const listener of [...this.listeners]) listener(parsed)
    }

    ws.onclose = () => {
      if (this.socket === ws) this.socket = null
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => this.openMux(), 2000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  close() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.socket) {
      this.socket.onclose = null
      this.socket.close()
      this.socket = null
    }
    this.listeners = []
  }
}
