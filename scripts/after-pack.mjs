/**
 * electron-builder afterPack 钩子：把项目的 node_modules 完整复制进打包产物。
 *
 * electron-builder 自带的依赖收集在 pnpm 布局下会漏掉大量传递依赖
 * （只有 9/195 个 @deepseek-ai 包进入产物），导致 dsh 引擎无法启动。
 * 这里直接整体复制扁平化的 node_modules，保证依赖闭包完整。
 */
import { cpSync, existsSync, readdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 复制时排除的顶层包名（devDependencies + 明确的构建工具/运行时重复物）。
 * dsh 引擎需要完整运行时依赖闭包，但 dev 依赖（electron 运行时、builder、TS 等）
 * 不该进产物——这是体积大头（约 500MB 中的 300MB+）。
 */
function loadDevDeps(projectRoot) {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
    return new Set(Object.keys(pkg.devDependencies ?? {}))
  } catch {
    return new Set()
  }
}

/** 是否应排除某顶层包：dev 依赖或构建工具。 */
function shouldExclude(name, devDeps) {
  if (devDeps.has(name)) return true
  // 构建/打包工具链（即使非 devDep 也排除，运行时不加载）
  const buildTools = new Set(['app-builder-bin', '7zip-bin', 'esbuild', 'electron-builder-binaries'])
  return buildTools.has(name)
}

export default async function afterPack(context) {
  const { appOutDir, packager } = context
  const projectRoot = packager.projectDir
  const src = join(projectRoot, 'node_modules')

  if (!existsSync(src)) {
    console.warn('[afterPack] node_modules 不存在，跳过复制')
    return
  }

  const devDeps = loadDevDeps(projectRoot)

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

  console.log(`[afterPack] 复制 node_modules → ${dest}（排除 devDependencies 与构建工具）`)
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, {
    recursive: true,
    filter: (p) => {
      if (p.includes('/.git/')) return false
      // 只对"包根"做排除判断：node_modules/<name> 或 node_modules/<scope>/<name>
      const rel = p.slice(src.length + 1)
      const seg = rel.split('/')
      // 包名 = 首层（非 scope）或 "@scope/name"（scope 包用完整名匹配 devDeps）
      let pkgName = null
      if (seg.length >= 1 && !seg[0].startsWith('@')) pkgName = seg[0]
      else if (seg.length >= 2 && seg[0].startsWith('@')) pkgName = `${seg[0]}/${seg[1]}`
      if (pkgName !== null) {
        // 只判断包根路径（后面是包内文件）
        const isRoot = !seg[0].startsWith('@') ? seg.length === 1 : seg.length === 2
        if (isRoot) return !shouldExclude(pkgName, devDeps)
      }
      return true
    },
  })
  try {
    const count = readdirSync(join(dest, '@deepseek-ai')).length
    console.log(`[afterPack] 复制完成，@deepseek-ai 包数 = ${count}`)
  } catch {
    console.log('[afterPack] 复制完成（无 @deepseek-ai 目录）')
  }
}
