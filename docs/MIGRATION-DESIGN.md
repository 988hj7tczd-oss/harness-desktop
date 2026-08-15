# harness-desktop × 官方 Web UI 完整迁移设计文档

> 状态：**设计稿 v1（评审中，未实施）**
> 目标：把官方 DeepSeek Harness web 版本完整接入桌面应用，作为应用主界面；当前桌面独有元素（向导/任务面板/记忆/进化/提醒/外观扩展等）以官方模块机制叠加保留。
> 关联：`docs/REPORT.md`（交付历史）、`docs/history/`（历史报告）、官方仓库 `deepseek-ai/deepseek-harness`（`apps/web` + `packages/client/*`）。

---

## 1. 结论先行（本设计的前提，均已实测验证）

1. **官方 web UI 已经在本应用内部运行**。`electron/dsh-manager.ts` 以 `dsh web --host 127.0.0.1 --port 0` 启动引擎；该进程由 `@deepseek-ai/dsh-web-app` 挂载静态服务，把 `@deepseek-ai/dsh-web-frontend/dist/`（官方 UI 完整构建产物，4.6MB React SPA）输出到随机回环端口。实测 curl 该端口返回 200，载荷为官方 UI（zh-CN，`window.__DSH_BOOT__` 含 40+ 客户端模块：conversation / sidebar / trajectory / workspace / settings / model-selection / agent-preset / plan / jobs / goal / subagent / skills / commands / message-feedback / theme / locale 等）。
2. **版本已对齐**：桌面锁 `@deepseek-ai/dsh@0.1.0-rc.6`；官方 UI 为同一 `0.1.0-rc.6` 构建，无需额外下载。
3. **扩展机制已存在且被本应用使用过**：`plugins/harness-memory` 通过 `cordis.patch.yml`（`dsh.bundle.patch`）注入 web profile，被 `electron/profile-setup.ts` 安装。官方 UI 的客户端模块（`dsh-client-modules` + `dsh-client-ui-slots`）就是本设计的挂载点。
4. **引擎对跨源 API 请求返回 403**（实测 `Origin: localhost:5173` 被拒）→ 若走 iframe 方案，桌面壳与官方 UI 只能 postMessage；**直接 loadURL 引擎端口则全程同源，最省事**。

因此"完整迁移"不是搬运代码，而是：**窗口指向已在运行的官方 UI + 把桌面独有元素做成官方客户端模块叠加 + 保留 Electron 壳**。

---

## 2. 现状对照

### 2.1 官方 UI 已覆盖（迁移后桌面侧可退役自己的实现）

| 领域 | 官方模块 |
|---|---|
| 聊天主界面 | `dsh-client-ui-conversation`（消息流/输入区/会话头） |
| 侧栏会话列表 | `dsh-client-ui-sidebar` |
| 轨迹详情 | `dsh-client-ui-trajectory` |
| 工作区/目录 | `dsh-client-ui-workspace` |
| 模型选择 | `dsh-client-ui-model-selection` |
| Agent 预设 | `dsh-client-ui-agent-preset` |
| 计划模式 | `dsh-client-ui-plan` |
| 技能 | `dsh-client-ui-skill` |
| Jobs / Goal / Subagent | `dsh-client-ui-jobs` / `dsh-client-ui-goal` / `dsh-client-ui-subagent` |
| 设置（通用/模型/插件/主题） | `dsh-client-ui-settings-*` |
| 多语言 / 主题 | `dsh-client-locale` / `dsh-client-ui-theme` |
| 消息反馈 / 用户提问 | `dsh-client-ui-message-feedback` / `dsh-client-ui-user-questions` |

### 2.2 桌面独有（官方没有，需叠加保留 —— 本项目"现在的元素"）

| # | 元素 | 现有实现 | 保留方式 |
|---|---|---|---|
| 1 | 首启 4 步向导 | `src/components/Wizard.tsx` + `cred:testKey` | 官方 `settings.onboarding` 槽位模块 **或** 桌面加载门（见 §4.2） |
| 2 | 任务面板（推导/重试/取消/复盘） | `src/components/TaskPanel.tsx` + `src/tasks.ts` | 官方 details 栏 / `shell.overlay` 模块（§5.1） |
| 3 | 记忆管理 UI | `src/components/MemorySection.tsx` + `electron/memory.ts` | 官方 `settings.section` 模块（§5.2） |
| 4 | 进化时间线 | `src/components/EvolutionSection.tsx` | 官方 `settings.section` 模块（§5.2） |
| 5 | 定时提醒 | `electron/reminder-manager.ts` + `src/components/RemindersSection.tsx` | 主进程不动 + 官方 `settings.section` UI 模块（§5.3） |
| 6 | 外观扩展（主题色/字体/密度/自启） | `src/components/AppearanceSection.tsx` + App.tsx 主题解析 | 官方 `settings.theme` 相邻 section 模块（§5.4） |
| 7 | 自定义 provider（llm-pi-ai） | `src/components/CustomProviders.tsx` | 官方 `settings.models` 覆盖则删除，否则 section 模块（§5.5，待核对） |
| 8 | safeStorage 加密凭证 | `electron/credential-store.ts` | 主进程层不动；统一写入入口（§6.2） |
| 9 | 托盘常驻 / 自动更新 / 单实例 / 导航防护 | `electron/main.ts` | **原样保留，零改动** |
| 10 | 控制台/日志视图 | `src/components/ConsoleSection.tsx` | 官方 `shell.overlay` 模块（低优先级） |
| 11 | 会话置顶/标签颜色 | `MainView.tsx`（app 本地设置） | `sidebar.workspaces` 行扩展或官方 settings 命名空间（§5.6） |

### 2.3 桌面侧待退役文件（A1 完成后）

`src/components/`：`ChatView.tsx`、`Sidebar.tsx`、`MessageBubble.tsx`、`MessageList.tsx`、`ChatInput.tsx`、`ModelDisplay.tsx`、`TrajectoryPanel.tsx`、`SessionContextMenu.tsx`、`SettingsModal.tsx` 及对应样式。
**保留**：`adapter/`（事件归一化，桌面模块复用）、`src/tasks.ts`、`src/trajectory.ts`、`src/chatReducer.ts`（迁移为模块内逻辑）、`src/__tests__/*`（迁移进模块测试）。

---

## 3. 目标架构

```
┌────────────────────────────────────────────────────────────┐
│  Electron 主进程（不变）                                      │
│  托盘 / 自动更新 / 单实例锁 / 导航防护 / safeStorage / reminder │
│  DshManager: spawn `dsh web` → 解析端口 → 就绪轮询            │
└───────────────┬────────────────────────────────────────────┘
                │ loadURL(http://127.0.0.1:<port>)  ← 主窗口
┌───────────────▼────────────────────────────────────────────┐
│  Electron 渲染进程 = 官方 web UI（引擎提供，同源）             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 官方客户端模块（40+，官方维护）                            │ │
│  │ conversation / sidebar / trajectory / settings / ...    │ │
│  └───────────────────────────┬────────────────────────────┘ │
│  ┌───────────────────────────▼────────────────────────────┐ │
│  │ 桌面客户端模块（本次新增，cordis.patch.yml 注入）          │ │
│  │ tasks / memory / evolution / reminders / appearance-ext │ │
│  │ 消费 window.harness（preload 已暴露）+ __desktop__ 桥     │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
        │ 同源 JSON-RPC /api/* + events.mux（官方 UI 自身调用）
┌───────▼────────────────────────────────────────────────────┐
│  dsh 引擎进程（web profile，含 harness-memory + 桌面 bundle） │
└────────────────────────────────────────────────────────────┘
```

关键决策：**不引入 iframe**（跨源 403 + 双侧栏冲突），主窗口直接 `loadURL` 引擎端口；桌面壳能力全部走 preload 的 `window.harness` / `__desktop__`（preload 对加载的任何页面生效，官方页面同样可用）。

---

## 4. 阶段 A0：窗口切换官方 UI（约 1-2 天）

### 4.1 加载流程

1. `DshManager.start()` 就绪后，主进程拿到 `http://127.0.0.1:<port>`（现状已有）。
2. `electron/main.ts` `createWindow()`：不再 `loadFile(dist/index.html)`，改为等待 `manager.start()` 成功后 `loadURL('http://127.0.0.1:' + port)`。
3. **回退策略**：引擎未就绪/启动失败时，`loadURL` 到占位页（现有 `dist/index.html` 可作为"引擎启动中/失败"屏），保证窗口永不白屏；就绪后跳转。

### 4.2 向导门（二选一，评审时定）

- **方案 G1（推荐）**：向导做成**官方 onboarding 模块**。官方设置系统有 `settings.onboarding` 槽位；桌面 bundle 注册一个"首次启动向导"模块，读取应用设置（`app:getState`），未 onboarded 时全屏呈现 4 步向导（复用现有 `Wizard.tsx` 组件代码），完成后写 `app:updateSettings`。
  - 优点：向导与官方 UI 同页面、无跳转闪烁、后续可进设置重开。
  - 代价：需摸清 onboarding 槽位契约（工作量小）。
- **方案 G2（过渡）**：加载门。主窗口先加载现有渲染器（向导），onboarded 后 `loadURL` 官方 UI。
  - 优点：完全复用现有 Wizard，零新契约。
  - 代价：一次整页跳转；未 onboarded 时看不到官方界面。

### 4.3 dev / prod 流程

- **prod**：窗口 loadURL 引擎端口（引擎随应用启动，流程不变）。
- **dev**：`pnpm dev` 已先起引擎（`dev:electron` 依赖就绪后窗口创建）；窗口同样 loadURL 引擎端口。现有 vite(5173) 渲染器保留为**回退页 + 向导宿主（G2 时）**，`dev:renderer` 脚本保留。
- 导航防护：`will-navigate` 白名单增加 `http://127.0.0.1:*`（仅引擎端口），其余仍阻止；`setWindowOpenHandler` 不变。

### 4.4 A0 验收标准

- 窗口显示官方 UI（会话列表/聊天/设置/轨迹全部可用）；
- 托盘、单实例、Cmd+N 新会话（改发官方 UI 可识别的事件或经 `__desktop__` 桥触发）、Cmd+, 设置可用；
- 引擎崩溃自动重启后窗口跟随新端口（`DshManager` 重建 adapter 已有机制，窗口侧需监听 `dsh:status` 重新 loadURL）；
- 向导门（G1 或 G2）可用；
- 凭证/记忆/提醒等主进程能力不受影响（A0 阶段这些 UI 暂以覆盖层或暂缺呈现，A1 补齐）。

---

## 5. 阶段 A1：桌面元素模块化（约 1-2 周，主体工作）

统一机制：每个桌面能力 = 一个 bundle 插件目录 `plugins/dsh-desktop-<name>/`，含
`package.json`（`dsh.bundle.patch`）、`cordis.patch.yml`（插入 web profile，仿 `plugins/harness-memory`）、服务端 `index.js`（如需数据服务/定时）、客户端模块入口（经 `cordis.patch.yml` 的 insert 注册进启动载荷）。
`electron/profile-setup.ts` 的 `BUNDLE_PLUGINS` 数组登记新插件（复用现有安装逻辑）。

### 5.1 任务面板（dsh-desktop-tasks）

| 项 | 设计 |
|---|---|
| 数据源 | 会话事件流（`window.harness.onSessionEvent`），复用 `src/tasks.ts` 的 TaskStore 状态机与 `src/chatReducer.ts` 的推理逻辑 |
| 挂载点 | 官方布局插槽 `conversation.session.header.utilities`（入口按钮）+ `conversation.details.tool` / `shell.overlay`（面板本体，右侧 details 栏与官方轨迹并列） |
| 操作 | 重试（重发原 prompt）、取消（`session:cancel`）、复盘（走隐藏复盘会话，复用 MainView 逻辑）、复制摘要 |
| 持久化 | 继续存 `AppSettings.tasks`（`app:updateSettings`），或迁官方 settings 命名空间（§6.3 评审） |
| 复用 | `src/tasks.ts`、`src/components/TaskPanel.tsx` 组件代码整体搬入 |

### 5.2 记忆 + 进化（dsh-desktop-memory / dsh-desktop-evolution）

| 项 | 设计 |
|---|---|
| 数据源 | 记忆：`memory:list/add/delete/clear`（读 harness-memory 的 storage domain，`electron/memory.ts` 不动）；进化：`AppSettings.tasks` + 记忆变更时间线 |
| 挂载点 | 官方 `settings.section`（新增"记忆"、"进化"分区，与官方设置并列）+ `sidebar.footer.action` 快捷入口 |
| 复用 | `MemorySection.tsx`、`EvolutionSection.tsx` 组件代码搬入 |
| 服务端 | 如需在官方 UI 内实时推送记忆变化，插件 `index.js` 里用 `ctx.on` 订阅 storage domain 变更并广播（新增能力，可选） |

### 5.3 定时提醒（dsh-desktop-reminders）

| 项 | 设计 |
|---|---|
| 主进程 | `electron/reminder-manager.ts` **零改动**（到点注入会话 + `reminder:fired` 推送已存在） |
| UI 挂载点 | 官方 `settings.section`（"提醒"分区），复用 `RemindersSection.tsx` |
| 触发反馈 | 官方 UI 内由桌面模块监听 `onReminderFired` 显示 toast（新增，小） |

### 5.4 外观扩展（dsh-desktop-appearance）

| 项 | 设计 |
|---|---|
| 现状 | 官方 `dsh-client-ui-theme` 已提供深/浅/跟随系统；桌面另有主题色/字体/密度/开机自启/最小化启动 |
| 挂载点 | 官方 `settings.theme` 相邻 `settings.section`（"外观扩展"） |
| 实现 | 读 `AppSettings.appearance`（`app:getState`），对 `document.documentElement` 设 CSS 变量（官方主题系统同样用 CSS 变量，无冲突面需评审）；`autoLaunch` 走 `app:setAutoLaunch` |
| 复用 | `AppearanceSection.tsx` 组件代码搬入；App.tsx 的 system 主题解析逻辑搬入模块 |

### 5.5 自定义 provider（dsh-desktop-providers）—— 先核对再定

- **待核对**：官方 `dsh-client-ui-settings-models` 是否已提供自定义 LLM provider 管理（含 llm-pi-ai 协议）。
- 已覆盖 → 删除 `CustomProviders.tsx`，桌面只保留 `setProviderApiKey`（safeStorage 侧）。
- 未覆盖 → 做成 `settings.section` 模块（复用 `CustomProviders.tsx`）。

### 5.6 会话置顶 / 标签颜色（dsh-desktop-session-ext）

- 官方 `sidebar.workspaces` 行插槽扩展：行内渲染"置顶/颜色"按钮（小）。
- 存储：`AppSettings.pinnedSessionIds / sessionColors`（现状）或官方 settings 命名空间（§6.3 评审）。

### 5.7 其他（低优先级，可后置）

控制台视图 → `shell.overlay` 模块；"无新增 emoji"等既有约定在新模块中保持。

---

## 6. 横切设计

### 6.1 IPC 桥

- **保留**：`window.harness`（preload 已暴露，官方页面同样可用）——桌面模块直接调用，不新增传输层。
- **新增 `window.__desktop__`（小）**：官方 UI 页面内需要但 harness 未覆盖的壳能力：引擎端口获取、`dsh:status` 事件（端口漂移跟随）、菜单事件（Cmd+N/Cmd+, 转发给官方 UI 动作）、通知 toast 通道。
- 新增 IPC 通道清单（评审时定）：`desktop:getPort`、`desktop:onEnginePort`（推送）、`desktop:notify`，其余全部复用现有 40+ 通道。

### 6.2 凭证双写策略（官方 settings 与桌面 safeStorage 的冲突）

- 现状：桌面 `cred:setKey/setRef` 写引擎 **并** 写 safeStorage 加密层；官方 settings 模块可能直接改 `.credentials.yaml`，导致加密副本过期。
- 方案：主进程统一凭证入口——引擎侧 `credentials.set/unset` 与官方 UI 写入都经主进程拦截/监听，同步加密层（实现：主进程定时或事件驱动 diff `.credentials.yaml` 与加密副本，幂等回填）。评审确认是否引入官方 settings 凭证 UI 的禁用/桥接。

### 6.3 桌面本地设置 vs 官方 settings 命名空间

- `AppSettings`（userData）与官方 `settings.describe/update`（dsh settings 命名空间）是两套存储。桌面独有项（tasks/reminders/pinned/colors/appearance 扩展）**默认继续存 AppSettings**（主进程可读写、不污染引擎黑盒）；仅当官方模块需要消费时才考虑迁入官方命名空间（如外观扩展想融入官方主题配置）。此项留作评审决策。

### 6.4 升级策略

- dsh rc 升级 → 官方 UI 随之更新；桌面 bundle 插件只依赖稳定插槽名（§5 所列均为官方契约），升级时回归验证插槽契约与事件归一化（`adapter/events.ts` 是唯一需要跟变的点，现状如此）。
- 建议 CI 加一条：升级 dsh 后跑 32 个既有单测 + 模块新增单测 + 冒烟（loadURL 官方 UI 200）。

---

## 7. 里程碑与工作量

| 里程碑 | 内容 | 预估 |
|---|---|---|
| M0 | 设计评审（本文档） | 1 次评审 |
| M1 | A0：窗口 loadURL + 向导门 + 导航白名单 + 端口跟随 + 回退页 | 1-2 天 |
| M2 | A1-1：`__desktop__` 桥 + dsh-desktop-tasks（任务面板进 details 栏） | 2-3 天 |
| M3 | A1-2：memory / evolution / reminders / appearance 模块 | 2-3 天 |
| M4 | A1-3：providers 核对处置 + session-ext + 退役重叠 UI + 测试迁移 | 2-3 天 |
| M5 | 回归：32 测试 + 冒烟 + 打包验证（dmg/exe 体积审计复测） | 1-2 天 |

总计约 1.5-2 周（单人）。

---

## 8. 风险登记

| 风险 | 等级 | 缓解 |
|---|---|---|
| 官方插槽契约随 rc 变动 | 中 | 只依赖稳定槽位；adapter 单点跟变；升级回归测试 |
| onboarding 槽位契约未知（G1） | 低 | 备选 G2 加载门零风险 |
| 双凭证写入竞态 | 中 | 主进程统一入口 + diff 回填（§6.2） |
| 官方 settings-models 与桌面 custom provider 重复 | 低 | §5.5 核对后二选一 |
| 官方 UI 全屏后桌面控制台/日志入口丢失 | 低 | shell.overlay 模块后置 |
| dev 流程复杂度上升（双渲染器职责变化） | 中 | dev 文档更新；vite 渲染器仅作回退/向导宿主 |
| 自动更新与官方 UI 页面共存 | 低 | updater 走主进程 + 通知，不依赖页面 |

## 9. 待评审决策点

1. 向导门 G1（官方 onboarding 模块）还是 G2（加载门）？→ 推荐 G1。
2. 任务面板放 `conversation.details.tool`（与官方轨迹并列）还是 `shell.overlay`（浮层）？→ 推荐 details 并列。
3. 桌面本地设置是否迁入官方 settings 命名空间（§6.3）？→ 默认不迁。
4. 自定义 provider 核对结果出来后是否删除桌面实现（§5.5）？
5. A0 阶段桌面元素 UI 以覆盖层临时呈现还是直接缺失、等 A1 补齐？→ 推荐直接等 A1（A0 仅验证壳 + 官方 UI 完整度）。

## 10. 参考资料

- 官方仓库：https://github.com/deepseek-ai/deepseek-harness（`apps/web` = `@deepseek-ai/dsh-web-frontend`，`packages/client/*` = `dsh-client-*`）
- 本地官方 UI 产物：`node_modules/@deepseek-ai/dsh-web-frontend/dist/`
- 插槽契约：`node_modules/@deepseek-ai/dsh-client-ui-slots/lib/types/` + 各 `dsh-client-ui-*/lib/types/client/**/slots.d.ts`
- 扩展机制示例：`plugins/harness-memory/`（cordis.patch.yml + bundle patch）
- 桌面现状：`docs/REPORT.md`、`docs/history/`
