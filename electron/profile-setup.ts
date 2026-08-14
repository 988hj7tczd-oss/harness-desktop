/**
 * electron/profile-setup.ts —— 确保 dsh profile 已初始化并安装本地插件
 * （harness-memory 记忆 + dsh-bot-gateway 消息网关 + dsh-bot-telegram）。
 *
 * 首次启动：dsh 引擎会初始化 profile（下载依赖，耗时）。本模块负责在
 * profile 就绪后把本地插件安装进去：
 *  1. 复制 plugins/<name> → profiles/web/node_modules/<name>
 *  2. 在 profiles/web/package.json 的 dsh.profile.bundles 里登记每个插件
 *
 * 之后启动：插件已存在，直接跳过。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 需要安装进 profile 的本地插件（dsh bundle 格式）。 */
const BUNDLE_PLUGINS = [
  'harness-memory',
  'dsh-bot-gateway',
  'dsh-bot-telegram',
  'dsh-bot-wechat',
  'dsh-bot-feishu',
  'dsh-bot-dingtalk',
  'dsh-bot-email',
  'dsh-bot-webhooks',
  'dsh-bot-slack',
]

export type ProfileSetupResult =
  | { status: 'ready' } // profile 就绪且插件已安装
  | { status: 'needs-priming' } // profile 尚未初始化，需要先跑一次引擎
  | { status: 'skip'; reason: string } // 无法安装（非致命，相关功能降级）

/** 插件源码目录（开发/打包后都在 app 目录内）。 */
export function pluginSourceDir(appPath: string, name: string): string {
  return join(appPath, 'plugins', name)
}

/** profile 中插件应安装的位置。 */
function pluginTargetDir(dshHome: string, name: string): string {
  return join(dshHome, 'profiles', 'web', 'node_modules', name)
}

/** 复制单个插件到 profile 并登记 bundle。返回是否成功。 */
function installOne(dshHome: string, appPath: string, name: string): boolean {
  const src = pluginSourceDir(appPath, name)
  if (!existsSync(join(src, 'index.js'))) {
    console.warn(`[harness-desktop] 插件 ${name} 源码缺失，跳过`)
    return false
  }
  const target = pluginTargetDir(dshHome, name)
  try {
    mkdirSync(join(target, '..'), { recursive: true })
    cpSync(src, target, { recursive: true })
    const manifestPath = join(dshHome, 'profiles', 'web', 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const bundles = manifest?.dsh?.profile?.bundles ?? []
      if (!bundles.includes(name)) {
        bundles.push(name)
        manifest.dsh = { ...(manifest.dsh ?? {}), profile: { ...(manifest.dsh?.profile ?? {}), bundles } }
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      }
    }
    return true
  } catch (err) {
    console.error(`[harness-desktop] 安装插件 ${name} 失败:`, err)
    return false
  }
}

/** 检查 profile 与插件状态。 */
export function checkProfile(dshHome: string, appPath: string): ProfileSetupResult {
  const profileDir = join(dshHome, 'profiles', 'web')
  if (!existsSync(join(profileDir, 'package.json'))) {
    return { status: 'needs-priming' }
  }
  let anyFail = false
  // 总是同步本地插件源码到 profile（保证改动即时生效，覆盖旧版本）
  for (const name of BUNDLE_PLUGINS) {
    if (!installOne(dshHome, appPath, name)) anyFail = true
  }
  return anyFail ? { status: 'skip', reason: '部分插件安装失败' } : { status: 'ready' }
}
