# harness-desktop 交付报告（016 修复事件订阅竞态 + 端口漂移）

> 状态：Part A/B/C 完成并实测（排队补订阅单元测试 PASS、mux 连接实测建立、
> 引擎重启端口漂移实测恢复、typecheck/build 通过），UI 流式视觉待 owner 实测。

## 背景（015 审查实测发现致命竞态）
- 引擎端完全正常（agent 真实回复 96+ 流式事件）
- **renderer 收不到任何事件**：mux WebSocket 从未建立
- **根因**：`dsh:subscribe` 只有 adapter 已创建才订阅，adapter 创建前订阅被静默跳过，之后无补订阅

## Part A：可靠订阅（排队补订阅）✅
- **DshManager 新增 `subscribeEvents(cb)`**：adapter 就绪则立即接入；未就绪则排队
- **`rebindEventListeners()`**：adapter 创建/重建后，为所有订阅者重新接入事件流
- `ipc.ts` 的 `dsh:subscribe` 改为调 `manager.subscribeEvents(onEvent)`（不再直接操作 adapter）

## Part B：renderer 幂等 ✅
- preload `onSessionEvent` 每次调用都 invoke `dsh:subscribe`（已存在，保留）
- 主进程订阅改为排队式，renderer 何时订阅都能接上

## Part C：引擎重启端口漂移 ✅
- **引擎退出**（child exit）：解除旧 adapter 订阅（eventUnsubs 清空），**保留 eventListeners 列表**
- **自动重启**：start → spawn → handleStdout 解析新端口 → new DshAdapter → `rebindEventListeners` 重新接入
- **实测**：kill dsh 子进程 → 自动重启换端口（52758→52905）→ Electron 主进程自动建立新 mux 连接（52906→52905）→ 功能正常

## 实测结果
| 验收项 | 结果 |
|---|---|
| 排队订阅→补订阅→换端口重建→重新接入 | ✅ 单元测试 PASS（事件都收到） |
| mux 连接建立 | ✅ lsof 确认 Electron↔dsh ESTABLISHED |
| 引擎重启端口漂移 | ✅ kill 后自动重启，新 mux 连接建立 |
| 重启后功能正常 | ✅ webhook 同步回复 "4+4=8" |
| 引擎回复正常 | ✅ "3+3=6" |
| pnpm typecheck / build | ✅ 零错误 |
| dev server | ✅ 200 |
| 无新增 emoji | ✅ |

## 改动文件
- `electron/dsh-manager.ts`：+subscribeEvents / rebindEventListeners / eventListeners / eventUnsubs；exit 保留订阅者并解除旧 adapter；handleStdout 创建 adapter 后 rebind；stop 清 eventUnsubs
- `electron/ipc.ts`：dsh:subscribe → manager.subscribeEvents

## 需要 owner 实测
- ⏳ 启动应用发消息 → 看到思考动画 + 打字机流式回复
- ⏳ kill dsh 进程让它自动拉起 → 发消息仍正常（端口漂移）
- ⏳ 多轮对话每条都有流式

## 已知限制
1. **事件推送依赖 adapter 创建成功**：若 dsh 启动失败（超时），订阅保持排队，需引擎恢复后 rebind。
2. **mux 断线重连**由 DshClient 内部处理（2s 重试，已有）；本修复保证 adapter 重建时订阅不丢。
