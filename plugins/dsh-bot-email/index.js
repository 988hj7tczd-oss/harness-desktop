/**
 * dsh-bot-email —— Email 消息通道 adapter（SMTP 发 + IMAP 轮询收）。
 *
 * 使用 node 内置 net/tls 实现最小 SMTP 与 IMAP 客户端，不引入第三方库。
 * 配置（走 credentials）：
 *   EMAIL_IMAP_HOST/EMAIL_IMAP_PORT/EMAIL_ADDRESS/EMAIL_PASSWORD/EMAIL_SMTP_HOST/EMAIL_SMTP_PORT
 * 出站：SMTP AUTH LOGIN 发送 agent 回复。
 * 入站：IMAP 轮询未读邮件 → 主题/正文作为消息 → botGateway.handleInbound()。
 */
import z from '@deepseek-ai/schemastery'
import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'

export const name = 'dsh-bot-email'
export const inject = ['botGateway', 'credentials']

export const Config = z.object({
  imapHostEnv: z.string().default('EMAIL_IMAP_HOST'),
  imapPortEnv: z.string().default('EMAIL_IMAP_PORT'),
  emailEnv: z.string().default('EMAIL_ADDRESS'),
  passwordEnv: z.string().default('EMAIL_PASSWORD'),
  smtpHostEnv: z.string().default('EMAIL_SMTP_HOST'),
  smtpPortEnv: z.string().default('EMAIL_SMTP_PORT'),
  pollIntervalMs: z.number().default(30000),
})

function base64(s) {
  return Buffer.from(s, 'utf8').toString('base64')
}

/** 最小 SMTP 客户端（AUTH LOGIN）。implicitTls=true 走 465；否则 STARTTLS。 */
async function smtpSend({ host, port, user, pass, from, to, subject, text }) {
  const socket = await new Promise((resolve, reject) => {
    const s = netConnect(Number(port) || 465, host)
    s.once('connect', () => resolve(s))
    s.once('error', reject)
  })
  let tls = null
  const useTls = Number(port) === 465
  if (useTls) {
    tls = tlsConnect({ socket }, { servername: host })
    await new Promise((resolve, reject) => {
      tls.once('secureConnect', resolve)
      tls.once('error', reject)
    })
  }
  const conn = useTls ? tls : socket
  let buffer = ''
  const wait = () =>
    new Promise((resolve, reject) => {
      const check = () => {
        if (buffer.includes('\n')) {
          const line = buffer.split('\n')[0]
          buffer = buffer.slice(line.length + 1)
          resolve(line)
        }
      }
      const onData = (chunk) => {
        buffer += chunk.toString()
        check()
      }
      conn.once('data', onData)
      conn.once('error', reject)
      setTimeout(() => reject(new Error('SMTP 超时')), 15000)
    })
  const send = (line) => conn.write(line + '\r\n')
  const expect = async (code) => {
    const line = await wait()
    if (!line.startsWith(String(code))) {
      throw new Error(`SMTP 错误：${line}`)
    }
    return line
  }
  await expect(220)
  send(`EHLO harness-desktop`)
  await expect(250)
  if (!useTls) {
    send(`STARTTLS`)
    await expect(220)
    tls = tlsConnect({ socket }, { servername: host })
    await new Promise((resolve, reject) => {
      tls.once('secureConnect', resolve)
      tls.once('error', reject)
    })
    buffer = ''
    await expect(250) // 升级后的 EHLO 回显（部分服务器需重发）
  }
  send(`AUTH LOGIN`)
  await expect(334)
  send(base64(user))
  await expect(334)
  send(base64(pass))
  await expect(235)
  send(`MAIL FROM:<${from}>`)
  await expect(250)
  send(`RCPT TO:<${to}>`)
  await expect(250)
  send(`DATA`)
  await expect(354)
  const body = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\n\r\n${text}\r\n.`
  conn.write(body + '\r\n')
  await expect(250)
  send(`QUIT`)
  try {
    conn.end()
  } catch {
    // ignore
  }
}

/** 最小 IMAP 客户端：LOGIN → SELECT INBOX → SEARCH UNSEEN → FETCH。 */
async function imapFetch({ host, port, user, pass }) {
  const p = Number(port) || 993
  const useTls = p === 993
  const socket = await new Promise((resolve, reject) => {
    const s = netConnect(p, host)
    s.once('connect', () => resolve(s))
    s.once('error', reject)
  })
  let conn = socket
  if (useTls) {
    conn = tlsConnect({ socket }, { servername: host })
    await new Promise((resolve, reject) => {
      conn.once('secureConnect', resolve)
      conn.once('error', reject)
    })
  }
  let buffer = ''
  const waitFor = (tag) =>
    new Promise((resolve, reject) => {
      const onData = (chunk) => {
        buffer += chunk.toString()
        if (buffer.includes(tag)) {
          conn.removeListener('data', onData)
          const out = buffer
          buffer = ''
          resolve(out)
        }
      }
      conn.on('data', onData)
      setTimeout(() => {
        conn.removeListener('data', onData)
        reject(new Error('IMAP 超时'))
      }, 20000)
    })
  const send = (line) => conn.write(line + '\r\n')

  // 握手
  const greeting = await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      conn.removeListener('data', onData)
      resolve(chunk.toString())
    }
    conn.once('data', onData)
    setTimeout(() => reject(new Error('IMAP 连接超时')), 15000)
  })
  if (!greeting.includes('OK')) throw new Error(`IMAP 握手失败：${greeting.trim()}`)
  if (!useTls) {
    send(`a0 STARTTLS`)
    const r = await waitFor('a0 ')
    if (!r.includes('OK')) throw new Error(`IMAP STARTTLS 失败：${r.trim()}`)
    conn = tlsConnect({ socket }, { servername: host })
    await new Promise((resolve, reject) => {
      conn.once('secureConnect', resolve)
      conn.once('error', reject)
    })
    buffer = ''
  }
  send(`a1 LOGIN ${base64(user)} ${base64(pass)}`)
  const login = await waitFor('a1 ')
  if (!login.includes('OK')) throw new Error(`IMAP 登录失败：${login.trim()}`)
  send(`a2 SELECT INBOX`)
  await waitFor('a2 ')
  send(`a3 SEARCH UNSEEN`)
  const search = await waitFor('a3 ')
  const match = /SEARCH ([\d\s]+)/.exec(search)
  if (!match || !match[1].trim()) return []
  const ids = match[1].trim().split(/\s+/).slice(-5) // 最多取 5 封
  const out = []
  for (const id of ids) {
    send(`a4 FETCH ${id} (BODY.PEEK[HEADER.FIELDS (SUBJECT FROM)] BODY.PEEK[TEXT])`)
    const fetched = await waitFor('a4 ')
    const subject = /Subject:\s*(.+)/i.exec(fetched)?.[1]?.trim() ?? ''
    const from = /From:\s*(.+)/i.exec(fetched)?.[1]?.trim() ?? ''
    const bodyMatch = /BODY\[TEXT\]\r\n\r\n([\s\S]*)/i.exec(fetched)
    const body = bodyMatch?.[1]?.trim() ?? ''
    out.push({ id, from, subject, body: body.slice(0, 4000) })
    // 标记已读
    send(`a5 STORE ${id} +FLAGS (\\Seen)`)
    await waitFor('a5 ')
  }
  send(`a6 LOGOUT`)
  try {
    conn.end()
  } catch {
    // ignore
  }
  return out
}

export function apply(ctx, config) {
  let running = false
  let timer = null
  let lastConfig = null

  async function resolveConf() {
    return {
      imapHost: (await ctx.credentials.resolve(config.imapHostEnv))?.value ?? '',
      imapPort: (await ctx.credentials.resolve(config.imapPortEnv))?.value ?? '',
      email: (await ctx.credentials.resolve(config.emailEnv))?.value ?? '',
      password: (await ctx.credentials.resolve(config.passwordEnv))?.value ?? '',
      smtpHost: (await ctx.credentials.resolve(config.smtpHostEnv))?.value ?? '',
      smtpPort: (await ctx.credentials.resolve(config.smtpPortEnv))?.value ?? '',
    }
  }

  async function send(chatId, text) {
    const conf = lastConfig ?? (await resolveConf())
    if (!conf.smtpHost || !conf.email || !conf.password) return
    await smtpSend({
      host: conf.smtpHost,
      port: conf.smtpPort || '465',
      user: conf.email,
      pass: conf.password,
      from: conf.email,
      to: String(chatId || conf.email),
      subject: `[agent] ${text.slice(0, 60)}`,
      text,
    })
  }

  async function poll() {
    if (!running) return
    try {
      const conf = await resolveConf()
      lastConfig = conf
      if (!conf.imapHost || !conf.email || !conf.password) return
      const mails = await imapFetch({
        host: conf.imapHost,
        port: conf.imapPort || '993',
        user: conf.email,
        pass: conf.password,
      })
      for (const mail of mails) {
        const from = /<([^>]+)>/.exec(mail.from)?.[1] ?? mail.from
        const text = mail.subject ? `[${mail.subject}] ${mail.body}` : mail.body
        if (!text) continue
        await ctx.botGateway.handleInbound('email', from, text, {
          userId: from,
          chatType: 'dm',
        })
      }
    } catch (err) {
      ctx.logger?.warn(`dsh-bot-email: 轮询异常: ${err?.message ?? err}`)
    }
  }

  function startLoop() {
    if (timer) return
    timer = setInterval(() => void poll(), config.pollIntervalMs)
    void poll()
  }

  ctx.effect(() => {
    const dispose = ctx.botGateway.registerAdapter({
      platform: 'email',
      name: 'Email',
      send,
    })
    resolveConf().then((c) => {
      if (c.email && c.password) {
        running = true
        startLoop()
        ctx.logger?.info('dsh-bot-email: 已配置，开始收信轮询')
      } else {
        ctx.logger?.warn('dsh-bot-email: 未配置 EMAIL_ADDRESS / EMAIL_PASSWORD')
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
