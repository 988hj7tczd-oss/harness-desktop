---
title: M2-M4 桌面元素官方模块化 + 右上角品牌 logo + 首启 UI 改版
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 027 的 M2-M4 部分（027 已完成 P0/P1/P2/P3 修复 + __desktop__ 桥）
---

# 任务：M2-M4 模块化（契约已调研）+ 品牌 UI 改版

项目：~/development/harness-desktop
基于：001-027 已验收（027 完成 22 问题修复中的 17 个 + __desktop__ 桥）
关联：docs/MIGRATION-DESIGN.md + 官方 ui-slots 契约（已调研确认）

## 契约调研结论（已确认，直接可用）
官方插槽系统（packages/client/ui-slots + ui-conversation/src/client/contract/slots.ts）：
- 插件通过 `ctx.slots.register({ name, children?, store?, inject? }, Component)` 组合 UI
- 组件 props 四份 share：PropsRuntime / PropsRenderSlots / PropsStore / inject face
- hooks 只有框架：useSession / useSessions / useWorkspaces / useStore / renderSlot
- 业务组件无订阅机制；ctx 只在 apply 世界；组件永远看不到 ctx

### 可用挂载点（已确认契约）
| 桌面元素 | 官方插槽 | kind/scope |
|---|---|---|
| 任务面板入口按钮 | `conversation.session.header.utilities` | list/session |
| 任务视图（与轨迹并列）| `conversation.view` | list/session |
| 任务详情 | `conversation.details.tool` | single/session |
| 记忆/进化/提醒/外观/技能 | `settings.section`（官方设置分区，需看 ui-settings contract）| 待确认 |
| 侧栏快捷入口 | `sidebar.footer.action`（需看 ui-layout contract）| 待确认 |

### 参考实现（仿照）
- ~/dsh-src/packages/client/ui-trajectory/（注册 conversation.view 视图的完整例子）
- ~/dsh-src/packages/client/ui-settings/src/client/contract/slots.ts（settings.section 契约）
- plugins/harness-memory/（cordis.patch.yml 注入机制）

---

## M2：任务面板模块（dsh-desktop-tasks，约 2-3 天）

### M2.1 模块结构
- plugins/dsh-desktop-tasks/：package.json + cordis.patch.yml + 客户端模块入口
- 客户端入口 apply(ctx)：
  - 注册 `conversation.session.header.utilities`（入口按钮，order 100）
  - 注册 `conversation.view`（任务视图，id: 'tasks'，与 trajectory 并列）
- 数据源：window.harness.onSessionEvent → 复用 src/tasks.ts TaskStore（已修 P1#5）
- 组件复用：TaskPanel.tsx 搬入模块（类型过滤/进度条/步骤展开/失败重试/复盘/复制摘要）
- 操作：重试（重发原 prompt）/取消（session:cancel）/复盘（隐藏会话）/复制摘要
- 持久化：AppSettings.tasks（app:updateSettings）
- 注意：组件 props 要符合官方四份 share 规范（用 useSession 拿 sessionId，
  不要自己订阅——TaskStore 可作为 store 声明或 inject hooks）

---

## M3：记忆/进化/提醒/外观 模块（约 2-3 天）

### M3.1 先读 settings.section 契约
- ~/dsh-src/packages/client/ui-settings/src/client/contract/slots.ts
- 确认 settings.section 的注册方式（keyed? list? owner props?）
- 若契约清晰 → 按官方方式注册；若不清晰 → 用 sidebar.footer.action 或 shell.overlay

### M3.2 记忆模块（dsh-desktop-memory）
- 挂载：settings.section（"记忆"分区）
- 数据：memory:list/add/delete/clear（electron/memory.ts 不动）
- 复用：MemorySection.tsx 搬入（类型徽标/统计/来源）

### M3.3 进化模块（dsh-desktop-evolution）
- 挂载：settings.section（"进化"分区）
- 数据：AppSettings.tasks + 记忆时间线（已修 P1#10）
- 复用：EvolutionSection.tsx 搬入（统计 + 时间线）

### M3.4 提醒模块（dsh-desktop-reminders）
- 挂载：settings.section（"提醒"分区）
- 主进程 reminder-manager.ts 零改动（P0#1/#2 已修）
- 复用：RemindersSection.tsx 搬入 + onReminderFired toast

### M3.5 外观扩展模块（dsh-desktop-appearance）
- 挂载：settings.section 或官方 theme 相邻
- 读 AppSettings.appearance → document.documentElement 设 CSS 变量
- 复用：AppearanceSection.tsx + system 主题解析（025 已修）搬入

---

## M4：技能/自定义 provider + 退役 + 测试迁移（约 2-3 天）

### M4.1 技能模块（dsh-desktop-skills）
- 挂载：settings.section（"技能"分区）
- 复用：SkillsSection.tsx 搬入
- 核对官方 ui-skill 是否覆盖 → 覆盖则精简

### M4.2 自定义 provider
- 核对官方 settings-models 是否覆盖 llm-pi-ai → 覆盖删 CustomProviders，否则 settings.section 模块

### M4.3 退役重叠 UI + 测试迁移
- 主界面不再加载：ChatView/Sidebar/MessageBubble/MessageList/ChatInput 等
  （文件保留给回退页）
- 保留：adapter/、tasks.ts、trajectory.ts、chatReducer.ts（模块复用）
- 测试：34 个既有 + 模块新增单测

---

## Part C：右上角品牌 logo + 首启 UI 改版（owner 明确要求）

### C1. 右上角品牌区（官方 UI 内）
- 官方 UI 右上角（header 区）加**品牌标识**：
  - **彩色鲸鱼图标**（WhaleLogo 组件，src/components/WhaleLogo.tsx）
  - 文字：**harness desktop v0.1.0**（版本号从 package.json 或 app version 读取）
- 挂载点：找官方 header 的右侧插槽（conversation.session.header.utilities 或
  官方 shell 的右上角区域；若官方无合适插槽 → 用 conversation.session.header.utilities
  注册品牌按钮，或 CSS 注入官方 header 右上）
- 视觉：彩色鲸鱼（渐变，保持现有 WhaleLogo 风格）+ "harness desktop v0.1.0" 字标
  （--dsw-* token，深色/浅色都清晰）

### C2. 首启 UI 改版（首次会话/空状态）
- 官方 UI 的**首次会话界面**（hero 空状态）品牌化：
  - 彩色鲸鱼 logo（居中大图）
  - "harness desktop v0.1.0" 标题
  - 引导文案："开始你的 AI 工作台之旅"（或类似，简洁）
  - 复用官方 conversation.hero.workspace / hero.agentPreset 插槽逻辑，
    加品牌 hero 区块
- 若官方 hero 插槽不便改 → 用 conversation.composer.bar 的 hero variant
  或注册 conversation.view 空态视图

### C3. 版本显示
- 统一版本号来源：app.getVersion()（Electron）或 package.json
- 品牌区/首启/关于 都显示 v0.1.0

---

## 附带修复：027 复审遗留的 4 个跟进项（M2-M4 期间同步完成）

> 来源：027 交付后的二次复审（027 的 22 问题清单里，P1#7 的修复经验证无效）。
> **F1 必须修**（trajectory.ts 是 M4.3 声明"保留供模块复用"的文件，先修再搬）；
> F2 一行；F3/F4 是文档。

### F1. 重做 trajectory 步骤去重修复（027 P1#7 修复无效，必改）

- **现状**：`src/trajectory.ts` 用 `if (evt.step >= 1)` 区分 turn/start 与
  step/start，注释写"turn/start 的 step 为 0"——**假设错误**：
  - dsh 引擎真实事件 `turn/start` 只带 `{ turn }`，无 step 字段（已验证
    `dsh-agent-loop/lib/index.js`：`session.append("turn/start", { turn })`）
  - `adapter/events.ts` 对缺失 step 归一化为 1（`Number(data.step ?? 1)`）
  - 所以真实事件流里 turn/start → assistant-start(step=1) → `step >= 1`
    为真 → **仍记幻影"步骤"节点，stepCount 仍每回合多 1**，bug 原样保留
  - `adapter/__tests__/events.test.ts` 里 `turn/start 的 data: { turn: 1, step: 0 }`
    是错误假设（真实事件无 step 字段），且断言只查 turn 不查 step，拦不住
- **修法（在 trajectory.ts 内做，不要改 adapter）**：
  - 维护 `seenTurns: Set<number>`：每个 turn 的**第一个** assistant-start
    即 turn/start（只记回合开始/时间），之后的才是 step/start（记步骤节点 + stepCount）
  - `reset()` 清空 seenTurns
- **硬约束**：不要改 adapter 把 turn/start 输出 step=0 —— chatReducer 的
  (turn, step) 幂等去重依赖 turn/start 与第一个 step/start 同为 step=1，
  改成 0 会给每个回合多建一条空 assistant 消息
- **测试**：新增 `src/__tests__/trajectory.test.ts`（多回合用户消息归属、
  步骤计数不多 1、工具节点归属、reset 行为）；修正 events.test.ts 的错误假设
  （turn/start 事件不带 step，断言改为验证归一化输出 step=1）

### F2. loadEngineUI 重试竞态（electron/main.ts，一行）

- 旧端口的 pending 重试 timer 在 `tryLoad` 里**不检查
  `loadedEnginePort === port`**：引擎崩溃换新端口（onStatus → loadEngineUI(新端口)）
  后，旧端口重试仍会 `loadURL(旧端口)`，覆盖刚加载的新端口页面
- 修法：`tryLoad` 开头加 `if (loadedEnginePort !== port) return`

### F3. prompts/README.md 027 行表格损坏 + 状态

- 027 行描述单元格里多一个 `|`（行变 6 列，正常 5 列），markdown 表格渲染错乱
- 且状态标 `done`，但 M2-M4 模块实际未实施 → 改为 `active`（028 完成后改 done）
- 028 验收通过后，把 028 行补进表格

### F4. docs/REPORT.md 027 节计数改准

- P2 写"5/7"：实际 #17（快捷键文案）也已修 → 应为 6/7 + #16 后置
- P3 写"2/3"：实际 #19（identity: null 已删）也完成 → 应为 3/3

---

## ✅ 要做（正面）
1. M2：dsh-desktop-tasks（header 按钮 + conversation.view 视图，与轨迹并列）
2. M3：dsh-desktop-memory / evolution / reminders / appearance（settings.section）
3. M4：技能模块 + providers 核对 + 退役 + 测试迁移
4. C：右上角彩色鲸鱼 + "harness desktop v0.1.0" + 首启 hero 品牌化
5. 模块遵循官方插槽规范（ctx.slots.register + 四份 share + 框架 hooks）
6. 主进程能力零改动
7. 纯文字/CSS/SVG，不用 emoji
8. 附带修复 F1-F4：**F1 在 M4.3 迁移 trajectory 进模块前完成**（含 trajectory
   单测 + events 测试假设修正）；F2 随手修；F3/F4 文档顺手对齐

## ❌ 不要做（反面，硬约束）
- **不要自己写订阅机制**（官方规则：业务组件无订阅，数据走 hooks/store/inject）
- **不要违反插槽声明**（children = 声明 + 授权；渲染未声明或声明他人已声明的会加载失败）
- **不要改 adapter 的 turn/start step 归一化**（F1 只改 trajectory.ts；改 adapter
  输出 step=0 会破坏 chatReducer 的 (turn,step) 幂等去重，产生重复空消息）
- **不要引入 iframe / 不要删除主进程能力 / 不要删除回退页依赖**
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要一次性提交所有里程碑** — M2 → M3 → M4 → C 分批，每批等 owner 验收
- **不要引入重型 UI 库 / 不要用 emoji**
- **不要假装验收通过** — 没跑过 typecheck / pnpm test / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥到日志**

## 验收标准（owner 实测，按里程碑）
- **M2**：官方 UI 会话头部出现任务按钮；点击打开任务视图（与轨迹 tab 并列）；重试/取消/复盘/复制摘要可用
- **M3**：官方设置页出现"记忆/进化/提醒/外观扩展"分区；各功能正常
- **M4**：技能分区可用；providers 处置完成；重叠 UI 退役；34+ 测试全绿
- **C**：右上角显示彩色鲸鱼 + "harness desktop v0.1.0"；首启界面品牌化（鲸鱼 + 标题 + 引导）
- **附带修复**：F1 完成（trajectory 单测新增 + events 测试假设修正 + stepCount 实测不多 1）；
  F2 完成；F3/F4 完成——逐条对照"附带修复"清单自检
- **M5 回归**：typecheck 零错误 + pnpm test 全绿 + pnpm dev 正常 + 官方 UI + 桌面模块 + 品牌 UI 全部可用 + 打包验证
- 全程：无新增 emoji，主进程能力正常

## 交付形式
- 按里程碑分 4 批提交（M2 → M3 → M4 → C），每批等 owner 验收
- 每批报告：改动文件、如何测试、自测结果、已知限制
