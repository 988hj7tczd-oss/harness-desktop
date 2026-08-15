---
title: 修复首次会话 hero 品牌替换（preload 注入诊断与修复）
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: opencode（VSCode）
supersedes: 无（029 已交付官方模块；本任务修 preload 品牌注入的 hero 部分）
---

# 任务：修复"探索未至之境 预览版"区域的品牌替换

项目：~/development/harness-desktop
前置：029 已交付（7 个官方客户端模块 + 品牌 header）；随后在 electron/preload.ts
加了品牌注入（owner 要求"动态变色鲸鱼 + harness desktop v0.1.0"）

## 现状（owner 实测反馈）
- ✅ **右上角品牌注入成功**：渐变流动鲸鱼 + "harness desktop v0.1.0" 已显示
  （fixed 定位，任何页面可见）
- ❌ **首次会话 hero 替换失败**：官方"探索未至之境 预览版"区域没有被替换成品牌
- 说明：preload 的 DOM 注入链路整体可用（右上角证明），问题在 hero 的**定位/时机**

## 相关文件与已知事实（已调研，直接可用）

### 1. 注入代码：`electron/preload.ts` 末尾 `injectDesktopBrand()`（约 180-277 行）
- `ensureCorner()`：右上角 fixed 注入（成功 ✅）
- `ensureHero()`（约 231 行）：`document.createTreeWalker(document.body, SHOW_TEXT)`
  找含**"探索未至"**的文本节点 → 取 parentElement（headlineText span）→ 再取
  parentElement（.headline 容器）→ `innerHTML=''` 后注入品牌
- `boot()`（约 250 行）：`MutationObserver` observe `document.documentElement`
  **只监听 `{ childList: true, subtree: true }`**，300ms 节流，兜底重注入

### 2. 官方 hero 源码（~/dsh-src/packages/client/）
- 渲染组件：`ui-conversation/src/client/skeleton/EmptyHero.tsx` 的 `HeroShell`
  - DOM 结构：`.headline` div 内 = `fishHitbox > FishLogo(34)` + `headlineText("探索未至之境")` + `previewBadge("预览版")`
- **渲染条件**：`ui-conversation/src/client/skeleton/ConversationRoot.tsx` 第 79 行
  `const hero = sessionId === undefined` —— **hero 只在"无激活会话"时显示**！
  app 打开时若自动激活了历史会话，hero 不渲染，自然看不到替换效果
- 文案：`ui-conversation/src/client/locales.ts`
  - zh: `hero.headline` = '探索未至之境'、`hero.preview` = '预览版'
  - en: `hero.headline` = 'Into the Unknown'、`hero.preview` = 'Preview'
  - locale 未就绪时 `t()` 可能返回 key 字符串（'hero.headline'）或英文
- CSS：`ui-conversation/src/client/skeleton/HeroShell.module.css`（CSS Modules
  hash 化，运行时 class 形如 `_headline_xxxxx`，可用 `[class*="_headline_"]` 匹配）

## 诊断步骤（必须做，结果写进报告）

1. **确认 hero 渲染条件**：启动 app 后先确认是否处于"无激活会话"状态（hero 出现）
   ——不在空状态就看不到 hero，先新建/切到无会话状态或删除会话再测
2. **DevTools 检查**（Cmd+Option+I）：在 hero 显示时检查"探索未至之境 预览版"的
   实际 DOM：
   - 文本内容（中文？英文 'Into the Unknown'？还是 key 'hero.headline'？）
   - 容器 class 名（CSS Modules hash 后的实际值）
   - 文本节点的层级（headline 容器是谁）
3. **加诊断日志**：在 `ensureHero()` 开头/结尾 `console.log` 打印
   （是否找到"探索未至"、扫描到的相关文本、headline 是否命中），
   DevTools Console 里看 preload 日志（注意 preload 的 console 在 DevTools 可见）
4. **验证 MutationObserver 时机**：hero 渲染/文本变化时 observer 是否触发

## 修复方案（按优先级，选择后实施并验证）

### 方案 A：observer 补 `characterData: true`（先做，最小改动）
- 现状 observer 只监听 childList —— **locale 就绪后 hero 文本从 key/英文变成中文
  是 `characterData` 类型的变更，childList 监听不到** → 文本匹配永不命中
- 修法：`mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true })`

### 方案 B：多语言兜底匹配
- `ensureHero` 的匹配条件从 `indexOf('探索未至')` 扩展为命中任一：
  '探索未至' / 'Into the Unknown' / 'hero.headline'
- 命中后**校验父级结构**（headline 容器内应有 fishHitbox 特征：子元素含 svg 且
  有"预览版"/'Preview'/'hero.preview' 文本），避免误替换

### 方案 C：结构匹配替代/补充文本匹配
- 用 `[class*="_headline_"]` 找 headline 容器（CSS Modules 原类名保留在 hash 中），
  校验其父级/兄弟特征后替换 —— 不依赖 locale 文本，最早生效
- 注意排除非 hero 场景的同名 class（限定在 hero 区域，可同时校验
  `[class*="_stack_"]` 或 workspace chip 存在）

### 方案 D：React 恢复兜底
- 若注入后 React 把官方 headline 渲染回来：确认 MutationObserver 持续兜底重注入
  （已有）+ 注入元素带 `data-hd-hero-brand` 标记，扫描时跳过已注入
- 若仍有闪烁/恢复，可在注入时给 headline 加 `data-hd-hero-patched` 并在
  observer 里检测官方 headline 重新出现（无标记）→ 重新注入

## 验收标准（owner 实测）
- [ ] app 处于**无激活会话**（首次会话/空状态）时，"探索未至之境 预览版"区域
      被替换为：渐变流动鲸鱼（蓝→紫→粉循环）+ "harness desktop" + 版本徽标
- [ ] 右上角品牌仍正常（不被本次改动破坏）
- [ ] 有会话（非空状态）时右侧/会话区域无异常残留
- [ ] DevTools 无报错；typecheck 零错误 + pnpm test 全绿
- [ ] 渐变流动动画正常（SMIL，6s 循环）
- [ ] 无新增 emoji

## 硬约束
- **只改 `electron/preload.ts`**（必要时可新增诊断注释/日志，完成后清理或保留
  console.log 均可，但要说明）
- **不动 029 的 7 个 dsh-desktop-* 模块**（不冲突；若发现双品牌另报）
- **不改官方 UI / 引擎 / 不引入重型库 / 不用 emoji**
- **不要假装验收通过** — 每个修复必须 DevTools + GUI 实测截图/描述证据
- 主进程能力零改动（托盘/单实例/更新/safeStorage/reminder）

## 交付形式
- 改完 `pnpm typecheck && pnpm test` + `pnpm build:electron`，重启 app 自测
- 报告：根因（诊断步骤的发现）、改了什么（diff 摘要）、实测证据、已知限制
