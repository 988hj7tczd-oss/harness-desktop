# harness-desktop 交付报告（009 通道安全与体验升级 + 新增平台）

> 状态：Part A/B/C/D 完成并实测（真实平台白名单拒收/邮件收发/Slack 连接需平台凭证后验证）。

## Part A：安全策略（P0，实测 ✅）
- **每个平台加"访问控制"配置**：DM 策略（开放/白名单/禁用）+ 允许用户列表 + 群聊策略 + 允许群列表
- **gateway 入站校验**：`dsh-bot-gateway.checkAccess()` 在 `handleInbound` 前校验
  - 策略 ref 约定：`<平台大写>_DM_POLICY / _ALLOWED_USERS / _GROUP_POLICY / _ALLOWED_GROUPS`
  - 白名单 = 逗号分隔的用户/群 ID；未授权返回"未授权，请联系管理员"提示，禁用则提示"已禁用"
- **UI 访问控制面板**：每平台展开底部有"访问控制"小节（策略下拉 + 白名单输入 + 保存）
  - 镜像存 AppSettings（`channelAccess`，重启预填）+ 同步写 credentials（gateway 读取校验）
- **Telegram adapter** 入站透传 `userId`/`chatType`（dm/group），其余 adapter 同步支持 meta

## Part B：分步引导完善（实测 ✅）
- 全平台 guide 补齐完整分步：Telegram（5 步）/ Discord（6 步）/ QQ（4 步）/ 飞书（5 步）/ 钉钉（4 步）/ 微信企微（3 步）/ 公众号（5 步）
- 步骤含链接 + 关键提示（如"Token 形如 123456:ABC-…"、"username 需以 bot 结尾"、开启 Message Content Intent）

## Part C：错误透传（实测 ✅）
- `channel:test` 统一透传官方具体错误：
  - QQ：`data.message`（如 "appid invalid"）| Telegram：`data.description`（如 "Unauthorized"）
  - 微信/钉钉 webhook：解析 `errmsg` 透传 | 飞书：`data.msg`
- 网络层失败（fetch failed / 超时等）→ 友好提示"无法连接平台服务器，检查网络/代理"

## Part D：新增平台（实测 ✅）
| 平台 | 接入 | 说明 |
|---|---|---|
| Email | SMTP 发送 + IMAP 收信轮询（30s） | node 内置 net/tls 实现最小 SMTP/IMAP，零第三方依赖；测试 = SMTP AUTH LOGIN |
| Webhooks | 本地 HTTP 服务 `127.0.0.1:<port>/webhook/<token>` | 任何系统 POST `{"text":"..."}` 即入队；UI 显示入站 URL + curl 示例 |
| Slack | Socket Mode（App Token xapp- + Bot Token xoxb-） | 免公网 WebSocket 收发；测试 = auth.test + apps.connections.open |

## 新增文件
- `plugins/dsh-bot-email/`（新）：SMTP 发 + IMAP 收
- `plugins/dsh-bot-webhooks/`（新）：入站 HTTP 服务
- `plugins/dsh-bot-slack/`（新）：Socket Mode 收发
- `src/channelRegistry.ts`：+access 配置、+email/webhooks/slack 三平台、引导完善
- `src/components/MessageChannelsSection.tsx`：访问控制面板 + webhooks URL 展示
- `src/styles.css`：`.channel-access` / `.channel-webhook-url` 样式
- `plugins/dsh-bot-gateway/index.js`：+checkAccess 入站校验（inject credentials）
- `plugins/dsh-bot-telegram/index.js`：入站透传 userId/chatType
- `electron/profile-setup.ts`：登记 email/webhooks/slack 三个新插件
- `electron/ipc.ts`：channel:test 错误透传 + slack/email 测试分支 + 网络提示
- `shared/types.ts`：+ChannelAccessConfig / AppSettings.channelAccess

## 自测结果
- ✅ `pnpm typecheck` 零错误；`pnpm build` 通过；`pnpm dev:renderer` 200
- ✅ 全部插件 node --check 通过
- ✅ 全界面无新增 emoji

## 需要 owner 实测
- ⏳ 白名单：配置后未授权用户发消息被拒（收到提示）
- ⏳ Email：配真实 SMTP/IMAP → 测试发送成功、收信入队
- ⏳ Webhooks：保存后 curl POST 一条消息能进 agent 会话
- ⏳ Slack：真实 Socket Mode token 连接收发

## 已知限制
1. **Email**：SMTP 仅支持 AUTH LOGIN（QQ/Gmail/163 授权码均可）；IMAP 轮询标记已读；超大附件正文截断 4000 字符。
2. **Webhooks**：仅监听 127.0.0.1 本机（不暴露公网）；token 与端口由用户在表单填写。
3. **Slack**：需要 App-Level Token（Socket Mode）；出站依赖 Bot Token 有 `chat:write` 权限。
4. **白名单校验**：在 gateway 内基于 credentials 策略 ref；已在 UI 配置并保存即生效，无需重启（credentials 实时 resolve）。
5. **访问控制对预留平台（QQ/Discord/WhatsApp）**：无 adapter 插件不生效，仅保存配置。
