/**
 * electron-builder afterPack 钩子：把项目的 node_modules 完整复制进打包产物。
 *
 * electron-builder 自带的依赖收集在 pnpm 布局下会漏掉大量传递依赖
 * （只有 9/195 个 @deepseek-ai 包进入产物），导致 dsh 引擎无法启动。
 * 这里直接整体复制扁平化的 node_modules，保证依赖闭包完整。
 */
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export default async function afterPack(context) {
  const { appOutDir, packager } = context
  const projectRoot = packager.projectDir
  const src = join(projectRoot, 'node_modules')

  if (!existsSync(src)) {
    console.warn('[afterPack] node_modules 不存在，跳过复制')
    return
  }

  // appOutDir 可能是 .app 目录本身，也可能是包含 .app 的父目录（mac）
  let appBundle = appOutDir
  if (!existsSync(join(appBundle, 'Contents', 'Info.plist'))) {
    const app = readdirSync(appOutDir).find((name) => name.endsWith('.app'))
    if (app) appBundle = join(appOutDir, app)
  }
  // mac 布局：Contents/Resources/app/node_modules；win/linux：resources/app/node_modules
  const appResources = existsSync(join(appBundle, 'Contents', 'Resources'))
    ? join(appBundle, 'Contents', 'Resources')
    : join(appBundle, 'resources')
  const dest = join(appResources, 'app', 'node_modules')

  console.log(`[afterPack] 复制 node_modules → ${dest}`)
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true, filter: (p) => !p.includes('/.git/') })
  const count = readdirSync(join(dest, '@deepseek-ai')).length
  console.log(`[afterPack] 复制完成，@deepseek-ai 包数 = ${count}`)
}
