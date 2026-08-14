/**
 * dsh-bot-webhooks —— 通用入站 Webhook adapter（支持同步等待回复）。
 *
 * 本地起一个 HTTP 服务：POST /webhook/<token> {"text":"..."} → botGateway.handleInbound()。
 * 默认**同步等待** agent 回复后返回：`{"ok":true,"reply":"<agent回复>"}`；
 * 加 `?async=1` 立即返回 `{"ok":true}`（兼容旧行为）；超时（默认 60s）返回
 * `{"ok":true,"reply":"","timeout":true}`。
 * 配置：WEBHOOKS_PORT（端口）、WEBHOOKS_TOKEN（token，走 credentials）。
 */
import z from '@deepseek-ai/schemastery'
import { createServer } from 'node:http'

export const name = 'dsh-bot-webhooks'
export const inject = ['botGateway', 'credentials']

export const Config = z.object({
  portEnv: z.string().default('WEBHOOKS_PORT'),
  tokenEnv: z.string().default('WEBHOOKS_TOKEN'),
  /** 默认等待回复超时（ms）。 */
  replyTimeoutMs: z.number().default(60000),
})

export function apply(ctx, config) {
  let server = null
  // chatId → { resolve, timer }，出站 send 时 resolve
  const pending = new Map()

  async function resolveConf() {
    const port = Number((await ctx.credentials.resolve(config.portEnv))?.value ?? '8899')
    const token = (await ctx.credentials.resolve(config.tokenEnv))?.value ?? ''
    return { port, token }
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (c) => {
        data += c
        if (data.length > 1_000_000) {
          reject(new Error('body too large'))
          req.destroy()
        }
      })
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
  }

  ctx.effect(async () => {
    const { port, token } = await resolveConf()
    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const parts = url.pathname.split('/').filter(Boolean)
      // 路径要求：POST /webhook[/<token>]。token 未配置时跳过校验（入站开放）。
      const tokenOk = !token || parts[1] === token
      if (req.method !== 'POST' || parts[0] !== 'webhook' || parts.length < 1 || !tokenOk) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }
      const wantAsync = url.searchParams.get('async') === '1'
      try {
        const raw = await readBody(req)
        let text = raw
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') text = String(parsed.text ?? parsed.content ?? '')
        } catch {
          text = raw
        }
        text = text.trim()
        if (!text) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'empty text' }))
          return
        }
        const chatId = 'inbound'
        let reply = ''
        let timedOut = false
        if (!wantAsync) {
          // 同步等待：注册 pending，出站 send 时 resolve
          const waitReply = new Promise((resolve) => {
            const timer = setTimeout(() => {
              pending.delete(chatId)
              timedOut = true
              resolve('')
            }, config.replyTimeoutMs)
            pending.set(chatId, { resolve, timer })
          })
          const handled = await ctx.botGateway.handleInbound('webhooks', chatId, text, {
            userId: 'webhooks',
            chatType: 'dm',
          })
          if (!handled) {
            pending.delete(chatId)
            clearTimeout(pending.get(chatId)?.timer)
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'not enqueued' }))
            return
          }
          reply = await waitReply
        } else {
          const handled = await ctx.botGateway.handleInbound('webhooks', chatId, text, {
            userId: 'webhooks',
            chatType: 'dm',
          })
          if (!handled) {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'not enqueued' }))
            return
          }
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(wantAsync ? { ok: true } : { ok: true, reply, timeout: timedOut }))
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err?.message ?? 'error' }))
      }
    })
    server.on('error', (err) => {
      ctx.logger?.error(`dsh-bot-webhooks: HTTP 服务错误: ${err?.message ?? err}`)
    })
    server.listen(port, '127.0.0.1', () => {
      ctx.logger?.info(
        token
          ? `dsh-bot-webhooks: 监听 http://127.0.0.1:${port}/webhook/<token>`
          : `dsh-bot-webhooks: 监听 http://127.0.0.1:${port}/webhook（未配置 token，入站开放）`,
      )
    })
    ctx.botGateway.registerAdapter({
      platform: 'webhooks',
      name: 'Webhooks',
      send: async (chatId, text) => {
        // 出站：resolve 该 chatId 的 pending（同步回复），无 pending 则忽略
        const waiter = pending.get(String(chatId))
        if (waiter) {
          pending.delete(String(chatId))
          clearTimeout(waiter.timer)
          waiter.resolve(String(text ?? ''))
        }
      },
    })
    return () => {
      if (server) {
        server.close()
        server = null
      }
    }
  })
}

export default { name, inject, Config, apply }
