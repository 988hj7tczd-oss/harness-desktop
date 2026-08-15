---
title: A1 桌面元素模块化（M2-M4 全量：任务/记忆/进化/提醒/外观/技能/providers + 退役）
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 026 的 A1 部分（026 已完成 A0 窗口切换 + __desktop__ 桥）
---

# 任务：A1 桌面元素模块化（M2-M4 全量）

项目：~/development/harness-desktop
基于：001-026 已验收（026 完成 M1/A0：窗口 loadURL 官方 UI + 端口跟随 + __desktop__ 桥）
关联设计：docs/MIGRATION-DESIGN.md（§5 模块化 + §6 横切设计）

## 背景（owner 决策：A0 已完成，现在做 A1 全量模块化）
- 026 已完成：窗口显示官方 UI（A0）+ __desktop__ 桥（getPort/notify）
- 现在把桌面独有元素（任务/记忆/进化/提醒/外观/技能/providers）做成官方客户端模块
- 完成后：官方 UI 主界面 + 桌面模块叠加 = 完整产品

## 统一机制（MIGRATION-DESIGN §5 开头，每个模块都遵循）
每个桌面能力 = 一个 bundle 插件目录 `plugins/dsh-desktop-<name>/`：
- package.json（dsh.bundle.patch）
- cordis.patch.yml（插入 web profile，仿 plugins/harness-memory）
- 服务端 index.js（如需数据服务/定时）
- 客户端模块入口（经 cordis.patch.yml 的 insert 注册进启动载荷）
- electron/profile-setup.ts 的 BUNDLE_PLUGINS 数组登记新插件

---

## M2：__desktop__ 桥补全 + 任务面板模块（约 2-3 天）

### M2.1 __desktop__ 桥补全（026 已做部分 + 补菜单事件）
- 026 已有：desktop:getPort / desktop:notify ✅
- 补充：desktop:onEnginePort（端口漂移推送，如未做）
- 补充：菜单事件转发（Cmd+N 新会话 / Cmd+, 设置 → 转官方 UI 动作）
- window.__desktop__ 完整：{ getPort, onEnginePort, notify, menuEvents }

### M2.2 任务面板模块（dsh-desktop-tasks，§5.1）
- 数据源：会话事件流（window.harness.onSessionEvent），复用 src/tasks.ts TaskStore
- 挂载点：官方 `conversation.session.header.utilities`（入口按钮）
  + `conversation.details.tool`（面板本体，与官方轨迹并列 details 栏）
- 操作：重试（重发原 prompt）/ 取消（session:cancel）/ 复盘（隐藏复盘会话）/ 复制摘要
- 持久化：AppSettings.tasks（app:updateSettings）
- 复用：src/tasks.ts + src/components/TaskPanel.tsx 组件代码搬入模块
- 界面：任务类型过滤 tab + 进度条 + 步骤展开 + 失败重试（023 已实现，搬入）

---

## M3：记忆/进化/提醒/外观扩展 模块（约 2-3 天）

### M3.1 记忆模块（dsh-desktop-memory，§5.2）
- 数据：memory:list/add/delete/clear（读 harness-memory storage domain，electron/memory.ts 不动）
- 挂载点：官方 settings.section（"记忆"分区）+ sidebar.footer.action 快捷入口
- 复用：MemorySection.tsx 组件代码搬入
- 增强：记忆卡片（类型徽标/时间/来源）+ 统计（023 已实现，搬入）

### M3.2 进化模块（dsh-desktop-evolution，§5.2）
- 数据：AppSettings.tasks + 记忆变更时间线
- 挂载点：官方 settings.section（"进化"分区）
- 复用：EvolutionSection.tsx 组件代码搬入
- 内容：统计（任务/记忆/技能数）+ 时间线（023 已实现，搬入）

### M3.3 定时提醒模块（dsh-desktop-reminders，§5.3）
- 主进程 reminder-manager.ts 零改动（到点注入会话 + reminder:fired 已存在）
- 挂载点：官方 settings.section（"提醒"分区）
- 复用：RemindersSection.tsx 组件代码搬入
- 触发反馈：桌面模块监听 onReminderFired 显示 toast（新增，小）

### M3.4 外观扩展模块（dsh-desktop-appearance，§5.4）
- 官方 ui-theme 已提供深/浅/跟随系统；桌面另有主题色/字体/密度/开机自启/最小化启动
- 挂载点：官方 settings.theme 相邻 settings.section（"外观扩展"）
- 实现：读 AppSettings.appearance → document.documentElement 设 CSS 变量
- 复用：AppearanceSection.tsx + App.tsx 的 system 主题解析逻辑搬入模块
- autoLaunch 走 app:setAutoLaunch

---

## M4：技能/自定义 provider/置顶颜色 + 退役 + 测试迁移（约 2-3 天）

### M4.1 技能模块（dsh-desktop-skills）
- 挂载点：官方 settings.section（"技能"分区）
- 复用：SkillsSection.tsx 组件代码搬入
- 先核对：官方 ui-skill 是否已覆盖技能浏览 → 已覆盖则精简桌面实现

### M4.2 自定义 provider（§5.5，先核对再定）
- **先核对**：官方 dsh-client-ui-settings-models 是否已提供自定义 LLM provider 管理
  （含 llm-pi-ai 协议）
- 已覆盖 → 删除 CustomProviders.tsx，桌面只保留 setProviderApiKey（safeStorage 侧）
- 未覆盖 → 做成 settings.section 模块（复用 CustomProviders.tsx）

### M4.3 会话置顶/标签颜色（§5.6，可后置）
- 官方 sidebar.workspaces 行插槽扩展：行内"置顶/颜色"按钮
- 存储：AppSettings.pinnedSessionIds / sessionColors（现状）
- 低优先级：若插槽契约复杂可标注后置

### M4.4 退役重叠 UI + 测试迁移（§2.3 + §7）
- 退役（官方已覆盖，不再加载）：
  - src/components/: ChatView / Sidebar / MessageBubble / MessageList / ChatInput /
    ModelDisplay / TrajectoryPanel / SessionContextMenu / SettingsModal 及对应样式
  - 注意：**保留文件作为回退页依赖**（026 A0 的回退屏是 dist/index.html = 自研 UI，
    引擎未就绪时才显示）——退役的是"作为主界面的加载"，文件保留给回退页
- 保留（模块复用）：adapter/、src/tasks.ts、src/trajectory.ts、src/chatReducer.ts
- 测试迁移：32 个既有单测 → 迁移进模块测试（chatReducer/tasks/events 逻辑不变）
- 新增模块单测：tasks 模块、memory 模块（各 3-5 个关键用例）

---

## 横切设计（§6，全程遵守）

### 6.1 凭证双写
- 桌面 cred:setKey/setRef 写引擎 + safeStorage 加密层
- 官方 settings 模块直接改 .credentials.yaml → 主进程统一入口：
  事件驱动 diff .credentials.yaml 与加密副本，幂等回填

### 6.2 设置存储
- AppSettings（userData）与官方 settings 命名空间两套存储
- 桌面独有项（tasks/reminders/pinned/colors/appearance 扩展）默认继续存 AppSettings
- 仅官方模块需要消费时才迁入官方命名空间

### 6.3 升级策略
- 桌面 bundle 只依赖稳定插槽名；adapter/events.ts 是唯一需要跟变的点

---

## 附带修复：审查发现的 22 个问题（M2-M4 期间同步修复）

> 来源：026 后全量代码审查（typecheck/test 全绿基础上的人工审查）。
> 编号与审查报告一致。**P0/P1 必须修**；P2/P3 修或标注后置；P4 先实测给结论。
> 注意：#5/#6/#7/#8 所在文件（tasks.ts / trajectory.ts / chatReducer.ts）正是
> M4.4 声明"保留供模块复用"的文件——**先修再搬入 dsh-desktop-*，不得带 bug 搬**。

### P0 必修（主进程，确定 bug，与迁移无关，优先修）

1. **reminder-manager.ts 引擎未就绪丢提醒**（高危）：tick() 里 fire 失败
   （adapter 为 null / listSessions 抛错 / 目标会话不可用）后，after/at 到期提醒
   被从列表删除、永久丢失（启动后引擎 30-90s 才就绪，窗口内到期全丢）。
   修法：fire 失败不删，顺延重试（如 nextAt += 30s，上限 ~10 次），引擎就绪后自然补发。
2. **reminder-manager.ts 每日 00:xx 解析成 09:xx**（高危）：nextDaily 用
   `d.setHours(h || 9, m || 0, 0, 0)`，`0 || 9 = 9`。修法：改 `??` 语义
   （`h ?? 9, m ?? 0`）；nextWeekly 同步检查。
3. **main.ts loadEngineUI 失败后不重试**（中危）：catch 里 loadedEnginePort=null，
   但 onStatus 只在状态变化时触发 → 窗口永停本地回退屏。
   修法：失败后定时重试（1s/2s/5s 递增，约 10 次封顶）。
4. **main.ts will-navigate 白名单过宽**（中危）：`http://127.0.0.1:` 前缀放行
   任意本地端口（恶意本地服务可诱导导航）。修法：收窄为
   `http://127.0.0.1:${loadedEnginePort}` 精确前缀；loadedEnginePort 为 null 时仅放行 dev/file。

### P1 模块复用代码（先修再搬入 dsh-desktop-*，逻辑会被模块继承）

5. **tasks.ts TaskStore.startTask 顶掉同会话历史任务**（中危）：新任务过滤
   `t.status==='running' || t.sessionId!==sessionId` 会删除同会话已完成/失败任务，
   任务面板"已完成/失败"tab 与自动复盘只对最后一条消息生效。
   修法：同会话保留历史（如最近 50 条），只覆盖 running/queued。
6. **trajectory.ts 用户消息全归入回合 1**（中危）：`user-message` 用
   `currentTurn() ?? 1`，回合结束后 currentTurn() 恒为 null → 永远 1。
   修法：维护"下一回合"计数器，或按 seq 归属最近回合。
7. **trajectory.ts 每回合重复"步骤"节点 + stepCount 多 1**（中危）：turn/start 与
   step/start 都触发 assistant-start，trajectory 对每个都记 step。
   修法：仅 step/start 记 step 节点与计数；turn/start 只记回合开始/时间。
8. **chatReducer 编辑重发产生重复用户消息**（中危）：replace-user-text 替换文本
   （id 非 opt-）后 sendMessage → dsh 新 user/message（新 id）→ latestOptimisticUser
   找不到 opt- → append 第二条。修法：user-message 到达时若末条用户消息文本相同则替换。
9. **Wizard 无工作区存空字符串 cwd**（中危）：`onComplete(workspace ?? '')` 写入
   `workspaceCwd: ''`，后续 `createSession('' ?? undefined)` 把空字符串传给 dsh。
   修法：改 `workspace ?? null`；入口 `workspaceCwd || null` 兜底。
10. **EvolutionSection 技能事件 time: Date.now()**（中危）：每次渲染技能时间戳
    都是当前时间，时间线排序失真。修法：用记忆/任务时间，或移除技能事件（仅保留统计数）。

### P2 低危（退役 UI/回退页/主进程，修或标注后置）

11. MessageBubble 编辑框二次打开显示旧文本：confirmEdit 后不重置 editText state。
12. UpdateSection 所有状态共用 `settings-msg ok` 绿色样式：error/downloading 需区分。
13. ipc.ts registerIpc dispose 不完整：解除 manager.onStatus 监听 + reminders.stop()。
14. credential-store get() 死代码 + set() 返回值被忽略：safeStorage 不可用时记
    warn 日志；get 无消费方则删或补读路径。
15. main.ts `import('yaml')` 隐式依赖：yaml 显式加入 dependencies（避免未来
    pnpm 布局变化导致迁移静默失败）。
16. ChatView 空状态乐观消息被 getHistory 覆盖：history 返回后合并保留 optimistic。
17. SettingsModal 快捷键文案 Ctrl+Shift+I 与实际 CmdOrCtrl+Option+I 不符。

### P3 打包/配置/文档

18. after-pack.mjs 未排除 @scope devDeps：devDeps 里是 `@scope/name` 全名，取
    seg[1] 判断导致 @types/*、@vitejs/plugin-react 等漏进包。修法：用完整包名判断。
19. electron-builder.yml `identity: null` 与 SIGNING 文档矛盾（强制永不签名）：
    改 env 控制（CSC_LINK 存在才签名），实测一次 `pnpm dist:mac` 确认 notarize env 行为。
20. prompts/README.md 表格 026/025/024/023 重复行 + 026 done/active 状态矛盾 +
    026 文件名与内容不符：去重、修正状态、文件名与标题对齐。

### P4 待实测（验证后给结论，不承诺修复）

21. 任务状态机多步骤提前 done：实测 dsh 是否每 step 都发 assistant/message
    （→ assistant-end）。若发，任务完成判定改为 turn-end（或按 step 聚合）。
22. session:hardDelete archive→cancel→rm 顺序竞态：实测归档后会话日志是否仍在写；
    若在写，调为先 cancel → 再 archive → 再 rm。

---

## ✅ 要做（正面）
1. M2：__desktop__ 桥补全（菜单事件）+ dsh-desktop-tasks 模块（details 栏并列）
2. M3：dsh-desktop-memory / evolution / reminders / appearance 四个 settings.section 模块
3. M4：技能模块 + providers 核对处置 + 置顶颜色（可后置）+ 退役重叠 UI + 测试迁移
4. 每模块独立 bundle 插件（cordis.patch.yml 注入，仿 harness-memory）
5. 主进程能力零改动（托盘/单实例/更新/safeStorage/reminder）
6. 模块内 UI 复用现有组件代码（TaskPanel/MemorySection/EvolutionSection/RemindersSection/AppearanceSection/SkillsSection）
7. 纯文字/CSS/SVG，不用 emoji
8. 附带修复 22 个问题：**P0/P1 全修**（对应模块搬入前完成），P2/P3 修或标注后置，
   P4 给实测结论（见上方"附带修复"清单）

## ❌ 不要做（反面，硬约束）
- **不要引入 iframe**（跨源 403）
- **不要删除主进程能力**（托盘/单实例/更新/safeStorage/reminder 零改动）
- **不要删除回退页依赖**（自研 UI 文件保留，A0 回退屏用）
- **不要删除 adapter/ / src/tasks.ts / src/trajectory.ts / src/chatReducer.ts / src/__tests__/**
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要带着已知 bug 搬代码** — 模块复用的 tasks.ts / trajectory.ts / chatReducer.ts
  先修 P1 清单（#5/#6/#7/#8）再搬入 dsh-desktop-*
- **不要一次性提交所有里程碑** — M2 → M3 → M4 分批，每批等 owner 验收
- **不要引入重型 UI 库 / 不要用 emoji / 不动 Brand/WhaleLogo**
- **不要假装验收通过** — 没跑过 typecheck / pnpm test / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥到日志**

## 验收标准（owner 实测，按里程碑）
- **M2**：任务面板出现在官方 details 栏（与轨迹并列）；按钮在会话头部；重试/取消/复盘/复制摘要可用；Cmd+N/Cmd+, 转发到官方 UI 生效
- **M3**：设置页出现"记忆/进化/提醒/外观扩展"分区（与官方设置并列）；各模块功能正常（记忆增删查/进化时间线/提醒创建/外观切换即时生效）
- **M4**：技能分区可用；providers 核对处置完成；重叠 UI 退役（主界面不再加载）；32+ 测试全绿（含新增模块测试）
- **M5 回归**：typecheck 零错误 + pnpm test 全绿 + pnpm dev 正常 + 官方 UI + 桌面模块全部可用 + 打包验证
- **附带修复**：P0/P1 全修（含对应模块单测），P2/P3 完成或明确标注后置，P4 给出实测结论——逐条对照"附带修复"清单自检，未处置的写进"已知限制"
- 全程：无新增 emoji，主进程能力正常

## 交付形式
- 按里程碑分 3 批提交（M2 → M3 → M4），每批等 owner 验收
- 每批报告：改动文件、如何测试、自测结果、已知限制
