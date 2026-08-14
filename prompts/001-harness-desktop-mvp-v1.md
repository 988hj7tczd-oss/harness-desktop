---
title: harness-desktop MVP（开箱即用版）
status: active
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
scope: 桌面壳 + 极简UI + 记忆/消息插件
---

# 项目名：harness-desktop（GitHub/npm 均无撞名，已查证）

# 任务：为 DeepSeek Harness (dsh) 构建桌面端应用

## 背景
DeepSeek Harness 是 DeepSeek 官方开源 agent 框架（MIT 协议，v0.1.0-rc.5），
核心架构"一切皆插件"。它自带 Web UI（React SPA，默认 127.0.0.1:3080），
但 UI 复杂、面向开发者。我们要做的是一个**面向普通用户的开箱即用桌面端**。

## 边界（铁律，不可越界）
- ✅ 做：Electron 桌面壳、自研极简 UI、记忆插件、消息通道插件、首启向导、锁版本
- ❌ 不做：修改 dsh 引擎核心、fork/魔改 dsh 源码、重写 agent 循环/工具
- 定位：dsh 引擎是黑盒底座（能力全保留），外层包"普通人能用的壳 + 界面 + 插件"

## 已验证的技术事实（开发前必须遵守）
1. 服务启动：`dsh web` 启动本地服务于 http://127.0.0.1:3080，默认端口可配置
2. API 契约：POST /api/<method>，JSON-RPC 信封格式：
   请求 {"type":"client-request","rpcId":"<id>","method":"<name>","payload":{}}
   响应 {"type":"server-response","rpcId":"<id>","result":{"ok":true,"value":{...}}}
3. 已确认可用的方法：host.describe, settings.describe, session.list
   （host.describe 实测返回 {version, cwd, provider, model, attachedSessions, canOpenPath}）
4. 前端通过 HTTP POST + WebSocket（events.mux）与后端通信
5. 运行时要求：Node.js >= 22.19（已实测 v26 可用），包管理 pnpm
6. dsh 官方明示 rc 期会有 breaking changes —— 必须锁定 @deepseek-ai/dsh@0.1.0-rc.5，
   不得使用最新版

## 产品需求
1. **开箱即用**：用户下载安装后双击即用，无需命令行、无需装 Node
2. **简单易上手**：UI 为极简聊天风格（参考 ChatGPT/豆包），不是 Harness 原版复杂界面
3. **首次启动向导**：3 步引导——选择模型提供商 → 输入 API Key → 选择工作区文件夹
4. **核心界面**：会话列表 + 聊天窗口 + 模型切换下拉 + 设置入口
5. **不重写引擎**：所有 agent 能力（工具调用/文件读写/代码执行/子代理）由 dsh 引擎提供，
   桌面端只做 UI 层 + 进程管理，通过 /api 调用

## 技术方案要求
1. Electron 桌面壳（不追求轻量化，功能优先），主进程内嵌/管理 dsh 服务进程：
   - 自动启动 dsh、管理随机回环端口、就绪检测（轮询 host.describe 直到 ok:true）
   - 退出时优雅终止 dsh 子进程
   - 用户数据（会话/插件/配置）存应用目录外，升级不丢数据
2. 前端：React（或 Vue），自研极简 UI，不加载 dsh 自带 Web UI
3. 后端通信：封装 adapter 层（隔离 dsh API 变更），UI 只调 adapter
4. 打包：electron-builder，产出 macOS dmg + Windows exe
5. 所有 dsh 依赖锁死 0.1.0-rc.5

## 分阶段交付
- Phase 0：Electron 壳 + dsh 进程管理 + adapter 骨架
- Phase 1：极简 UI：首启向导 + 会话列表 + 聊天窗口 + 设置（模型/key/工作区）
- Phase 2：记忆插件 dsh-memory：ctx.storage 存记忆 + system-prompt section 注入
- Phase 3：打包分发（dmg + exe）

## 验收标准（owner 实测，不是自报）
- macOS 上 `pnpm dev` 能一键启动桌面端并进入聊天界面
- 配置 DeepSeek API Key 后能真实对话（走 dsh 引擎）
- 首启向导完整可走通，不出现命令行界面
- adapter 层独立成模块，dsh 上游变更只改 adapter
- 桌面端退出后 dsh 子进程无残留
- 每完成一个 Phase 需交付可运行产物 + 自测说明，等待 owner 验收

## 交付形式
- 代码直接写入本仓库（~/development/harness-desktop/）
- 完成后报告：完成哪些 Phase、如何启动、自测结果、已知限制
