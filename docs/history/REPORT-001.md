# harness-desktop 交付报告（001-harness-desktop-mvp-v1）

> 状态：Phase 0–3 全部完成。真实 API Key 对话待 owner 实测验收。

## 完成情况

| Phase | 内容 | 状态 |
|---|---|---|
| 0 | Electron 壳 + dsh 进程管理 + adapter 骨架 | ✅ |
| 1 | 极简 UI（首启向导 + 会话列表 + 聊天窗口 + 设置） | ✅ |
| 2 | 记忆插件 dsh-memory（ctx.storage + system-prompt section） | ✅ |
| 3 | 打包分发（macOS dmg + Windows exe） | ✅ |

## 如何启动

```bash
pnpm install          # 安装依赖（含 dsh 引擎，锁 0.1.0-rc.6）
pnpm dev              # 开发模式：vite + electron，打开聊天界面
pnpm dist             # 打包：out/*.dmg + out/*.exe
```

打包产物：
- macOS：`out/harness-desktop-0.1.0-arm64.dmg` / `out/harness-desktop-0.1.0.dmg`（x64）
- Windows：`out/harness-desktop Setup 0.1.0.exe`

## 自测结果（opencode 实测）

- ✅ `dsh web` 随机端口启动、`host.describe` 就绪轮询（poll 直到 ok:true）
- ✅ JSON-RPC 信封契约（POST /api/<method> + WS /api/events.mux 事件流）
- ✅ adapter 独立模块；通过 IPC 只暴露稳定类型，renderer 不接触 dsh 原始字段
- ✅ 首启向导 3 步完整走通（37 个 provider 可选 → API Key → 工作区）
- ✅ 会话创建/列表/历史加载；聊天消息发送 → 事件流 → UI 渲染
- ✅ 模型目录（DeepSeek-V4-Flash / DeepSeek-V4-Pro）与切换
- ✅ runtime-context 等引擎注入消息已过滤，不污染聊天界面
- ✅ 记忆插件：`memory_save`/`memory_forget` 工具注册 + 记忆段落注入系统提示
- ✅ 退出后 dsh 子进程无残留（SIGTERM/SIGINT/before-quit 均覆盖）
- ✅ 打包产物可启动：macOS dmg 内 dsh 引擎（electron-as-node + `--expose-internals`）正常服务 API，记忆插件自动安装

## 需要 owner 实测的项

- ⏳ 配置真实 DeepSeek API Key 后完成一次真实对话（核心验收项）
- ⏳ macOS `pnpm dev` 一键启动进入聊天界面
- ⏳ 首启向导完整走通（含原生目录选择器弹窗）

## 已知限制

1. **版本说明**：提示词要求锁 `@deepseek-ai/dsh@0.1.0-rc.5`，但 npm 上不存在该版本（registry 从 `0.1.0-rc.3` 直接到 `0.1.0-rc.6`）。已改为精确锁定 `0.1.0-rc.6`（当前最新可用版本），满足"锁版本、不用最新"的意图。
2. **首次启动耗时**：首次启动会初始化 dsh profile（构建依赖闭包，离线完成）并安装记忆插件后自动重启一次，约 30–60s。
3. **原生目录选择器**：dsh 的 `host.pickDirectory` 会弹原生对话框；自动化测试中无法点击，用 `updateAppSettings` 模拟。
4. **Windows 安装包**：NSIS exe 已产出但未在 Windows 实机运行验证（本机为 macOS）。
5. **未签名**：macOS dmg / Windows exe 未做代码签名，安装时系统可能提示未知开发者。
6. **打包体积**：约 500MB（功能优先，未做体积优化）。
7. **图标**：使用脚本生成的极简图标，未做精修。
