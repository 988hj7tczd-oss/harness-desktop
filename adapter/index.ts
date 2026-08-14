/**
 * adapter/index.ts —— 高层的稳定 API。
 *
 * 主进程通过这个类访问 dsh 的全部能力。dsh 上游变更只会影响
 * DshClient（dsh-client.ts）与 normalize*（events.ts），本文件尽量薄。
 */
import { DshClient } from './dsh-client.js'
import { normalizeHistory, normalizeMuxFrame } from './events.js'
import type { DshEvent } from './events.js'
import type {
  AgentPresetInfo,
  CredentialStatus,
  CustomProviderConfig,
  CustomProviderListItem,
  MessageBlock,
  ModelGroup,
  PickedFile,
  ProviderInfo,
  SessionStreamEvent,
  SessionSummary,
  SkillInfo,
  WebSearchConfig,
} from '../shared/types.js'

/** 从 provider id 生成一个环境变量风格的凭据引用，如 my-gateway → MY_GATEWAY_KEY。 */
function envRefFor(providerId: string): string {
  const base = providerId.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase()
  return `${base || 'CUSTOM'}_API_KEY`
}

export class DshAdapter {
  readonly client: DshClient
  private muxUnsub: (() => void) | null = null
  private eventListeners: ((evt: SessionStreamEvent) => void)[] = []

  constructor(port: number) {
    this.client = new DshClient(port)
  }

  // ---- 生命周期 ----

  /** 就绪探测：host.describe 返回 ok 即视为就绪。 */
  async isReady(): Promise<boolean> {
    const probe = await this.client.probeDescribe()
    return probe !== null
  }

  describe(): Promise<{
    version: string
    cwd: string
    provider?: string
    model?: string
    attachedSessions: number
    canOpenPath: boolean
  }> {
    return this.client.describeHost()
  }

  // ---- 会话 ----

  async listSessions(): Promise<SessionSummary[]> {
    const [sessionRes, workspaceRes] = await Promise.all([
      this.client.listSessions(),
      this.client.workspaceList().catch(() => ({ items: [], archivedSessionIds: [] })),
    ])
    const archived = new Set(workspaceRes.archivedSessionIds ?? [])
    const { items } = sessionRes
    return items
      .filter((raw) => !archived.has(String((raw as Record<string, unknown>).sessionId ?? '')))
      .map((raw) => {
        const s = raw as Record<string, unknown>
        // title projection 的值是字符串（或 null）；兼容旧形态 { value }
        const projTitle = (s.projections as { values?: { title?: unknown } } | undefined)?.values?.title
        const resolvedTitle =
          typeof projTitle === 'string'
            ? projTitle
            : projTitle && typeof projTitle === 'object' && 'value' in projTitle
              ? (projTitle as { value?: unknown }).value
              : undefined
        const title = typeof resolvedTitle === 'string' ? resolvedTitle : (s.title as string)
        const planProj = (s.projections as { values?: { plan?: { active?: boolean } } } | undefined)?.values?.plan
        return {
          sessionId: String(s.sessionId ?? ''),
          title: title || '新会话',
          updatedAt: Number(s.updatedAt ?? 0),
          running: Boolean(s.running),
          blank: Boolean(s.blank),
          cwd: typeof s.cwd === 'string' ? s.cwd : undefined,
          agentPreset: typeof s.agentPreset === 'string' ? s.agentPreset : undefined,
          planActive: Boolean(planProj?.active),
        }
      })
  }

  createSession(cwd?: string, agentPreset?: string): Promise<{ sessionId: string }> {
    const payload: { workspaceId?: string; cwd?: string; agentPreset?: string } = {}
    if (cwd) payload.cwd = cwd
    if (agentPreset) payload.agentPreset = agentPreset
    return this.client.createSession(payload)
  }

  async getHistory(sessionId: string): Promise<{ events: SessionStreamEvent[]; hasMore: boolean }> {
    const { events, hasMore } = await this.client.history({ sessionId })
    return { events: normalizeHistory(events), hasMore }
  }

  async sendMessage(sessionId: string, text: string, files?: PickedFile[]): Promise<{ accepted: boolean }> {
    const content: unknown[] = [{ type: 'text', text }]
    if (files && files.length > 0) {
      const images = files.filter((f) => f.data && f.mediaType)
      for (const img of images) {
        content.push({
          type: 'image',
          mediaType: img.mediaType,
          data: img.data,
          ...(img.name ? { name: img.name } : {}),
        })
      }
      const refs = files.filter((f) => !f.data)
      if (refs.length > 0) {
        content.push({
          type: 'text',
          text: `[已附加文件]\n${refs.map((f) => `- ${f.path}`).join('\n')}`,
        })
      }
    }
    return this.client.prompt({
      sessionId,
      mode: 'queue',
      content,
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  }

  cancelTurn(sessionId: string): Promise<{ accepted: boolean }> {
    return this.client.cancel({ sessionId })
  }

  renameSession(sessionId: string, title: string): Promise<{ title: string }> {
    return this.client.rename({ sessionId, title })
  }

  forkSession(sessionId: string): Promise<{ sessionId: string }> {
    return this.client.fork({ sessionId })
  }

  archiveSession(sessionId: string): Promise<{ archivedSessionIds: string[] }> {
    return this.client.archiveSession({ sessionId })
  }

  // ---- Agent 预设（模式） ----

  async listSkills(sessionId: string): Promise<SkillInfo[]> {
    const res = await this.client.skillsList({ sessionId })
    return (res.skills ?? []).map((s) => {
      const sk = s as Record<string, unknown>
      return {
        name: String(sk.name ?? ''),
        description: String(sk.description ?? ''),
        whenToUse: typeof sk.whenToUse === 'string' ? sk.whenToUse : undefined,
        modelInvocable: Boolean(sk.modelInvocable),
      }
    })
  }

  async listAgentPresets(): Promise<AgentPresetInfo[]> {
    const res = await this.client.agentPresetList()
    return (res.presets ?? []).map((p) => {
      const preset = p as Record<string, unknown>
      return {
        id: String(preset.id ?? ''),
        name: String(preset.name ?? preset.id ?? ''),
        description: typeof preset.description === 'string' ? preset.description : undefined,
        isDefault: Boolean(preset.isDefault),
      }
    })
  }

  selectAgentPreset(sessionId: string, agentPreset: string): Promise<{ agentPreset: string }> {
    return this.client.agentPresetSelect({ sessionId, agentPreset })
  }

  // ---- 模型 ----

  async listModels(): Promise<ModelGroup[]> {
    const { groups } = await this.client.llmModels()
    return (groups ?? []).map((g) => {
      const grp = g as Record<string, unknown>
      return {
        id: String(grp.id ?? ''),
        name: String(grp.name ?? grp.id ?? ''),
        models: ((grp.models as unknown[]) ?? []).map((m) => {
          const model = m as Record<string, unknown>
          return {
            id: String(model.id ?? ''),
            name: String(model.name ?? model.id ?? ''),
            description: typeof model.description === 'string' ? model.description : undefined,
          }
        }),
      }
    })
  }

  async listProviders(): Promise<ProviderInfo[]> {
    const { providers } = await this.client.llmProviders()
    return (providers ?? []).map((p) => {
      const prov = p as Record<string, unknown>
      return {
        id: String(prov.id ?? prov.provider ?? ''),
        name: String(prov.name ?? prov.id ?? prov.provider ?? ''),
      }
    })
  }

  selectModel(sessionId: string, provider: string, model: string): Promise<unknown> {
    return this.client.selectModel({ sessionId, provider, model })
  }

  // ---- 凭据 / 设置 ----

  async hasApiKey(): Promise<boolean> {
    const { credentials } = await this.client.credentialsDescribe({
      refs: ['DEEPSEEK_API_KEY'],
    })
    const view = credentials['DEEPSEEK_API_KEY']
    return Boolean(view?.configured)
  }

  async setApiKey(key: string): Promise<void> {
    await this.client.credentialsSet({ ref: 'DEEPSEEK_API_KEY', value: key })
  }

  // ---- Part A：凭证统一管理 ----

  /** 枚举全部凭据 ref 及配置状态（来自 llm-deepseek / llm-pi-ai / web-search 命名空间）。 */
  async listCredentials(): Promise<CredentialStatus[]> {
    const describe = await this.client.settingsDescribe()
    const refs: Array<{ ref: string; label: string; priority: number }> = []
    const push = (ref: string, label: string, priority: number) => refs.push({ ref, label, priority })
    for (const ns of describe.namespaces) {
      const value = ns.value ?? {}
      if (ns.ns === 'llm-deepseek') {
        push(typeof value.apiKeyEnv === 'string' ? value.apiKeyEnv : 'DEEPSEEK_API_KEY', 'DeepSeek 官方', 0)
      } else if (ns.ns === 'web-search-deepseek') {
        push(typeof value.apiKeyEnv === 'string' ? value.apiKeyEnv : 'DEEPSEEK_API_KEY', 'Web 搜索', 2)
      } else if (ns.ns === 'llm-pi-ai') {
        const providers = (value.providers ?? {}) as Record<string, Record<string, unknown>>
        for (const [id, cfg] of Object.entries(providers)) {
          if (typeof cfg.apiKeyEnv === 'string' && cfg.apiKeyEnv.length > 0) {
            push(cfg.apiKeyEnv, String(cfg.displayName ?? id), 1)
          }
        }
      }
    }
    // 按 ref 去重，优先级高（数字小）的 label 胜出
    const byRef = new Map<string, { label: string; priority: number }>()
    for (const r of refs) {
      const cur = byRef.get(r.ref)
      if (!cur || r.priority < cur.priority) byRef.set(r.ref, { label: r.label, priority: r.priority })
    }
    const uniqRefs = [...byRef.entries()].map(([ref, v]) => ({ ref, label: v.label }))
    const { credentials } = await this.client.credentialsDescribe({ refs: uniqRefs.map((r) => r.ref) })
    return uniqRefs.map((r) => {
      const view = credentials[r.ref]
      return { ref: r.ref, label: r.label, configured: Boolean(view?.configured) }
    })
  }

  async setCredential(ref: string, value: string): Promise<void> {
    await this.client.credentialsSet({ ref, value })
  }

  async clearCredential(ref: string): Promise<void> {
    await this.client.credentialsUnset({ ref })
  }

  /** 查询任意 ref 是否已配置（消息通道等专用 ref 不在此前的 listCredentials 枚举内）。 */
  async describeCredentialRefs(refs: string[]): Promise<Record<string, boolean>> {
    const uniq = [...new Set(refs)]
    const { credentials } = await this.client.credentialsDescribe({ refs: uniq })
    const out: Record<string, boolean> = {}
    for (const r of uniq) out[r] = Boolean(credentials[r]?.configured)
    return out
  }

  // ---- Part A：Web 搜索 ----

  async getWebSearchConfig(): Promise<WebSearchConfig> {
    const describe = await this.client.settingsDescribe()
    const ns = describe.namespaces.find((n) => n.ns === 'web-search-deepseek')
    const v = (ns?.value ?? {}) as Record<string, unknown>
    return {
      apiKeyEnv: typeof v.apiKeyEnv === 'string' ? v.apiKeyEnv : 'DEEPSEEK_API_KEY',
      model: typeof v.model === 'string' ? v.model : 'deepseek-v4-flash',
      apiVersion: typeof v.apiVersion === 'string' ? v.apiVersion : '2023-06-01',
      baseURL: typeof v.baseURL === 'string' ? v.baseURL : undefined,
      maxUses: typeof v.maxUses === 'number' ? v.maxUses : 5,
    }
  }

  async setWebSearchConfig(config: Partial<WebSearchConfig>): Promise<WebSearchConfig> {
    await this.client.settingsUpdate({ ns: 'web-search-deepseek', patch: config })
    return this.getWebSearchConfig()
  }

  /** 计划模式：通过 /plan 斜杠命令（host 命令注册表执行，无需 LLM）。 */
  async togglePlanMode(sessionId: string): Promise<void> {
    await this.client.prompt({
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: '/plan' }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  }

  pickDirectory(): Promise<{ path: string | null }> {
    return this.client.pickDirectory()
  }

  // ---- 自定义 provider（llm-pi-ai） ----

  /** 读取用户添加的自定义 provider（来自 settings.describe 的 llm-pi-ai 区）。 */
  async listCustomProviders(): Promise<CustomProviderListItem[]> {
    const describe = await this.client.settingsDescribe()
    const ns = describe.namespaces.find((n) => n.ns === 'llm-pi-ai')
    const providers = (ns?.value?.providers ?? {}) as Record<string, Record<string, unknown>>
    const entries = Object.entries(providers)
    // 查询活跃状态
    const { providers: providerViews } = await this.client.llmProviders()
    const activeById = new Map<string, boolean>()
    for (const view of providerViews) {
      const v = view as Record<string, unknown>
      activeById.set(String(v.provider), Boolean(v.active))
    }
    return entries.map(([id, cfg]) => ({
      id,
      displayName: String(cfg.displayName ?? id),
      apiKeyEnv: typeof cfg.apiKeyEnv === 'string' ? cfg.apiKeyEnv : undefined,
      api: String(cfg.api ?? 'openai-completions'),
      baseURL: String(cfg.baseURL ?? ''),
      models: Array.isArray(cfg.models)
        ? cfg.models.map((m) => {
            const mm = m as Record<string, unknown>
            return {
              id: String(mm.id ?? ''),
              name: typeof mm.name === 'string' ? mm.name : undefined,
            }
          })
        : [],
      active: activeById.get(id) ?? false,
    }))
  }

  /** 保存（新增或更新）一个自定义 provider 到 dsh settings。 */
  async saveCustomProvider(config: CustomProviderConfig): Promise<unknown> {
    const apiKeyEnv = config.apiKeyEnv ?? envRefFor(config.id)
    const patch = {
      providers: {
        [config.id]: {
          displayName: config.displayName,
          apiKeyEnv,
          api: config.api,
          baseURL: config.baseURL,
          models: config.models.map((m) => ({
            id: m.id,
            ...(m.name ? { name: m.name } : {}),
          })),
        },
      },
    }
    return this.client.settingsUpdate({ ns: 'llm-pi-ai', patch })
  }

  /** 删除一个自定义 provider。 */
  async removeCustomProvider(id: string): Promise<unknown> {
    return this.client.settingsMutate({
      ns: 'llm-pi-ai',
      ops: [{ op: 'unset', path: ['providers', id] }],
    })
  }

  /** 写入自定义 provider 的 API Key（凭据库，引用式存储）。 */
  async setProviderApiKey(apiKeyEnv: string, key: string): Promise<void> {
    await this.client.credentialsSet({ ref: apiKeyEnv, value: key })
  }

  // ---- 事件流 ----

  onSessionEvent(cb: (evt: SessionStreamEvent) => void): () => void {
    this.eventListeners.push(cb)
    if (this.muxUnsub === null) {
      this.muxUnsub = this.client.subscribeMux((frame) => {
        for (const evt of normalizeMuxFrame(frame)) {
          for (const listener of [...this.eventListeners]) listener(evt)
        }
      })
    }
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== cb)
    }
  }

  close() {
    this.muxUnsub?.()
    this.muxUnsub = null
    this.eventListeners = []
    this.client.close()
  }
}

export type { DshEvent, MessageBlock }
