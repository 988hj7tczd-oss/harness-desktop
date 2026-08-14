/**
 * dsh-bot-telegram —— Telegram Bot 消息通道 adapter。
 *
 * 用官方 Bot API 长轮询（getUpdates）接收消息，sendMessage 回发。
 * Token 走 dsh credentials（apiKeyEnv 引用），不写明文。
 * 接入网关：注册 adapter {platform:'telegram', send}，并把入站消息交给网关 handleInbound。
 */
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-bot-telegram'
export const inject = ['botGateway', 'credentials']

export const Config = z.object({
  /** 存放 Bot Token 的凭据引用。 */
  apiKeyEnv: z.string().default('TELEGRAM_BOT_TOKEN'),
  /** 长轮询间隔（ms）。 */
  pollIntervalMs: z.number().default(1000),
})

const API_BASE = 'https://api.telegram.org/bot'

function safeToken(token) {
  // 脱敏：只打印前 6 位
  return token.length > 6 ? `${token.slice(0, 6)}…` : '***'
}

export function apply(ctx, config) {
  let running = false
  let offset = 0
  let timer = null
  let token = null

  async function resolveToken() {
    try {
      const ref = config.apiKeyEnv
      const resolved = await ctx.credentials.resolve(ref)
      return resolved?.value ?? null
    } catch (err) {
      ctx.logger?.warn(`dsh-bot-telegram: 读取凭据失败: ${err?.message ?? err}`)
      return null
    }
  }

  async function send(chatId, text) {
    const tk = await resolveToken()
    if (!tk) return
    const res = await fetch(`${API_BASE}${tk}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(chatId), text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Telegram sendMessage HTTP ${res.status}: ${body.slice(0, 120)}`)
    }
  }

  async function poll() {
    if (!running) return
    const tk = await resolveToken()
    if (!tk) {
      if (token) {
        token = null
        ctx.logger?.warn('dsh-bot-telegram: Token 已失效，断开')
      }
      return
    }
    token = tk
    try {
      const res = await fetch(`${API_BASE}${tk}/getUpdates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offset, timeout: 0 }),
      })
      if (!res.ok) {
        ctx.logger?.warn(`dsh-bot-telegram: getUpdates HTTP ${res.status}`)
      } else {
        const data = await res.json()
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = Math.max(offset, update.update_id + 1)
            const msg = update.message ?? update.channel_post
            if (!msg || typeof msg.text !== 'string') continue
            const chatId = String(msg.chat?.id ?? '')
            if (!chatId) continue
            const handled = await ctx.botGateway.handleInbound('telegram', chatId, msg.text, {
              userId: msg.from ? String(msg.from.id) : chatId,
              chatType: msg.chat?.type === 'private' ? 'dm' : 'group',
            })
            if (!handled) {
              await send(chatId, '（消息未入队，请检查 Agent 状态）').catch(() => undefined)
            }
          }
        }
      }
    } catch (err) {
      ctx.logger?.warn(`dsh-bot-telegram: 轮询异常: ${err?.message ?? err}`)
    }
  }

  function startLoop() {
    if (timer) return
    timer = setInterval(() => void poll(), config.pollIntervalMs)
    void poll()
  }

  ctx.effect(() => {
    const dispose = ctx.botGateway.registerAdapter({
      platform: 'telegram',
      name: 'Telegram',
      send,
    })
    // 首次读取 token 并尝试连接
    resolveToken().then((t) => {
      token = t
      if (t) {
        running = true
        startLoop()
        ctx.logger?.info(`dsh-bot-telegram: 已连接（token ${safeToken(t)}）`)
      }
    })
    return () => {
      dispose()
      running = false
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
  })
}

export default { name, inject, Config, apply }
