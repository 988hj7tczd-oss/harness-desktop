---
title: 消息通道重做（竖排列表 + 按平台定制接入 + 引导）
status: done
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 006 的 MessageChannelsSection 部分（006 已验收功能保留）
completed: 2026-08-14（实现 + typecheck/build 通过，真实平台连接待 owner 实测）
---

# 任务：消息通道重做 —— 竖排布局 + 按平台真实接入方式定制 + 引导流程

项目：~/development/harness-desktop
基于：006 已验收（全局去 emoji、微信/飞书/钉钉 adapter 已建）

## 背景（用户明确反馈 + 参考 Hermes）
当前消息通道只有"单一 Token 输入框 + 横向 tab"：
1. ❌ 每个平台真实接入**不止一个字段**（飞书 = APP_ID+APP_SECRET、钉钉 = webhook+加签密钥、QQ = 配对码）
2. ❌ 没有**引导**——用户不知道去哪创建 bot / 怎么拿 token
3. ❌ **横向 tab 布置**——平台多了就挤爆，用户建议改竖排

参考：本机 Hermes（~/.hermes/config.yaml）每个平台一个插件、独立配置区、支持 streaming 等选项。
接入方式参考 Hermes 实际配置（Telegram bot token、QQ bot、WhatsApp 配对等）。

---

## Part A：布局改竖排（用户钦定）

### A1. 竖排平台列表
```
┌────────────────────────────────────────┐
│ 📡 消息通道                             │
│                                        │
│  ● Telegram                 [已配置]    │
│  ○ 微信                     [配置]      │
│  ○ 飞书                     [配置]      │
│  ○ 钉钉                     [配置]      │
│  ○ QQ                       [配置]      │
│  ○ Discord                  [配置]      │
│  ○ WhatsApp                 [配置]      │
│  + 添加更多平台                          │
└────────────────────────────────────────┘
```
- 每行一个平台：状态圆点（● 已配置 / ○ 未配置）+ 平台名 + 右侧状态文字/按钮
- 点击行**展开**该平台的配置表单（accordion 展开式）
- 竖排可无限扩展，再加平台不挤
- 纯文字/CSS 圆点，**不用 emoji**

### A2. 现有 MessageChannelsSection 重构
- 替换横向 channel-tabs 为竖排列表
- 状态从 credentials 读取（listCredentials 已有）
- 展开行高亮，其他行收起

---

## Part B：按平台定制接入（核心）

### B1. 平台字段定义（每个平台独立配置结构）
不再统一"Token 输入框"，每个平台按真实接入方式定制：

| 平台 | 配置字段 | 引导链接 |
|---|---|---|
| Telegram | Bot Token（1 字段） | @BotFather 创建链接（https://t.me/BotFather） |
| 微信/企微 | 企业微信机器人 Webhook（1 字段） | 企微群添加机器人说明 |
| 飞书 | APP_ID + APP_SECRET（2 字段） | 飞书开放平台创建应用（https://open.feishu.cn） |
| 钉钉 | Webhook + 加签密钥（2 字段） | 钉钉群机器人设置说明 |
| QQ | Bot Token / 配对码（1 字段） | QQ 开放平台（https://q.qq.com） |
| Discord | Bot Token + 邀请链接生成（1 字段+引导） | Discord 开发者后台（https://discord.com/developers） |
| WhatsApp | 手机号 + 配对码（2 字段） | WhatsApp 配对说明 |

### B2. 配置表单按平台渲染
- 每个平台一个字段配置（id, label, type: password/text, placeholder, ref）
- 保存时按平台写对应 credentials ref
- 平台备注（note）显示真实接入方式说明

### B3. 引导流程（用户体验关键）
- 每个平台展开后顶部有"如何获取"引导块：
  - 分步说明：1. 点链接创建 → 2. 复制密钥 → 3. 粘贴保存
  - 链接可点击（electron shell.openExternal）
  - 部分平台给"测试连接"按钮（发测试消息验证）

### B4. 后端 adapter 同步
- 多字段平台（飞书/钉钉）adapter Config 增加对应字段
- 飞书：APP_ID + APP_SECRET → 内部换取 tenant_access_token（自动刷新）
- 钉钉：webhook + secret → 加签计算（timestamp + secret HMAC-SHA256）
- 微信企微：webhook 直接 POST
- 现有 6 个 adapter（telegram/wechat/feishu/dingtalk + 预留 qq/discord）字段对齐

---

## Part C：平台可扩展性

### C1. 平台注册表
- PLATFORMS 数组改为可扩展结构：{id, name, fields[], guide[], adapterName}
- 新增平台 = 加一个条目 + 一个 adapter 插件，UI 自动出现
- 为后续 WhatsApp/Slack/Signal 预留

### C2. 空状态
- 未配置任何平台时：引导文案"连接一个消息平台，随时和你的 Agent 对话"
- 全部未配置时显示在列表

---

## ✅ 要做（正面）
1. A：竖排平台列表（accordion 展开式），替换横向 tab
2. B：每平台按真实接入方式定制字段 + 引导链接 + 测试按钮
3. B4：adapter 多字段对齐（飞书 token 刷新、钉钉加签）
4. C：平台注册表可扩展结构
5. 保留 006 已建的全部功能
6. 纯文字/CSS 圆点，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要用 emoji** — 状态用 CSS 圆点，平台名纯文字（延续 006 的清理成果）
- **不要动 Brand/WhaleLogo/favicon** — logo 区不动
- **不要改 dsh 引擎核心 / 不要重写 adapter 隔离层 / 不要升级 dsh 版本（锁 rc.6）**
- **不要引入重型 UI 库** — 延续手写 CSS + --dsw-* token
- **不要删除 006 已建平台 adapter**（wechat/feishu/dingtalk）— 只扩展字段，不删
- **不要一次性提交所有 Part** — A→B→C 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥/打印 token 到日志** — 配置值走 credentials，不写 settings.yaml 明文
- **不要做花哨动效** — 展开动画克制

## 验收标准（owner 实测）
1. 消息通道区是**竖排列表**：每个平台一行（状态圆点 + 名称 + 状态），点开展开配置
2. Telegram 展开：Token 输入 + @BotFather 引导链接可点开
3. 飞书展开：APP_ID + APP_SECRET 两个输入框 + 开放平台链接
4. 钉钉展开：Webhook + 加签密钥两个输入框
5. 保存后状态圆点变实心（已配置），重启后保留
6. 全界面无新增 emoji
7. pnpm typecheck 零错误，pnpm dev 正常启动

## 交付形式
- 分 Part 提交（A → B → C），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
