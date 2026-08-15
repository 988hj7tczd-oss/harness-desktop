/**
 * electron/ipc.ts —— IPC 注册：把 adapter 的稳定 API 暴露给 renderer。
 *
 * renderer 只认识这里的 channel 与 shared/types.ts 里的类型；
 * dsh 上游变更永远到不了这里。
 */
import { ipcMain, dialog, clipboard, app, type BrowserWindow } from 'electron'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { DshManager } from './dsh-manager.js'
import type { SettingsStore } from './settings-store.js'
import { ReminderManager } from './reminder-manager.js'
import { addMemory, clearMemories, deleteMemory, listMemories } from './memory.js'
import type { SafeCredentialStore } from './credential-store.js'
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

export function registerIpc(
  manager: DshManager,
  settings: SettingsStore,
  getWindow: () => BrowserWindow | null,
  creds: SafeCredentialStore,
) {
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

  // ---- 026 __desktop__ 桥（官方 UI 页面用） ----
  ipcMain.handle('desktop:getPort', () =>
    run(() => Promise.resolve(manager.adapterInstance?.client.port ?? null)),
  )
  ipcMain.handle('desktop:getVersion', () =>
    run(() => Promise.resolve(app.getVersion())),
  )
  ipcMain.handle('desktop:notify', (_e, title: string, body: string) =>
    run(async () => {
      const { Notification } = await import('electron')
      try {
        new Notification({ title: String(title ?? ''), body: String(body ?? '') }).show()
      } catch {
        // 通知失败不阻塞
      }
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
    run(async () => {
      await adapter().setProviderApiKey(apiKeyEnv, key)
      creds.set(apiKeyEnv, key)
    }),
  )

  // ---- Part A：凭证统一管理 ----
  ipcMain.handle('cred:list', () => run(() => adapter().listCredentials()))
  ipcMain.handle('cred:setRef', (_e, ref: string, value: string) =>
    run(async () => {
      await adapter().setCredential(ref, value)
      creds.set(ref, value)
    }),
  )
  ipcMain.handle('cred:clear', (_e, ref: string) =>
    run(async () => {
      await adapter().clearCredential(ref)
      creds.unset(ref)
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
  ipcMain.handle('cred:setKey', (_e, key: string) =>
    run(async () => {
      await adapter().setApiKey(key)
      creds.set('DEEPSEEK_API_KEY', key)
    }),
  )
  ipcMain.handle('cred:hasKey', () => run(() => adapter().hasApiKey()))
  // 测试 DeepSeek API Key：主进程用 key 调 models 端点验证（key 不入 renderer 往返，不落日志）
  ipcMain.handle('cred:testKey', (_e, key: string) =>
    run(async () => {
      const apiKey = String(key ?? '').trim()
      if (!apiKey) throw new Error('请输入 API Key')
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Key 无效：HTTP ${res.status} ${body.slice(0, 120)}`)
      }
      const data = (await res.json().catch(() => ({}))) as { data?: unknown[] }
      const count = Array.isArray(data.data) ? data.data.length : 0
      return { ok: true, message: `Key 有效，可用模型 ${count} 个` }
    }),
  )
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
  const unsubStatus = manager.onStatus(onStatus)

  // 可靠事件订阅：adapter 未就绪时排队，创建/重建后自动接入（修复订阅竞态 + 端口漂移）
  ipcMain.handle('dsh:subscribe', () => {
    manager.subscribeEvents(onEvent)
    return ok(true)
  })

  // 预加载时调用，确保退出时清理
  return () => {
    manager.adapterInstance?.close()
    unsubStatus()
    reminders.stop()
  }
}
