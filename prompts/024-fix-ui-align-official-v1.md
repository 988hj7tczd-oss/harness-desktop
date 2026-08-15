---
title: 修复 5 问题（重复会话/思考状态）+ UI 全面参考官方 web 版
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 023 的部分 UI 实现（023 功能保留，布局/状态修复）

# 任务：修复 5 个体验问题 + UI 对齐官方 web 版

项目：~/development/harness-desktop
基于：001-023 已验收

## 背景（owner 实测反馈 5 个问题）
1. **一条消息出现两个会话**（发了"你好"，列表/界面出现两个会话）
2. **会话轨迹布局要参考官方 web 版**（现在是自创的，不好看）
3. **轨迹 hover 也要有操作**（复制/编辑/重新生成 在轨迹节点上）
4. **思考完成仍显示"思考中"+ 左侧会话标签转圈不停**（状态没结束）
5. **整体 UI 布局/会话气泡没参考官方 web 版**

## 官方参考（已确认源码位置 + 用户已打开官方 UI 可对照）
- 官方 web 正在运行：http://127.0.0.1:3080（可直接对照视觉）
- 官方轨迹组件：~/dsh-src/packages/client/ui-trajectory/src/client/
  - TrajectoryTable.tsx（KIND_LABEL: SYSTEM/USER/CONTEXT/COMPACTED/MESSAGE/TOOL/SUBTOOL
    + 虚拟滚动 + JsonTree + MarkdownText + diff）
  - TrajectoryCell.tsx（Tag 分类 + formatElapsedSeconds）
- 官方布局：~/dsh-src/packages/client/ui-layout/src/client/AppFrame.tsx
  - **三栏框架**：sidebar | center(conversation) | details
  - 拖拽手柄调宽（DragHandle：pointer capture + rAF throttle）
  - SIDEBAR_AUTO_COLLAPSE / SIDEBAR_DEFAULT（侧栏自动折叠）
- 官方会话：~/dsh-src/packages/client/ui-conversation/src/client/chat/
  - MessageItem.tsx（**用户消息右对齐 + clock + copy IconActions**；assistant 带分支）
  - MessageIconActions.tsx（官方操作按钮组件）
  - ReasoningRow.tsx（思考行组件）
  - ChatView.tsx / AssistantMarkdown.tsx / ContextBody.tsx
- 官方原语：~/dsh-src/packages/client/ui-primitives/（StateDot/JsonBlock/MessageText/MarkdownText/Tooltip）
- 官方主题 token：已有 --dsw-*（003 提取，193 个）

---

## Part A：修复重复会话（问题 1）

### A1. 排查方向（已确认线索）
- ChatView onEditMessage/onRegenerate 都调 onTaskCreated + sendMessage（不新建会话）
- tasks.ts startTask 只创建任务记录（不建会话）
- 引擎 session.list 4 个会话无重复标题
- **可能**：①侧栏渲染重复（同一 session 两行）②编辑/重发触发了引擎新会话
  （sendMessage 参数问题）③空状态 sendFromEmpty 与正常发送路径冲突

### A2. 修复
- 侧栏会话列表去重（按 sessionId 唯一）
- sendMessage 不额外创建会话（确认 dsh sendMessage 语义）
- 编辑/重新生成复用同一会话（不新建）
- 空状态发送只建一次会话
- 验证：发一条消息 → 侧栏只有 1 个新会话

---

## Part B：修复思考状态不结束（问题 4）

### B1. 根因
- adapter/events.ts 208 行 `turn/end → running:false` 存在
- 但 UI 显示"思考中"不消失 + 侧栏转圈不停 → running 事件链断了
- 可能：turn-end 事件没被 reducer 消费，或 events 归一化遗漏

### B2. 修复
- 确认 turn-end → { kind:'running', running:false } 推送链路完整
- chatReducer 处理 turn-end 时：streaming 消息落定 + running:false
- 侧栏：running false 时转圈停止（session 状态驱动）
- 验证：发消息 → 思考中显示 → 回复完成 → 思考中消失 + 转圈停

---

## Part C：轨迹参考官方布局（问题 2 + 3）

### C1. 官方风格要点（对齐 ui-trajectory）
- **表格/时间线结构**：按 turn 分组，每 turn 是折叠块，展开显示节点序列
- **节点类型标签**（KIND_LABEL 风格）：USER / ASSISTANT / TOOL / STEP / REASONING
- **每节点**：类型标签（彩色 tag）+ 内容预览 + 耗时（formatElapsedSeconds 格式）
- **工具节点**：JsonTree 风格展示参数/结果（JSON 树，可折叠）
- **思考节点**：MarkdownText 渲染 reasoning
- **虚拟滚动**：长轨迹不卡（参考 @tanstack/react-virtual 或简单窗口化）
- **颜色**：用 --dsw-* token + 官方 tag 配色（参考 TrajectoryCell.module.css）

### C2. 轨迹节点操作（问题 3）
- 轨迹节点 hover 操作：
  - 复制节点内容（工具参数/思考文本/步骤摘要）
  - 用户消息节点：编辑（同聊天区编辑逻辑）
  - 工具节点：查看完整参数/结果（展开）
- 复用聊天区的复制/编辑逻辑（MessageBubble 的 copy/edit）

---

## Part D：UI 全面参考官方 web 版（问题 5）

### D1. 会话气泡（重点，参考 ui-conversation MessageItem）
- 参考官方 MessageItem.tsx 的结构：
  - **用户消息：右对齐** + 浅色背景气泡（官方配色）+ 时间 + copy 操作（IconActions）
  - **agent 消息：左对齐** + 官方浅灰背景（不是现在的纯边框卡片）
  - 思考行：参考 ReasoningRow.tsx（紧凑一行，非大标签）
  - markdown 渲染：参考 AssistantMarkdown.tsx（代码块/表格/列表样式对齐官方）
  - 消息操作：参考 MessageIconActions.tsx（copy/编辑/重新生成 图标按钮布局）
  - 状态点：参考 StateDot（思考/完成/错误 小圆点）

### D2. 布局对齐（参考 ui-layout AppFrame）
- 三栏框架：sidebar | center(conversation) | details
  - sidebar：会话列表（当前已有）+ 官方风格（hover 高亮/选中态/操作）
  - center：聊天区（气泡 + 输入区）
  - details：可选右栏（轨迹/详情）——**轨迹面板移到右侧 details 栏**
    （对齐官方：轨迹不是抽屉弹层，是三栏中的 details 列）
- 拖拽手柄：sidebar 与 details 可拖拽调宽（参考 DragHandle）
- 侧栏自动折叠：窄窗口时 sidebar 自动折叠（参考 SIDEBAR_AUTO_COLLAPSE）
- 输入区：参考官方（工具条 + textarea + 发送，Enter 发送/Shift+Enter 换行）

### D3. 实现方式
- 不引入官方包依赖（保持独立）——**参考风格 + 用现有 --dsw-* token 实现**
- 核心：视觉对齐（配色/间距/圆角/字体/布局结构），不是照抄组件代码
- 对照：官方 web http://127.0.0.1:3080 实时对照

---

## ✅ 要做（正面）
1. A：重复会话修复（去重 + 不新建）
2. B：思考状态结束（running:false 链路补全）
3. C：轨迹按官方 ui-trajectory 风格重做（表格/标签/JsonTree/虚拟滚动）+ 节点操作
4. D：UI 全面参考官方（气泡/布局/输入区/侧栏）
5. 保留 001-023 全部功能
6. 纯文字/CSS/SVG，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要直接引入官方包**（@deepseek-ai/dsh-client-ui-*）— 参考风格，保持独立
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要重写 adapter 隔离层**
- **不要删除 001-023 已实现功能**（023 的复制/编辑/重新生成逻辑保留，只改样式/修复）
- **不要用 emoji**
- **不要动 Brand/WhaleLogo**
- **不要一次性提交所有 Part** — A → B → C → D 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / pnpm test / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥到日志**

## 验收标准（owner 实测）
1. 发一条消息 → 侧栏只有 1 个会话（无重复）
2. 思考完成 → "思考中"消失 + 左侧转圈停止
3. 轨迹按官方风格（类型标签/耗时/JsonTree）+ 节点 hover 可复制/展开
4. 会话气泡参考官方（用户右/agent 左 + 官方配色 + markdown 增强）
5. 整体布局视觉对齐官方 web 版
6. pnpm typecheck 零错误 + pnpm test 全绿 + pnpm dev 正常
7. 全界面无新增 emoji

## 交付形式
- 分 Part 提交（A → B → C → D），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
