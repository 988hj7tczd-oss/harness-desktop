---
title: 修复复盘污染 + 补技能提炼 + 全局去 emoji + 新增微信/飞书/钉钉通道
status: active
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 005 的问题项（005 已验收功能保留）
---

# 任务：005 修复 + 全局去表情包 + 消息通道扩展

项目：~/development/harness-desktop
基于：005 已验收（任务面板/记忆进化/技能 UI/体验优化）

## 背景
005 审查发现 3 个问题，加上用户对 UI 的明确要求（去表情包），以及消息通道需要扩展。

---

## Part A：修复 005 的 3 个问题

### A1. 复盘消息污染聊天界面（必须修）
现状：`reviewTask` 用 `harness.sendMessage(sessionId, prompt)` 把复盘指令发进**同一会话**，
用户会在聊天窗口看到"【复盘】刚才的任务已由你完成…"这条指令和 agent 的回复。
问题：用户只问了一个问题，却看到多了一条复盘对话，体验很差。

要求：
- 复盘改走**独立会话**（新建一个隐藏/内部会话，sessionId 不显示在会话列表），
  或复用同一会话但复盘消息**不在聊天 UI 渲染**（用消息 source 标记过滤）
- 用户聊天界面永远看不到复盘指令和复盘回复
- 复盘结果（memory_save 写入的记忆）正常入库

### A2. 技能提炼（D1）核心逻辑缺失
现状：SkillsSection 只有 UI（建议沉淀占位 + 技能列表），没有真正的聚类/生成 SKILL.md 逻辑。
要求：
- 实现"同类任务完成 3 次 → 自动提炼 SKILL"：
  - 按任务标题相似度聚类（简单的字符串相似度即可，不需要 ML）
  - 同一类达到 3 次 → 生成 SKILL.md（任务类型 + 标准步骤 + 常见坑 + 验证方式）
  - 步骤从该任务会话的事件轨迹提取（tool 调用序列 + 成功结果）
  - SKILL.md 写入技能目录，通过 dsh skill-filesystem 注册
- 技能区显示真实的提炼结果（不再是占位）
- 提炼过程走 dsh 引擎（临时 agent 生成内容），不另起炉灶

### A3. 确认任务持久化完整
现状：tasks 存 AppSettings，加载路径有。要求：确认重启后任务列表完整恢复，状态正确。

---

## Part B：全局清除表情包（用户明确要求）

### B1. 原则
- **取消所有不必要的 emoji 图标**，UI 用文字/几何图形/CSS 表达
- **logo 区域不动**：Brand.tsx 的鲸鱼 logo + wordmark、WhaleLogo.tsx、favicon、build/brand/ 素材一律不动
- **不要私自添加任何新 emoji**（包括"替换成更好看的 emoji"也不行，直接去掉）
- 功能文字保留（如"通用/模型与凭证"），只去掉 emoji 前缀

### B2. 清除清单（已扫描确认的位置）
以下文件的 emoji 全部移除（改为纯文字或 CSS 形状）：

| 文件 | 移除内容 |
|---|---|
| src/components/SettingsModal.tsx | 导航 icon：⚙🗝⏰🧠📚📡🚀（NAV 数组 icon 字段删除，导航项只留 label） |
| src/components/TaskPanel.tsx | 🎯（标题）、✅❌（状态标记改纯文字"已完成/失败"或 CSS 圆点） |
| src/components/Sidebar.tsx | 🎯📌✏️🗑⚙（图标改文字/CSS；⚙ 设置按钮改文字"设置"） |
| src/components/SessionContextMenu.tsx | ✏️📌🎨🔗🌿⬇️📦🗑（右键菜单项去图标，纯文字） |
| src/components/MemorySection.tsx | 🧠⭐（空状态图标去掉，重要标记改纯文字"重要"） |
| src/components/SkillsSection.tsx | 💡📚（建议/空状态去图标） |
| src/components/ChatInput.tsx | 🖼📄🗂⚙⚠️（附件/工具栏图标改文字或 CSS） |
| src/components/MessageBubble.tsx | 🤔❌✅🔧（推理/工具状态改纯文字） |
| src/App.tsx | ⚠️（错误提示去 emoji） |
| src/chatReducer.ts | ⚠️（错误前缀文字去掉） |
| electron/ipc.ts | 👤🤖🔧（会话导出 Markdown 的图标，改纯文字"用户/助手/工具调用"） |
| adapter/index.ts | 📎（附加文件提示改纯文字） |
| src/components/CustomProviders.tsx | ✕（这是关闭按钮符号，保留） |
| src/components/ChatInput.tsx 第82行 | ✕（关闭按钮，保留） |

### B2b. Boot/向导画面：🛠 替换为鲸鱼 logo（用户钦定）
- src/App.tsx 第 70 行：`<div className="boot-logo">🛠</div>` → 换成 `<WhaleLogo className="boot-logo" />`
  （WhaleLogo 组件已存在：src/components/WhaleLogo.tsx，导入即可）
- src/components/Wizard.tsx 第 87 行：`<div className="wizard-logo">🛠</div>` → 同样换成 `<WhaleLogo className="wizard-logo" />`
- 样式适配：boot-logo / wizard-logo 的 CSS 尺寸调整为 logo 显示合理（如 48-64px），背景色/圆角沿用现有
- 品牌统一：启动画面、向导、左上角品牌区三处都是同一个鲸鱼 logo

### B3. 注意
- `✕` 关闭按钮**保留**（是功能符号不是表情）
- 检查后如果还有遗漏的 emoji（含 CSS content 或 JSX 里的），一并清除
- 清除后视觉保持干净，间距用 CSS 调整

---

## Part C：消息通道扩展（微信/飞书/钉钉）

### C1. 架构（沿用 dsh-bot-gateway）
- 已有：dsh-bot-gateway（网关）+ dsh-bot-telegram（已实现）
- 新增 3 个 adapter 插件，复制 Telegram 模板改平台 API：
  - `dsh-bot-wechat` — 微信（企业微信机器人或微信机器人 API）
  - `dsh-bot-feishu` — 飞书（飞书开放平台 bot API）
  - `dsh-bot-dingtalk` — 钉钉（钉钉机器人 API）
- 每个插件：cordis.patch.yml + package.json + index.js，注册进 web profile bundle
- 入站：平台 webhook/长轮询 → botGateway.handleInbound(platform, chatId, text)
- 出站：adapter.send(chatId, text) 回发
- token 走 dsh credentials（引用式，不写明文）

### C2. 平台 API 要点
- 微信：企业微信群机器人 webhook（最简）或微信公众平台
- 飞书：飞书开放平台机器人（app_id/app_secret + 消息 API）
- 钉钉：钉钉机器人（webhook + 加签 或 Stream 模式）
- 如果某平台 API 需要复杂鉴权（如飞书 token 刷新），在 adapter 内实现，不污染网关

### C3. 设置页"消息通道"区扩展
- MessageChannelsSection 增加 3 个平台卡片：微信/飞书/钉钉（icon 用文字或平台首字，不用 emoji）
- 每个卡片：状态（未配置/已连接）+ token/配置输入 + 保存/断开

---

## ✅ 要做（正面）
1. A1 复盘走独立会话/隐藏会话，用户界面干净
2. A2 技能提炼真逻辑（3 次聚类 → 生成 SKILL.md → 注册）
3. A3 确认任务持久化
4. B 全局清除清单中的 emoji，保留 ✕ 和 logo 区
5. C 新增微信/飞书/钉钉 3 个 adapter + 设置页卡片
6. 保留 001-005 已验收的全部功能

## ❌ 不要做（反面，硬约束）
- **不要动 Brand.tsx / WhaleLogo.tsx / favicon.svg / build/brand/** — logo 区域是用户钦定不动
- **不要添加任何新 emoji** — 包括"用更好看的 emoji 替换"，直接去掉就行
- **不要删功能文字** — 只去 emoji 前缀，label 保留
- **不要改 dsh 引擎核心 / 不要重写 adapter 隔离层 / 不要升级 dsh 版本（锁 rc.6）**
- **不要引入重型 UI 库**
- **不要删除 001-005 已实现功能**
- **不要破坏 harness-memory 插件核心**
- **不要自己做 LLM 调用** — 复盘/提炼走 dsh 引擎
- **不要一次性提交所有 Part** — A→B→C 分批，每批等 owner 验收
- **不要假装验收通过**
- **不要加未在任务中的功能**
- **不要写明文密钥/打印 token 到日志**

## 验收标准（owner 实测）
1. 发起任务完成 → 聊天界面**看不到**复盘消息，但记忆里出现新条目（带来源）
2. 同一类任务做 3 次 → 技能区出现真实 SKILL.md（非占位），内容含步骤
3. 重启应用 → 任务列表完整恢复
4. 全界面扫描：**无多余 emoji**（设置导航/任务/会话/右键菜单/输入框/消息全部干净），logo 区域完好
5. 设置页消息通道区出现微信/飞书/钉钉 3 个卡片（可配置，连接验证可选）
6. pnpm typecheck 零错误，pnpm dev 正常启动

## 交付形式
- 分 Part 提交（A → B → C），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
