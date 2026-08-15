/**
 * electron/credential-store.ts —— safeStorage 加密的敏感凭证存储（桌面端自有层）。
 *
 * dsh 引擎自身把凭证明文存 `$DSH_HOME/.credentials.yaml`（黑盒，无法改）。
 * 本模块提供**桌面端自己持有**的加密副本：所有经 renderer 设置/读取的敏感值
 * 同时写入这里（safeStorage 加密，macOS Keychain / Windows DPAPI），
 * 供测试连接等桌面端逻辑读取时不解明文落盘。启动时自动把引擎明文迁移进来。
 *
 * 文件：`userData/safe-credentials.json`（{ ref: base64(encrypted) }）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'

export type SafeCredentialStore = ReturnType<typeof createCredentialStore>

export function createCredentialStore(userDataDir: string) {
  const file = join(userDataDir, 'safe-credentials.json')

  function readAll(): Record<string, string> {
    try {
      if (!existsSync(file)) return {}
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v
      }
      return out
    } catch {
      return {}
    }
  }

  function writeAll(map: Record<string, string>) {
    try {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
    } catch {
      // 写失败不致命
    }
  }

  function isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  /** 加密一个值存盘。返回是否成功。 */
  function set(ref: string, plain: string): boolean {
    if (!isAvailable()) {
      console.warn(`[harness-desktop] safeStorage 不可用，凭证 ${ref} 未加密存储（仅引擎侧明文）`)
      return false
    }
    const all = readAll()
    all[ref] = safeStorage.encryptString(plain).toString('base64')
    writeAll(all)
    return true
  }

  function unset(ref: string) {
    const all = readAll()
    if (ref in all) {
      delete all[ref]
      writeAll(all)
    }
  }

  /** 把引擎明文 yaml 里的敏感 ref 迁移进加密层（幂等）。 */
  function migrateFromPlain(plainMap: Record<string, string>) {
    if (!isAvailable()) return
    const all = readAll()
    let changed = false
    for (const [k, v] of Object.entries(plainMap)) {
      if (typeof v === 'string' && v.length > 0 && !(k in all)) {
        all[k] = safeStorage.encryptString(v).toString('base64')
        changed = true
      }
    }
    if (changed) writeAll(all)
  }

  return { set, unset, migrateFromPlain, isAvailable }
}

/** 应用级 userData 目录。 */
export function userDataDir(): string {
  return app.getPath('userData')
}
