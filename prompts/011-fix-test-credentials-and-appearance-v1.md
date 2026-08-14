---
title: 修复测试连接用已保存凭证 + 设置通用加外观配置
status: done
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（对 009 的 bug 修复 + 003 设置页扩展）
completed: 2026-08-14（实现 + typecheck/build 通过，真实凭证/浅色视觉待 owner 实测）
---

# 任务：修复通道测试连接 + 设置加外观配置（参考 Hermes）

项目：~/development/harness-desktop
基于：001-010 已验收

## 背景
1. **Bug（已实测确认）**：用户 QQ 凭证从官网获取、真实有效——用真实凭证直连
   `bots.qq.com/app/getAppAccessToken` 成功返回 access_token。但应用内"测试连接"报"凭证无效"。
   根因：`MessageChannelsSection.tsx` 的 test() 用**表单临时输入值**（`values[p.id]`），
   保存凭证后表单被清空，测试时传空/不一致值 → 失败。
   正确逻辑：**优先用已保存凭证，表单有输入才用表单值**。
2. **需求**：设置 → 通用 需要加"外观"配置区（参考 Hermes：主题/字体/密度等）。

---

## Part A：修复测试连接用已保存凭证（Bug，必须）

### A1. 根因（全局性问题，所有平台都有）
- src/components/MessageChannelsSection.tsx 第 148-151 行：
  `const vals = values[p.id] ?? {}` → testChannel 只传表单临时值
- 保存凭证后（第 133 行）`setValues(prev => ({...prev, [p.id]: {}}))` 表单清空
- 导致：保存后点"测试连接"传空值 → 失败

**已确认影响全部平台**（electron/ipc.ts channel:test 各分支都只读表单值）：
| 平台 | 位置 |
|---|---|
| Telegram | 267 行 v.botToken |
| 微信·公众号 | 277-278 行 v.appId/appSecret |
| 微信·企微 | 289 行 v.webhook |
| 飞书 | 309-310 行 v.appId/appSecret |
| 钉钉·企业应用 | 323-324 行 v.appKey/appSecret |
| 钉钉·群机器人 | 333-335 行 v.webhook/secret |
| QQ | 355-356 行 v.appId/appSecret |
| Slack | 371 行 v.botToken |
| Email/Webhooks | 同构，一并处理 |

### A2. 修复方案
- 测试连接时**优先用已保存的 credentials**，表单有输入才覆盖：
  - IPC 端 channel:test 增加逻辑：`values` 中某字段为空时，从 dsh credentials 读取对应 ref 的值
  - 或前端 test() 先 `describeCredentialRefs`/读已保存值填充空字段再传
- 建议实现（IPC 端最稳）：
  ```ts
  // channel:test 中，字段值为空时从 credentials 读
  const appId = v.appId?.trim() || (await resolveCredential('QQ_BOT_APP_ID'))
  const appSecret = v.appSecret?.trim() || (await resolveCredential('QQ_BOT_APP_SECRET'))
  ```
- **所有平台统一**（telegram/wechat/feishu/dingtalk/qq/slack/email/webhooks），一个不落

### A3. 额外体验
- 测试成功后显示"已保存凭证有效"或"表单凭证有效"（区分来源）
- 表单为空 + 未保存过 → 仍提示"请先填写"

---

## Part B：设置-通用加"外观"配置（参考 Hermes）

### B1. 外观配置项（参考 Hermes 的主题/布局设计）
| 配置项 | 选项 | 说明 |
|---|---|---|
| 主题模式 | 深色 / 浅色 / 跟随系统 | 默认深色（003 现有），加浅色 + 跟随系统 |
| 主题色 | DeepSeek 蓝（默认）/ 绿色 / 紫色 / 橙色 | 品牌色可选（--dsw-deepseek-* 换色）|
| 字体大小 | 小 / 中 / 大 | CSS 变量控制 |
| 消息密度 | 舒适 / 紧凑 | 间距变量 |
| 启动行为 | 开机自启（开关）/ 启动时最小化到托盘（开关）| Electron 配置 |

### B2. 实现要点
- 外观配置存 AppSettings（settings-store，本地持久化）
- CSS 变量由外观设置驱动：
  - 主题：html[data-theme="light"] / dark / system（media query）
  - 主题色：CSS 自定义属性覆盖 --dsw-deepseek-*（或新增 --hd-accent）
  - 字体/密度：--hd-font-size / --hd-density 变量
- 切换即时生效（不重启），持久化重启保留
- 设置-通用页新增"外观"分区（在引擎状态/工作区/快捷键附近）

### B3. 参考 Hermes 的设计
- Hermes 有 personality/主题/pet 等外观设置，我们取其核心：主题 + 字体 + 密度
- 简洁为主，不做花哨主题包

---

## ✅ 要做（正面）
1. A：测试连接优先用已保存凭证，表单有输入才覆盖（所有平台统一）
2. B：设置-通用加外观区：主题（深/浅/跟随系统）+ 主题色 + 字体大小 + 消息密度 + 启动行为
3. 外观即时生效 + 持久化
4. 保留 001-010 全部功能
5. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要改 dsh 引擎核心 / 不要重写 adapter 隔离层 / 不要升级 dsh 版本（锁 rc.6）**
- **不要引入重型 UI 库**（主题切换用 CSS 变量，不引 antd/mui）
- **不要做花哨主题包** — 只做基础：深浅色 + 换色 + 字体/密度
- **不要用 emoji**
- **不要动 Brand/WhaleLogo/favicon** — logo 区不动
- **不要删除 001-010 已实现功能**
- **不要一次性提交所有 Part** — A → B 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥/打印 token 到日志**
- **不要忘记浅色主题的对比度** — 浅色下文字/边框要可读（不只是反色）

## 验收标准（owner 实测）
1. 保存 QQ 凭证后直接点"测试连接"→ **成功**（用已保存凭证，不再报无效）
2. 表单重新输入新值点测试 → 用表单值（覆盖行为正确）
3. 设置-通用出现"外观"区：主题/主题色/字体/密度/启动行为 5 项
4. 切浅色主题 → 界面变浅色且可读；切深色 → 恢复
5. 换主题色 → 主色按钮/选中态变色
6. 字体大小/密度调整即时生效
7. 重启应用外观设置保留
8. 全界面无新增 emoji
9. pnpm typecheck 零错误，pnpm dev 正常启动

## 交付形式
- 分 Part 提交（A → B），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
