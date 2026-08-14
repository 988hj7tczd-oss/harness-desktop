# harness-desktop

> 开箱即用的 DeepSeek Harness 桌面客户端 · Out-of-the-box desktop client for DeepSeek Harness

[![License: MIT](https://img.shields.io/badge/License-MIT-171513.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/988hj7tczd-oss/harness-desktop?style=social)](https://github.com/988hj7tczd-oss/harness-desktop)

**harness-desktop** 把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（官方开源 agent 框架）包装成**面向普通用户的开箱即用桌面应用**。下载安装、双击即用，无需命令行、无需配置环境。

DeepSeek Harness (dsh) 的完整 agent 能力（工具调用、文件读写、代码执行、子代理、MCP、沙箱）全部保留，外层提供极简聊天界面 + 首次启动向导。

## ✨ 特性

- 🖥️ **桌面应用**：macOS / Windows，双击即用
- 🚀 **开箱即用**：自动启动引擎，无需 Node.js / 命令行
- 🎯 **简单易上手**：极简聊天界面，3 步首启向导（选模型 → 填 Key → 选工作区）
- 🧠 **持久记忆**：跨会话记住用户偏好与上下文
- 💬 **多平台消息**：连接 Telegram / QQ 等通道
- 🔌 **引擎全能力**：保留 dsh 全部 agent 能力（工具/代码/子代理/MCP/沙箱）

## 🚀 快速开始

> 开发预览期，安装包即将发布

```bash
# 开发模式
pnpm install
pnpm dev
```

## 🧱 技术栈

- **引擎**: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `@deepseek-ai/dsh@0.1.0-rc.5`（MIT）
- **桌面壳**: Electron + electron-builder
- **前端**: React + TypeScript

## 📦 当前状态

- [x] 项目立项 / 方案定稿（2026-08）
- [x] dsh API 契约验证（host.describe / settings.describe / session.list）
- [ ] Phase 0: Electron 壳 + 进程管理 + adapter 骨架
- [ ] Phase 1: 极简 UI（首启向导 + 会话 + 设置）
- [ ] Phase 2: 记忆插件 dsh-memory
- [ ] Phase 3: 打包分发

## 🛠 开发

```bash
git clone https://github.com/988hj7tczd-oss/harness-desktop.git
cd harness-desktop
pnpm install
pnpm dev
```

## ⚠️ 说明

- 本仓库为**社区独立开发**，与 DeepSeek 官方无附属关系
- 非官方桌面端，商标归各所有者
- dsh 处于 rc 预览期，本项目锁定 `0.1.0-rc.5` 版本

## 📄 License

[MIT](LICENSE)
