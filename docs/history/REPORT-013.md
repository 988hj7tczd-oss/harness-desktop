# harness-desktop 交付报告（013 bot-gateway 致命 bug 修复 + 端到端验收）

> 状态：Part A/B 修复完成并实测通过（webhook 入站 200 / agent 附加成功 / 会话复用），
> 任务面板+记忆复盘链路需配置真实 DeepSeek API Key 后由 owner 验证。

## 背景（端到端验收发现 2 个致命 bug）
用 Webhooks 通道实测发现：
- 消息进来 → gateway 收到 → 会话创建 → **agent 附加失败 → HTTP 500 "not enqueued" → 消息不进 agent 循环**
- 影响所有平台，消息通道=摆设

## Part A：修复 Bug 1 —— webhooks 空 token 永远 404
- **根因**：`parts.length < 2 || parts[1] !== token`，token 为空（未配置）时永远 404
- **修复**（plugins/dsh-bot-webhooks/index.js）：`tokenOk = !token || parts[1] === token`，token 为空时跳过校验
- 保留安全：配置 token 后必须匹配（实测错误 token 404）
- 日志：未配置时提示"入站开放"

## Part B：修复 Bug 2 —— 未注册 workspace / agent 附加失败（致命）
- **根因**（参照 dsh-src 源码确认）：
  1. 手动 `ctx.sessions.create(undefined, {meta:{cwd}})` 创建 session 后，再 `ctx.agents.create({sessionId})`
     —— `agents.create` 工厂内部会 `sessions.prepare(sessionId)`，同 id session 已存在 → 冲突 → agent 附加失败
  2. workspace 未注册（官方 session.create 路径需 workspace 先行）
- **修复**（plugins/dsh-bot-gateway/index.js）：
  1. 参照官方 `ensureSession` 路径：**去掉手动 `sessions.create`**，直接用 `ctx.agents.create({ sessionId, meta: {cwd} })` 一步创建 session + agent
  2. 创建前确保 workspace 已注册：`workspaceRegistry.resolveByPath(cwd)` 存在则复用，否则 `workspaceRegistry.create(cwd)`
  3. cwd 取 `config.workspaceCwd` 或 `process.cwd()`（host cwd，与官方 defaults.cwd 一致）
  4. 注入 `workspaceRegistry`
- 复用现有 agent 逻辑不变（已附加直接用）

## Part C：端到端验收（实测通过 ✅）
| 验收项 | 结果 |
|---|---|
| webhook 入站返回 200 ok | ✅ `{"ok":true}`（不再 not enqueued） |
| agent 真实创建/附加 | ✅ host.describe attachedSessions=1，session-1 blank:false |
| 连续消息同一会话 | ✅ 两条消息后 attachedSessions 仍=1，session-1 复用 |
| 空 token 时 /webhook 直接可用 | ✅ 200 |
| 配置 token 后错误 token 404 | ✅ `{"ok":false,"error":"not found"}` |
| 配置 token 后正确 token 200 | ✅ |
| 任务面板 / 记忆复盘 | ⏳ 需真实 API Key（无 key 时 agent 无法执行 LLM turn，turns=0） |
| pnpm typecheck 零错误 | ✅ |
| 所有平台共用 handleInbound | ✅（同一修复覆盖 Telegram/QQ/微信/飞书/钉钉/Email/Slack/Webhooks） |

## 改动文件
- `plugins/dsh-bot-webhooks/index.js`：空 token 跳过校验 + 日志
- `plugins/dsh-bot-gateway/index.js`：workspace 注册 + `agents.create` 一步创建（去手动 sessions.create）

## 需要 owner 实测
- ⏳ 配置真实 API Key 后：POST 消息 → agent 真实回复 → 任务面板出现任务 → 记忆库复盘条目
- ⏳ 各平台（Telegram/QQ/微信等）入站路径

## 已知限制
1. **真实 LLM 处理**依赖 `DEEPSEEK_API_KEY`：未配置时 agent 能创建/入队，但 turn 会快速失败（turns/steps=0），消息不会产生真实回复——这是引擎行为，非 bug。
2. **workspace 注册失败降级**：`workspaceRegistry.create` 失败仅 warn 不阻塞（agent 创建仍继续）；极端情况下会话可能不在 workspace list。
3. **插件需重新安装进 profile** 才生效（本次已手动同步 profile；下次 `checkProfile` 会因 target 存在而跳过覆盖——如需强制更新需清 profile 缓存）。
