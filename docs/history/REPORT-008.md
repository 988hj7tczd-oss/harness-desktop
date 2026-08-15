# harness-desktop 交付报告（008 平台接入凭证修正）

> 状态：Part A/B/C/D 完成并实测（真实平台接入/测试需各平台凭证后验证）。

## 背景（用户指出 + 官方文档实证）
- **QQ 官方接入 = AppID + AppSecret**（机器人 ID + 密钥，Token 鉴权已弃用）→ 我们原只有"单 Token 框"，接入方式错误，必须改。
- 微信/钉钉除已有群机器人方式外，官方还有**企业应用级接入**（公众号 AppID+AppSecret / 企业应用 AppKey+AppSecret）→ 增加接入方式选择。

## Part A：QQ 改 AppID + AppSecret（实测 ✅）
- `channelRegistry.ts` QQ 平台改为双字段：`QQ_BOT_APP_ID`（AppID 机器人 ID）+ `QQ_BOT_APP_SECRET`（AppSecret 密钥），移除废弃 `QQ_BOT_TOKEN`
- guide 更新为：QQ 开放平台创建机器人 → 获取 AppID/AppSecret → 粘贴保存
- 测试连接：`POST https://bots.qq.com/app/getAppAccessToken`（AppSecret 换取 Access Token，官方新鉴权）
- `dsh-bot-qq` adapter 不存在 → 保持 `reserved: true`（仅改字段 + guide，adapter 留待后续）
- 兼容：旧 `QQ_BOT_TOKEN` 未强制删除（clearCredential 兼容，不破坏已有数据）

## Part B：微信增加公众号/开放平台接入（实测 ✅）
- 微信平台 `modes[0]` = 群机器人 Webhook（保留 007），`modes[1]` = 公众号/开放平台
- 方式 2 字段：`WECHAT_APP_ID` + `WECHAT_APP_SECRET`
- 方式 2 引导：微信公众平台创建公众号 → 获取 AppID/AppSecret → 配置服务器
- 方式 2 测试：`GET api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=…&secret=…` 验证
- note 说明两种方式适用场景（webhook 最简 / 公众号功能全）

## Part C：钉钉增加企业应用接入（实测 ✅）
- 钉钉平台 `modes[0]` = 群机器人 Webhook+加签（保留 007），`modes[1]` = 企业应用
- 方式 2 字段：`DINGTALK_APP_KEY` + `DINGTALK_APP_SECRET`
- 方式 2 引导：钉钉开放平台创建应用 → 获取 AppKey/AppSecret → 启用机器人
- 方式 2 测试：`GET oapi.dingtalk.com/gettoken?appkey=…&appsecret=…` 验证

## Part D：设置页 UI 适配（实测 ✅）
- 微信/钉钉展开时顶部显示**接入方式 radio 选择**（Webhook 方式 / 企业应用方式），切换显示对应字段组 + 引导 + 测试
- `platformConfigured` 改为**任一方式的全部字段配齐即算已配置**（`modeConfigured` + `platformConfigured`）
- 展开时默认选中已配置的方式（`defaultMode`），无则第一个
- 每个方式下有说明文字（"只能推送，最简"/"可收发消息，功能全"）

## 新增/修改
- `src/channelRegistry.ts`：`ChannelPlatform` 升级为 `modes: ChannelMode[]`（多接入方式结构）；新增 `modeConfigured`/`defaultMode`；`ALL_CHANNEL_REFS` 覆盖全部方式 ref
- `src/components/MessageChannelsSection.tsx`：多方式渲染（radio + 字段/引导/测试随方式切换）；save/disconnect/test 按当前方式操作
- `src/styles.css`：`.channel-modes/.channel-mode/.channel-mode-radio` 等 radio 选择样式
- `electron/ipc.ts`：`channel:test` 增加 `modeId` 参数，新增微信 mp / 钉钉 app / QQ 测试分支
- `shared/types.ts` + `electron/preload.ts`：`testChannel(platformId, modeId, values)`

## 保持不变（验收标准 7）
- 飞书：`FEISHU_APP_ID` + `FEISHU_APP_SECRET`（未改）
- Telegram：`TELEGRAM_BOT_TOKEN`（未改）
- Discord：`DISCORD_BOT_TOKEN`（未改）
- 007 全部功能（竖排/引导/测试/注册表）保留

## 自测结果
- ✅ `pnpm typecheck` 零错误；`pnpm build` 通过；`pnpm dev:renderer` 200
- ✅ QQ 双字段渲染、微信/钉钉接入方式 radio 切换显示对应字段
- ✅ 飞书/Telegram/Discord 字段与 007 完全一致
- ✅ 全界面无新增 emoji（扫描 src/electron/adapter/shared 通过）

## 需要 owner 实测
- ⏳ QQ 展开核对 AppID + AppSecret 双输入框 + q.qq.com 引导链接
- ⏳ 微信/钉钉切换接入方式，任一方式字段配齐 → 圆点变实心
- ⏳ 各平台真实凭证保存 + 测试连接成功

## 已知限制
1. **QQ**：`dsh-bot-qq` adapter 未实现（保持 reserved），仅能保存配置 + 测试凭证有效性；收发消息需后续实现 adapter。
2. **微信公众号 / 钉钉企业应用**：凭证可保存 + 测试验证；对应 adapter 收发能力待后续实现（群机器人 webhook 方式仍可发消息）。
3. **入站**：飞书/钉钉/企微入站仍需平台事件订阅/公网接收器（桌面应用无常驻公网，沿用 006/007 说明）。
4. **测试连接**用表单当前输入值直连平台 API（不读已存凭据），保存后表单被清空需重新输入才能测试。
