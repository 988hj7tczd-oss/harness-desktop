/**
 * electron/ipc.ts —— IPC 注册：把 adapter 的稳定 API 暴露给 renderer。
 *
 * renderer 只认识这里的 channel 与 shared/types.ts 里的类型；
 * dsh 上游变更永远到不了这里。
 */
import { ipcMain, dialog, clipboard, shell, app, type BrowserWindow } from 'electron'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { DshManager } from './dsh-manager.js'
import type { SettingsStore } from './settings-store.js'
import { ReminderManager } from './reminder-manager.js'
import { addMemory, clearMemories, deleteMemory, listMemories } from './memory.js'
import type {
  IpcResult,
  SessionStreamEvent,
  DshStatus,
  AppSettings,
  CustomProviderConfig,
  PickedFile,
  Reminder,
  WebSearchConfig,
} from '../shared/types.js'

/** 读取 dsh 已保存的凭证值（$DSH_HOME/.credentials.yaml）。读不到返回 null。 */
function readSavedCredentials(dshHome: string): Record<string, string> {
  try {
    const file = join(dshHome, '.credentials.yaml')
    if (!existsSync(file)) return {}
    const parsed = parseYaml(readFileSync(file, 'utf8'))
    const out: Record<string, string> = {}
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string' && v.length > 0) out[k] = v
      }
    }
    return out
  } catch {
    return {}
  }
}

/** 把归一化会话事件渲染成 Markdown（A6 会话导出）。 */
function renderMarkdown(events: SessionStreamEvent[]): string {
  const lines: string[] = ['# 会话导出', '', `导出时间：${new Date().toISOString()}`, '', '---', '']
  for (const evt of events) {
    if (evt.kind === 'user-message') {
      const text = evt.message.blocks.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('\n')
      lines.push('## 用户', '', text, '')
    } else if (evt.kind === 'assistant-end') {
      const text = evt.message.blocks.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('\n')
      lines.push('## 助手', '', text, '')
    } else if (evt.kind === 'tool-call') {
      lines.push(`> 工具调用：${evt.name}`)
    }
  }
  return lines.join('\n')
}

/** 与 dsh 相同的会话日志路径编码（用于硬删定位，见 dsh-session-persistence-jsonl）。 */
function encodeSegment(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

function projectKey(cwd: string): string {
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

function ok<T>(value: T): IpcResult<T> {
  return { ok: true, value }
}

function fail(error: unknown): IpcResult<never> {
  const err = error as { code?: string; message?: string }
  return {
    ok: false,
    error: { code: err.code ?? 'error', message: err.message ?? String(error) },
  }
}

function run<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  return fn().then(ok, fail)
}

export function registerIpc(manager: DshManager, settings: SettingsStore, getWindow: () => BrowserWindow | null) {
  const adapter = () => {
    const a = manager.adapterInstance
    if (!a) throw new Error('dsh 引擎尚未就绪')
    return a
  }

  // ---- 应用状态 ----
  ipcMain.handle('app:getState', () => run(() => Promise.resolve(settings.get())))
  ipcMain.handle('app:updateSettings', (_e, patch: Partial<AppSettings>) =>
    run(() => Promise.resolve(settings.update(patch))),
  )

  // ---- 011 启动行为（开机自启 / 启动最小化） ----
  ipcMain.handle('app:setAutoLaunch', (_e, enabled: boolean) =>
    run(async () => {
      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        openAsHidden: Boolean(enabled && settings.get().appearance?.launchMinimized),
      })
    }),
  )

  // ---- dsh 生命周期 ----
  ipcMain.handle('dsh:status', () => run(() => Promise.resolve(manager.status())))
  ipcMain.handle('dsh:ensure', () => run(() => manager.start()))
  ipcMain.handle('dsh:shutdown', () => run(() => manager.stop()))
  ipcMain.handle('dsh:describe', () =>
    run(async () => {
      const a = adapter()
      const d = await a.describe()
      const status: DshStatus = { ...manager.status(), version: d.version, cwd: d.cwd }
      return status
    }),
  )

  // ---- 会话 ----
  ipcMain.handle('session:list', () => run(() => adapter().listSessions()))
  ipcMain.handle('session:create', (_e, cwd?: string, agentPreset?: string) =>
    run(() => adapter().createSession(cwd, agentPreset)),
  )
  ipcMain.handle('session:history', (_e, sessionId: string) => run(() => adapter().getHistory(sessionId)))
  ipcMain.handle('session:send', (_e, sessionId: string, text: string, files?: PickedFile[]) =>
    run(() => adapter().sendMessage(sessionId, text, files)),
  )
  ipcMain.handle('session:cancel', (_e, sessionId: string) => run(() => adapter().cancelTurn(sessionId)))
  ipcMain.handle('session:rename', (_e, sessionId: string, title: string) =>
    run(() => adapter().renameSession(sessionId, title)),
  )
  ipcMain.handle('session:fork', (_e, sessionId: string) => run(() => adapter().forkSession(sessionId)))
  ipcMain.handle('session:archive', (_e, sessionId: string) => run(() => adapter().archiveSession(sessionId)))

  // 硬删除：取消(若运行) → 校验日志文件存在 → 删除会话目录
  // 硬删除：先归档（dsh 原生：立即从活跃列表移除，session.list 不再返回），
  // 再取消运行中的 turn，最后尽力删除会话日志文件（数据清除）。
  // 之所以要先归档：dsh 的 session 存储持有内存注册表，仅外部删文件后
  // session.list 仍会返回该会话（看起来像删除无反应）。
  ipcMain.handle('session:hardDelete', (_e, sessionId: string, cwd?: string) =>
    run(async () => {
      try {
        await adapter().archiveSession(sessionId)
      } catch {
        // 归档失败不阻塞删除（尽力而为）
      }
      try {
        await adapter().cancelTurn(sessionId)
      } catch {
        // 忽略：未运行或已结束
      }
      try {
        const sessionsRoot = join(manager.home, 'sessions')
        const projectDir = cwd ? join(sessionsRoot, projectKey(cwd)) : join(sessionsRoot, '_no-cwd')
        const sessionDir = join(projectDir, encodeSegment(sessionId))
        if (existsSync(sessionDir)) rmSync(sessionDir, { recursive: true, force: true })
      } catch {
        // 文件清理失败不阻塞：会话已归档（从列表消失），数据可能残留但不可见
      }
    }),
  )

  // 复制文本到剪贴板
  ipcMain.handle('clipboard:copy', (_e, text: string) =>
    run(async () => {
      clipboard.writeText(String(text ?? ''))
    }),
  )

  // ---- Agent 预设（模式） ----
  ipcMain.handle('preset:list', () => run(() => adapter().listAgentPresets()))
  ipcMain.handle('preset:select', (_e, sessionId: string, agentPreset: string) =>
    run(() => adapter().selectAgentPreset(sessionId, agentPreset)),
  )

  // ---- 附加文件（本机文件选择器） ----
  const IMAGE_EXT: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }
  // ---- 012 附件限制：单文件 50MB / 最多 10 个（主进程兜底，防绕过前端） ----
  const MAX_FILE_BYTES = 50 * 1024 * 1024
  const MAX_FILES = 10
  ipcMain.handle('files:pick', () =>
    run(async () => {
      const win = getWindow()
      if (!win) return [] as PickedFile[]
      const result = await dialog.showOpenDialog(win, {
        title: '添加文件',
        properties: ['openFile', 'multiSelections'],
      })
      if (result.canceled) return [] as PickedFile[]
      if (result.filePaths.length > MAX_FILES) {
        throw new Error(`附件最多 ${MAX_FILES} 个`)
      }
      const files: PickedFile[] = []
      for (const path of result.filePaths) {
        const stat = statSync(path)
        if (stat.size > MAX_FILE_BYTES) {
          throw new Error(`文件「${basename(path)}」过大，最大 50MB`)
        }
        const mediaType = IMAGE_EXT[extname(path).toLowerCase()]
        if (mediaType) {
          const buf = readFileSync(path)
          files.push({ path, name: basename(path), mediaType, size: stat.size, data: buf.toString('base64') })
        } else {
          files.push({ path, name: basename(path), size: stat.size })
        }
      }
      return files
    }),
  )

  // ---- 模型 ----
  ipcMain.handle('model:list', () => run(() => adapter().listModels()))
  ipcMain.handle('model:providers', () => run(() => adapter().listProviders()))
  ipcMain.handle('model:select', (_e, sessionId: string, provider: string, model: string) =>
    run(() => adapter().selectModel(sessionId, provider, model)),
  )

  // ---- 自定义 provider ----
  ipcMain.handle('provider:list', () => run(() => adapter().listCustomProviders()))
  ipcMain.handle('provider:save', (_e, config: CustomProviderConfig) =>
    run(() => adapter().saveCustomProvider(config)),
  )
  ipcMain.handle('provider:remove', (_e, id: string) =>
    run(() => adapter().removeCustomProvider(id)),
  )
  ipcMain.handle('provider:setKey', (_e, apiKeyEnv: string, key: string) =>
    run(() => adapter().setProviderApiKey(apiKeyEnv, key)),
  )

  // ---- Part A：凭证统一管理 ----
  ipcMain.handle('cred:list', () => run(() => adapter().listCredentials()))
  ipcMain.handle('cred:setRef', (_e, ref: string, value: string) => run(() => adapter().setCredential(ref, value)))
  ipcMain.handle('cred:clear', (_e, ref: string) => run(() => adapter().clearCredential(ref)))
  ipcMain.handle('cred:describeRefs', (_e, refs: string[]) =>
    run(() => adapter().describeCredentialRefs(refs)),
  )

  // ---- Part 007：引导链接 / 测试连接 ----
  ipcMain.handle('shell:openExternal', (_e, url: string) =>
    run(async () => {
      if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
        throw new Error('非法链接')
      }
      await shell.openExternal(url)
    }),
  )

  // 测试连接：优先用已保存的 credentials，表单有输入才用表单值。
  // 按平台 + 接入方式（modeId）分发：Telegram getMe / 飞书换 token /
  // 微信 webhook 发测试消息 / 微信公众号 access_token / 钉钉 webhook 加签发消息 /
  // 钉钉企业应用 access_token / QQ Access Token 换取 / Slack / Email。
  // 错误透传平台官方具体信息，并区分网络/凭证两类提示。不打印任何 token 内容。
  const networkHint = (err: unknown): string => {
    const message = (err as { message?: string })?.message ?? String(err)
    const e = err as { name?: string }
    // fetch 网络层失败（TypeError: fetch failed / ENOTFOUND 等）→ 友好网络提示
    if (e.name === 'TypeError' || /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|socket|网络/.test(message)) {
      return '无法连接平台服务器，检查网络/代理后重试'
    }
    return message
  }
  const runFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    try {
      return await fetch(url, init)
    } catch (err) {
      throw new Error(networkHint(err))
    }
  }
  const savedCreds = readSavedCredentials(manager.home)
  // 表单有值用表单值，否则用已保存凭证；两者都无返回 null。
  const pick = (form: string | undefined, ref: string): string | null => {
    const formVal = form?.trim()
    if (formVal) return formVal
    return savedCreds[ref] ?? null
  }
  const credentialSource = (form: string | undefined, ref: string): 'saved' | 'form' =>
    form?.trim() ? 'form' : savedCreds[ref] ? 'saved' : 'form'
  ipcMain.handle('channel:test', (_e, platformId: string, modeId: string, values: Record<string, string>) =>
    run(async () => {
      const v = (values ?? {}) as Record<string, string>
      if (platformId === 'telegram') {
        const token = pick(v.botToken, 'TELEGRAM_BOT_TOKEN')
        if (!token) throw new Error('请先填写 Bot Token')
        const res = await runFetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`)
        if (!res.ok) throw new Error(`Telegram API HTTP ${res.status}`)
        const data = (await res.json()) as { ok?: boolean; description?: string; result?: { username?: string } }
        if (!data.ok) throw new Error(`凭证无效：${data.description ?? 'Unauthorized'}`)
        const src = credentialSource(v.botToken, 'TELEGRAM_BOT_TOKEN')
        return { ok: true, message: `连接成功（@${data.result?.username ?? ''}）${src === 'saved' ? '（已保存凭证）' : ''}` }
      }
      if (platformId === 'wechat') {
        if (modeId === 'mp') {
          const appId = pick(v.appId, 'WECHAT_APP_ID')
          const appSecret = pick(v.appSecret, 'WECHAT_APP_SECRET')
          if (!appId || !appSecret) throw new Error('请先填写 AppID 和 AppSecret')
          const res = await runFetch(
            `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
          )
          const data = (await res.json()) as { access_token?: string; errcode?: number; errmsg?: string }
          if (!data.access_token) {
            throw new Error(`凭证无效：${data.errmsg ?? `errcode ${data.errcode}`}`)
          }
          const src = credentialSource(v.appId, 'WECHAT_APP_ID')
          return { ok: true, message: `凭证有效，已获取 access_token${src === 'saved' ? '（已保存凭证）' : ''}` }
        }
        const webhook = pick(v.webhook, 'WECHAT_BOT_WEBHOOK')
        if (!webhook) throw new Error('请先填写 Webhook 地址')
        const res = await runFetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ msgtype: 'text', text: { content: 'harness-desktop 测试连接' } }),
        })
        const body = await res.text().catch(() => '')
        let parsed: { errcode?: number; errmsg?: string } = {}
        try {
          parsed = JSON.parse(body)
        } catch {
          parsed = {}
        }
        if (!res.ok || parsed.errcode !== 0 || !body.includes('ok')) {
          throw new Error(`Webhook 不可用：${parsed.errmsg ?? body.slice(0, 120)}`)
        }
        const src = credentialSource(v.webhook, 'WECHAT_BOT_WEBHOOK')
        return { ok: true, message: `测试消息已发送到群${src === 'saved' ? '（已保存凭证）' : ''}` }
      }
      if (platformId === 'feishu') {
        const appId = pick(v.appId, 'FEISHU_APP_ID')
        const appSecret = pick(v.appSecret, 'FEISHU_APP_SECRET')
        if (!appId || !appSecret) throw new Error('请先填写 APP_ID 和 APP_SECRET')
        const res = await runFetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        })
        const data = (await res.json()) as { code?: number; msg?: string }
        if (data.code !== 0) throw new Error(`凭证无效：${data.msg ?? 'app_id/secret 无效'}`)
        const src = credentialSource(v.appId, 'FEISHU_APP_ID')
        return { ok: true, message: `应用凭证有效，已获取访问令牌${src === 'saved' ? '（已保存凭证）' : ''}` }
      }
      if (platformId === 'dingtalk') {
        if (modeId === 'app') {
          const appKey = pick(v.appKey, 'DINGTALK_APP_KEY')
          const appSecret = pick(v.appSecret, 'DINGTALK_APP_SECRET')
          if (!appKey || !appSecret) throw new Error('请先填写 AppKey 和 AppSecret')
          const res = await runFetch(
            `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`,
          )
          const data = (await res.json()) as { access_token?: string; errcode?: number; errmsg?: string }
          if (!data.access_token) throw new Error(`凭证无效：${data.errmsg ?? `errcode ${data.errcode}`}`)
          const src = credentialSource(v.appKey, 'DINGTALK_APP_KEY')
          return { ok: true, message: `凭证有效，已获取 access_token${src === 'saved' ? '（已保存凭证）' : ''}` }
        }
        const webhook = pick(v.webhook, 'DINGTALK_BOT_WEBHOOK')
        if (!webhook) throw new Error('请先填写 Webhook 地址')
        const secret = pick(v.secret, 'DINGTALK_BOT_SECRET')
        let url = webhook
        if (secret) {
          const ts = Date.now()
          const sign = encodeURIComponent(createHmac('sha256', secret).update(`${ts}\n${secret}`).digest('base64'))
          url = `${webhook}${webhook.includes('?') ? '&' : '?'}timestamp=${ts}&sign=${sign}`
        }
        const res = await runFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ msgtype: 'text', text: { content: 'harness-desktop 测试连接' } }),
        })
        const body = await res.text().catch(() => '')
        const data = (await JSON.parse(body || '{}').catch(() => ({}))) as { errcode?: number; errmsg?: string }
        if (!res.ok || data.errcode !== 0) {
          throw new Error(`Webhook 不可用：${data.errmsg ?? body.slice(0, 120)}`)
        }
        const src = credentialSource(v.webhook, 'DINGTALK_BOT_WEBHOOK')
        return { ok: true, message: `测试消息已发送到群${src === 'saved' ? '（已保存凭证）' : ''}` }
      }
      if (platformId === 'qq') {
        const appId = pick(v.appId, 'QQ_BOT_APP_ID')
        const appSecret = pick(v.appSecret, 'QQ_BOT_APP_SECRET')
        if (!appId || !appSecret) throw new Error('请先填写 AppID 和 AppSecret')
        // 官方 Access Token 换取（AppSecret 签名），替代已废弃的 Token 鉴权
        const res = await runFetch('https://bots.qq.com/app/getAppAccessToken', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ appId, clientSecret: appSecret }),
        })
        const data = (await res.json()) as { code?: number; message?: string; data?: { access_token?: string } }
        if (data.code !== 0 || !data.data?.access_token) {
          throw new Error(`凭证无效：${data.message ?? 'app_id/secret 无效'}`)
        }
        const src = credentialSource(v.appId, 'QQ_BOT_APP_ID')
        return { ok: true, message: `凭证有效，已获取 Access Token${src === 'saved' ? '（已保存凭证）' : ''}` }
      }
      if (platformId === 'slack') {
        const botToken = pick(v.botToken, 'SLACK_BOT_TOKEN')
        const appToken = pick(v.appToken, 'SLACK_APP_TOKEN')
        if (!botToken) throw new Error('请先填写 Bot Token')
        if (!appToken) throw new Error('Socket Mode 需要 App-Level Token（xapp-）')
        const res = await runFetch('https://slack.com/api/auth.test', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${botToken}` },
          body: JSON.stringify({}),
        })
        const data = (await res.json()) as { ok?: boolean; error?: string; team?: string; user?: string }
        if (!data.ok) throw new Error(`凭证无效：${data.error ?? 'Unauthorized'}`)
        // 验证 App-Level Token 可用（拿 socket 地址，不连接）
        const conn = await runFetch('https://slack.com/api/apps.connections.open', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${appToken}` },
          body: JSON.stringify({}),
        })
        const connData = (await conn.json()) as { ok?: boolean; error?: string; url?: string }
        if (!connData.ok || !connData.url) {
          throw new Error(`App Token 无效：${connData.error ?? '无法打开连接'}`)
        }
        const src = credentialSource(v.botToken, 'SLACK_BOT_TOKEN')
        return { ok: true, message: `Slack 凭证有效（${data.team ?? ''}）${src === 'saved' ? '（已保存凭证）' : ''}` }
      }
      if (platformId === 'email') {
        const host = pick(v.smtpHost, 'EMAIL_SMTP_HOST')
        const port = pick(v.smtpPort, 'EMAIL_SMTP_PORT')
        const email = pick(v.email, 'EMAIL_ADDRESS')
        const password = pick(v.password, 'EMAIL_PASSWORD')
        if (!host || !email || !password) throw new Error('请填写 SMTP 服务器、邮箱和密码/授权码')
        // 用 node 内置 TLS 做最小 SMTP 校验（AUTH LOGIN + NOOP）
        const { connect } = await import('node:net')
        const { connect: tlsConnect } = await import('node:tls')
        const { createHmac: _h } = await import('node:crypto')
        void _h
        const sock = await new Promise<import('node:net').Socket>((resolve, reject) => {
          const s = connect(Number(port) || 465, host)
          s.once('connect', () => resolve(s))
          s.once('error', () => reject(new Error('无法连接 SMTP 服务器，检查网络/服务器地址')))
        })
        const tls = tlsConnect({ socket: sock, servername: host })
        const b64 = (x: string) => Buffer.from(x, 'utf8').toString('base64')
        let buf = ''
        const expect = (code: string) =>
          new Promise<string>((resolve, reject) => {
            const onData = (c: Buffer) => {
              buf += c.toString()
              if (buf.includes('\n')) {
                const line = buf.split('\n')[0]
                buf = buf.slice(line.length + 1)
                if (line.startsWith(code)) resolve(line)
                else reject(new Error(`SMTP 错误：${line}`))
              }
            }
            tls.once('data', onData)
            setTimeout(() => {
              tls.removeListener('data', onData)
              reject(new Error('SMTP 超时'))
            }, 15000)
          })
        const send = (line: string) => tls.write(line + '\r\n')
        try {
          await expect('220')
          send('EHLO harness-desktop')
          await expect('250')
          send('AUTH LOGIN')
          await expect('334')
          send(b64(email))
          await expect('334')
          send(b64(password))
          await expect('235')
          const src = credentialSource(v.email, 'EMAIL_ADDRESS')
          return { ok: true, message: `SMTP 登录成功，授权码有效${src === 'saved' ? '（已保存凭证）' : ''}` }
        } catch (err) {
          throw new Error(`凭证无效：${(err as Error).message}`)
        } finally {
          try {
            tls.destroy()
            sock.destroy()
          } catch {
            // ignore
          }
        }
      }
      throw new Error('该平台暂不支持测试连接')
    }),
  )

  // ---- Part A：定时提醒（桌面端） ----
  const reminders = new ReminderManager(
    () => settings.get(),
    (next) => settings.update({ reminders: next }),
    () => manager.adapterInstance,
    (r, sessionId) => {
      getWindow()?.webContents.send('reminder:fired', { sessionId, text: r.text })
    },
  )
  reminders.start()
  ipcMain.handle('reminder:list', () => run(async () => reminders.list()))
  ipcMain.handle('reminder:create', (_e, input: Omit<Reminder, 'id' | 'nextAt'>) =>
    run(async () => reminders.create(input)),
  )
  ipcMain.handle('reminder:delete', (_e, id: string) => run(async () => reminders.delete(id)))

  // ---- Part A：记忆管理（harness-memory 存储文件） ----
  ipcMain.handle('memory:list', () => run(async () => listMemories(manager.home)))
  ipcMain.handle('memory:add', (_e, text: string, tags?: string[]) =>
    run(async () => addMemory(manager.home, text, tags)),
  )
  ipcMain.handle('memory:delete', (_e, id: string) => run(async () => deleteMemory(manager.home, id)))
  ipcMain.handle('memory:clear', () => run(async () => clearMemories(manager.home)))

  // ---- Part A：计划模式 / Web 搜索 ----
  ipcMain.handle('plan:toggle', (_e, sessionId: string) => run(() => adapter().togglePlanMode(sessionId)))
  ipcMain.handle('websearch:get', () => run(() => adapter().getWebSearchConfig()))
  ipcMain.handle('websearch:set', (_e, config: Partial<WebSearchConfig>) =>
    run(() => adapter().setWebSearchConfig(config)),
  )
  ipcMain.handle('skill:list', (_e, sessionId: string) => run(() => adapter().listSkills(sessionId)))

  // ---- Part A：会话导出（JSON / Markdown / zip） ----
  ipcMain.handle('session:export', (_e, sessionId: string, format: 'zip' | 'json' | 'markdown' = 'zip') =>
    run(async () => {
      const win = getWindow()
      if (!win) return { saved: false }
      let content: string
      let ext = 'jsonl'
      if (format === 'zip') {
        const port = manager.adapterInstance?.client.port
        if (!port) throw new Error('dsh 尚未就绪')
        const res = await fetch(
          `http://127.0.0.1:${port}/api/session.export?sessionId=${encodeURIComponent(sessionId)}`,
        )
        if (!res.ok) throw new Error(`导出失败：HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        const save = await dialog.showSaveDialog(win, {
          title: '导出会话',
          defaultPath: `session-${sessionId.slice(-8)}.zip`,
        })
        if (save.canceled || !save.filePath) return { saved: false }
        writeFileSync(save.filePath, buf)
        return { saved: true, path: save.filePath }
      }
      const history = await adapter().getHistory(sessionId)
      if (format === 'json') {
        content = JSON.stringify({ sessionId, exportedAt: new Date().toISOString(), events: history.events }, null, 2)
        ext = 'json'
      } else {
        content = renderMarkdown(history.events)
        ext = 'md'
      }
      const save = await dialog.showSaveDialog(win, {
        title: '导出会话',
        defaultPath: `session-${sessionId.slice(-8)}.${ext}`,
      })
      if (save.canceled || !save.filePath) return { saved: false }
      writeFileSync(save.filePath, content, 'utf8')
      return { saved: true, path: save.filePath }
    }),
  )

  // ---- 凭据 / 目录 ----
  ipcMain.handle('cred:setKey', (_e, key: string) => run(() => adapter().setApiKey(key)))
  ipcMain.handle('cred:hasKey', () => run(() => adapter().hasApiKey()))
  ipcMain.handle('dir:pick', () =>
    run(async () => {
      // 优先走 dsh 的原生目录选择器；失败或取消时回退 Electron 对话框
      try {
        const a = adapter()
        const { path } = await a.pickDirectory()
        if (path) return path
      } catch {
        // 继续回退
      }
      const win = getWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        title: '选择工作区文件夹',
        properties: ['openDirectory', 'createDirectory'],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    }),
  )

  // ---- 事件推送（主进程 → renderer） ----
  const onEvent = (evt: SessionStreamEvent) => {
    getWindow()?.webContents.send('dsh:event', evt)
  }
  const onStatus = (s: DshStatus) => {
    getWindow()?.webContents.send('dsh:status', s)
  }
  manager.onStatus(onStatus)

  // 可靠事件订阅：adapter 未就绪时排队，创建/重建后自动接入（修复订阅竞态 + 端口漂移）
  ipcMain.handle('dsh:subscribe', () => {
    manager.subscribeEvents(onEvent)
    return ok(true)
  })

  // 预加载时调用，确保退出时清理
  return () => {
    manager.adapterInstance?.close()
  }
}
