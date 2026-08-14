/**
 * dsh-bot-dingtalk —— 钉钉机器人 adapter（webhook + 加签）。
 *
 * 配置：DINGTALK_BOT_WEBHOOK（webhook 基础 URL）、DINGTALK_BOT_SECRET（加签密钥，可空）。
 * 出站：webhook + 时间戳签名 → 发送 text 消息。
 * 入站：webhook 单向，入站需外部接收器（本插件先做发送）。
 */
import z from '@deepseek-ai/schemastery'
import { createHmac, createHash } from 'node:crypto'

export const name = 'dsh-bot-dingtalk'
export const inject = ['botGateway', 'credentials']

export const Config = z.object({
  webhookEnv: z.string().default('DINGTALK_BOT_WEBHOOK'),
  secretEnv: z.string().default('DINGTALK_BOT_SECRET'),
})

export function apply(ctx, config) {
  async function resolveConf() {
    const webhook = (await ctx.credentials.resolve(config.webhookEnv))?.value ?? null
    const secret = (await ctx.credentials.resolve(config.secretEnv))?.value ?? ''
    return { webhook, secret }
  }

  async function send(_chatId, text) {
    const { webhook, secret } = await resolveConf()
    if (!webhook) return
    let url = webhook.trim()
    if (secret) {
      const ts = Date.now()
      const sign = encodeURIComponent(
        createHmac('sha256', secret).update(`${ts}\n${secret}`).digest('base64'),
      )
      url = `${url}${url.includes('?') ? '&' : '?'}timestamp=${ts}&sign=${sign}`
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`钉钉 webhook HTTP ${res.status}: ${body.slice(0, 120)}`)
    }
  }

  ctx.effect(() => {
    const dispose = ctx.botGateway.registerAdapter({
      platform: 'dingtalk',
      name: '钉钉',
      send,
    })
    resolveConf().then((c) => {
      if (c.webhook) ctx.logger?.info('dsh-bot-dingtalk: 已配置钉钉 webhook')
      else ctx.logger?.warn('dsh-bot-dingtalk: 未配置 DINGTALK_BOT_WEBHOOK')
    })
    return dispose
  })
}

export default { name, inject, Config, apply }
