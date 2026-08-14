---
title: 空状态首页加完整输入套件（输入框/工作区/模式/模型/发送）
status: done
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（对 005 的 ChatView 迭代）
completed: 2026-08-14（实现 + typecheck/build 通过，待 owner 实测验收）
---

# 任务：无会话首页（"开始对话"）下方加完整输入套件

项目：~/development/harness-desktop
基于：001-009 已验收

## 背景（用户明确需求）
当前没有会话时（sessionId 为 null），首页只显示：
```
🐋（WhaleLogo）
开始对话
点击左侧「新会话」创建一个会话，或在设置中选择工作区。
```
用户希望在这个页面**下方直接加完整输入套件**：
- 输入框
- 工作区选择
- 模式（agent preset）
- 模型区（provider + model 两级选择）
- 发送 UI（含附件按钮）

效果：用户**一打开应用就能直接输入对话**，不用先去左侧"新会话"——更开箱即用。

## 现状（已确认）
- src/components/ChatView.tsx：`sessionId === null` 时返回 `chat-empty`（只有 logo + 文字），
  后续 return 的完整界面（含 ChatInput）只在有 sessionId 时渲染
- src/components/ChatInput.tsx：**组件已完整**（输入框/模型两级/模式/工作区/附件/发送），
  只是没在空状态渲染。Props 需要：modelGroups, selection, onSelectModel, mode, onModeChange,
  workspaceCwd, onChangeWorkspace, attachments, onSend, disabled, apiKeyMissing, onOpenSettings
- MainView.tsx 已把需要的 props 传给 ChatView（sessionId, workspaceCwd, mode, onModeChange,
  onChangeWorkspace, apiKeyMissing, onOpenSettings, onTaskCreated, modelsTick）

---

## Part A：空状态页加输入套件

### A1. 布局
```
┌────────────────────────────────────────────┐
│              🐋（WhaleLogo 居中）            │
│              开始对话                        │
│        点击下方输入框直接开始，或左侧新建会话    │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │ [工作区 ▾] [模式 ▾] [模型 ▾]          │  │  ← 顶部工具条
│  │                                      │  │
│  │ [输入框..............................] │  │
│  │ [📎附件]              [发送 ▶]        │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### A2. 交互逻辑（关键）
- 空状态页的输入框**可输入、可选择**工作区/模式/模型/附件
- 用户点**发送**时：
  1. 自动调用 `harness.createSession(workspaceCwd)` 创建新会话
  2. 创建成功后跳转到该会话（MainView setActiveId + view 切 chat）
  3. 然后把消息发进新会话（ChatView 内部或由 MainView 协调）
- 行为等同"新建会话 + 立即发消息"的一步完成
- 如果未配置 API Key：发送时提示去设置（apiKeyMissing 已有，复用）

### A3. 实现建议
- 空状态分支渲染 `<ChatInput>`（复用现成组件，不新写）
- ChatView 新增 prop 或回调：`onFirstSend(text, attachments)`（在空状态时由 MainView 处理：
  createSession → setActiveId → 发送）
- 或者更简单：空状态页点击发送 → 调 MainView 的 startTask/createSession 流程
- 保证不破坏现有"左侧新建会话"路径（两种方式并存）

### A4. 样式
- 输入套件在空状态页垂直居中偏下，宽度与聊天界面一致（max-width 约 760px）
- 复用现有 ChatInput 样式 + chat-empty 容器调整
- 深色主题一致（--dsw-* token），无 emoji 新增

---

## ✅ 要做（正面）
1. 空状态页（sessionId=null）下方渲染完整 ChatInput 套件（输入框/工作区/模式/模型/附件/发送）
2. 空状态直接发送 = 自动创建会话 + 跳转 + 发消息（一步完成）
3. 工作区/模式/模型在空状态可选（和会话内一致）
4. 未配置 key 时发送给友好提示（去设置）
5. 保留左侧"新会话"原有路径
6. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要重写 ChatInput** — 组件已完整，直接复用
- **不要改 ChatInput 的会话内行为** — 只加空状态用法，不影响有会话时的逻辑
- **不要用 emoji** — 附件/发送用 CSS 形状或文字（延续 006 清理成果）
- **不要动 Brand/WhaleLogo/favicon** — logo 区不动
- **不要改 dsh 引擎核心 / 不要重写 adapter 隔离层 / 不要升级 dsh 版本（锁 rc.6）**
- **不要引入重型 UI 库**
- **不要删除 001-009 已实现功能**
- **不要一次性改太多文件** — 只动 ChatView（或 + MainView 协调逻辑）
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要做花哨动效**

## 验收标准（owner 实测）
1. 无会话首页显示：logo + "开始对话" + **完整输入套件**（输入框/工作区/模式/模型/发送）
2. 空状态直接输入文字 → 点发送 → **自动创建会话并进入聊天**，消息已发出
3. 空状态可切换工作区/模式/模型（与会话内一致）
4. 空状态可加附件
5. 左侧"新会话"路径仍正常
6. 未配置 key 时发送有提示
7. pnpm typecheck 零错误，pnpm dev 正常启动

## 交付形式
- 一次提交（改动集中在 ChatView + 必要的 MainView 协调）
- 完成后报告：改动文件、如何测试、自测结果、已知限制
- 等 owner 实测验收
