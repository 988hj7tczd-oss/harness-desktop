/**
 * electron/preload.ts —— 暴露安全的 IPC API 给 renderer。
 */
/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  CustomProviderConfig,
  DshStatus,
  HarnessApi,
  IpcResult,
  PickedFile,
  Reminder,
  SessionStreamEvent,
  WebSearchConfig,
} from '../shared/types.js'

const call = <T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> =>
  ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>

const api: HarnessApi = {
  getAppState: () => call('app:getState'),
  updateAppSettings: (patch: Partial<AppSettings>) => call('app:updateSettings', patch),
  setAutoLaunch: (enabled: boolean) => call('app:setAutoLaunch', enabled),
  checkForUpdates: () => call('update:check'),
  quitAndInstall: () => call('update:quitAndInstall'),
  getDshStatus: () => call('dsh:status'),
  ensureDsh: () => call('dsh:ensure'),
  shutdownDsh: () => call('dsh:shutdown'),
  describe: () => call('dsh:describe'),

  listSessions: () => call('session:list'),
  createSession: (cwd?: string, agentPreset?: string) => call('session:create', cwd, agentPreset),
  getHistory: (sessionId: string) => call('session:history', sessionId),
  sendMessage: (sessionId: string, text: string, files?: PickedFile[]) => call('session:send', sessionId, text, files),
  cancelTurn: (sessionId: string) => call('session:cancel', sessionId),
  renameSession: (sessionId: string, title: string) => call('session:rename', sessionId, title),
  forkSession: (sessionId: string) => call('session:fork', sessionId),
  archiveSession: (sessionId: string) => call('session:archive', sessionId),
  hardDeleteSession: (sessionId: string, cwd?: string) => call('session:hardDelete', sessionId, cwd),
  copyText: (text: string) => call('clipboard:copy', text),

  listAgentPresets: () => call('preset:list'),
  selectAgentPreset: (sessionId: string, agentPreset: string) => call('preset:select', sessionId, agentPreset),
  pickFiles: () => call('files:pick'),

  listModels: () => call('model:list'),
  listProviders: () => call('model:providers'),
  selectModel: (sessionId: string, provider: string, model: string) =>
    call('model:select', sessionId, provider, model),

  listCustomProviders: () => call('provider:list'),
  saveCustomProvider: (config: CustomProviderConfig) => call('provider:save', config),
  removeCustomProvider: (id: string) => call('provider:remove', id),
  setProviderApiKey: (apiKeyEnv: string, key: string) => call('provider:setKey', apiKeyEnv, key),

  setApiKey: (key: string) => call('cred:setKey', key),
  hasApiKey: () => call('cred:hasKey'),
  testApiKey: (key: string) => call('cred:testKey', key),
  pickDirectory: () => call('dir:pick'),

  listCredentials: () => call('cred:list'),
  setCredential: (ref: string, value: string) => call('cred:setRef', ref, value),
  clearCredential: (ref: string) => call('cred:clear', ref),
  listReminders: () => call('reminder:list'),
  createReminder: (input: Omit<Reminder, 'id' | 'nextAt'>) => call('reminder:create', input),
  deleteReminder: (id: string) => call('reminder:delete', id),
  listMemories: () => call('memory:list'),
  addMemory: (text: string, tags?: string[]) => call('memory:add', text, tags),
  deleteMemory: (id: string) => call('memory:delete', id),
  clearMemories: () => call('memory:clear'),
  togglePlanMode: (sessionId: string) => call('plan:toggle', sessionId),
  getWebSearchConfig: () => call('websearch:get'),
  setWebSearchConfig: (config: Partial<WebSearchConfig>) => call('websearch:set', config),
  exportSession: (sessionId: string, format: 'zip' | 'json' | 'markdown') => call('session:export', sessionId, format),
  listSkills: (sessionId: string) => call('skill:list', sessionId),

  onSessionEvent: (cb: (evt: SessionStreamEvent) => void) => {
    const listener = (_e: unknown, evt: SessionStreamEvent) => cb(evt)
    ipcRenderer.on('dsh:event', listener)
    void ipcRenderer.invoke('dsh:subscribe')
    return () => ipcRenderer.removeListener('dsh:event', listener)
  },
  onMenuEvent: (cb: (action: 'new-chat' | 'open-settings') => void) => {
    const onNew = () => cb('new-chat')
    const onSettings = () => cb('open-settings')
    ipcRenderer.on('menu:new-chat', onNew)
    ipcRenderer.on('menu:open-settings', onSettings)
    return () => {
      ipcRenderer.removeListener('menu:new-chat', onNew)
      ipcRenderer.removeListener('menu:open-settings', onSettings)
    }
  },
  onReminderFired: (cb: (payload: { sessionId: string; text: string }) => void) => {
    const listener = (_e: unknown, payload: { sessionId: string; text: string }) => cb(payload)
    ipcRenderer.on('reminder:fired', listener)
    return () => ipcRenderer.removeListener('reminder:fired', listener)
  },
  onDshStatus: (cb: (status: DshStatus) => void) => {
    const listener = (_e: unknown, status: DshStatus) => cb(status)
    ipcRenderer.on('dsh:status', listener)
    return () => ipcRenderer.removeListener('dsh:status', listener)
  },
  onUpdateStatus: (cb: (status: { state: string; version?: string; percent?: number; message?: string }) => void) => {
    const listener = (_e: unknown, status: { state: string; version?: string; percent?: number; message?: string }) =>
      cb(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
}

contextBridge.exposeInMainWorld('harness', api)

// ---- 026 __desktop__ 桥：官方 UI 页面消费的桌面壳能力 ----
interface DesktopBridge {
  getPort(): Promise<number | null>
  getVersion(): Promise<string>
  notify(title: string, body: string): Promise<void>
  onEnginePort(cb: (port: number | null) => void): () => void
  onMenuEvent(cb: (action: 'new-chat' | 'open-settings') => void): () => void
}

const desktop: DesktopBridge = {
  getPort: async () => {
    const res = await call<number | null>('desktop:getPort')
    return res.ok ? (res.value ?? null) : null
  },
  getVersion: async () => {
    const res = await call<string>('desktop:getVersion')
    return res.ok ? (res.value ?? '') : ''
  },
  notify: async (title, body) => {
    await call('desktop:notify', title, body)
  },
  onEnginePort: (cb) => {
    const listener = (_e: unknown, status: DshStatus) => {
      cb(status?.port ?? null)
    }
    ipcRenderer.on('dsh:status', listener)
    return () => ipcRenderer.removeListener('dsh:status', listener)
  },
  onMenuEvent: (cb) => {
    const onNew = () => cb('new-chat')
    const onSettings = () => cb('open-settings')
    ipcRenderer.on('menu:new-chat', onNew)
    ipcRenderer.on('menu:open-settings', onSettings)
    return () => {
      ipcRenderer.removeListener('menu:new-chat', onNew)
      ipcRenderer.removeListener('menu:open-settings', onSettings)
    }
  },
}

contextBridge.exposeInMainWorld('__desktop__', desktop)

// ---- 品牌注入（官方 UI 页面）：渐变流动鲸鱼 + "harness desktop vX" ----
// 目标区域：① 窗口右上角（fixed 定位，任何页面可见）
//          ② 首次会话 hero（替换官方"探索未至之境 预览版"区）
// 动态变色 = SMIL 渐变 stop 颜色/位置循环（蓝→紫→粉），纯浏览器动画，无 JS 定时器
const BRAND_WHALE_PATH =
  'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z'

/** 渐变流动鲸鱼 SVG（SMIL 动画：stop 颜色 + 位置循环 蓝→紫→粉）。 */
function brandWhaleSvg(size: number, gradId: string): string {
  return (
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 50 50" fill="none" aria-hidden="true">' +
    '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%">' +
    '<animate attributeName="stop-color" values="#4f8cff;#a855f7;#ec4899;#4f8cff" dur="6s" repeatCount="indefinite"/>' +
    '<animate attributeName="offset" values="0%;0.5;0.95;0%" dur="6s" repeatCount="indefinite"/>' +
    '</stop>' +
    '<stop offset="50%"><animate attributeName="stop-color" values="#a855f7;#ec4899;#4f8cff;#a855f7" dur="6s" repeatCount="indefinite"/></stop>' +
    '<stop offset="100%"><animate attributeName="stop-color" values="#ec4899;#4f8cff;#a855f7;#ec4899" dur="6s" repeatCount="indefinite"/></stop>' +
    '</linearGradient></defs>' +
    '<path d="' + BRAND_WHALE_PATH + '" fill="url(#' + gradId + ')"/></svg>'
  )
}

/** 品牌注入（官方 UI 页面）：左上角品牌替换 + 首次会话 hero 替换。 */
function injectDesktopBrand() {
  const started = Date.now()

  /**
   * 动态解析品牌文字颜色：读取侧栏/文档背景亮度。
   * 浅色主题（背景亮）→ 深色文字（黑）；深色主题 → 浅色文字（白），保证反差。
   */
  const resolveBrandColors = (): { primary: string; secondary: string } => {
    const bg = (() => {
      const sidebar = document.querySelector('[class*="sidebarCol"], [class*="sidebar"]')
      const probe = sidebar ?? document.body
      if (!probe) return '#0f1115'
      const style = getComputedStyle(probe)
      const rgb = style.backgroundColor
      const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(rgb)
      if (m) {
        const lum = (Number(m[1]) * 0.299 + Number(m[2]) * 0.587 + Number(m[3]) * 0.114)
        return lum > 140 ? 'light' : 'dark'
      }
      return 'dark'
    })()
    if (bg === 'light') return { primary: '#111418', secondary: '#5a6472' }
    return { primary: '#e8eaf1', secondary: '#9aa3b2' }
  }

  /** 左上角品牌内容：动态鲸鱼 + "harness desktop"（无版本徽标）。 */
  const makeTopLeftBrand = (): HTMLElement => {
    const { primary } = resolveBrandColors()
    const el = document.createElement('span')
    el.setAttribute('data-hd-topleft-brand', '1')
    el.style.cssText =
      'display:inline-flex;align-items:center;gap:10px;white-space:nowrap;user-select:none;'
    el.innerHTML =
      brandWhaleSvg(34, 'hd-topleft-grad') +
      '<span data-hd-topleft-text style="font:700 17px/1 -apple-system,&quot;Segoe UI&quot;,Roboto,sans-serif;color:' +
      primary +
      ';letter-spacing:.2px">harness desktop</span>'
    return el
  }

  /** hero 版本徽标：浅色界面蓝底白字；深色界面白底深字（反差）。 */
  const heroVersionBadge = (): { style: string; dataAttr: string } => {
    const { primary } = resolveBrandColors()
    const isLight = primary === '#111418'
    const badgeStyle = isLight
      ? 'display:inline-block;margin-left:10px;background:#4f8cff;color:#fff;font:600 13px/1.4 -apple-system,&quot;Segoe UI&quot;,Roboto,sans-serif;border-radius:999px;padding:3px 10px;vertical-align:middle;'
      : 'display:inline-block;margin-left:10px;background:#fff;color:#111418;font:600 13px/1.4 -apple-system,&quot;Segoe UI&quot;,Roboto,sans-serif;border-radius:999px;padding:3px 10px;vertical-align:middle;'
    return { style: badgeStyle, dataAttr: 'data-hd-hero-ver' }
  }

  /** hero 品牌：居中排版（大鲸鱼 + 标题 + 版本徽标 + 副标题）。 */
  const makeHeroBrand = (): HTMLElement => {
    const { primary, secondary } = resolveBrandColors()
    const ver = heroVersionBadge()
    const el = document.createElement('div')
    el.setAttribute('data-hd-hero-brand', '1')
    el.style.cssText =
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:12px 0;width:100%;'
    el.innerHTML =
      brandWhaleSvg(56, 'hd-hero-grad') +
      '<span data-hd-hero-title style="font:700 30px/1.2 -apple-system,&quot;Segoe UI&quot;,Roboto,sans-serif;color:' +
      primary +
      ';letter-spacing:.3px">harness desktop<span ' +
      ver.dataAttr +
      ' style="' +
      ver.style +
      '">v0.1.0</span></span>' +
      '<span data-hd-hero-sub style="font:400 14px/1.5 -apple-system,&quot;Segoe UI&quot;,Roboto,sans-serif;color:' +
      secondary +
      '">你的 AI 工作台 · 开始对话</span>'
    return el
  }

  const applyVersion = () => {
    // 左上角不显示版本；hero 版本徽标用 getVersion 填充（默认 v0.1.0）
    const topLeftText = document.querySelector('[data-hd-topleft-text]')
    if (topLeftText) topLeftText.textContent = 'harness desktop'
    void desktop.getVersion().then((v) => {
      const heroVer = document.querySelector('[data-hd-hero-ver]')
      if (heroVer) heroVer.textContent = 'v' + (v || '0.1.0')
    })
  }

  /**
   * 替换官方左上角品牌（sidebar 顶部 logo + wordmark，官方为单张 svg）。
   * 官方结构：`.hHd-Xa_logoRow > .hHd-Xa_brand`（aria-label="新建会话"，内含 svg）。
   */
  const ensureTopLeft = () => {
    if (!document.body) return
    if (document.querySelector('[data-hd-topleft-brand]')) return
    // 官方 brand 按钮：含 svg 且 aria-label 含"新建会话"/"New"（右上/左上都可能出现，取 sidebar 内）
    const candidates = Array.from(
      document.querySelectorAll('[class*="_brand"], [aria-label*="新建会话"], [aria-label*="New Chat"]'),
    )
    for (const el of candidates) {
      const hasSvg = el.querySelector('svg') !== null
      const inSidebar = el.closest('[class*="sidebarCol"], [class*="sidebar"]') !== null
      if (hasSvg && (inSidebar || el.getAttribute('aria-label'))) {
        el.innerHTML = ''
        el.appendChild(makeTopLeftBrand())
        applyVersion()
        return
      }
    }
  }

  /** hero 品牌替换的目标文本（多语言兜底：中文/英文/未就绪的 key）。 */
  const HERO_HEADLINE_KEYS = ['探索未至', 'Into the Unknown', 'hero.headline']

  /**
   * 找官方 hero 的 .headline 容器并替换为品牌。
   * 三层匹配：
   *  C) CSS Modules 结构：`[class*="_headline_"]`（原类名保留在 hash 中，不依赖 locale）
   *  B) 文本匹配：中文/英文/未就绪 key
   *  校验父级含 fish 特征（子元素有 svg），避免误替换。
   */
  const ensureHero = () => {
    if (!document.body) return
    // 已注入标记：跳过
    if (document.querySelector('[data-hd-hero-brand]')) return
    // 方案 C：结构匹配 headline 容器 → 取祖先 stack（更宽、CSS 居中，品牌 column 排版自然生效）
    const headlineEls = Array.from(document.querySelectorAll('[class*="_headline_"]'))
    for (const headline of headlineEls) {
      const text = (headline.textContent ?? '').trim()
      const hasHeroText = HERO_HEADLINE_KEYS.some((k) => text.indexOf(k) !== -1)
      const hasFish = headline.querySelector('svg') !== null || headline.closest('[class*="_fish_"]') !== null
      if (hasHeroText || hasFish) {
        // 用 headline 的父 stack 容器（headline.parentElement 即 stack，宽、CSS 居中）
        // 避免 closest 匹配到 headline 自身（若其 class 意外含 _stack_）
        let target: HTMLElement | null = headline.parentElement
        if (target && target !== headline && target.classList) {
          // 确认 target 是 stack 或更宽容器
          if (target.querySelector && !target.querySelector('[data-hd-hero-brand]')) {
            target.innerHTML = ''
            target.appendChild(makeHeroBrand())
            applyVersion()
            return
          }
        }
      }
    }
    // 方案 B：文本匹配（兜底，用于结构类名变动时）
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const text = node.textContent ?? ''
      if (HERO_HEADLINE_KEYS.some((k) => text.indexOf(k) !== -1)) {
        const textEl = node.parentElement
        const headline = textEl ? textEl.parentElement : null
        if (headline && headline.parentElement && !headline.querySelector('[data-hd-hero-brand]')) {
          const target = headline.parentElement
          if (target && !target.querySelector('[data-hd-hero-brand]')) {
            target.innerHTML = ''
            target.appendChild(makeHeroBrand())
            applyVersion()
            return
          }
        }
      }
    }
  }

  const boot = () => {
    ensureTopLeft()
    ensureHero()
    // React 重渲染可能恢复官方 hero/brand → MutationObserver 持续兜底重注入（节流）
    // characterData: true —— locale 就绪后 hero 文本从 key/英文变中文是 characterData 变更
    let lastScan = 0
    const mo = new MutationObserver(() => {
      const now = Date.now()
      if (now - lastScan < 300) return
      lastScan = now
      ensureTopLeft()
      ensureHero()
    })
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    // 兜底轮询：hero/brand 延迟渲染时也能命中（30s 后停止）
    const poll = () => {
      if (Date.now() - started > 30000) return
      ensureTopLeft()
      ensureHero()
      setTimeout(poll, 400)
    }
    setTimeout(poll, 400)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
}

injectDesktopBrand()
