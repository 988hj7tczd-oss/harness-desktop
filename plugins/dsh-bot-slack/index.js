/**
 * dsh-bot-slack —— Slack Bot 消息通道 adapter（Socket Mode，免公网）。
 *
 * 用官方 Web API + Socket Mode：
 *  - apps.connections.open 拿 wss 地址（需 App-Level Token xapp-）
 *  - 连接 WebSocket 收事件（message.*）→ botGateway.handleInbound()
 *  - chat.postMessage 回发（需 Bot Token xoxb-）
 * Token 走 dsh credentials（引用式）。
 */
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-bot-slack'
export const inject = ['botGateway', 'credentials']

export const Config = z.object({
  botTokenEnv: z.string().default('SLACK_BOT_TOKEN'),
  appTokenEnv: z.string().default('SLACK_APP_TOKEN'),
  pollIntervalMs: z.number().default(1000),
})

function safeToken(t) {
  return t.length > 6 ? `${t.slice(0, 6)}…` : '***'
}

export function apply(ctx, config) {
  let running = false
  let ws = null
  let timer = null

  async function resolveBotToken() {
    return (await ctx.credentials.resolve(config.botTokenEnv))?.value ?? null
  }
  async function resolveAppToken() {
    return (await ctx.credentials.resolve(config.appTokenEnv))?.value ?? null
  }

  async function send(chatId, text) {
    const tk = await resolveBotToken()
    if (!tk) return
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tk}`,
      },
      body: JSON.stringify({ channel: chatId, text }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(`Slack chat.postMessage 失败: ${data.error ?? 'unknown'}`)
  }

  async function connect() {
    const botToken = await resolveBotToken()
    const appToken = await resolveAppToken()
    if (!botToken || !appToken) {
      running = false
      return
    }
    try {
      const res = await fetch('https://slack.com/api/apps.connections.open', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${appToken}`,
        },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!data.ok || !data.url) {
        ctx.logger?.warn(`dsh-bot-slack: apps.connections.open 失败: ${data.error ?? 'unknown'}`)
        running = false
        return
      }
      ws = new WebSocket(data.url)
      ws.onmessage = async (ev) => {
        try {
          const frame = JSON.parse(String(ev.data))
          // 需要回 ack 保活
          if (frame.type === 'hello') return
          if (frame.type === 'disconnect') {
            ctx.logger?.warn('dsh-bot-slack: 收到 disconnect，重连')
            cleanup()
            running = false
            return
          }
          if (frame.envelope_id) {
            try {
              await fetch(data.url.replace(/^wss:\/\//, '') === '' ? '' : 'https://slack.com/api/apps.connections.ack', {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  authorization: `Bearer ${appToken}`,
                },
                body: JSON.stringify({ envelope_id: frame.envelope_id }),
              })
            } catch {
              // ack 失败不阻塞
            }
          }
          const payload = frame.payload
          if (!payload) return
          const evType = payload.type
          if (evType !== 'message') return
          const msg = payload.event ?? payload
          const text = msg.text
          const channel = msg.channel
          if (typeof text !== 'string' || !channel) return
          const userId = msg.user ? String(msg.user) : String(channel)
          const chatType = channel?.startsWith('C') || channel?.startsWith('G') ? 'group' : 'dm'
          const handled = await ctx.botGateway.handleInbound('slack', String(channel), text, {
            userId,
            chatType,
          })
          if (!handled) {
            await send(String(channel), '（消息未入队，请检查 Agent 状态）').catch(() => undefined)
          }
        } catch (err) {
          ctx.logger?.warn(`dsh-bot-slack: 事件处理异常: ${err?.message ?? err}`)
        }
      }
      ws.onclose = () => {
        ws = null
        if (running) timer = setTimeout(() => void connect(), config.pollIntervalMs)
      }
      ws.onerror = () => {
        ctx.logger?.warn('dsh-bot-slack: WebSocket 错误')
      }
      running = true
    } catch (err) {
      ctx.logger?.warn(`dsh-bot-slack: 连接失败: ${err?.message ?? err}`)
      running = false
    }
  }

  function cleanup() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
  }

  ctx.effect(() => {
    const dispose = ctx.botGateway.registerAdapter({
      platform: 'slack',
      name: 'Slack',
      send,
    })
    resolveBotToken().then((t) => {
      if (t) {
        void connect()
        ctx.logger?.info(`dsh-bot-slack: 已配置（bot ${safeToken(t)}）`)
      } else {
        ctx.logger?.warn('dsh-bot-slack: 未配置 SLACK_BOT_TOKEN')
      }
    })
    return () => {
      dispose()
      running = false
      cleanup()
    }
  })
}

export default { name, inject, Config, apply }
