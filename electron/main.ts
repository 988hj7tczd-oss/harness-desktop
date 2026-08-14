/**
 * electron/main.ts —— 应用入口。
 */
import { app, BrowserWindow, Menu, shell } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DshManager } from './dsh-manager.js'
import { SettingsStore } from './settings-store.js'
import { registerIpc } from './ipc.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let mainWindow: BrowserWindow | null = null
let manager: DshManager
let settings: SettingsStore
let disposeIpc: () => void = () => {}
let quitting = false

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
  })

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
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
  // 应用窗口只能导航到自身资源（dev server 或打包后的本地文件），其余一律阻止
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = VITE_DEV_SERVER_URL
      ? url.startsWith(VITE_DEV_SERVER_URL)
      : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })
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

  // 开机自启（若配置过）——开机自动拉起，保证 dsh 引擎随系统启动
  const appearance = settings.get().appearance
  if (appearance?.autoLaunch) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: Boolean(appearance.launchMinimized),
    })
  }

  setupMenu()
  disposeIpc = registerIpc(manager, settings, () => mainWindow)

  createWindow()

  // 启动时最小化到托盘：不展示主窗口，仅后台运行
  if (appearance?.launchMinimized) {
    mainWindow?.hide()
  }

  // 后台启动 dsh，失败不阻塞窗口展示
  manager.start().catch((err) => {
    console.error('[harness-desktop] dsh 启动失败:', err)
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    shutdown()
  }
})

// SIGTERM / SIGINT（进程被外部终止）也要清理 dsh 子进程
process.on('SIGTERM', () => shutdown())
process.on('SIGINT', () => shutdown())

// 兜底：应用退出时确保子进程被终止
app.on('will-quit', () => {
  manager?.stop().catch(() => undefined)
})
