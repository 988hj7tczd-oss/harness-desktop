---
title: 会话窗口流式优化（乐观UI+打字机）+ webhook 回复回传
status: done
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 010 的 ChatView 部分（010 已验收功能保留）
completed: 2026-08-14（A 乐观UI+流式+思考指示完成，B webhook 同步回复端到端实测通过；桌面流式视觉待 owner 实测）
---

# 任务：会话窗口流式优化 + webhook 回复回传

项目：~/development/harness-desktop
基于：001-014 已验收

## 背景（端到端实测 + 用户反馈）
1. **端到端已跑通**（014 修复后实测）：webhook 发"1+1等于几？" → agent 真实回复
   "1+1等于2。" → turn completed。消息链路完全正常。
2. **用户反馈两个问题**：
   - 体验卡顿：发送消息时"自己的消息先发出去 → agent 才开始思考"，有空窗感，
     不像 Hermes/ChatGPT 那种打字机流式输出
   - 平台"接不通"：webhook 发消息后看不到回复——因为 webhooks adapter 的 send()
     是空实现（设计为入站专用），agent 回复没有回传给调用方

---

## Part A：会话窗口流式优化（用户体验核心）

### A1. 乐观 UI（用户消息立即上屏）
- 当前 src/components/ChatView.tsx sendMessage：`await harness.sendMessage(...)` 串行等待
- 改为：点击发送 → **立即把用户消息加入本地 chat state**（乐观渲染）→ 同时异步调 sendMessage
- 效果：发送瞬间消息就显示，无等待感
- 注意：dsh 的 user/message 事件回来时**去重**（避免重复显示乐观消息 + 事件消息）
  - 方案：乐观消息带临时 id，事件回来匹配替换，或本地只信乐观 + 事件用于流式

### A2. 流式回复（打字机效果，参考 Hermes）
- 当前：等 assistant/message 完整事件一次性显示
- 改为：订阅 **token 级/增量事件**：
  - 查 dsh 是否支持 streaming 事件（assistant/delta、message-partial、content-delta 之类）
  - 查法：~/.dsh-src 搜 `streaming`、`delta`、`partial`，或看 adapter 的 SessionStreamEvent
    有哪些 type；从 web-app / packages/client 看官方前端怎么渲染流式
  - 若 dsh 有增量事件：ChatView 订阅后逐字 append 到当前 assistant 消息
  - 若 dsh 只有完整事件：至少做到"assistant/message 到达后立即渲染 + 后续
    tool 调用卡片即时更新"，并加"思考中…"指示（不空等）
- 渲染：assistant 消息区显示打字机光标（CSS 闪烁竖线，不用 emoji）

### A3. 发送状态与停止
- 发送中：输入框禁用 + 按钮变"停止生成"（可取消当前 turn，已有 cancelTurn）
- agent 思考中：显示"思考中…"指示（CSS 动画，不用 emoji）
- tool 调用中：工具卡即时显示（tool/call 事件 → 卡片，done/result 更新状态）

### A4. 不破坏现有功能
- 任务面板（onTaskCreated）照常
- 复盘（reviewTask）照常
- 空状态一步创建会话（sendFromEmpty）照常
- 历史加载、会话切换照常

---

## Part B：webhook 回复回传（平台通道可见化）

### B1. 现状
- plugins/dsh-bot-webhooks/index.js 的 send() 是空实现（注释"入站专用"）
- gateway session/event → adapter.send 被调用但什么都不做 → 调用方看不到回复

### B2. 方案：同步回复模式（request-response）
- POST /webhook/<token> 请求**挂起等待** agent 回复后返回结果：
  - 入站时注册 pending 回调（按 chatId 存 Promise resolve）
  - 出站 adapter.send(chatId, text) 时 resolve 对应 pending
  - 响应格式：`{"ok":true, "reply": "<agent回复>"}`
- 超时：如 60s 无回复返回 `{"ok":true, "reply": "", "timeout": true}`
- 或异步模式：加 query 参数 `?async=1` → 立即返回 200（当前行为），回复通过
  配置的回调 URL POST（可选 WEBHOOKS_CALLBACK_URL）

### B3. 保持向后兼容
- 默认行为可选：保持当前"立即返回 200"（异步），加 `?wait=1` 或默认等回复？
  - 建议：默认等回复（curl/脚本体验好），`?async=1` 立即返回
  - 或默认异步（兼容现有），`?wait=1` 等回复
  - **二选一，owner 拍板或 codex 选合理默认 + 报告**
- 空 token 路径（未配置 token）同样生效

---

## ✅ 要做（正面）
1. A：乐观 UI（消息立即上屏 + 去重）
2. A：流式回复（增量事件逐字渲染 / 或至少即时渲染 + 思考指示）
3. A：发送状态（停止生成按钮 + 思考中指示 + 工具卡即时）
4. B：webhook 同步回复（等 agent 回复返回，或 wait 参数控制）
5. B：超时处理 + 保持异步兼容
6. 保留 001-014 全部功能
7. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要重写 adapter 隔离层**
- **不要猜 dsh 流式事件** — 查 ~/dsh-src 源码确认事件类型，不发明
- **不要引入重型 UI 库**（打字机用 CSS/React 实现，不引 framer-motion 等）
- **不要破坏乐观消息与事件消息的去重** — 重复显示是体验 bug
- **不要破坏任务面板/复盘/空状态创建/历史加载**
- **不要用 emoji / 不动 Brand/WhaleLogo**
- **不要删除 001-014 已实现功能**
- **不要一次性提交所有 Part** — A → B 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥/打印 token 到日志**

## 验收标准（owner 实测）
1. 发送消息 → 用户消息**立即上屏**（无等待感）
2. agent 回复**流式逐字出现**（或至少即时显示 + 思考指示，不空窗）
3. 发送中显示"停止生成"，点击可取消
4. 工具调用显示卡片，状态即时更新
5. curl POST webhook 发消息 → **响应里带 agent 回复**（`{"ok":true,"reply":"..."}`）
6. 超时/异步模式行为正确
7. 乐观消息不重复显示（关键）
8. 任务面板/复盘/空状态创建正常
9. pnpm typecheck 零错误，pnpm dev 正常启动
10. 全界面无新增 emoji

## 交付形式
- 分 Part 提交（A → B），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
