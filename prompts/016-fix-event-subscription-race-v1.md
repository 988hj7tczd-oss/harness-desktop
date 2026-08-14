---
title: 修复事件订阅竞态（引擎就绪前 subscribe 丢失 → UI 无流式/无回复显示）
status: done
created: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 015 的 bus/订阅部分（015 已验收功能保留）
completed: 2026-08-15（A/B/C 完成：排队补订阅 + 端口漂移恢复；单元测试 + mux 实测 + 重启实测通过，UI 流式视觉待 owner 实测）
---

# 任务：修复事件订阅竞态（致命 —— UI 收不到 agent 事件流）

项目：~/development/harness-desktop
基于：001-015 已验收

## 背景（015 审查实测发现致命竞态）
015 实现了流式 UI（乐观消息 + assistant-delta 打字机），但用户实测：
**消息立即上屏了，但没有思考动画、没有打字机回复**。

排查发现：
- ✅ 引擎端完全正常：agent 真实回复（96+ 个 assistant/chunk 流式事件 → 完整回复 → turn completed）
- ✅ normalize 转换正确（assistant/chunk → assistant-delta）
- ✅ reducer 处理正确（assistant-start → streaming → delta append）
- ❌ **renderer 收不到任何事件** —— mux WebSocket 从未建立（无 ESTABLISHED 连接）
- ❌ **根因：事件订阅竞态**

## 根因（已确认）
electron/ipc.ts 的 `dsh:subscribe`：
```ts
ipcMain.handle('dsh:subscribe', () => {
  const a = manager.adapterInstance
  if (a) {
    a.onSessionEvent(onEvent)  // ← 只有 adapter 已创建才订阅！
  }
  return ok(true)              // ← 但永远返回 ok，调用方不知道订阅丢了
})
```
- renderer 的 App.tsx 在 `booting` 流程中调用 `onSessionEvent`（preload 里 invoke dsh:subscribe）
- **此时引擎可能还在启动，adapter 尚未创建（manager.adapter 是 null）** → 订阅被静默跳过
- 之后 adapter 创建了，但**没有补订阅机制** → 事件永远不推送
- 而 HTTP 调用（sendMessage 等）在 adapter 创建后正常 → 消息能发，但回复/流式事件收不到

## 修复方案（参考 dsh 官方 + 稳定模式）

### Part A：dsh:subscribe 排队补订阅（主进程，核心）
- `dsh:subscribe` 改为**可靠订阅**：
  - adapter 已创建 → 立即订阅
  - adapter 未创建 → 记录"待订阅"标记，manager 在 adapter 创建后**自动补订阅**
- dsh-manager 在 `this.adapter = new DshAdapter(port)` 之后，检查是否有 pending 订阅者，
  有则逐个 `adapter.onSessionEvent(cb)`
- 或者更简单：dsh:subscribe 用**轮询重试**（如每 500ms 查 adapterInstance，直到非 null 再订阅，最多 N 秒）
- 关键：**事件订阅不丢，adapter 创建后必然接上**

### Part B：preload/renderer 幂等（保险）
- preload 的 onSessionEvent 每次调用都 invoke dsh:subscribe（已做）
- App.tsx 增加：**引擎就绪后再订阅**（dshStatus ready 后再调 onSessionEvent）
- 或者：dsh:subscribe 返回实际状态（subscribed/queued），renderer 根据结果决定是否重试

### Part C：mux 断线重连验证
- DshClient.openMux 有自动重连（onclose → 2s 后重连）✅
- 但要验证：**引擎重启换端口后 adapter 是否重建**（当前 `!this.adapter` 只建一次，
  引擎崩溃重启换端口 → adapter 指向旧端口 → 全挂）
  - 查 dsh-manager 是否有引擎退出/重启处理（spawn exit 事件）
  - 若引擎退出后重启，应重建 adapter（new DshAdapter(新端口)）+ 重新订阅
  - 这是另一层防护：不止"订阅竞态"，还有"端口漂移"

---

## ✅ 要做（正面）
1. A：dsh:subscribe 可靠订阅（排队补订阅 / 轮询重试），adapter 创建后必然接上
2. B：renderer 幂等 + 返回真实状态（subscribed/queued）
3. C：引擎重启换端口 → adapter 重建 + 重新订阅（防端口漂移）
4. 修复后实测：UI 能看到思考动画 + 打字机流式回复
5. 保留 001-015 全部功能

## ❌ 不要做（反面，硬约束）
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要重写 adapter 隔离层**
- **不要只修订阅竞态忽略端口漂移** — 两个都要防（C 是同一类问题）
- **不要引入重型库**（轮询用 setTimeout，不引 rxjs 等）
- **不要用 emoji / 不动 Brand/WhaleLogo**
- **不要删除 001-015 已实现功能**
- **不要一次性提交所有 Part** — A → B → C 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**

## 验收标准（owner 实测）
1. 启动应用 → 发消息 → **看到思考动画**（reasoning 标签/呼吸动画）
2. 发消息 → **看到打字机流式回复**（逐字出现，不是一次性）
3. 引擎重启（kill dsh 进程让它自动拉起）→ 发消息仍正常（端口漂移处理）
4. 多轮对话正常（每条都有流式）
5. 任务面板/复盘/空状态创建正常
6. pnpm typecheck 零错误，pnpm dev 正常启动
7. 全界面无新增 emoji

## 交付形式
- 分 Part 提交（A → B → C），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
