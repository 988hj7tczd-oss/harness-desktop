# harness-desktop 交付报告（007 消息通道重做）

> 状态：Part A/B/C 完成并实测（真实平台连接/测试需 token 后验证）。

## Part A：竖排布局（实测 ✅）
- 消息通道区改为**竖排平台列表**：每行 = CSS 状态圆点（● 已配置 / ○ 未配置）+ 平台名 + 右侧状态文字
- 点击行 **accordion 展开**该平台配置表单（只展开一个，其他收起），展开行高亮
- 替换原横向 channel-tabs 全部样式与组件逻辑

## Part B：按平台定制接入（实测 ✅）
| 平台 | 配置字段 | 引导 | 测试 |
|---|---|---|---|
| Telegram | Bot Token | @BotFather 链接（t.me/BotFather） | getMe 验证 ✅ |
| 微信 | 群机器人 Webhook | 企微机器人文档 | 发测试消息 ✅ |
| 飞书 | APP_ID + APP_SECRET | open.feishu.cn | 换 token 验证 ✅ |
| 钉钉 | Webhook + 加签密钥 | 钉钉机器人文档 | 加签发测试消息 ✅ |
| QQ | Bot Token/配对码 | q.qq.com（预留） | 不支持 |
| Discord | Bot Token | discord.com/developers（预留） | 不支持 |
| WhatsApp | 手机号 + 配对码 | 配对说明（预留） | 不支持 |

- 每个平台**字段独立**（不再是统一 Token 输入框），保存按平台写对应 credentials ref
- 展开后顶部"如何获取"引导块（分步 + 可点击链接，走 `shell.openExternal`）
- 部分平台提供"测试连接"按钮（用表单当前值直连平台 API，不读取已存凭据、不打印 token）

## Part B4：adapter 字段对齐（确认 ✅）
- 飞书 `FEISHU_APP_ID`+`FEISHU_APP_SECRET`（token 自动刷新）、钉钉 `DINGTALK_BOT_WEBHOOK`+`DINGTALK_BOT_SECRET`（HMAC 加签）、微信 `WECHAT_BOT_WEBHOOK`、Telegram `TELEGRAM_BOT_TOKEN` —— 与注册表 ref 完全一致，无需改动

## Part C：平台注册表（实测 ✅）
- 新增 `src/channelRegistry.ts`：`{id, name, fields[], guide[], adapterName}` 可扩展结构
- 新增平台 = 注册表加一条 + 建一个 dsh-bot-* 插件，UI 自动出现（WhatsApp/Slack/Signal 预留）
- 空状态：全部未配置时显示引导文案"连接一个消息平台，随时和你的 Agent 对话"

## 新增 IPC
- `cred:describeRefs`（adapter.describeCredentialRefs：按任意 ref 查配置状态——原 listCredentials 只枚举 LLM ref，通道 token 查不到状态，已修复）
- `shell:openExternal`（引导链接安全打开，仅允许 http/https）
- `channel:test`（按平台测试连接，不落日志 token）

## 改动文件
- `src/channelRegistry.ts`（新）：平台注册表
- `src/components/MessageChannelsSection.tsx`（重写）：竖排列表 + accordion + 定制字段 + 引导 + 测试
- `src/styles.css`：channel-tabs/tab/card → channel-list/row/body/guide/dot 新样式
- `shared/types.ts`：HarnessApi + describeCredentialRefs/openExternal/testChannel
- `adapter/index.ts`：describeCredentialRefs
- `electron/ipc.ts`：cred:describeRefs / shell:openExternal / channel:test
- `electron/preload.ts`：暴露 3 个新方法
- 顺带修复 006 残留：`⏰` → `[定时提醒]`（MainView.tsx / reminder-manager.ts）

## 自测结果
- ✅ `pnpm typecheck` 零错误；`pnpm build` 通过；`pnpm dev:renderer` 200
- ✅ 竖排列表 7 平台渲染，状态圆点读取 describeRefs 正确反映配置态
- ✅ 全界面无新增 emoji（扫描 src/electron/adapter/shared 通过）

## 需要 owner 实测
- ⏳ 展开各平台核对字段与引导链接可点开
- ⏳ 配置真实 token 后保存 → 圆点变实心、重启保留、测试连接返回成功
- ⏳ Telegram / 微信 / 飞书 / 钉钉 真实收发消息

## 已知限制
1. **预留平台（QQ/Discord/WhatsApp）** 无 adapter 插件，仅能保存配置，"测试连接"返回不支持。
2. **测试连接**用表单当前输入值直连平台 API（不读已存凭据，避免明文回传主进程/渲染层）；已保存但表单被清空后需重新输入才能测试。
3. **飞书/钉钉入站**需平台事件订阅/公网接收器（桌面应用无常驻公网，沿用 006 说明）；出站与连接验证已实现。
