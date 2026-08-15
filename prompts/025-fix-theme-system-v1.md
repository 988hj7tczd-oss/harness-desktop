---
title: 修复主题 system 未解析（界面全黑/浅色设置失效）+ 气泡颜色确认
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 011 的外观 theme 部分（011 功能保留）
---

# 任务：修复主题切换 bug（system 不解析 → 界面全黑）

项目：~/development/harness-desktop
基于：001-024 已验收

## 背景（owner 实测反馈）
用户设置的外观：`theme: system` + `accent: orange`
但界面"都是黑色"，气泡看不见，感觉"没按设置的外观来"。

## 根因（已确认）
- App.tsx 的 useEffect（69-77 行）：
  ```ts
  root.setAttribute('data-theme', appearance.theme)  // theme = 'system' 时原样设置
  ```
- CSS 里只有 `[data-theme='light']` 和 `:root` 深色默认，**没有 `[data-theme='system']` 规则**
- `theme: 'system'` → data-theme='system' → 不匹配任何主题 → 回落到 :root 深色
- **system 应该用 matchMedia('(prefers-color-scheme: light)') 解析成 light/dark，再设置**

## 修复方案

### Part A：system 主题解析（核心）
- App.tsx 外观 effect：
  ```ts
  const applyTheme = () => {
    const theme = appearance.theme
    let resolved = theme
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    root.setAttribute('data-theme', resolved)  // 只设 light/dark，不设 system
  }
  applyTheme()
  // 系统主题变化时自动切换
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  mq.addEventListener('change', applyTheme)
  ```
- cleanup：移除监听
- 效果：theme:system → 跟随系统实时切换（浅色系统→浅色UI，深色→深色）

### Part B：气泡颜色核对
- 确认气泡在两种主题下可读：
  - 深色：assistant=rgb(30,31,33) 深灰 + label-primary 白字 ✅（官方深色一致）
  - 浅色：assistant=rgb(240,241,244) 浅灰 + label-primary 深字 ✅
  - 用户气泡：两主题都是浅蓝 rgb(234,238,255) + 深字
- 若用户仍觉得对比不足：气泡加边框（--dsw-border-l1）提升层次

### Part C：主题切换即时生效
- 设置页切主题 → data-theme 立即更新（确认 onUpdateSettings 链路）
- system 模式下切系统外观 → 应用实时跟随

---

## ✅ 要做（正面）
1. A：system 用 matchMedia 解析成 light/dark + 监听系统变化
2. B：气泡两主题可读性确认/微调
3. C：主题切换即时生效 + system 实时跟随
4. 保留 001-024 全部功能
5. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要重写 adapter 隔离层**
- **不要改气泡布局结构**（024 对齐官方的三栏/圆角保留，只调颜色/边框）
- **不要用 emoji / 不动 Brand/WhaleLogo**
- **不要删除 001-024 已实现功能**
- **不要一次性提交所有 Part** — A → B → C 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**

## 验收标准（owner 实测）
1. theme:system + macOS 浅色 → 界面浅色；macOS 深色 → 界面深色
2. 切换 macOS 外观 → 应用实时跟随（无需重启）
3. 深色/浅色下气泡文字都清晰可读（不是黑色看不见）
4. 设置页手动切深/浅/system 都即时生效
5. pnpm typecheck 零错误 + pnpm test 全绿 + pnpm dev 正常
6. 全界面无新增 emoji

## 交付形式
- 分 Part 提交（A → B → C），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
