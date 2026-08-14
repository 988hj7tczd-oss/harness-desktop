---
title: 修正平台接入凭证（QQ 改 AppID+AppSecret、微信/钉钉加企业应用接入）
status: done
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 007 的 channelRegistry 字段部分（007 已验收功能保留）
completed: 2026-08-14（实现 + typecheck/build 通过，真实平台凭证待 owner 实测）
---

# 任务：修正消息平台接入凭证方式（按官方 API 对齐）

项目：~/development/harness-desktop
基于：007 已验收（竖排列表 + 按平台定制接入 + 引导 + 测试连接）

## 背景（用户指出 + 官方文档实证）
用户质疑"为什么接入不是用 AppID 和 AppSecret"，经查证 QQ 官方文档：
- **QQ 机器人官方接入 = AppID + AppSecret**（AppID 机器人 ID；AppSecret 用于 oauth 请求签名）
- **Token 鉴权已废弃**（官方文档明确标注"Token(已弃用)"，改用 Access Token 方式）
- 我们当前 QQ 只有"单 Token 框"——**接入方式错误**

各平台官方接入方式对照（实测/文档实证）：
| 平台 | 官方接入凭证 | 我们当前 | 需改 |
|---|---|---|---|
| QQ | **AppID + AppSecret**（Token 废弃）| 单 Token 框 | 🔴 必须改 |
| 微信 | 企微群机器人 Webhook（已有）；公众号/开放平台 = AppID+AppSecret | 仅 webhook | 🟡 增加公众号方式 |
| 钉钉 | 群机器人 webhook+加签（已有）；企业应用 = AppKey+AppSecret | 仅 webhook | 🟡 增加企业应用方式 |
| 飞书 | APP_ID + APP_SECRET | ✅ 已对 | 不动 |
| Telegram | Bot Token（官方就一个）| ✅ 已对 | 不动 |
| Discord | Bot Token | ✅ 已对 | 不动 |

原则：**跟着平台官方走**——官方用 AppID+AppSecret 的必须双字段，官方只有 Token 的保持单字段。

---

## Part A：QQ 接入修正（核心，必须做）

### A1. channelRegistry 的 QQ 平台改双字段
当前（src/channelRegistry.ts）：
```ts
{ id: 'qq', name: 'QQ', fields: [{ id: 'token', label: 'Bot Token / 配对码', type: 'password', ref: 'QQ_BOT_TOKEN' }], ... }
```
改为：
```ts
{
  id: 'qq',
  name: 'QQ',
  adapterName: 'dsh-bot-qq',  // 若 adapter 存在；不存在则保持 reserved 并注明
  note: 'QQ 开放平台机器人，AppID + AppSecret 接入（Token 鉴权已废弃）。',
  fields: [
    { id: 'appId', label: 'AppID（机器人 ID）', type: 'text', placeholder: '输入机器人 AppID', ref: 'QQ_BOT_APP_ID' },
    { id: 'appSecret', label: 'AppSecret（机器人密钥）', type: 'password', placeholder: '输入机器人密钥', ref: 'QQ_BOT_APP_SECRET' },
  ],
  guide: [
    { text: '1. 在 QQ 开放平台创建机器人', url: 'https://q.qq.com', urlLabel: '打开 QQ 开放平台' },
    { text: '2. 获取开发接入票据 AppID 和 AppSecret' },
    { text: '3. 粘贴到下方并保存' },
  ],
  testable: true,
  reserved: true,  // 若 dsh-bot-qq adapter 不存在则保留 reserved
}
```

### A2. QQ adapter（若存在 dsh-bot-qq）
- Config 增加 appIdEnv/appSecretEnv（QQ_BOT_APP_ID / QQ_BOT_APP_SECRET）
- 接入用官方 Access Token 鉴权方式（AppSecret 签名换取 Access Token），不用废弃 Token
- 若 dsh-bot-qq 不存在：仅改字段 + guide，adapter 实现留待后续（保持 reserved）

### A3. 兼容
- 旧的 QQ_BOT_TOKEN ref 不再使用（清除逻辑保留 clearCredential 兼容，不强制删）

---

## Part B：微信增加公众号/开放平台接入（企业应用级）

### B1. channelRegistry 微信平台加"接入方式"选择
- 微信平台改为支持两种方式（radio 选择）：
  - 方式 1：企业微信群机器人 Webhook（现有）
  - 方式 2：公众号/开放平台（AppID + AppSecret）
- 方式 2 字段：
```ts
{ id: 'appId', label: 'AppID', type: 'text', ref: 'WECHAT_APP_ID' }
{ id: 'appSecret', label: 'AppSecret', type: 'password', ref: 'WECHAT_APP_SECRET' }
```
- note 说明两种方式适用场景（webhook 最简/公众号功能全）

### B2. 引导更新
- 方式 2 引导：微信公众平台创建公众号/服务号 → 获取 AppID/AppSecret → 配置服务器

### B3. 测试连接
- 方式 2：调用微信 access_token 接口（GET https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=...&secret=...）验证凭证有效

---

## Part C：钉钉增加企业应用接入

### C1. channelRegistry 钉钉平台加"接入方式"选择
- 方式 1：群机器人 Webhook + 加签（现有）
- 方式 2：企业应用（AppKey + AppSecret）
```ts
{ id: 'appKey', label: 'AppKey', type: 'text', ref: 'DINGTALK_APP_KEY' }
{ id: 'appSecret', label: 'AppSecret', type: 'password', ref: 'DINGTALK_APP_SECRET' }
```
- 说明：企业应用可收消息（群机器人只能发）

### C2. 引导更新
- 方式 2 引导：钉钉开放平台创建应用 → 获取 AppKey/AppSecret → 启用机器人

### C3. 测试连接
- 方式 2：调用钉钉获取 access_token 接口验证

---

## Part D：设置页 UI 适配

### D1. 多方式平台渲染
- 微信/钉钉展开时顶部显示"接入方式"选择（radio：Webhook 方式 / 企业应用方式）
- 切换方式后显示对应字段组
- platformConfigured 判断：任一方式的全部字段配齐即算已配置

### D2. 说明文案
- 每个方式下面一行说明（如"群机器人：只能推送，最简""企业应用：可收发消息，功能全"）

---

## ✅ 要做（正面）
1. A：QQ 改 AppID + AppSecret 双字段 + guide 更新
2. B：微信增加公众号/开放平台 AppID+AppSecret 接入（保留 webhook）
3. C：钉钉增加企业应用 AppKey+AppSecret 接入（保留 webhook+加签）
4. D：设置页支持"接入方式"选择渲染
5. 保留 007 已验收的全部功能（竖排/引导/测试/注册表）
6. 纯文字/CSS 圆点，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要改 Telegram/Discord/飞书的现有字段** — 它们官方接入方式正确（Telegram/Discord 只有 Token；飞书已是双凭证）
- **不要用 emoji** — 状态用 CSS 圆点，平台名纯文字
- **不要动 Brand/WhaleLogo/favicon** — logo 区不动
- **不要改 dsh 引擎核心 / 不要重写 adapter 隔离层 / 不要升级 dsh 版本（锁 rc.6）**
- **不要引入重型 UI 库**
- **不要删除 007 已建功能**（channelRegistry/MessageChannelsSection 只改不删）
- **不要保留已废弃的 QQ Token 作为主接入** — 主接入必须 AppID+AppSecret（可留兼容清除）
- **不要一次性提交所有 Part** — A→B→C→D 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥/打印 token 到日志** — 凭证走 credentials 引用式存储
- **不要做花哨动效**

## 验收标准（owner 实测）
1. 设置 → 消息通道 → QQ 展开：显示 **AppID + AppSecret 两个输入框** + QQ 开放平台引导链接
2. 微信展开：顶部有"接入方式"选择（Webhook / 公众号），切换显示对应字段
3. 钉钉展开：顶部有"接入方式"选择（群机器人 / 企业应用），切换显示对应字段
4. 微信/钉钉任一方式字段配齐 → 状态圆点变实心
5. 全界面无新增 emoji
6. pnpm typecheck 零错误，pnpm dev 正常启动
7. 飞书/Telegram/Discord 字段与 007 完全一致（未被误改）

## 交付形式
- 分 Part 提交（A → B → C → D），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
