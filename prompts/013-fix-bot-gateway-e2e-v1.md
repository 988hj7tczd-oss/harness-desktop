---
title: 修复 bot-gateway 2 个致命 bug（webhooks 空token + workspace 注册）+ 端到端验收
status: done
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 009 的 bot-gateway 部分（009 已验收功能保留）
completed: 2026-08-14（A/B 修复 + 端到端入站/agent/会话复用实测通过；任务/记忆链路待真实 key 后 owner 验收）
---

# 任务：修复 bot-gateway 致命 bug + 跑通端到端消息闭环

项目：~/development/harness-desktop
基于：001-012 已验收

## 背景（端到端验收实测发现 2 个致命 bug）
用 Webhooks 通道做端到端验收（POST /webhook/<token> 模拟平台消息）：
- ✅ Webhooks 服务监听 8899
- ✅ 消息进来 → gateway 收到（handleInbound）
- ✅ 会话创建成功（session-1 出现在 session.list）
- ❌ **agent 附加失败 → handleInbound 返回 false → HTTP 500 "not enqueued" → 消息没进 agent 循环**

**影响：所有平台（Telegram/QQ/微信/飞书/钉钉…）消息进来后 agent 都不会真正干活，
消息通道=摆设。这是当前最高优先级。**

---

## Part A：修复 Bug 1 —— webhooks 空 token 永远 404

### A1. 问题
plugins/dsh-bot-webhooks/index.js 的 token 校验：
```js
if (req.method !== 'POST' || parts[0] !== 'webhook' || parts.length < 2 || parts[1] !== token) {
  res.writeHead(404)
}
```
- 未配置 WEBHOOKS_TOKEN 时 token=''，则：
  - `/webhook/` → split + filter(Boolean) 后 parts=['webhook']（1 段）→ parts.length<2 → 404
  - `/webhook/xxx` → parts[1]='xxx' !== '' → 404
- **空 token = 永远 404，webhook 不可用**

### A2. 修复
- token 为空时**跳过 token 校验**（允许任意/单段路径）：
  ```js
  const tokenOk = !token || parts[1] === token
  if (req.method !== 'POST' || parts[0] !== 'webhook' || !tokenOk) { ... 404 }
  ```
- 若 token 为空且路径只有 1 段（/webhook），直接接受；有多段（/webhook/xxx）也接受（忽略段值）
- 保留：token 配置后必须匹配（安全不降级）
- 日志：监听时提示"未配置 token，入站开放"（info 级）

---

## Part B：修复 Bug 2 —— 未注册 workspace 就建会话/agent（致命）

### B1. 问题
plugins/dsh-bot-gateway/index.js 的 handleInbound：
```js
const created = ctx.sessions.create(undefined, {...})  // ← 未注册 workspace
...
await ctx.agents.create({ sessionId, ... })  // ← agent 附加失败
```
- dsh 的 session.create/agent.create **需要先有 workspace**（实测 session.create 返回
  `workspace-not-found: workspace "x" not found`）
- gateway 直接 ctx.sessions.create(undefined, ...) 跳过了 workspace 注册
- → agent 附加失败 → handleInbound 返回 false → 消息不干活

### B2. 修复（参考 dsh 正确用法）
- 入站处理前，确保 workspace 已注册/复用：
  - 查 dsh workspaceRegistry API（`ctx.workspaceRegistry`，见 ~/dsh-src/packages/workspace/）：
    - 有 `ensure`/`get`/`create` 之类的方法？优先用官方提供的方式
    - 或调用 API 代理层（host.describe 返回 cwd，web-app 会话创建走什么路径？）
  - gateway 的 workspaceCwd 配置：有值 → 注册/复用该 cwd 的 workspace；空 → 用 host cwd（host.describe 的 cwd）
- 或者：**完全复用 dsh 官方 session 创建路径**（web-app/前端调用 session.create 的正确方式——
  从 ~/dsh-src/apps/web 或 packages/client 看前端怎么建会话，gateway 照抄）
- 关键：create 成功后再 ctx.agents.create/createAgent，agent 能 get 到

### B3. 验证方式
- 修完重启 → POST /webhook/<token> 发"你好" → 应返回 {ok:true}（不再 500）
- 引擎日志应显示 agent 创建成功 + 消息入队

---

## Part C：端到端验收（修复后跑通闭环）

### C1. 验收步骤（owner/助手实测）
```
1. pnpm typecheck 零错误
2. pnpm dev 启动，记录 dsh 随机端口 + webhook 端口（默认 8899）
3. 配置 WEBHOOKS_TOKEN（credentials.set，或 UI 保存）
4. curl POST /webhook/<token> {"text":"你好，请用一句话介绍你自己"}
   → 期望 HTTP 200 {ok:true}（不再 500）
5. 观察引擎日志：agent 创建 → 消息入队 → 开始处理
6. 等待 agent 回复（真实 LLM 调用 DeepSeek）
7. 检查：webhook 出站是否有回复（gateway session/event → adapter.send）
8. 任务面板出现任务卡（ChatView/MainView 的 onTaskCreated）
9. 任务完成后自动复盘 → 记忆入库（harness-memory storageDomain）
10. 再次 POST 消息 → 同一会话复用（session_map 生效）
```

### C2. 验收通过标准
- [ ] webhook 入站返回 200 ok（不再 not enqueued）
- [ ] agent 真实回复（引擎日志可见 assistant/message）
- [ ] 连续两条消息在同一会话（session_map 复用）
- [ ] 任务面板有任务记录
- [ ] 记忆库有复盘条目（harness-memory）

### C3. 若 Part B 修复遇阻（workspace API 不确定）
- 不要瞎猜 API，先查：
  - ~/dsh-src/packages/workspace/workspace/src/（workspaceRegistry 方法）
  - ~/dsh-src/apps/web 或 packages/client（前端 session.create 的真实调用）
  - 或直接问：host.describe 的 cwd + workspace 注册方式
- 把查到的正确 API 用法写进实现，不靠猜

---

## ✅ 要做（正面）
1. A：webhooks 空 token 跳过校验（安全不降级：配置后必须匹配）
2. B：gateway 入站前确保 workspace 注册/复用，agent 附加成功
3. B：参考 dsh 官方 session/agent 创建路径（不自己发明）
4. C：修复后跑通端到端闭环（webhook 入站 → agent 回复 → 任务 → 记忆）
5. 保留 001-012 全部功能
6. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要重写 adapter 隔离层**
- **不要自己发明 workspace/session API** — 以 ~/dsh-src 源码为准，查准再写
- **不要引入重型 UI 库 / 不用 emoji / 不动 Brand/WhaleLogo**
- **不要删除 001-012 已实现功能**
- **不要一次性提交所有 Part** — A → B → C 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥/打印 token 到日志**
- **不要只修一个 bug 就报完成** — 两个 bug + 闭环验证都过才算

## 验收标准（owner 实测）
1. 未配置 WEBHOOKS_TOKEN 时，POST /webhook/ 直接可用（HTTP 200）
2. 配置 token 后，POST /webhook/<token> 可用，错误 token 404
3. 入站消息 → agent 真实回复（引擎日志可见，或 webhook 出站收到）
4. 连续消息在同一会话（不复建）
5. 任务面板有任务 + 记忆库有复盘条目
6. pnpm typecheck 零错误，pnpm dev 正常启动
7. 所有平台（Telegram/QQ/微信…）的入站路径已修（同一 handleInbound）

## 交付形式
- 分 Part 提交（A → B → C），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
