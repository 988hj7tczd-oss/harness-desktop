# harness-desktop 交付报告（012 安全加固 6 项）

> 状态：A/B/C/D/E 完成并实测（typecheck/build 通过，CSP/导航/单实例已实测，附件限制逻辑就绪）。

## Part A：渲染进程安全纵深
- **A1 sandbox**：保持 `sandbox: false` + 显式 `webSecurity: true`（采用提示词方案 B）。
  - 原因：preload 编译为 ESM（package.json `type: module`），sandbox 下 preload 仅支持 CommonJS/受限 require，ESM import 会崩溃。已在 main.ts 注释说明。
  - 补偿：严格 CSP + 导航防护（B 部分）+ webSecurity。
- **A2 CSP（index.html）**：收紧 connect-src 至 `http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*`（dsh 随机端口 + Vite dev HMR），新增 `object-src 'none'`、`base-uri 'self'`、`frame-src 'none'`。dev/prod 均验证加载 200 且 CSP 生效。

## Part B：导航防护（实测 ✅）
- `setWindowOpenHandler`：新窗口仅 http/https 走系统浏览器（`shell.openExternal`），一律 `deny`。
- `will-navigate`：仅允许 dev server 或打包 `file://` 自身资源，其余 `preventDefault`。

## Part C：单实例锁（实测 ✅）
- `requestSingleInstanceLock` 失败则 `app.quit()`；`second-instance` 聚焦/还原已有窗口。
- 实测：双开时第二个实例退出，进程数不变（6）。

## Part D：MessageList 渲染上限（实现 ✅）
- 最多渲染最近 500 条 + "显示更早消息（还有 N 条）"按钮（每次回看 200 条）。
- 不引虚拟滚动库；自动滚底逻辑保留。

## Part E：附件限制（实现 ✅）
- 前端（ChatInput）：单文件 ≤50MB、总数 ≤10，超限提示"文件过大/附件最多 10 个"。
- 主进程兜底（ipc files:pick）：`statSync` 校验单文件 50MB、总数 10，超限 throw（防绕过前端）。
- `PickedFile` 增加 `size` 字段。

## 改动文件
- `index.html`：CSP 收紧（connect-src 限定 127.0.0.1/localhost + object-src/base-uri/frame-src）
- `electron/main.ts`：webSecurity 显式、单实例锁、setWindowOpenHandler、will-navigate
- `electron/ipc.ts`：files:pick 附件大小/数量校验 + statSync
- `shared/types.ts`：PickedFile.size
- `src/components/MessageList.tsx`：窗口化渲染 + 加载更早按钮
- `src/components/ChatInput.tsx`：附件前端限制 + 错误提示
- `src/styles.css`：load-earlier-btn / chat-input-err

## 自测结果
- ✅ `pnpm typecheck` 零错误；`pnpm build` 通过；dev 200 + prod 构建 CSP 生效
- ✅ `pnpm start` 正常启动（preload API 可用，无崩溃）
- ✅ 双开 → 第二个实例退出（单实例锁生效）
- ✅ 无新增 emoji（保留 ✕ 功能符号）

## 需要 owner 实测
- ⏳ 点外部引导链接（@BotFather 等）→ 系统浏览器打开、应用内不弹窗
- ⏳ 超长会话（>500 条）→ 只渲染最近 + 可加载更早
- ⏳ 选 >50MB 文件 / 选 11 个文件 → 提示并拒绝
- ⏳ dev 模式 HMR 正常（CSP 不阻断）

## 已知限制
1. **sandbox 未开启**：因 ESM preload 与 sandbox 不兼容（方案 B 补偿 webSecurity + 严格 CSP）；如需真正 sandbox，需把 preload 改为 CJS（独立构建）。
2. **附件大小限制**依赖 `statSync`（主进程），前端仅在文件已选取后按 size 校验；超限在对话框后提示。
