---
title: 完整迁移官方 Web UI（A0 窗口切换 + A1 桌面元素模块化）
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 023/024 的 UI 部分（迁移后自研 UI 退役为回退页）
---

# 任务：完整迁移官方 Web UI（A0 + A1 一起做，约 2 周）

项目：~/development/harness-desktop
基于：001-025 已验收
关联设计：docs/MIGRATION-DESIGN.md（v1 评审中，本提示词实施其 M1-M5 全部）

## 背景（owner 决策：放弃自研 UI，迁移官方 web UI，A0+A1 一起做）
1. **官方 web UI 已在我们应用内部运行**：dsh-manager 以 `dsh web` 启动引擎，
   `@deepseek-ai/dsh-web-app` 挂载 `dsh-web-frontend/dist/`（4.6MB 官方 SPA，
   zh-CN，40+ 客户端模块）到随机回环端口，curl 实测 200
2. **版本已对齐**：桌面锁 dsh@0.1.0-rc.6 = 官方 UI 同一版本
3. **扩展机制已验证**：harness-memory 用 cordis.patch.yml 注入成功
4. **跨源 403**：走 iframe 会跨源；**直接 loadURL 引擎端口 = 全程同源，最省事**

**因此：窗口指向官方 UI + 桌面独有元素做成官方客户端模块 + 保留 Electron 壳。
自研 UI（ChatView/Sidebar/MessageBubble 等）退役为回退页。**

## 目标架构（MIGRATION-DESIGN §3）
```
Electron 主进程（不变）：托盘/更新/单实例/导航/safeStorage/reminder/DshManager
  ↓ loadURL(http://127.0.0.1:<port>)
Electron 渲染进程 = 官方 web UI（同源）
  ├─ 官方客户端模块（40+）：conversation/sidebar/trajectory/settings/...
  └─ 桌面客户端模块（本次新增）：tasks/memory/evolution/reminders/appearance-ext
      消费 window.harness（preload）+ __desktop__ 桥
  ↓ 同源 JSON-RPC /api/* + events.mux
dsh 引擎进程（web profile，含 harness-memory + 桌面 bundle）
```

---

## 任务 A0：窗口切换官方 UI（M1，约 1-2 天）

### A0.1 加载流程（§4.1）
- electron/main.ts createWindow()：不再 loadFile(dist/index.html)
  → 等 manager.start() 成功后 `loadURL('http://127.0.0.1:' + port)`
- **回退策略**：引擎未就绪/失败 → loadURL 现有 dist/index.html（占位/启动屏）→ 就绪后跳转
- 导航防护：will-navigate 白名单加 `http://127.0.0.1:*`（仅引擎端口）
- dev/prod：都 loadURL 引擎端口；vite(5173) 渲染器保留为回退页

### A0.2 向导门（§4.2，推荐 G1）
- 向导做成官方 onboarding 模块（settings.onboarding 槽位），复用 Wizard.tsx 组件
- 未 onboarded 时全屏 4 步向导，完成写 app:updateSettings
- 若 onboarding 槽位契约不清晰 → 用 G2 加载门（先现有渲染器向导，onboarded 后 loadURL）

### A0.3 端口跟随（§4.4）
- 引擎崩溃重启换端口 → 窗口监听 dsh:status 重新 loadURL 新端口
  （DshManager 重建 adapter 已有机制，窗口侧加监听）

### A0.4 保留主进程能力（零改动）
- 托盘 / 单实例 / 自动更新 / safeStorage / reminder / 导航防护

---

## 任务 A1：桌面元素模块化（M2-M4，约 1-2 周，主体工作）

### A1.0 统一机制（§5 开头）
- 每个桌面能力 = 一个 bundle 插件目录 `plugins/dsh-desktop-<name>/`：
  - package.json（dsh.bundle.patch）
  - cordis.patch.yml（插入 web profile，仿 plugins/harness-memory）
  - 服务端 index.js（如需数据服务/定时）
  - 客户端模块入口（经 cordis.patch.yml 的 insert 注册进启动载荷）
- electron/profile-setup.ts 的 BUNDLE_PLUGINS 数组登记新插件

### A1.1 __desktop__ 桥（§6.1，M2 先做）
- 保留 window.harness（preload 已暴露，官方页面同样可用）
- 新增 window.__desktop__（小）：
  - 引擎端口获取（desktop:getPort）
  - dsh:status 事件（端口漂移跟随，desktop:onEnginePort 推送）
  - 菜单事件（Cmd+N/Cmd+, 转发给官方 UI 动作）
  - 通知 toast 通道（desktop:notify）
- 新增 IPC 通道：desktop:getPort / desktop:onEnginePort / desktop:notify

### A1.2 任务面板（dsh-desktop-tasks，§5.1，M2）
- 数据源：会话事件流（window.harness.onSessionEvent），复用 src/tasks.ts TaskStore
- 挂载点：官方 `conversation.session.header.utilities`（入口按钮）
  + `conversation.details.tool`（面板本体，与官方轨迹并列 details 栏）
- 操作：重试/取消/复盘/复制摘要（复用 MainView 逻辑）
- 持久化：AppSettings.tasks（app:updateSettings）
- 复用：src/tasks.ts + src/components/TaskPanel.tsx 组件代码搬入

### A1.3 记忆 + 进化（dsh-desktop-memory / dsh-desktop-evolution，§5.2，M3）
- 记忆数据：memory:list/add/delete/clear（读 harness-memory storage domain）
- 进化数据：AppSettings.tasks + 记忆变更时间线
- 挂载点：官方 settings.section（"记忆"、"进化"分区）+ sidebar.footer.action 快捷入口
- 复用：MemorySection.tsx + EvolutionSection.tsx 组件代码搬入

### A1.4 定时提醒（dsh-desktop-reminders，§5.3，M3）
- 主进程 reminder-manager.ts 零改动
- UI 挂载点：官方 settings.section（"提醒"分区），复用 RemindersSection.tsx
- 触发反馈：桌面模块监听 onReminderFired 显示 toast（新增，小）

### A1.5 外观扩展（dsh-desktop-appearance，§5.4，M3）
- 官方 ui-theme 已提供深/浅/跟随系统；桌面另有主题色/字体/密度/开机自启/最小化启动
- 挂载点：官方 settings.theme 相邻 settings.section（"外观扩展"）
- 实现：读 AppSettings.appearance → 对 document.documentElement 设 CSS 变量
- 复用：AppearanceSection.tsx + App.tsx 的 system 主题解析逻辑搬入模块

### A1.6 自定义 provider（dsh-desktop-providers，§5.5，M4）
- **先核对**：官方 dsh-client-ui-settings-models 是否已提供自定义 LLM provider 管理
- 已覆盖 → 删除 CustomProviders.tsx，桌面只保留 setProviderApiKey（safeStorage 侧）
- 未覆盖 → 做成 settings.section 模块（复用 CustomProviders.tsx）

### A1.7 会话置顶/标签颜色（dsh-desktop-session-ext，§5.6，M4）
- 官方 sidebar.workspaces 行插槽扩展：行内"置顶/颜色"按钮
- 存储：AppSettings.pinnedSessionIds / sessionColors（现状）
- 低优先级，可后置

### A1.8 退役重叠 UI + 测试迁移（§2.3 + §7 M4）
- 退役：src/components/ 的 ChatView/Sidebar/MessageBubble/MessageList/ChatInput/
  ModelDisplay/TrajectoryPanel/SessionContextMenu/SettingsModal 及对应样式
- 保留：adapter/（事件归一化，桌面模块复用）、src/tasks.ts、src/trajectory.ts、
  src/chatReducer.ts（迁移为模块内逻辑）、src/__tests__/*（迁移进模块测试）
- 测试：32 个既有单测迁移 + 模块新增单测

### A1.9 技能库（dsh-desktop-skills，§5 扩展）
- 挂载点：官方 settings.section（"技能"分区），复用 SkillsSection.tsx
- 或核对官方 ui-skill 是否已覆盖 → 已覆盖则退役桌面实现

---

## 横切设计（§6，全程遵守）

### 6.1 凭证双写策略
- 桌面 cred:setKey/setRef 写引擎 + safeStorage 加密层
- 官方 settings 模块可能直接改 .credentials.yaml → 主进程统一入口：
  事件驱动 diff .credentials.yaml 与加密副本，幂等回填

### 6.2 设置存储
- AppSettings（userData）与官方 settings 命名空间是两套存储
- 桌面独有项（tasks/reminders/pinned/colors/appearance 扩展）默认继续存 AppSettings
- 仅当官方模块需要消费时迁入官方命名空间

### 6.3 升级策略
- dsh rc 升级 → 官方 UI 随之更新；桌面 bundle 只依赖稳定插槽名
- adapter/events.ts 是唯一需要跟变的点

---

## ✅ 要做（正面）
1. A0：窗口 loadURL 官方 UI + 回退页 + 向导门（G1/G2）+ 端口跟随
2. A1：__desktop__ 桥 + 6 个桌面模块（tasks/memory/evolution/reminders/appearance/providers）
3. A1：退役重叠自研 UI + 测试迁移
4. 主进程能力全部保留（托盘/单实例/更新/safeStorage/reminder）
5. 每模块 = 独立 bundle 插件（cordis.patch.yml 注入，仿 harness-memory）
6. 纯文字/CSS/SVG，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要引入 iframe**（跨源 403 + 双侧栏冲突）
- **不要删除主进程能力**（托盘/单实例/更新/safeStorage/reminder 零改动）
- **不要删除 adapter/ / src/tasks.ts / src/trajectory.ts / src/chatReducer.ts / src/__tests__/**
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要一次性提交所有里程碑** — M1 → M2 → M3 → M4 → M5 分批，每批等 owner 验收
- **不要引入重型 UI 库 / 不要用 emoji / 不动 Brand/WhaleLogo**
- **不要假装验收通过** — 没跑过 typecheck / pnpm test / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥到日志**

## 验收标准（owner 实测，按里程碑）
- **M1（A0）**：窗口显示官方 UI；托盘/单实例/Cmd+N/Cmd+, 可用；引擎崩溃重启跟随新端口；向导门可用
- **M2**：任务面板出现在官方 details 栏（与轨迹并列）；__desktop__ 桥可用
- **M3**：记忆/进化/提醒/外观扩展 出现在官方设置分区
- **M4**：providers 核对处置；置顶/颜色（或后置）；重叠 UI 退役；测试迁移
- **M5**：32+ 测试全绿 + typecheck 零错误 + pnpm dev 正常 + 打包验证
- 全程：无新增 emoji，主进程能力正常

## 交付形式
- 按里程碑分 5 批提交（M1 → M5），每批等 owner 验收
- 每批报告：改动文件、如何测试、自测结果、已知限制
