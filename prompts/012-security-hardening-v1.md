---
title: 安全加固 6 项（sandbox/CSP/导航防护/单实例/消息分页/附件限制）
status: done
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（对 001-011 的安全加固）
completed: 2026-08-14（A/B/C/D/E 实现 + typecheck/build 通过，sandbox 采用方案 B 补偿）
---

# 任务：安全加固 6 项

项目：~/development/harness-desktop
基于：001-011 已验收（全局审查发现 6 个加固项）

## 背景
全局审查完成，核心安全架构正确（无密钥泄漏/无命令注入/无 XSS），
但发现 6 个加固项需要修复：

| # | 问题 | 严重度 | 位置 |
|---|---|---|---|
| 1 | Electron `sandbox: false` | 🟠 中 | electron/main.ts webPreferences |
| 2 | 无 CSP meta | 🟠 中 | index.html |
| 3 | 无导航防护 | 🟡 低 | electron/main.ts |
| 4 | MessageList 无长度限制 | 🟡 低 | src/components/MessageList.tsx |
| 5 | 附件无大小限制 | 🟡 低 | src/components/ChatInput.tsx + ipc |
| 6 | 无单实例锁 | 🟡 低 | electron/main.ts |

---

## Part A：渲染进程安全纵深（P1，重点）

### A1. 开启 Electron sandbox
- electron/main.ts 的 webPreferences：`sandbox: false` → `sandbox: true`
- ⚠️ 注意：开启 sandbox 后 preload 脚本受限（只能用有限的 API，不能 require Node 模块）。
  先验证 preload.ts 是否兼容：
  - preload 只用 `contextBridge.exposeInMainWorld` + `ipcRenderer` → **兼容**（sandbox 下可用）
  - preload 如果 require 了 Node 模块（fs/path 等）→ 需要调整（把逻辑移到主进程）
- 若 sandbox: true 导致 preload 崩溃，方案 B：保持 false 但加 `webSecurity: true`（默认）+
  严格 CSP 补偿

### A2. 添加 CSP meta（index.html）
- 在 index.html `<head>` 添加：
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*;" />
  ```
- ⚠️ 注意：
  - `connect-src` 必须允许 `ws://127.0.0.1:*` 和 `http://127.0.0.1:*`（dsh 引擎的随机端口 WebSocket/HTTP）
  - 开发模式（Vite dev server）会注入自己的脚本 → 需要 CSP 允许 `http://localhost:5173`（或用环境判断）
  - 验证：dev 模式 + 打包模式都能正常加载（不破坏 Vite HMR）
  - 若 Vite dev 与 CSP 冲突：只在生产构建注入严格 CSP（vite 插件或 index.html 条件）

---

## Part B：导航防护（P2）

### B1. setWindowOpenHandler
- electron/main.ts 的 BrowserWindow 加：
  ```ts
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 仅允许 http/https 外部链接用默认浏览器打开
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  ```
- 目的：renderer 里点开的任何新窗口（如引导链接）不在应用内打开，走系统浏览器

### B2. will-navigate 防护
- 加：
  ```ts
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = VITE_DEV_SERVER_URL
      ? url.startsWith(VITE_DEV_SERVER_URL)
      : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })
  ```
- 目的：应用窗口不能被导航到任意 URL

---

## Part C：单实例锁（P2）

### C1. requestSingleInstanceLock
- electron/main.ts 顶部（app.whenReady 之前）：
  ```ts
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    // 第二个实例启动时聚焦已有窗口
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
    })
  }
  ```
- 目的：防止双开（两个 dsh 引擎进程抢随机端口/资源冲突）

---

## Part D：MessageList 分页/上限（P3）

### D1. 超长会话保护
- src/components/MessageList.tsx 增加渲染上限：
  - 方案：只渲染最近 N 条（如 500 条）消息 + "显示更早消息"按钮（增量加载）
  - 或：virtualization（不引重型库，用简单窗口化：只渲染可视区域 ± buffer）
- 目的：超长会话不 DOM 爆炸
- ⚠️ 不要破坏流式输出/自动滚动到底部

---

## Part E：附件大小限制（P3）

### E1. 前端限制
- src/components/ChatInput.tsx 选文件时检查大小：
  - 单文件上限（如 50MB）
  - 超过 → 提示"文件过大，最大 50MB"并拒绝添加
- 总附件数限制（如最多 10 个）

### E2. 主进程兜底
- electron/ipc.ts 的 files:pick 处理时也校验大小（防绕过前端）

---

## ✅ 要做（正面）
1. A1：sandbox: true（验证 preload 兼容；不兼容则方案 B 补偿）
2. A2：CSP meta（生产严格、dev 兼容 Vite HMR）
3. B1：setWindowOpenHandler 外部链接走系统浏览器
4. B2：will-navigate 只允许应用自身 URL
5. C1：requestSingleInstanceLock 单实例锁 + second-instance 聚焦
6. D1：MessageList 渲染上限 + 加载更早
7. E1+E2：附件大小/数量限制（前后端都校验）
8. 保留 001-011 全部功能

## ❌ 不要做（反面，硬约束）
- **不要破坏 preload 的 contextBridge 暴露** — sandbox 开启后 preload API 必须照常工作（这是最大风险点）
- **不要破坏 Vite HMR** — CSP 若导致 dev 模式热更新失效，必须用生产/开发分支方案
- **不要引虚拟滚动库** — MessageList 用简单窗口化，不加 react-virtualized 等重型依赖
- **不要改 dsh 引擎核心 / 不要重写 adapter 隔离层 / 不要升级 dsh 版本（锁 rc.6）**
- **不要引入重型 UI 库**
- **不要删除 001-011 已实现功能**
- **不要一次性提交所有 Part** — A→B→C→D→E 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要做花哨动效**

## 验收标准（owner 实测）
1. sandbox: true 后应用正常启动，preload API（window.harness.*）全部可用
2. 消息通道/设置/任务/聊天全部功能正常（sandbox 没破坏任何东西）
3. CSP 生效：控制台无 CSP 报错，Vite dev HMR 正常
4. 点外部链接（如 @BotFather）→ 系统浏览器打开，应用内不弹新窗口
5. 双开应用 → 第二个实例退出/聚焦第一个窗口
6. 超长会话（>500 条）→ 只渲染最近 N 条 + 可加载更早
7. 选 >50MB 文件 → 提示并拒绝；>10 个附件 → 提示
8. pnpm typecheck 零错误，pnpm dev 正常启动

## 交付形式
- 分 Part 提交（A → B → C → D → E），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
