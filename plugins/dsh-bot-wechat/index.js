/**
 * dsh-bot-wechat —— 企业微信群机器人 adapter（webhook 出站）。
 *
 * 配置：企业微信群机器人 webhook URL（存 dsh credentials，引用 WECHAT_BOT_WEBHOOK）。
 * 出站：agent 回复 → POST webhook（text 消息）。
 * 入站：webhook 是单向（只能发不能收），入站需外部 webhook 接收器（本插件先做发送）。
 */
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-bot-wechat'
export const inject = ['botGateway', 'credentials']

export const Config = z.object({
  apiKeyEnv: z.string().default('WECHAT_BOT_WEBHOOK'),
})

export function apply(ctx, config) {
  async function resolveWebhook() {
    try {
      const r = await ctx.credentials.resolve(config.apiKeyEnv)
      return r?.value ?? null
    } catch {
      return null
    }
  }

  async function send(chatId, text) {
    const webhook = await resolveWebhook()
    if (!webhook) return
    const url = webhook.trim()
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`企业微信 webhook HTTP ${res.status}: ${body.slice(0, 120)}`)
    }
  }

  ctx.effect(() => {
    const dispose = ctx.botGateway.registerAdapter({
      platform: 'wechat',
      name: '企业微信',
      send,
    })
    resolveWebhook().then((w) => {
      if (w) ctx.logger?.info('dsh-bot-wechat: 已配置企业微信 webhook')
      else ctx.logger?.warn('dsh-bot-wechat: 未配置 WECHAT_BOT_WEBHOOK')
    })
    return dispose
  })
}

export default { name, inject, Config, apply }
