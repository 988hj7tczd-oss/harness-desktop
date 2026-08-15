---
title: 官方客户端模块注入（最小验证 → 桌面元素批量搬入 + 品牌 UI）
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 028 的 M2-M4 部分（028 完成 F1-F4 + 回退页品牌）
---

# 任务：官方客户端模块注入（M2-M4 落地）

项目：~/development/harness-desktop
基于：001-028 已验收
关联：docs/MIGRATION-DESIGN.md + 官方 AMD 模块机制（已调研确认）

## 背景（owner 决策：把桌面元素加进官方 UI）
- 028 只完成了 F1-F4 修复 + 回退页品牌；**M2-M4 模块注入未实施**（待 AMD 构建）
- 用户要求：官方 UI 右上角彩色鲸鱼 + "harness desktop v0.1.0" + 首启 hero 品牌化
- 用户确认：把我们的元素（任务/记忆/进化/提醒/外观/技能）加入官方 UI

## 官方 AMD 模块机制（已调研确认，直接可用）

### 官方 client.js 格式（从引擎实际输出验证）
```js
window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-client-hmr",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    // ... 编译后代码
    // require('@deepseek-ai/dsh-client-ui-slots') 等官方依赖
    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  }
});
```
- 官方用 tsdown（tsdown.config.ts）编译 client.js
- 模块导出 { name, inject, apply }（标准 cordis 插件）
- apply(ctx) 里 ctx.slots.register() 挂载 UI
- 官方依赖（@deepseek-ai/dsh-client-*）官方 UI 已加载，**直接 require 引用，不打包进来**

### 注入路径（仿 harness-memory）
- cordis.patch.yml：`insert: [{ id, name, config }]`（dsh.bundle.patch）
- electron/profile-setup.ts 的 BUNDLE_PLUGINS 登记
- 客户端模块经 cordis-client-runner 加载执行

### 机制核实结论（owner 二次调研，全部有源码证据，直接可用）
- **平台种子表**：官方 UI 冻结共享 `react`/`react-dom`/`react/jsx-runtime`/
  `@deepseek-ai/cordis`/`dsh-client-ui-slots`/`dsh-client-web-react`/
  `dsh-client-ui-primitives` 等（`~/dsh-src/packages/client/web/src/seed.ts`）——
  我们的 factory 直接 `require('react')`、`require('@deepseek-ai/dsh-client-ui-slots')`
  拿到**同一实例**；**不打包 React、不打包官方依赖**（官方 client.js 编译产物
  就是 `require("react")`，已验证）
- **boot 载荷收集**：`dsh-client-modules` Node 端扫描 loader 每个 entry 的
  `dsh.client` 字段（`~/dsh-src/packages/client/modules/src/index.ts`）——
  cordis.patch insert 的 bundle 就是 loader entry，package.json 带 `dsh.client`
  + `./client` export 即自动进官方 UI（profile-setup 的复制+登记已具备）
- **数据获取**：官方 UI 页面里 `window.harness`（preload IPC）**依然可用**——
  桌面模块数据一律走 `window.harness`（onSessionEvent / memory:list 等），
  **不依赖官方 client runtime 的数据服务**（这是难度大头，直接绕开）
- **构建**：官方用共享 tsdown 预设 `~/dsh-src/packages/client/tsdown.client.ts`
  （ui-trajectory 的 tsdown.config.ts 只有 3 行：`clientBundle(id, [types])`）——
  **照抄文件改 id 即可**，不要试 vite lib 模式/手写 wrapper

### 官方挂载点（028 已确认契约）
| 桌面元素 | 官方插槽 | kind/scope |
|---|---|---|
| 任务视图 | `conversation.view` | list/session |
| 任务入口按钮 / 右上角品牌 | `conversation.session.header.utilities` | list/session（owner: ConversationHeaderActionOwnerProps）|
| 记忆/进化/提醒/外观/技能 | `settings.section` | list/root（已确认，注册模板见阶段 0）|
| 首启 hero 品牌 | `conversation.hero.workspace` 相邻 / hero 空态 | single/root（未确认，见 S3.2 后备）|

### 阶段 0：契约代码模板（从官方源码抄好，直接照抄改 id）

**settings.section 注册**（官方 ui-settings-general/src/client/index.ts，完整模板）：
```ts
// client.js 的 apply(ctx) 内：
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section',
  id: 'my-section',          // 分区 key（唯一）
  order: 100,                // 导航位置
  label: () => '我的分区',    // 显示名（locale 可后补）
}, MySectionComponent))
```

**conversation.view 注册**（官方 ui-trajectory，完整模板）：
```ts
ctx.slots.inject('conversation.view', () => ctx.slots.register({
  name: 'conversation.view',
  id: 'tasks',               // view tab id（与 trajectory 并列）
  order: 20,
  label: () => '任务',
}, TasksViewComponent))
```

**组件形态**（官方四份 share 规范）：
```tsx
import { useSession } from '@deepseek-ai/dsh-client-web-react'
// 组件 props = 官方注入的 runtime share；用框架 hooks 拿数据，
// 组件里不能用 ctx；数据可经 window.harness（preload IPC）获取
function TasksViewComponent() {
  const session = useSession()
  // ... window.harness.onSessionEvent / window.harness.listSessions() ...
}
```

**client.js 外壳**（手写或 tsdown 产物都行，必须匹配）：
```js
window.__ModuleLoader__.load({
  id: 'dsh-desktop-tasks',
  factory: (require) => {
    const { registerSlots } = require('@deepseek-ai/dsh-client-ui-slots') // seed 表
    // ... 编译产物或手写 apply/inject
  }
})
```

---

## 阶段 1：最小验证（约 1 天，最关键）

### S1.1 hello-world 插件
- 创建 `plugins/dsh-desktop-hello/`：
  - package.json：**`dsh.bundle.patch`（cordis.patch.yml 注入）+ `dsh.client`（platform: 'web', inject: ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-conversation']）双声明** + `./client` export 指向 `lib/client.js`
  - cordis.patch.yml（insert 注入 web profile，仿 harness-memory）
  - client.js：`window.__ModuleLoader__.load({ id: 'dsh-desktop-hello', factory })`
    - apply(ctx)：**注册 `settings.section`（id: 'hello'，契约已确认，模板见阶段 0）**，渲染一个最简单的 React 组件（`() => <div>hello from harness-desktop</div>`）
- **为什么用 settings.section 而不是 header.utilities**：S1 只验证"构建 + 注入 + seed require + 官方 UI 显示"链路，settings.section 契约已确认且有官方模板；header.utilities 留给 S2 任务按钮时再按阶段 0 模板做
- 目标：**证明全链路通**：profile-setup 复制 → boot 载荷出现 entry → __ModuleLoader__ 加载 → 官方设置页出现"hello"分区

### S1.2 构建链路（确定方案，不做发散尝试）
- **直接照抄官方**：复制 `~/dsh-src/packages/client/ui-trajectory/tsdown.config.ts`
  + `~/dsh-src/packages/client/tsdown.client.ts` + `~/dsh-src/packages/client/web/src/platform.ts`
  （PLATFORM_MODULES 种子表）到本项目模块构建目录，改 id/entry 即可
- 输出必须匹配：`window.__ModuleLoader__.load({ id, factory })`；externals =
  平台种子词 + 官方 client 依赖（**不打包 React/官方依赖**）
- 如果 tsdown 环境搭不起来 → **手写 client.js 外壳**（阶段 0 模板），
  React 组件部分用 `require('react')` + `require('@deepseek-ai/dsh-client-ui-slots')`
  最小组件，验证 seed 表链路后再决定要不要引入 tsdown
- 验证：注入后官方设置页出现 hello 分区，无控制台错误，不影响原 UI

### S1.3 验收（阶段 1）
- [ ] hello 分区出现在官方设置页（settings.section）
- [ ] 无控制台报错
- [ ] 官方 UI 原有功能正常（未破坏）
- [ ] 构建产物格式匹配 __ModuleLoader__（或手写外壳可运行）

---

## 阶段 2：桌面元素批量搬入（约 3-5 天）

> **统一数据获取方式（每个模块都遵守）**：组件内直接调 `window.harness.*`
> （preload IPC，官方 UI 页面可用）：`onSessionEvent`（任务状态流）、
> `memory:list/add/delete`、`reminder:list/create/delete`、`app:getState`/
> `app:updateSettings`（AppSettings 持久化）、`listSkills` 等。**不要**去研究
> 官方 client runtime 的服务注入（sessions/locale 等）——那是不必要的复杂度，
> 只有拿到 sessionId 需要用官方 `useSession()` hook（conversation.view 场景）。

### S2.1 任务面板（dsh-desktop-tasks）
- conversation.view 注册任务视图（id: 'tasks'，与 trajectory 并列 tab）
- conversation.session.header.utilities 注册入口按钮（契约已确认，按阶段 0 模板）
- 复用 src/tasks.ts TaskStore + TaskPanel.tsx 组件（先修后搬，P1 已修）
- 数据：window.harness.onSessionEvent → TaskStore（与回退页同一套逻辑）
- 操作：重试/取消/复盘/复制摘要
- 持久化：AppSettings.tasks（app:updateSettings）

### S2.2 记忆模块（dsh-desktop-memory）
- settings.section 注册"记忆"分区
- 复用 MemorySection.tsx（类型徽标/统计/来源）
- 数据：memory:list/add/delete/clear（electron/memory.ts 不动）

### S2.3 进化模块（dsh-desktop-evolution）
- settings.section 注册"进化"分区
- 复用 EvolutionSection.tsx（统计 + 时间线）

### S2.4 提醒模块（dsh-desktop-reminders）
- settings.section 注册"提醒"分区
- 主进程 reminder-manager.ts 零改动
- 复用 RemindersSection.tsx + onReminderFired toast

### S2.5 外观扩展模块（dsh-desktop-appearance）
- settings.section 注册"外观扩展"分区（官方 theme 相邻）
- 复用 AppearanceSection.tsx + system 主题解析
- document.documentElement 设 CSS 变量

### S2.6 技能模块（dsh-desktop-skills）
- settings.section 注册"技能"分区
- 复用 SkillsSection.tsx
- 核对官方 ui-skill 是否覆盖 → 覆盖则精简

### S2.7 自定义 provider
- 核对官方 settings-models 是否覆盖 llm-pi-ai → 覆盖删 CustomProviders，否则 settings.section 模块

---

## 阶段 3：品牌 UI（owner 明确要求）

### S3.1 右上角品牌（官方 UI 内）
- 彩色鲸鱼（WhaleLogo 组件）+ "harness desktop v0.1.0"（getVersion）
- 挂载：conversation.session.header.utilities 注册品牌 chip（order 负值靠前）
  或官方 header 右上区域（找合适插槽）
- 视觉：彩色鲸鱼渐变 + 字标，--dsw-* token，深/浅色清晰

### S3.2 首启 hero 品牌化
- 官方 hero（conversation.hero.workspace 区域）加品牌：
  - 彩色鲸鱼居中 + "harness desktop v0.1.0" 标题 + 引导文案
- 或注册 conversation.hero.* 相邻插槽实现品牌 hero
- **后备方案（若 hero 插槽契约复杂，直接采用）**：品牌走 **preload DOM 注入**
  （已验证路线，零风险）：`electron/preload.ts` 在 `DOMContentLoaded` 后
  `document.querySelector` 官方 hero 容器，插入品牌 DOM（鲸鱼 SVG + 字标）。
  官方 UI 加载后立即生效，不依赖插槽系统；升级 rc 时布局选择器可能要适配

### S3.3 版本统一
- 所有品牌位置用 getVersion()（UpdateSection 关于页也改，028 遗漏）

---

## ✅ 要做（正面）
1. 阶段 1：最小验证（hello 分区进官方设置页，证明链路）
2. 阶段 2：6 个桌面元素模块（任务/记忆/进化/提醒/外观/技能）+ providers 核对
3. 阶段 3：右上角品牌 + 首启 hero + 版本统一
4. 官方 AMD 格式（__ModuleLoader__.load）+ cordis.patch.yml 注入
5. 主进程能力零改动（托盘/单实例/更新/safeStorage/reminder）
6. 纯文字/CSS/SVG，不用 emoji
7. 构建照抄官方 tsdown 预设（~/dsh-src/packages/client/tsdown.client.ts），不试别的工具
8. 顺手修：prompts/README.md 028 行重复（done + active 两行，删 active 保留 done）

## ❌ 不要做（反面，硬约束）
- **不要在阶段 1 未验证前批量搬** — 先证明链路通，再搬元素（避免大面积失败）
- **不要打包 React / 官方依赖进我们的模块** — 一律 `require()` 平台种子表
  （react / dsh-client-ui-slots / dsh-client-web-react 等，见机制核实结论）
- **不要去学官方 client runtime 的数据服务** — 数据走 `window.harness`（preload IPC）
- **不要破坏官方 UI** — 每个模块注入后验证原功能正常
- **不要引入 iframe / 不要删除主进程能力 / 不要删除回退页依赖**
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要一次性提交所有阶段** — S1 → S2 → S3 分批，每批等 owner 验收
- **不要引入重型 UI 库 / 不要用 emoji**
- **不要假装验收通过** — 没跑过 typecheck / pnpm test / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥到日志**

## 验收标准（owner 实测）
- **S1**：官方设置页出现 hello 分区；无报错；官方 UI 未破坏
- **S2**：官方 UI 出现任务视图（与轨迹并列）+ 设置页出现记忆/进化/提醒/外观扩展/技能分区；各功能正常（数据经 window.harness）
- **S3**：官方 UI 右上角彩色鲸鱼 + "harness desktop v0.1.0"；首启 hero 品牌化（或 preload 注入后备方案）；关于页版本统一
- **回归**：typecheck 零错误 + pnpm test 全绿 + pnpm dev 正常 + 打包验证
- 全程：无新增 emoji，主进程能力正常

## 交付形式
- 按阶段分 3 批提交（S1 → S2 → S3），每批等 owner 验收
- 每批报告：改动文件、构建方案、如何测试、自测结果、已知限制
