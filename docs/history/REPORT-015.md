# harness-desktop 交付报告（015 流式 UI + webhook 同步回复）

> 状态：Part A/B 完成并实测（乐观去重单元测试 PASS、webhook 同步回复端到端实测通过、
> typecheck/build 通过），桌面 UI 流式视觉待 owner 实测。

## Part A：会话窗口流式优化

### A1. 乐观 UI（用户消息立即上屏）✅
- `ChatView.sendMessage`：点击发送 → 先 `chatReducer('optimistic-user')` 立即上屏，再异步 `sendMessage`
- **去重**：乐观消息 id 前缀 `opt-`；dsh `user-message` 事件到达时，reducer 找到最近一条乐观用户消息**替换为真实消息**（不重复）
- 单元测试验证：乐观 + user-message → 只有 1 条用户消息（PASS）
- 空状态 `sendFromEmpty` 同步支持（切会话后乐观上屏）

### A2. 流式回复（打字机）✅
- 链路已存在且验证：dsh `assistant/chunk`(text-delta/reasoning-delta) → adapter `assistant-delta` → reducer 逐字 append → `stream-caret` 打字机光标
- `MessageBubble` 增强：reasoning 块加"思考中"标签 + streaming 呼吸动画（CSS，无 emoji）
- 思考中空隙由 `typing-indicator` 覆盖

### A3. 发送状态 ✅
- header 有"停止"按钮（chat.running 时）→ cancelTurn
- 输入框发送中禁用（`disabled={sending}`）
- 工具调用卡片即时显示（tool-call → ToolCallCard，tool-result 更新状态）

## Part B：webhook 同步回复（端到端实测通过 ✅）
- **默认同步等待**：POST /webhook/<token> → 入站注册 pending → agent 回复时 `adapter.send` resolve → 响应 `{"ok":true,"reply":"<agent回复>"}`
- `?async=1`：立即返回 `{"ok":true}`（兼容旧行为）
- 超时（默认 60s）：`{"ok":true,"reply":"","timeout":true}`
- 空 token 路径同样生效
- **实测**（真实 DeepSeek key）：
  - "1+1等于几？" → `{"ok":true,"reply":"2","timeout":false}`（1.6s）
  - "2+2等于几？" → `{"ok":true,"reply":"4","timeout":false}`
  - "你好" → `{"ok":true,"reply":"你好！有什么可以帮你的吗？","timeout":false}`
  - 错误 token → 404；`?async=1` → 立即 `{ok:true}`
  - 连续消息同会话复用

## 改动文件
- `src/chatReducer.ts`：`optimistic-user` action + user-message 去重替换
- `shared/types.ts`：SessionStreamEvent 增加 `optimistic-user`
- `src/components/ChatView.tsx`：sendMessage/sendFromEmpty 乐观 UI
- `src/components/MessageBubble.tsx`：reasoning"思考中"标签 + streaming 动画
- `src/styles.css`：`.reasoning-label` / `@keyframes reasoning-pulse`
- `plugins/dsh-bot-webhooks/index.js`：同步等待回复 + pending 回调 + `?async=1` + 超时

## 自测结果
- ✅ `pnpm typecheck` 零错误；`pnpm build` 通过；插件 node --check 通过
- ✅ 乐观去重单元测试 PASS（1 条用户消息不重复）
- ✅ webhook 同步回复端到端实测（真实 key，回复正确）
- ✅ 无新增 emoji

## 需要 owner 实测
- ⏳ 桌面 UI：发送消息立即上屏、agent 流式打字机、思考中指示、停止生成按钮
- ⏳ 工具调用卡片即时显示
- ⏳ 任务面板 / 复盘 / 空状态创建不受影响

## 已知限制
1. **同步等待**默认 60s 超时；长回复可能触发超时（可加 `?wait_ms=` 参数扩展，本轮未做）。
2. **乐观去重**按"最近一条 opt- 用户消息"匹配：极端并发发送多条的竞态下理论上可能误替换，实际 UI 单线程顺序发送无此问题。
3. **桌面流式视觉**依赖真实 LLM 响应速度，慢模型时打字机节奏由事件流驱动（天然平滑）。
