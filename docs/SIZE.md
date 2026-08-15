# 打包体积审计（harness-desktop）

> 目标：分析安装包体积构成，找出可安全裁剪项。不砍原生模块（node-pty/koffi）与 dsh 引擎（核心必需）。

## 当前状态（修复前）

| 项 | 大小 | 说明 |
|---|---|---|
| 整个 .app | ~1.2 GB | 含 Electron 框架 + 全量 node_modules |
| Electron Framework.framework | 274 MB | 运行时框架（必需，不可裁） |
| app/node_modules | 987 MB | **全量复制，含大量 devDependencies（大头）** |

### app/node_modules 体积构成（修复前）

| 包 | 大小 | 能否裁 |
|---|---|---|
| `electron` | 296 MB | 可裁：开发依赖，运行时不需要（已排除） |
| `app-builder-bin` | 207 MB | 可裁：electron-builder 构建工具，运行时不需要（已排除） |
| `node-pty` | 62 MB | 不裁：原生模块，dsh 工具必需 |
| `@deepseek-ai/*` | 30 MB | 不裁：dsh 引擎依赖闭包，必需 |
| `@opentelemetry` | 28 MB | 观察 dsh 是否引用；未确认前保留 |
| `@mistralai` / `openai` | 40 MB | dsh 供应商 SDK（LLM 路由用），保留 |
| `typescript` | 23 MB | 可裁：构建工具（已排除） |
| `esbuild` | 9.6 MB | 可裁：构建工具（已排除） |
| `7zip-bin` / `7zip` | 12 MB | 可裁：打包工具（已排除） |
| 其余传递依赖 | ~150 MB | dsh 运行时闭包，保留 |

## 修复内容

`scripts/after-pack.mjs` 复制 node_modules 时**排除 devDependencies 与构建工具链**：

- 排除：`electron` / `electron-builder` / `typescript` / `vite` / `vitest` / `concurrently` /
  `cross-env` / `wait-on` / `@types/*` / `@vitejs/plugin-react` / `app-builder-bin` /
  `7zip-bin` / `esbuild` / `electron-builder-binaries`
- 保留：`node-pty` / `koffi` / `@deepseek-ai/*` / 全部运行时依赖

## 预估收益

- 裁剪前 ~987 MB node_modules → 裁剪后约 350-400 MB（省掉 electron 296M + builder 220M + TS/esbuild ~33M）
- 整体 .app 从 ~1.2 GB → 约 650-700 MB；dmg 约 400-450 MB
- 更激进（不裁核心时）：可进一步清理 `@opentelemetry`（若 dsh 未用）、`@img` 平台二进制

## 后续建议

1. **验证**：裁剪后 `pnpm dist:mac` 产物必须能正常启动（dsh 引擎依赖闭包完整）——重点测 dsh 引擎加载
2. **按平台裁剪**：`@img/*` 平台特定二进制、`@rollup` wasm 等可只留当前平台
3. **渐进式**：每次裁剪后跑 `pnpm test` + 打包启动验证，避免为体积破坏功能
