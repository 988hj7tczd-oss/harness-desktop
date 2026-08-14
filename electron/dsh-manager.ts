/**
 * electron/dsh-manager.ts —— dsh 引擎子进程生命周期管理。
 *
 * 职责：
 *  - 定位 dsh 可执行入口（开发环境用系统 node，打包环境用 ELECTRON_RUN_AS_NODE）
 *  - 以 `web --host 127.0.0.1 --port 0` 启动 dsh，随机回环端口
 *  - 解析 stdout 拿到实际端口，轮询 host.describe 直到就绪
 *  - 退出时优雅终止子进程（SIGTERM → SIGKILL）
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { DshAdapter } from '../adapter/index.js'
import { checkProfile } from './profile-setup.js'
import type { SessionStreamEvent } from '../shared/types.js'

const READY_TIMEOUT_MS = 90_000
const KILL_TIMEOUT_MS = 5_000

/** dsh bin.js 的候选路径（开发 = 项目 node_modules；打包 = asar 内）。 */
function resolveDshBin(): string {
  const candidates = [
    join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    join(process.resourcesPath ?? '', 'app.asar', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  throw new Error('无法定位 dsh 引擎（@deepseek-ai/dsh/lib/bin.js）')
}

/** 解析可用的 Node 二进制。开发环境用系统 node；打包环境用 electron-as-node。 */
function resolveNodeBinary(): { exec: string; isElectron: boolean } {
  const fromNpm =
    process.env.npm_node_execpath ||
    process.env.npm_config_node_execpath ||
    process.env.npm_node_install_path
  if (fromNpm && existsSync(fromNpm)) {
    return { exec: fromNpm, isElectron: false }
  }
  return { exec: process.execPath, isElectron: true }
}

export interface DshManagerStatus {
  running: boolean
  ready: boolean
  port: number | null
  version: string | null
  cwd: string | null
  provider: string | null
  model: string | null
  error?: string
}

export class DshManager {
  private proc: ChildProcess | null = null
  private adapter: DshAdapter | null = null
  private dshHome: string
  private ready = false
  private version: string | null = null
  private hostCwd: string | null = null
  private provider: string | null = null
  private model: string | null = null
  private lastError: string | null = null
  private stopping = false
  private statusListeners: ((s: DshManagerStatus) => void)[] = []
  /** 事件订阅者（renderer 通过 dsh:subscribe 注册）。adapter 未就绪时排队，创建/重建后自动接入。 */
  private eventListeners: ((evt: SessionStreamEvent) => void)[] = []
  /** 当前 adapter 上的订阅解除函数（重建 adapter 时先解除旧的）。 */
  private eventUnsubs: (() => void)[] = []

  constructor() {
    this.dshHome = join(app.getPath('userData'), 'dsh-home')
  }

  get adapterInstance(): DshAdapter | null {
    return this.adapter
  }

  get home(): string {
    return this.dshHome
  }

  /**
   * 可靠事件订阅：adapter 就绪则立即接入；未就绪则排队，adapter 创建/重建后自动接入。
   * @returns 解除订阅函数。
   */
  subscribeEvents(cb: (evt: SessionStreamEvent) => void): () => void {
    this.eventListeners.push(cb)
    if (this.adapter) {
      this.eventUnsubs.push(this.adapter.onSessionEvent(cb))
    }
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== cb)
    }
  }

  /** adapter 创建/重建后调用：为所有订阅者重新接入事件流（补订阅 + 防端口漂移）。 */
  private rebindEventListeners() {
    const adapter = this.adapter
    if (!adapter) return
    for (const unsub of this.eventUnsubs) {
      try {
        unsub()
      } catch {
        // 忽略旧订阅解除失败
      }
    }
    this.eventUnsubs = []
    for (const cb of [...this.eventListeners]) {
      try {
        this.eventUnsubs.push(adapter.onSessionEvent(cb))
      } catch (err) {
        console.error('[harness-desktop] 事件订阅接入失败:', err)
      }
    }
  }

  onStatus(cb: (s: DshManagerStatus) => void): () => void {
    this.statusListeners.push(cb)
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== cb)
    }
  }

  private emitStatus() {
    const s = this.status()
    for (const listener of [...this.statusListeners]) listener(s)
  }

  status(): DshManagerStatus {
    return {
      running: this.proc !== null && this.proc.exitCode === null,
      ready: this.ready,
      port: this.adapter?.client.port ?? null,
      version: this.version,
      cwd: this.hostCwd,
      provider: this.provider,
      model: this.model,
      error: this.lastError ?? undefined,
    }
  }

  /** 启动（若已就绪则直接返回）。返回就绪后的状态快照。 */
  async start(): Promise<DshManagerStatus> {
    if (this.ready && this.adapter) return this.status()
    if (this.proc && this.proc.exitCode === null) {
      // 已启动但尚未就绪 → 等待就绪
      return this.waitUntilReady()
    }
    this.lastError = null

    // 确保 profile 就绪 + 记忆插件已安装
    const setup = checkProfile(this.dshHome, app.getAppPath())
    if (setup.status === 'needs-priming') {
      // 首次启动：先跑一次引擎让 profile 完成初始化，再装插件，然后正式启动
      await this.spawn()
      try {
        await this.waitUntilReady()
      } catch {
        // profile 初始化失败也不阻塞；记录日志继续
      }
      await this.stop()
      checkProfile(this.dshHome, app.getAppPath())
    } else if (setup.status === 'skip') {
      console.warn('[harness-desktop] 记忆插件不可用（非致命）:', setup.reason)
    }

    await this.spawn()
    return this.waitUntilReady()
  }

  private async spawn(): Promise<void> {
    const bin = resolveDshBin()
    const { exec, isElectron } = resolveNodeBinary()
    const env = {
      ...process.env,
      DSH_HOME: this.dshHome,
      ...(isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    }
    const args = ['--expose-internals', bin, 'web', '--host', '127.0.0.1', '--port', '0']

    const child = spawn(exec, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.proc = child

    child.stdout?.on('data', (chunk: Buffer) => this.handleStdout(String(chunk)))
    child.stderr?.on('data', (chunk: Buffer) => this.handleStderr(String(chunk)))

    child.on('error', (err) => {
      this.lastError = `dsh 进程启动失败: ${err.message}`
      this.emitStatus()
    })

    child.on('exit', (code, signal) => {
      const wasRunning = this.ready
      this.ready = false
      this.adapter?.close()
      this.adapter = null
      this.proc = null
      // 解除旧 adapter 上的订阅（eventListeners 保留，重建 adapter 后重新接入）
      for (const unsub of this.eventUnsubs) {
        try {
          unsub()
        } catch {
          // 忽略
        }
      }
      this.eventUnsubs = []
      if (!this.stopping) {
        this.lastError = `dsh 进程退出（code=${code ?? ''} signal=${signal ?? ''}）`
        // 若已就绪后退出，尝试自动重启
        if (wasRunning) {
          setTimeout(() => {
            if (!this.stopping) void this.start().catch(() => undefined)
          }, 1500)
        }
      }
      this.emitStatus()
    })
  }

  private handleStdout(chunk: string) {
    const match = chunk.match(/http:\/\/127\.0\.0\.1:(\d+)/)
    if (match && !this.adapter) {
      const port = Number(match[1])
      this.adapter = new DshAdapter(port)
      // 事件订阅补接：adapter 刚创建，把排队/已有订阅者接上（修复订阅竞态）
      this.rebindEventListeners()
    }
  }

  private handleStderr(chunk: string) {
    const line = chunk.trim()
    if (line) this.lastError = line.slice(0, 300)
  }

  private async waitUntilReady(): Promise<DshManagerStatus> {
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (this.stopping) throw new Error('dsh 正在停止')
      const adapter = this.adapter
      if (adapter && (await adapter.isReady())) {
        this.ready = true
        try {
          const d = await adapter.describe()
          this.version = d.version
          this.hostCwd = d.cwd
          this.provider = d.provider ?? null
          this.model = d.model ?? null
          this.lastError = null
        } catch {
          // 描述失败不影响就绪
        }
        this.emitStatus()
        return this.status()
      }
      await sleep(500)
    }
    this.lastError = 'dsh 启动超时'
    this.emitStatus()
    throw new Error('dsh 启动超时')
  }

  /** 优雅停止 dsh 子进程。 */
  async stop(): Promise<void> {
    this.stopping = true
    const child = this.proc
    if (!child) {
      this.stopping = false
      return
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        this.proc = null
        this.adapter?.close()
        this.adapter = null
        this.ready = false
        this.eventUnsubs = []
        this.stopping = false
        this.emitStatus()
        resolve()
      }
      if (child.exitCode !== null) return done()
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        setTimeout(done, 300)
      }, KILL_TIMEOUT_MS)
      child.once('exit', () => {
        clearTimeout(timer)
        done()
      })
      child.kill('SIGTERM')
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
