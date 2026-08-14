---
title: 消息通道安全与体验升级 + 新增主流平台（Email/Webhooks/Slack）
status: done
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 007/008 的通道部分（保留已验收功能）
completed: 2026-08-14（实现 + typecheck/build 通过，真实平台白名单/收发待 owner 实测）
---

# 任务：消息通道升级 —— 安全白名单 + 分步引导 + 错误透传 + 新增主流平台

项目：~/development/harness-desktop
基于：007/008 已验收（竖排列表 + 按平台定制字段 + QQ 双凭证 + 微信/钉钉双方式）

## 背景（参考 Hermes 接入方式）
Hermes 消息通道成熟度远超我们，差距在四个方面：
1. **安全**：Hermes 每个平台有"允许用户白名单 + DM 策略"（open/allowlist/disabled），防止陌生人调用 agent
2. **引导**：Hermes 分步引导完整（Discord 创建应用→建Bot→开Intents→拿Token 四步；QQ 启用 intents）
3. **错误透传**：Hermes 测试连接显示官方具体错误（如 appid invalid / Unauthorized），不是固定文案
4. **平台广度**：Hermes 35 个平台；我们 6 个。用户要求接入主流平台

## 现状（已确认）
- channelRegistry.ts：7 平台（telegram/wechat/feishu/dingtalk/qq/discord/whatsapp），QQ/微信/钉钉已按官方凭证
- 测试连接在 electron/ipc.ts 的 channel:test：腾讯系透传好，QQ/Telegram/webhook 固定文案
- 无白名单/权限控制
- 引导简单（guide 数组有链接但缺分步说明）

---

## Part A：安全策略（P0，必须做）

### A1. 每个平台加"访问控制"配置
参考 Hermes（QQ_ALLOWED_USERS / TELEGRAM_ALLOWED_USERS / dm_policy）：
- 每个平台配置区增加：
  - **DM 策略**：开放（所有用户可用）/ 白名单（仅允许列表）/ 禁用
  - **允许用户列表**：平台用户 ID 逗号分隔
  - **群聊策略**：开放 / 白名单 / 禁用（按平台支持情况）
- 配置存 dsh credentials 或 settings（引用式，不落明文于 settings.yaml 明文展示）

### A2. 入站消息权限校验
- dsh-bot-gateway 的 handleInbound 增加校验：来源用户/群是否在白名单（按平台策略）
- 拒绝时回复友好提示（如"未授权，请联系管理员"）或静默忽略（按配置）

### A3. UI：访问控制面板
- 每个平台展开时增加"访问控制"小节：
  - DM 策略下拉（开放/白名单/禁用）
  - 允许用户输入框（逗号分隔）
  - 群聊策略下拉 + 允许群列表

---

## Part B：分步引导完善（P1）

### B1. 每个平台 guide 补齐为"完整分步"
参考 Hermes 文档，每个平台 guide 补齐：
- **Telegram**：1. 打开 @BotFather → 2. 发 /newbot → 3. 命名（username 以 bot 结尾）→ 4. 复制 token → 5. 粘贴保存
- **Discord**：1. 打开开发者后台 → 2. 创建应用 → 3. 左侧 Bot 页建 Bot → 4. 开启 Message Content Intent（隐私设置）→ 5. 复制 Token → 6. 粘贴保存
- **QQ**：1. q.qq.com 创建应用 → 2. 启用 C2C/群消息 intents → 3. 复制 AppID + AppSecret → 4. 粘贴保存
- **飞书**：1. 开放平台创建应用 → 2. 开启机器人能力 → 3. 复制 APP_ID + APP_SECRET → 4. 配置事件订阅 → 5. 粘贴保存
- **钉钉**：1. 开放平台创建应用 → 2. 启用机器人 → 3. 复制 AppKey + AppSecret → 4. 粘贴保存
- **微信企微**：1. 企微群设置 → 添加群机器人 → 2. 复制 webhook → 3. 粘贴保存
- **微信公众号**：1. mp.weixin.qq.com 登录 → 2. 开发 → 基本配置 → 3. 复制 AppID + AppSecret → 4. 配置服务器 URL（回调）→ 5. 粘贴保存

### B2. guide 渲染优化
- 步骤编号圆点 + 文字 + 链接（已有结构，完善内容即可）
- 关键步骤可加"复制"辅助提示（如"Token 形如 123456:ABC-…"）

---

## Part C：错误透传（P1）

### C1. 测试连接错误信息透传（electron/ipc.ts channel:test）
统一所有平台透传官方具体错误：
- **QQ**：透传 `data.message`（已实测返回 "appid invalid"/"appsecret invalid"），不再固定文案
- **Telegram**：透传 `data.description`（getMe 失败时官方描述，如 "Unauthorized"）
- **微信企微 webhook**：解析响应 body 的 errmsg 透传
- **钉钉群机器人 webhook**：解析 body 的 errmsg 透传
- 保留"请先填写 xxx"这类本地校验提示（这是 UI 校验不是 API 错误）

### C2. 失败提示友好化
- 错误显示带图标前缀保持克制（无 emoji），但要说明可能原因：
  - 凭证无效：提示"去 XX 平台确认凭证是否正确/是否已审核"
  - 网络错误：提示"无法连接平台服务器，检查网络/代理"

---

## Part D：新增主流平台（P1）

### D1. Email（IMAP/SMTP）— 最简单，人人有邮箱
- channelRegistry 新增 email 平台：
  - 字段：IMAP 服务器 + 端口 + 邮箱 + 密码/授权码 + SMTP 服务器（收件箱轮询 + 发件）
  - 或简化：仅 SMTP 发送（收到任务结果推邮件）+ IMAP 轮询收件（可后置）
- 引导：主流邮箱（QQ 邮箱/Gmail/163）授权码获取说明
- 连接：轮询收件（如 30s）+ SMTP 发件
- 测试：SMTP 发送测试邮件验证

### D2. Webhooks（通用入口）— 简单
- channelRegistry 新增 webhooks 平台：
  - 字段：生成一个入站 Webhook URL（含 token），其他系统 POST 消息进来
  - 本地监听端口（如 127.0.0.1:<port>/webhook/<token>）
  - 说明：任何系统（GitHub CI/监控/脚本）都能推送消息进 agent
- 引导：复制 URL + 示例 curl 命令

### D3. Slack — 海外主流
- channelRegistry 新增 slack 平台：
  - 字段：Bot Token（Socket Mode 免公网）
  - 引导：Slack API 创建 App → Socket Mode 开启 → 添加 Bot Token → 邀请进频道
- 连接：Socket Mode WebSocket（免公网，参考 Hermes slack 文档）

---

## ✅ 要做（正面）
1. A：每平台白名单 + DM/群策略 + 入站校验 + 访问控制 UI
2. B：每平台完整分步引导
3. C：测试连接错误透传官方信息
4. D：新增 Email / Webhooks / Slack 三平台（channelRegistry + adapter 骨架 + UI）
5. 保留 007/008 已验收功能
6. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要做扫码/设备流接入** — 本轮不做（二期），保持手动填凭证
- **不要做 Stream/WebSocket 免公网改造** — 钉钉/飞书保持现状连接方式（本轮只加字段和引导）
- **不要做语音 STT/TTS** — 不在本轮
- **不要追平 Hermes 全部 35 平台** — 只加 Email/Webhooks/Slack 三个主流
- **不要用 emoji** — 状态用 CSS 圆点，纯文字
- **不要动 Brand/WhaleLogo/favicon** — logo 区不动
- **不要改 dsh 引擎核心 / 不要重写 adapter 隔离层 / 不要升级 dsh 版本（锁 rc.6）**
- **不要引入重型 UI 库**
- **不要删除 007/008 已建平台和字段**（只增改）
- **不要一次性提交所有 Part** — A→B→C→D 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥/打印 token 到日志** — 凭证走 credentials 引用式存储
- **不要做花哨动效**

## 验收标准（owner 实测）
1. 任意平台展开有"访问控制"区：DM 策略 + 白名单输入
2. 配置白名单后，未授权用户发消息被拒（有提示）
3. Telegram/Discord 引导是完整分步（6 步左右）
4. QQ 测试连接报错显示官方 message（如 appid invalid）
5. Email 平台出现在列表，可配 SMTP + 测试发送
6. Webhooks 平台生成入站 URL，curl POST 一条消息能进 agent 会话
7. Slack 平台出现在列表，字段/引导完整
8. 全界面无新增 emoji
9. pnpm typecheck 零错误，pnpm dev 正常启动

## 交付形式
- 分 Part 提交（A → B → C → D），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
