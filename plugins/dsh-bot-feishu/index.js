/**
 * dsh-bot-feishu —— 飞书开放平台机器人 adapter。
 *
 * 配置：FEISHU_APP_ID / FEISHU_APP_SECRET（存 dsh credentials）。
 * 出站：app_access_token 获取（带缓存）→ 发送文本消息到 chat_id。
 * 入站：需飞书事件订阅（webhook/长连接），本插件先做发送。
 */
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-bot-feishu'
export const inject = ['botGateway', 'credentials']

export const Config = z.object({
  appIdEnv: z.string().default('FEISHU_APP_ID'),
  appSecretEnv: z.string().default('FEISHU_APP_SECRET'),
})

const TOKEN_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal'
const MSG_URL = 'https://open.feishu.cn/open-apis/im/v1/messages'

export function apply(ctx, config) {
  let tokenCache = { token: null, expiresAt: 0 }

  async function getToken() {
    if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token
    const appId = (await ctx.credentials.resolve(config.appIdEnv))?.value
    const appSecret = (await ctx.credentials.resolve(config.appSecretEnv))?.value
    if (!appId || !appSecret) return null
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 0 || !data.tenant_access_token) return null
    tokenCache = { token: data.tenant_access_token, expiresAt: Date.now() + (data.expire - 120) * 1000 }
    return tokenCache.token
  }

  async function send(chatId, text) {
    const token = await getToken()
    if (!token) return
    const res = await fetch(`${MSG_URL}?receive_id_type=chat_id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`飞书消息 HTTP ${res.status}: ${body.slice(0, 120)}`)
    }
  }

  ctx.effect(() => {
    const dispose = ctx.botGateway.registerAdapter({
      platform: 'feishu',
      name: '飞书',
      send,
    })
    getToken().then((t) => {
      if (t) ctx.logger?.info('dsh-bot-feishu: 已获取飞书 token')
      else ctx.logger?.warn('dsh-bot-feishu: 飞书凭据未配置或无效')
    })
    return dispose
  })
}

export default { name, inject, Config, apply }
