# harness-desktop

> 开箱即用的 DeepSeek Harness 桌面客户端 · Out-of-the-box desktop client for DeepSeek Harness

[![License: MIT](https://img.shields.io/badge/License-MIT-171513.svg)](LICENSE)

**harness-desktop** 把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（官方开源 agent 框架）包装成**面向普通用户的开箱即用桌面应用**。下载安装、双击即用，无需命令行、无需配置环境。

DeepSeek Harness (dsh) 的完整 agent 能力（工具调用、文件读写、代码执行、子代理、MCP、沙箱）全部保留，外层提供极简聊天界面 + 首次启动向导。

## ✨ 特性

- 🖥️ **桌面应用**：macOS dmg + Windows exe，双击即用
- 🚀 **开箱即用**：自动启动引擎，无需 Node.js / 命令行
- 🎯 **简单易上手**：极简聊天界面，3 步首启向导（选模型 → 填 Key → 选工作区）
- 🧠 **持久记忆**：跨会话记住用户偏好与上下文（`dsh-memory` 插件）
- 🔌 **引擎全能力**：保留 dsh 全部 agent 能力（工具/代码/子代理/MCP/沙箱）

## 🚀 快速开始

```bash
# 开发模式
pnpm install
pnpm dev
```

## 🧱 技术栈

- **引擎**: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `@deepseek-ai/dsh@0.1.0-rc.6`（MIT，锁版本）
- **桌面壳**: Electron 43 + electron-builder
- **前端**: React 18 + TypeScript + Vite
- **隔离层**: `adapter/` 独立模块封装 dsh API，上游变更只改 adapter

## 📦 当前状态

- [x] 项目立项 / 方案定稿（2026-08）
- [x] dsh API 契约验证（host.describe / settings.describe / session.list）
- [x] Phase 0: Electron 壳 + 进程管理 + adapter 骨架
- [x] Phase 1: 极简 UI（首启向导 + 会话 + 设置）
- [x] Phase 2: 记忆插件 dsh-memory
- [x] Phase 3: 打包分发（macOS dmg + Windows exe）
- [ ] owner 实测（真实 API Key 对话）待验收

## 🛠 开发

```bash
git clone <repo> && cd harness-desktop
pnpm install
pnpm dev        # 开发模式：vite + electron
pnpm build      # 构建 renderer + main
pnpm dist       # 打包 macOS dmg + Windows exe（输出到 out/）
pnpm typecheck  # TS 类型检查
```

## 📁 目录结构

```
harness-desktop/
├── adapter/            # dsh API 隔离层（唯一感知 dsh wire 协议的模块）
│   ├── dsh-client.ts   # JSON-RPC 信封 + WebSocket 事件流
│   ├── events.ts       # dsh 事件 → 稳定词汇归一化
│   └── index.ts        # 高层的稳定 API
├── electron/           # 主进程
│   ├── main.ts         # 应用生命周期 / 优雅退出
│   ├── dsh-manager.ts  # dsh 子进程管理（随机端口 / 就绪检测 / 无残留退出）
│   ├── profile-setup.ts# 首启 profile 初始化 + 记忆插件安装
│   └── ipc.ts          # IPC 桥（renderer ↔ adapter）
├── plugins/
│   └── harness-memory/ # dsh-memory 记忆插件（ctx.storage + system-prompt section）
├── shared/types.ts     # IPC 契约（renderer 只依赖这里的稳定类型）
├── src/                # React 渲染进程
└── scripts/            # 构建钩子
```

## 🔌 架构要点

- **铁律**：不修改 dsh 引擎、不 fork 源码。dsh 是黑盒底座，通过 `/api` 调用。
- **进程管理**：`dsh web --port 0` 随机回环端口；轮询 `host.describe` 直到就绪；退出时 SIGTERM → SIGKILL，保证无残留。
- **用户数据**：`DSH_HOME` 指向系统用户数据目录（macOS: `~/Library/Application Support/harness-desktop/dsh-home`），升级不丢数据。
- **锁版本**：`@deepseek-ai/dsh` 精确锁定 `0.1.0-rc.6`（npm 上无 rc.5 发布，取当前可用版本）。

## ⚠️ 说明

- 本仓库为**社区独立开发**，与 DeepSeek 官方无附属关系
- 非官方桌面端，商标归各所有者
- dsh 处于 rc 预览期，本项目锁定具体 rc 版本

## 📄 License

[MIT](LICENSE)
