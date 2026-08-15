/**
 * electron-builder afterPack 钩子：把项目的 node_modules 完整复制进打包产物。
 *
 * electron-builder 自带的依赖收集在 pnpm 布局下会漏掉大量传递依赖
 * （只有 9/195 个 @deepseek-ai 包进入产物），导致 dsh 引擎无法启动。
 * 这里直接整体复制扁平化的 node_modules，保证依赖闭包完整。
 *
 * 平台原生模块补全（031）：koffi 等用 optionalDependencies 分发平台二进制
 * （@koromix/koffi-<platform>-<arch>）。本机 macOS 打包 win 时，darwin 平台包
 * 会被复制但 win 平台包缺失 → Windows 上原生模块加载失败 → dsh 引擎起不来。
 * 这里在打包前把目标平台的原生模块包补进 src，保证跨平台打包不缺二进制。
 */
import { cpSync, existsSync, readdirSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'

/** 目标平台 → 需要的 koffi 平台包名（031：win 交叉打包必补）。 */
function koffiPlatformPackage(targetPlatform) {
  const map = {
    win32: 'koffi-win32-x64', // 打包目标是 x64
    linux: 'koffi-linux-x64',
    darwin: process.arch === 'arm64' ? 'koffi-darwin-arm64' : 'koffi-darwin-x64',
  }
  return map[targetPlatform] ?? null
}

/** 确保某平台原生模块包存在于 src（不存在则从 npm 拉取到 node_modules）。 */
function ensurePlatformNativeModules(projectRoot, targetPlatform, src) {
  const scoped = '@koromix'
  const pkgName = koffiPlatformPackage(targetPlatform)
  if (!pkgName) return
  const scopedDir = join(src, scoped)
  const pkgDir = join(scopedDir, pkgName)
  if (existsSync(pkgDir)) {
    console.log(`[afterPack] 平台原生模块已存在: ${scoped}/${pkgName}`)
    return
  }
  console.log(`[afterPack] 补平台原生模块: ${scoped}/${pkgName} (target=${targetPlatform})`)
  try {
    // 用 npm pack 拉 tarball → 手动解包进 node_modules（不写 package.json）
    execFileSync('npm', ['pack', `${scoped}/${pkgName}`, '--pack-destination', projectRoot], {
      cwd: projectRoot,
      stdio: 'pipe',
      timeout: 120_000,
    })
    // npm pack 输出 koromix-koffi-win32-x64-<ver>.tgz（去掉 @ 前缀），用 glob 找实际文件
    const tgzFile = readdirSync(projectRoot).find((f) => f.includes(pkgName) && f.endsWith('.tgz'))
    if (!tgzFile) throw new Error('npm pack 未生成 tarball')
    const tgz = join(projectRoot, tgzFile)
    // tarball 结构是 package/...，先解到临时目录再把 package 移到目标位置
    const tmpDir = join(projectRoot, `.tmp-${pkgName}`)
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    execFileSync('tar', ['-xzf', tgz, '-C', tmpDir], { cwd: projectRoot, stdio: 'pipe' })
    const unpacked = join(tmpDir, 'package')
    if (!existsSync(unpacked)) throw new Error('tarball 无 package/ 目录')
    mkdirSync(scopedDir, { recursive: true })
    rmSync(pkgDir, { recursive: true, force: true })
    cpSync(unpacked, pkgDir, { recursive: true })
    rmSync(tmpDir, { recursive: true, force: true })
    rmSync(tgz, { force: true })
    if (!existsSync(pkgDir)) throw new Error(`解包后仍不存在: ${scoped}/${pkgName}`)
    console.log(`[afterPack] ✅ ${scoped}/${pkgName} 已补全`)
  } catch (err) {
    console.warn(`[afterPack] ⚠️ 补 ${scoped}/${pkgName} 失败: ${err.message ?? err}（Windows 上原生模块可能缺失）`)
  }
}

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

  // 031：交叉打包时补目标平台原生模块（koffi 等）——必须在 cpSync 之前
  ensurePlatformNativeModules(projectRoot, packager.platform.nodeName, src)

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
