---
title: 修复 bot-gateway Bug 3（agent 缺 model）+ 端到端闭环验收完成
status: done
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 013 的 bot-gateway 部分（013 已验收功能保留）
completed: 2026-08-14（Bug 3 修复 + 端到端入站/模型变量/turn 到 LLM/会话复用实测通过；真实回复待真实 key 后 owner 验收）
---

# 任务：修复 bot-gateway Bug 3（创建 agent 未传 model）+ 跑通端到端闭环

项目：~/development/harness-desktop
基于：001-013 已验收

## 背景（013 审查实测发现 Bug 3）
013 修复了 webhooks 空 token（Bug 1）和 workspace 注册（Bug 2）后，
端到端测试已到最后一环，但 agent 报错：

```
事件流：turn/start → step/start → user/message → step/end → turn/end
错误：prompt variable "{{model}}" has no value for this assembly
      (section "deployment:persona")
```

**根因**：gateway 创建 agent 时没传 `agentOptions: { provider, model }`，
dsh 的 system prompt 模板 `{{model}}` 变量无值 → prompt 组装失败 → turn 报错。
**影响：所有平台（Telegram/QQ/微信/飞书/钉钉/Webhooks/Slack/Email）消息进来，
agent 都无法生成回复。这是消息通道最后一环的致命 bug。**

## 现状（已确认）
- plugins/dsh-bot-gateway/index.js 的 handleInbound：
  ```js
  await ctx.agents.create({
    sessionId: `session-${randomUUID()}`,
    meta: { cwd },
  })
  // ← 缺 agentOptions: { provider, model }
  ```
- dsh CreateAgentOptions 支持 `agentOptions?: AgentOptions`：
  ```ts
  // ~/dsh-src/packages/core/agent/src/runtime-types.ts:24
  interface AgentOptions {
    provider?: string   // 必须有注册的 adapter
    model?: string      // provider 解释的模型 id
    maxTokens?: number
  }
  ```

---

## Part A：修复 Bug 3 —— gateway 创建 agent 传 model

### A1. 配置来源（选择其一，推荐方案 1+2 组合）
1. **gateway Config 加 model/provider 配置**（最直接）：
   ```ts
   export const Config = z.object({
     workspaceCwd: z.string().default(''),
     // 新增：
     provider: z.string().default(''),   // 空 = 用 dsh 全局默认
     model: z.string().default(''),      // 空 = 用 dsh 全局默认
   })
   ```
   - 设置页「消息通道」区可配（或先默认空，用 dsh 全局配置兜底）
2. **读 dsh 全局模型配置**：如果 gateway 没配，从 dsh 配置/`host.describe` 的
   provider/model（实测返回 `deepseek-official` + `deepseek-v4-flash`）取默认值
3. **复用桌面端已选模型**：ChatView 有 selectModel（用户选的），但那是会话级——
   平台新会话建议走 1 或 2（更稳）

### A2. 实现
- gateway 创建 agent 时传：
  ```js
  await ctx.agents.create({
    sessionId: `session-${randomUUID()}`,
    meta: { cwd },
    agentOptions: {
      provider: config.provider || defaultProvider,  // 兜底 dsh 全局
      model: config.model || defaultModel,
    },
  })
  ```
- 两处都要改：首次创建（handleInbound 新映射）+ 后续附加 agent 的分支
- 若 provider/model 都为空：尝试从 dsh 全局取（host.describe 或配置文件），
  取不到时**明确报错**（不要静默创建无模型的 agent）

### A3. 验证
- 修完重启 → POST /webhook/<token> 发"你好" → 应看到：
  - turn/end reason 不再是 error
  - assistant/message 出现真实回复（DeepSeek 调用）
  - webhook 出站回调 adapter.send（gateway session/event 监听）

---

## Part B：端到端闭环验收完成

### B1. 验收步骤（修复后完整跑通）
```
1. pnpm typecheck 零错误
2. pnpm dev 启动，记录 dsh 端口 + webhook 8899
3. 确保 WEBHOOKS_TOKEN 已配置（credentials.set 或 UI）
4. POST /webhook/<token> {"text":"你好，请用一句话介绍你自己"}
   → HTTP 200 {ok:true}
5. 等待 agent 真实处理（DeepSeek 调用，约 10-30 秒）
6. 查 session.history：
   - turn/end reason = completed（不是 error）
   - assistant/message 有文本回复
7. 连续发第二条消息 → 同一会话复用（session_map 生效，不复建）
8. 桌面端任务面板出现任务卡（onTaskCreated）
9. 任务完成后自动复盘 → 记忆入库（harness-memory）
```

### B2. 验收通过标准
- [ ] webhook 入站 200，agent 真实回复（assistant/message 有文本）
- [ ] turn/end 是 completed 不是 error
- [ ] 连续消息同会话复用
- [ ] 任务面板有任务记录
- [ ] 记忆库有复盘条目
- [ ] 桌面端 UI 能看到平台会话（如果会话列表接了）

### B3. 若还有新问题
- 如实记录报错（完整 message + code），不掩盖
- 先查 ~/dsh-src 源码确认 API 用法，不猜

---

## ✅ 要做（正面）
1. A：gateway 创建 agent 传 provider + model（两处：首次创建 + 附加分支）
2. A：配置来源：gateway Config（可配）+ dsh 全局兜底
3. B：修复后跑通端到端闭环（webhook → agent 回复 → 任务 → 记忆）
4. 保留 001-013 全部功能
5. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要重写 adapter 隔离层**
- **不要猜 API** — agentOptions 结构以 ~/dsh-src/packages/core/agent/src/runtime-types.ts 为准
- **不要静默创建无模型的 agent** — provider/model 取不到要报错，不假装能跑
- **不要只修不验** — 端到端闭环（agent 真实回复）验证过才算完成
- **不要引入重型 UI 库 / 不用 emoji / 不动 Brand/WhaleLogo**
- **不要删除 001-013 已实现功能**
- **不要一次性提交所有 Part** — A → B 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥/打印 token 到日志**

## 验收标准（owner 实测）
1. POST /webhook/<token> 发消息 → agent 真实回复（不是 error）
2. turn/end reason = completed
3. assistant/message 有文本内容
4. 连续两条消息在同一会话
5. 桌面端任务面板有任务 + 记忆库有复盘
6. pnpm typecheck 零错误，pnpm dev 正常启动
7. 所有平台（Telegram/QQ/微信…）入站路径同一修复生效

## 交付形式
- 分 Part 提交（A → B），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
