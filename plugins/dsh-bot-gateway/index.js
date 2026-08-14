/**
 * dsh-bot-gateway —— 多平台消息通道网关。
 *
 * 职责：
 *  - 会话映射：`${platform}:${chatId}` ↔ SessionId（ctx.storageDomain 持久化）
 *  - 入站：平台 adapter 调 `botGateway.handleInbound(platform, chatId, text)`，
 *    网关找到/创建会话并把消息以 `agent.followup()` 注入（作为用户消息的一轮 turn）
 *  - 出站：订阅 `session/event`，assistant/message 落定后回调对应平台 adapter 的 send()
 *  - adapter 注册：各平台插件通过 `botGateway.registerAdapter(adapter)` 接入，
 *    新增平台只需复制 adapter 模板，不改网关
 *
 * 平台 token 走 dsh credentials（引用式），不写明文进配置。
 */
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

export const name = 'dsh-bot-gateway'
export const inject = ['storageDomain', 'sessions', 'agents', 'credentials', 'workspaceRegistry', 'agentDefaultModel']

export const Config = z.object({
  /** 默认会话工作区（可选；空则用 host cwd）。 */
  workspaceCwd: z.string().default(''),
  /** 创建 agent 用的 provider（可选；空 = 用 dsh 全局默认模型）。 */
  provider: z.string().default(''),
  /** 创建 agent 用的 model（可选；空 = 用 dsh 全局默认模型）。 */
  model: z.string().default(''),
})

/**
 * 解析创建 agent 所需的 provider/model：
 * 1. gateway Config 显式配置优先
 * 2. 否则用 dsh 全局默认（agentDefaultModel.currentSelection()）
 * 3. 两者都无 → 抛错（不静默创建无模型 agent）
 */
function resolveAgentOptions(ctx, config) {
  const configured = {
    provider: config.provider?.trim(),
    model: config.model?.trim(),
  }
  if (configured.provider && configured.model) {
    return { provider: configured.provider, model: configured.model }
  }
  let global = null
  try {
    global = ctx.agentDefaultModel?.currentSelection?.() ?? null
  } catch {
    global = null
  }
  const provider = configured.provider || global?.provider
  const model = configured.model || global?.model
  if (!provider || !model) {
    throw new Error('无法确定模型：gateway 未配置 provider/model，且 dsh 全局默认模型不可用')
  }
  return { provider, model }
}

/** 平台 adapter 的接口约定。 */
const BotDomain = defineDomain({
  name: 'dsh_bots',
  version: 1,
  tables: {
    session_map: domainTable(
      zod.object({
        platform: zod.string(),
        chatId: zod.string(),
        sessionId: zod.string(),
        createdAt: zod.number(),
      }),
    ),
  },
})

export function apply(ctx, config) {
  const adapters = new Map() // platform -> adapter {name, send(chatId,text)}
  let table = null

  ctx.inject(['storageDomain'], (domainCtx) => {
    domainCtx.storageDomain
      .open(BotDomain)
      .then((domain) => {
        table = domain.table('session_map')
        domainCtx.effect(() => () => domain.close())
      })
      .catch((err) => {
        ctx.logger?.error(`dsh-bot-gateway: 打开会话映射存储失败: ${err?.message ?? err}`)
      })
  })

  /** 平台 adapter 注册（幂等，后注册覆盖）。 */
  ctx.provide('botGateway', {
    registerAdapter(adapter) {
      adapters.set(adapter.platform, adapter)
      return () => {
        if (adapters.get(adapter.platform) === adapter) adapters.delete(adapter.platform)
      }
    },
    getAdapter(platform) {
      return adapters.get(platform)
    },
    listAdapters() {
      return [...adapters.values()].map((a) => ({ platform: a.platform, name: a.name }))
    },
    /**
     * 入站访问控制：按平台策略校验来源用户/群是否允许。
     * 策略 ref：`<PLATFORM>_DM_POLICY` / `<PLATFORM>_ALLOWED_USERS` /
     *           `<PLATFORM>_GROUP_POLICY` / `<PLATFORM>_ALLOWED_GROUPS`（大写平台名）。
     * 值：open（开放，默认）/ allowlist（白名单）/ disabled（禁用）。
     * meta：{ userId, chatType: 'dm' | 'group' }，由 adapter 透传入站来源信息。
     * @returns {ok:boolean, reason?:'disabled'|'not-in-allowlist'}
     */
    async checkAccess(platform, chatId, meta) {
      const P = String(platform).toUpperCase()
      const isGroup = meta?.chatType === 'group'
      const policyRef = isGroup ? `${P}_GROUP_POLICY` : `${P}_DM_POLICY`
      const listRef = isGroup ? `${P}_ALLOWED_GROUPS` : `${P}_ALLOWED_USERS`
      const target = isGroup ? String(chatId ?? '') : String(meta?.userId ?? chatId ?? '')
      try {
        const policy = (await ctx.credentials.resolve(policyRef))?.value?.trim()?.toLowerCase() || 'open'
        if (policy === 'disabled') return { ok: false, reason: 'disabled' }
        if (policy === 'allowlist') {
          const list = String((await ctx.credentials.resolve(listRef))?.value ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          if (target && list.includes(target)) return { ok: true }
          return { ok: false, reason: 'not-in-allowlist' }
        }
        return { ok: true }
      } catch (err) {
        ctx.logger?.warn(`dsh-bot-gateway: 访问控制校验异常（放行）: ${err?.message ?? err}`)
        return { ok: true }
      }
    },
    /**
     * 入站消息：平台消息 → 会话映射 → agent.followup()。
     * meta：{ userId, chatType: 'dm' | 'group' }（可选；访问控制用）。
     * @returns 是否成功入队。未授权时回复友好提示并返回 false。
     */
    async handleInbound(platform, chatId, text, meta) {
      if (!table || !text || !text.trim()) {
        return false
      }
      const access = await this.checkAccess(platform, chatId, meta)
      if (!access.ok) {
        const adapter = adapters.get(platform)
        const hint =
          access.reason === 'disabled'
            ? '（该消息通道已禁用，请联系管理员）'
            : '（未授权：你的账号不在允许列表，请联系管理员）'
        if (adapter?.send) {
          adapter.send(chatId, hint).catch(() => undefined)
        } else {
          ctx.logger?.info(`dsh-bot-gateway: ${platform} 入站被拒绝（${access.reason}）: ${chatId}`)
        }
        return false
      }
      const key = `${platform}:${chatId}`
      let sessionId = null
      const existing = [...table.entries()].find(([, v]) => v.platform === platform && v.chatId === chatId)
      if (existing) {
        sessionId = existing[1].sessionId
      } else {
        // 首次：确保 workspace 已注册（host cwd 或配置 cwd），然后一步创建 session + agent。
        // 参照官方 session.create 路径（apiproxy ensureSession）：workspace 先行，
        // 再 ctx.agents.create（工厂内部 prepare 创建 session 并附加 agent），
        // 而不是手动 sessions.create 后另起 agents.create（同 id 会冲突）。
        try {
          let cwd = config.workspaceCwd?.trim() || process.cwd()
          try {
            const existingWs = await ctx.workspaceRegistry.resolveByPath(cwd)
            if (existingWs === undefined) {
              await ctx.workspaceRegistry.create(cwd)
            }
          } catch (err) {
            ctx.logger?.warn(`dsh-bot-gateway: workspace 注册失败（继续）: ${err?.message ?? err}`)
          }
          const agentOptions = resolveAgentOptions(ctx, config)
          const handle = await ctx.agents.create({
            sessionId: `session-${randomUUID()}`,
            meta: { cwd },
            agentOptions,
          })
          sessionId = String(handle?.agent?.id ?? handle?.agent?.session?.id ?? '')
          if (!sessionId) throw new Error('agent 创建未返回 id')
          await table.put(key, {
            platform,
            chatId,
            sessionId,
            createdAt: Date.now(),
          })
          ctx.logger?.info(`dsh-bot-gateway: 新映射 ${platform}:${chatId} → ${sessionId}（cwd=${cwd}）`)
        } catch (err) {
          ctx.logger?.error(`dsh-bot-gateway: 创建会话/agent 失败: ${err?.message ?? err}`)
          return false
        }
      }
      // 确保有 agent 可用：已附加则直接用，否则先尝试 resume（持久化会话），再 create（新会话）
      let agent = ctx.agents.get(sessionId)
      if (!agent) {
        const cwd = config.workspaceCwd?.trim() || process.cwd()
        const agentOptions = resolveAgentOptions(ctx, config)
        // 1) session 已持久化（进程重启后 session_map 残留）→ resume
        try {
          const handle = await ctx.agents.resume({
            resumeSessionId: sessionId,
            agentOptions,
            setup: undefined,
          })
          agent = ctx.agents.get(sessionId) ?? handle?.agent
        } catch (err) {
          ctx.logger?.warn(`dsh-bot-gateway: resume 失败（尝试 create）: ${err?.message ?? err}`)
        }
        // 2) 新 session → create
        if (!agent) {
          try {
            const handle = await ctx.agents.create({
              sessionId,
              meta: { cwd },
              agentOptions,
            })
            agent = ctx.agents.get(sessionId) ?? handle?.agent
          } catch (err) {
            ctx.logger?.warn(`dsh-bot-gateway: 附加 agent 失败: ${err?.message ?? err}`)
          }
        }
      }
      if (!agent) {
        ctx.logger?.warn(`dsh-bot-gateway: 会话 ${sessionId} 无可用 agent`)
        return false
      }
      try {
        const message = createUserMessage({
          content: [{ type: 'text', text: text.trim() }],
          source: { kind: `dsh-bot-${platform}`, form: 'inbound', chatId },
        })
        agent.followup(message)
        return true
      } catch (err) {
        ctx.logger?.error(`dsh-bot-gateway: 消息入队失败: ${err?.message ?? err}`)
        return false
      }
    },
  })

  // 出站：assistant/message 落定 → 回发对应平台
  ctx.on('session/event', (session, event) => {
    if (!table || event.type !== 'assistant/message') return
    const sessionId = String(session?.id ?? '')
    const texts = (event.data.message?.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
    if (!texts) return
    for (const [, v] of table.entries()) {
      if (v.sessionId === sessionId) {
        const adapter = adapters.get(v.platform)
        if (adapter) {
          adapter
            .send(v.chatId, texts)
            .catch((err) => ctx.logger?.error(`dsh-bot-gateway: 回发 ${v.platform} 失败: ${err?.message ?? err}`))
        }
      }
    }
  })
}

export default { name, inject, Config, apply }
