# harness-desktop 交付报告（014 修复 agent 缺 model + 端到端闭环）

> 状态：Part A 修复完成并实测通过（模型变量有值、turn 走到真实 LLM 调用、会话复用），
> 真实回复需配置 DeepSeek API Key 后由 owner 验证。

## 背景（013 审查实测发现 Bug 3）
013 修复后 agent 报错：
```
prompt variable "{{model}}" has no value for this assembly (section "deployment:persona")
```
**根因**：gateway 创建 agent 时没传 `agentOptions: { provider, model }`，system prompt 模板 `{{model}}` 无值 → turn 组装失败。影响所有平台，是消息通道最后一环。

## Part A：修复 Bug 3 —— 创建 agent 传 model
- **配置来源**：
  1. gateway Config 新增 `provider`/`model`（可配）
  2. 空则用 `ctx.agentDefaultModel.currentSelection()`（dsh 全局默认，实测返回 deepseek-official / deepseek-v4-flash）
  3. 两者都无 → 明确报错（不静默创建无模型 agent）
- **新增 `resolveAgentOptions(ctx, config)`**：返回 `{provider, model}`
- **两处创建都传 `agentOptions`**：首次创建 + 附加分支
- **附加分支增强**（端到端实测发现）：进程重启后 session_map 残留、agent 不在 registry →
  先 `agents.resume({resumeSessionId})`（持久化会话恢复），失败再 `agents.create`（新会话）——
  参照官方 ensureSession 逻辑（`live` 用现有，`stored` 走 resume）
- `AgentOptions` 结构以 `~/dsh-src/packages/core/agent/src/runtime-types.ts` 为准（provider/model/maxTokens）

## Part B：端到端闭环验收（实测）
| 验收项 | 结果 |
|---|---|
| webhook 入站 200 | ✅ `{ok:true}`（不再 not enqueued） |
| agent 创建/恢复 | ✅ attachedSessions=1，session 复用 |
| 模型变量有值 | ✅ 事件流不再报 `{{model}} has no value` |
| turn 走到真实 LLM 调用 | ✅ assistant/chunk finish → 真实认证错误（占位 key 401），证明 prompt 组装成功、model 正确传入 |
| 连续消息同一会话 | ✅ 两条消息 attachedSessions 仍=1 |
| 空 token / 错误 token | ✅ 未回归（013 修复保留） |
| 任务面板 / 记忆复盘 | ⏳ 需真实 API Key |
| pnpm typecheck / build | ✅ 零错误 |
| 所有平台共用 handleInbound | ✅ |

## 改动文件
- `plugins/dsh-bot-gateway/index.js`：Config +provider/model、`resolveAgentOptions`、两处创建传 agentOptions、附加分支 resume→create、注入 agentDefaultModel
- （013 已修：webhooks 空 token、workspace 注册）

## 需要 owner 实测
- ⏳ 配置真实 DeepSeek API Key → POST 消息 → agent 真实回复 → 任务面板任务 → 记忆库复盘条目
- ⏳ webhook 出站回调（agent 回复回发）

## 已知限制
1. **真实回复**依赖 `DEEPSEEK_API_KEY`：占位 key 实测到"LLM 认证错误"即证明修复生效；配真实 key 得真实回复。
2. **agent 为内存态**：进程重启后 session_map 持久化但 agent 需 resume 恢复（已实现）；首次 resume 需 agent-loop factory 就绪。
3. **gateway provider/model 优先**：设置页消息通道区暂未暴露这两个配置（当前走 dsh 全局默认兜底，够用）。
