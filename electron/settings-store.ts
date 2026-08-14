/**
 * electron/settings-store.ts —— 应用级设置持久化（userData 下的 JSON 文件）。
 *
 * 与 dsh 的用户数据分开：dsh 数据在 `userData/dsh-home`，这里只存应用壳自身的
 * 状态（是否完成首启、工作区路径、默认模型）。升级时这些数据不会丢失。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '../shared/types.js'

const DEFAULTS: AppSettings = {
  onboarded: false,
  workspaceCwd: null,
  provider: null,
  model: null,
  pinnedSessionIds: [],
  sessionColors: {},
  appearance: {
    theme: 'dark',
    accent: 'deepseek',
    fontSize: 'medium',
    density: 'comfortable',
    autoLaunch: false,
    launchMinimized: false,
  },
}

export class SettingsStore {
  private file: string
  private settings: AppSettings

  constructor() {
    this.file = join(app.getPath('userData'), 'app-settings.json')
    this.settings = { ...DEFAULTS, ...this.read() }
  }

  private read(): Partial<AppSettings> {
    try {
      if (!existsSync(this.file)) return {}
      return JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppSettings>
    } catch {
      return {}
    }
  }

  private write() {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, JSON.stringify(this.settings, null, 2), 'utf8')
    } catch {
      // 写失败不致命，忽略
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...patch }
    this.write()
    return this.get()
  }
}
