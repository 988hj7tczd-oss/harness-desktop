/**
 * electron/main.ts —— 应用入口。
 */
import { app, BrowserWindow, Menu, Tray, Notification, nativeImage, shell, ipcMain } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DshManager } from './dsh-manager.js'
import { SettingsStore } from './settings-store.js'
import { registerIpc } from './ipc.js'
import { createCredentialStore, userDataDir } from './credential-store.js'
import updaterModule from 'electron-updater'
// electron-updater 是 CJS；ESM 下具名导出互操作不可靠，取 default 对象的 autoUpdater
const { autoUpdater } = updaterModule as { autoUpdater: typeof import('electron-updater')['autoUpdater'] }

const __dirname = dirname(fileURLToPath(import.meta.url))
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let manager: DshManager
let settings: SettingsStore
let disposeIpc: () => void = () => {}
let quitting = false
let trayHintShown = false

// ---- 自动更新（021）：启动后台检查 + 手动检查 ----
// 注意：macOS 自动更新依赖代码签名（017）；未签名时自动更新被禁用，静默跳过。
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

function setupUpdater() {
  // 打包环境才启用自动更新（dev 模式跳过）；未签名 macOS 构建 updater 不活跃，静默跳过
  if (app.isPackaged && !autoUpdater.isUpdaterActive()) {
    console.warn('[harness-desktop] 自动更新不可用（未签名 macOS 构建，见 docs/SIGNING.md）')
    return
  }
  if (!app.isPackaged) return
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:status', { state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:status', { state: 'available', version: info.version })
    // 后台自动下载（autoDownload=true）
  })
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update:status', { state: 'up-to-date' })
  })
  autoUpdater.on('download-progress', (p) => {
    mainWindow?.webContents.send('update:status', {
      state: 'downloading',
      percent: Math.round(p.percent),
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:status', { state: 'downloaded', version: info.version })
    try {
      new Notification({ title: 'harness-desktop', body: `新版本 ${info.version} 已下载，重启应用完成更新。` }).show()
    } catch {
      // 通知失败不阻塞
    }
  })
  autoUpdater.on('error', (err) => {
    // 失败静默（日志记录，不打扰用户）
    console.warn('[harness-desktop] 检查更新失败:', (err as Error)?.message ?? err)
    mainWindow?.webContents.send('update:status', { state: 'error', message: err?.message })
  })
  ipcMain.handle('update:check', () => {
    try {
      void autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: { code: 'update-error', message: (err as Error).message } }
    }
  })
  ipcMain.handle('update:quitAndInstall', () => {
    autoUpdater.quitAndInstall()
    return { ok: true }
  })
}

/** 创建系统托盘：鲸鱼 template 图标 + 菜单（显示/新建会话/退出）。 */
function createTray() {
  const iconPath = join(app.getAppPath(), 'build', 'tray', 'TrayTemplate.png')
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    // 兜底：用应用图标（彩色，非 template）
    tray = new Tray(join(app.getAppPath(), 'build', 'icon.png'))
  } else {
    image.setTemplateImage(true)
    tray = new Tray(image)
  }
  tray.setToolTip('harness-desktop')

  const showWindow = () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  }

  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: showWindow },
    {
      label: '新建会话',
      click: () => {
        showWindow()
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) win.webContents.send('menu:new-chat')
      },
    },
    {
      label: '检查更新',
      click: () => {
        try {
          void autoUpdater.checkForUpdates()
        } catch (err) {
          console.warn('[harness-desktop] 检查更新失败:', (err as Error)?.message ?? err)
        }
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => shutdown() },
  ])
  tray.setContextMenu(menu)
  // 单击托盘图标 → 显示主窗口
  tray.on('click', showWindow)
  return tray
}

// ---- 单实例锁（012）：防止双开导致 dsh 引擎抢随机端口/资源冲突 ----
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    title: 'harness-desktop',
    icon: join(app.getAppPath(), 'build', 'icon.png'),
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox 保持 false：preload 编译为 ESM（package.json type: module），
      // sandbox 下 preload 仅支持 CommonJS/有限 require，ESM import 会崩溃。
      // 安全补偿：webSecurity（默认）+ 严格 CSP（index.html）+ 导航防护（B 部分）。
      sandbox: false,
      webSecurity: true,
    },
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    loadedEnginePort = null
  })

  // 关闭窗口（X）→ 隐藏到托盘，不退出（托盘菜单"退出"才真正退出）
  mainWindow.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    mainWindow?.hide()
    // 首次隐藏到托盘：提示一次（不打扰）
    if (!trayHintShown) {
      trayHintShown = true
      try {
        new Notification({ title: 'harness-desktop', body: '应用已最小化到托盘，点托盘鲸鱼图标恢复。' }).show()
      } catch {
        // 通知失败不阻塞
      }
    }
  })

  if (VITE_DEV_SERVER_URL) {
    // dev：先加载本地渲染器作为启动/回退屏，引擎就绪后由 loadEngineUI 跳转
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // prod：先加载本地构建作为启动/回退屏，引擎就绪后由 loadEngineUI 跳转
    void mainWindow.loadFile(join(app.getAppPath(), 'dist', 'index.html'))
  }

  // ---- 导航防护（012） ----
  // 新窗口（如 target=_blank / window.open）：仅 http/https 外部链接走系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  // 应用窗口只能导航到自身资源（dev server / 打包文件 / 精确引擎端口），其余一律阻止
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isEngine = loadedEnginePort !== null && url.startsWith(`http://127.0.0.1:${loadedEnginePort}`)
    const isDev = VITE_DEV_SERVER_URL ? url.startsWith(VITE_DEV_SERVER_URL) : false
    const isFile = url.startsWith('file://')
    if (!isEngine && !isDev && !isFile) event.preventDefault()
  })
}

/** 当前窗口指向的引擎端口（防重复 loadURL；也用于导航白名单精确匹配）。 */
let loadedEnginePort: number | null = null

/** 把主窗口加载到官方 UI（引擎端口）。端口变化时重新加载；失败定时重试。 */
function loadEngineUI(port: number) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (loadedEnginePort === port) return
  loadedEnginePort = port
  let attempt = 0
  const tryLoad = () => {
    // 端口已变（引擎重启换新端口触发 loadEngineUI 新端口）→ 放弃旧端口重试
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (loadedEnginePort !== port) return
    void mainWindow.loadURL(`http://127.0.0.1:${port}`).catch((err) => {
      console.warn('[harness-desktop] 加载官方 UI 失败:', (err as Error)?.message ?? err)
      if (loadedEnginePort === port) loadedEnginePort = null
      // 递增重试：1s/2s/5s/... 最多 10 次，避免窗口永停回退屏
      attempt += 1
      if (attempt <= 10) {
        const delay = attempt === 1 ? 1000 : attempt === 2 ? 2000 : Math.min(5000 * attempt, 30000)
        setTimeout(tryLoad, delay)
      }
    })
  }
  tryLoad()
}

/** 切换主窗口的开发者工具（开/关）。 */
function toggleDevTools() {
  const win = mainWindow
  if (!win) return
  const wc = win.webContents
  if (wc.isDevToolsOpened()) {
    wc.closeDevTools()
  } else {
    wc.openDevTools({ mode: 'detach' })
  }
}

/** 构建应用菜单：视图菜单提供「切换开发者工具」（Cmd+Option+I）。 */
function setupMenu() {
  const isMac = process.platform === 'darwin'
  /** 通知 renderer 触发对应动作（新会话 / 打开设置）。 */
  const sendToRenderer = (channel: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) win.webContents.send(channel)
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新会话',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToRenderer('menu:new-chat'),
        },
        { type: 'separator' },
        {
          label: '设置…',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendToRenderer('menu:open-settings'),
        },
        { type: 'separator' },
        {
          label: '检查更新…',
          click: () => {
            try {
              void autoUpdater.checkForUpdates()
            } catch (err) {
              console.warn('[harness-desktop] 检查更新失败:', (err as Error)?.message ?? err)
            }
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换开发者工具',
          id: 'toggle-devtools',
          accelerator: 'CmdOrCtrl+Option+I',
          click: () => toggleDevTools(),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    ...(isMac
      ? [{
          label: '窗口',
          submenu: [{ role: 'minimize' as const }, { role: 'zoom' as const }, { role: 'close' as const }],
        }]
      : []),
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** 优雅退出：先停掉 dsh 子进程，再退出应用。 */
function shutdown() {
  if (quitting) return
  quitting = true
  if (tray) {
    tray.destroy()
    tray = null
  }
  const running = manager && manager.status().running
  const finish = () => {
    disposeIpc()
    app.exit(0)
  }
  if (running) {
    // 最多等 6s，超时强制退出
    const timer = setTimeout(() => finish(), 6000)
    manager
      .stop()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer)
        finish()
      })
  } else {
    finish()
  }
}

app.whenReady().then(async () => {
  if (!gotLock) return
  settings = new SettingsStore()
  manager = new DshManager()

  // safeStorage 加密凭证层：桌面端自有的敏感值加密存储
  const creds = createCredentialStore(userDataDir())

  // 迁移：把引擎已有的明文 .credentials.yaml 敏感值加密进 safe-credentials（幂等）
  try {
    const { readFileSync, existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { parse } = await import('yaml')
    const credFile = join(manager.home, '.credentials.yaml')
    if (existsSync(credFile)) {
      const parsed = parse(readFileSync(credFile, 'utf8')) as Record<string, unknown>
      const plain: Record<string, string> = {}
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.length > 0) plain[k] = v
        }
      }
      creds.migrateFromPlain(plain)
    }
  } catch {
    // 迁移失败不阻塞
  }

  // 开机自启（若配置过）——开机自动拉起，保证 dsh 引擎随系统启动
  const appearance = settings.get().appearance
  if (appearance?.autoLaunch) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: Boolean(appearance.launchMinimized),
    })
  }

  setupMenu()
  setupUpdater()
  disposeIpc = registerIpc(manager, settings, () => mainWindow, creds)

  createWindow()
  createTray()

  // 启动时最小化到托盘：不展示主窗口，仅后台运行（托盘提供恢复入口）
  if (appearance?.launchMinimized) {
    mainWindow?.hide()
    if (!trayHintShown) {
      trayHintShown = true
      try {
        new Notification({ title: 'harness-desktop', body: '应用已在后台运行，点托盘鲸鱼图标打开。' }).show()
      } catch {
        // 通知失败不阻塞
      }
    }
  }

  // 后台启动 dsh，就绪后加载官方 UI（引擎端口），失败不阻塞（保留回退屏）
  void manager.start().then((s) => {
    if (s.port) loadEngineUI(s.port)
  }).catch((err) => {
    console.error('[harness-desktop] dsh 启动失败:', err)
  })

  // 端口跟随：引擎崩溃重启换端口 → 窗口重新 loadURL 新端口（A0 端口漂移）
  manager.onStatus((s) => {
    if (s.port && s.ready) loadEngineUI(s.port)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', (e) => {
  if (!quitting && manager && manager.status().running) {
    e.preventDefault()
    shutdown()
  }
})

// 关闭到托盘后没有窗口也不退出（托盘菜单"退出"才真正退出）
app.on('window-all-closed', () => {
  // 有托盘：保持后台运行（任何平台）
  if (tray) return
  // 无托盘（如开发早期）：非 macOS 退出，macOS 保持（符合惯例）
  if (process.platform !== 'darwin') shutdown()
})

// SIGTERM / SIGINT（进程被外部终止）也要清理 dsh 子进程
process.on('SIGTERM', () => shutdown())
process.on('SIGINT', () => shutdown())

// 兜底：应用退出时确保子进程被终止
app.on('will-quit', () => {
  manager?.stop().catch(() => undefined)
})
