---
title: 设置控制台补全 + 多平台消息通道
status: active
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（对 003 的迭代）
---

# 任务：设置控制台补全（7 项）+ 多平台消息通道（3 平台）

项目：~/development/harness-desktop
基于：001-003 已验收（Electron 壳 + adapter 隔离 + 自定义接入 + 官方风格 UI）

## 背景
当前设置页只有：引擎状态 / API Key（仅 DeepSeek）/ 工作区 / 默认模型 / 自定义接入。
本提示词把它升级为**完整控制台**，并新增**多平台消息通道**（不止 QQ）。

## 技术事实（已验证，开发前必读）
1. dsh API 信封：POST /api/<method>，{type:"client-request",rpcId,method,payload} → {type:"server-response",rpcId,result:{ok,value|error}}
2. 已确认可用方法：host.describe, session.list/create/history/prompt/cancel/rename, llm.providers/models, credentials.describe/set/unset, settings.describe/update/mutate, host.pickDirectory
3. dsh 原生能力（都有对应工具/服务）：
   - 定时提醒：schedule_create/schedule_list/schedule_delete 工具（支持延迟秒数、绝对时间 at、固定间隔 every≥5min）
   - 计划模式：ctx.planMode + exit_plan_mode 工具
   - 会话事件：user/message 入、assistant/* 出、tool/* 工具事件（assistant/message 自带 usage: TokenUsage）
   - 会话日志：session.history 拉全量，事件带 seq/time/surfaceOp
4. 记忆插件 harness-memory 已装（ctx.storageDomain 的 memories 表 + system-prompt section 注入）
5. 消息通道架构（参考 Hermes/OpenClaw gateway 模式）：
   - 入站：平台 Webhook/长轮询 → user/message 进 agent 会话（agent.followup()）
   - 出站：订阅 agent/* 事件 → 回复发回原平台
   - 每个平台一个独立 adapter 插件，共享一个 bot-gateway 网关
6. 锁 @deepseek-ai/dsh@0.1.0-rc.6 不变，adapter 隔离原则不变

---

## Part A：设置控制台补全（7 项）

### A1. 凭证统一管理（升级现有 API Key 区）
- 现在只有 DeepSeek 一个 key 输入框
- 改为：列出全部 provider 的凭据状态（已配置/未配置），每个可独立设置/更新/清除
- 实现：credentials.describe（查全部 refs 状态）→ 选中 provider → credentials.set/unset
- UI：provider 下拉 + key 输入 + 保存/清除按钮 + 状态徽标

### A2. 定时提醒 UI（新增"提醒"区）
- 列表显示已有提醒（schedule_list）
- 新建提醒表单：内容 + 触发方式（延迟秒数 / 绝对时间 / 固定间隔≥5min）
- 删除提醒（schedule_delete）
- 提醒触发时以用户消息进入会话

### A3. 记忆管理 UI（新增"记忆"区）
- 读取 harness-memory 插件的 memories 表（ctx.storageDomain）
- 显示记忆列表：内容 + 标签 + 时间，可搜索
- 操作：删除单条 / 手动添加 / 清空
- 说明文字：记忆会自动注入系统提示供跨会话召回

### A4. 计划模式开关
- 开关控件，控制当前会话计划模式（ctx.planMode 相关 API 或 exit_plan_mode 工具）

### A5. Web 搜索开关
- 开关 + provider 选择（web-search-deepseek 默认）
- 通过 settings 命名空间配置

### A6. 会话导出
- 设置页"会话"区：导出当前会话为 JSON / Markdown
- 实现：session.history 拉全量 → 主进程格式化 → 弹保存对话框（dialog.showSaveDialog）

### A7. 快捷键
- Electron Menu 注册：Cmd+N 新会话 / Cmd+, 打开设置 / Cmd+W 关闭窗口
- macOS 菜单栏显示应用名 harness-desktop

---

## Part B：多平台消息通道（3 平台第一批）

### B1. 架构（必须遵守）
```
dsh-bot-gateway（网关插件，统一注册/分发）
  ├─ dsh-bot-telegram   ← Telegram Bot API（Webhook 或长轮询）
  ├─ dsh-bot-qq         ← QQ 官方 Bot API
  └─ dsh-bot-discord    ← Discord Bot（WebSocket gateway）
```
- 每个平台一个独立 Cordis 插件，遵循"一切皆插件"原则
- 入站：平台消息 → 归一化成 UserMessage → agent.followup() 进会话
- 出站：订阅 agent/* 事件（assistant/message 等）→ 回复发回原平台
- 会话映射：平台 chatId ↔ dsh SessionId，存在 bot 自己的存储
- 新增平台只需复制 adapter 模板 + 改平台 API 调用，不改网关

### B2. Telegram（第一个实现，最标准）
- Bot Token 配置（设置页"消息通道"区输入）
- 用官方 Bot API（getUpdates 长轮询或 webhook）
- 支持：私聊/群聊消息 → 进会话 → 回复回原 chat
- 参考：Telegram Bot API 文档（标准 HTTP）

### B3. QQ（你有现成经验）
- 用 QQ 官方 Bot API（参考 Hermes 的 hermes-qqbot 实现，~/.hermes 下有可参考的配置）
- 支持私聊/群聊

### B4. Discord（第三个）
- Discord Bot Token + Gateway Intents（消息内容 intent）
- 支持私聊/频道

### B5. 设置页"消息通道"区
- 每个平台一个卡片：平台名 + 状态（未配置/已连接）+ Token 输入 + 保存/断开
- 连接状态实时显示（bot 是否在线）

---

## 技术约束（延续 001-003）
- adapter 隔离不变：renderer 只走 IPC，不碰 dsh wire 格式
- 锁 @deepseek-ai/dsh@0.1.0-rc.6
- 不引入重型 UI 库，延续现有 CSS 体系（--dsw-* token）
- TypeScript 严格模式，pnpm typecheck 零错误
- 新插件放 plugins/ 目录，遵循 dsh bundle 格式（cordis.patch.yml + package.json + index.js）
- 凭证安全：平台 token 走 dsh credentials（引用式存储），不写明文进 settings.yaml

## ❌ 不要做（反面，硬约束）
- **不要改 dsh 引擎核心** — 不 fork/魔改 @deepseek-ai/dsh 源码，引擎是黑盒底座
- **不要重写 adapter 隔离层** — 已有的 DshAdapter/DshClient 只增不改，renderer 永远不碰 dsh wire 格式
- **不要升级 dsh 版本** — 锁 0.1.0-rc.6 不动，npm 上不存在 rc.5
- **不要引入重型 UI 库** — 不加 Tailwind/MUI/AntD，延续手写 CSS + --dsw-* token
- **不要把平台 token 写进 settings.yaml / cordis.yml 明文** — 必须走 dsh credentials（引用式存储）
- **不要删除/破坏 harness-memory 现有实现** — 记忆插件是 001 验收过的，A3 只加 UI，不改插件核心逻辑
- **不要动 build/brand/ 品牌素材和 003 的 UI 结构** — 品牌区/左下角设置/转圈特效是 owner 钦定
- **不要一次性提交所有模块** — 按 Part A → B1+B2 → B3 → B4 → B5 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的功能不写进自测结果
- **不要加未在任务中的功能** — 只做 Part A + Part B 列出的项，不顺手"优化"无关代码
- **不要写明文密钥/打印 token 到日志** — 调试输出脱敏

## 验收标准（owner 实测）
1. 设置页有 7 个新区/升级区：凭证/提醒/记忆/计划/搜索/导出/快捷键，全部可操作
2. credentials 可对任意 provider 设置/清除 key，重启后保留
3. 创建一条定时提醒（如 60 秒后）→ 到时进入会话并触发 agent 处理
4. 记忆区能看到/删除/添加记忆，新记忆注入下次对话上下文
5. 会话导出 JSON/Markdown 文件可打开
6. Cmd+N / Cmd+, 生效
7. Telegram 配置 token 后：发消息 → agent 回复回 Telegram（核心验收）
8. QQ / Discord 至少一个完成配置可对话（另一个实现但可待验证）
9. pnpm typecheck 零错误，pnpm dev 正常启动

## 交付形式
- 分模块提交：Part A（A1-A7 可分批）→ Part B（B1 网关 + B2 Telegram → B3 QQ → B4 Discord → B5 UI）
- 每模块完成报告：改动文件、如何测试、自测结果、已知限制
- 每模块等 owner 验收后再继续
