/**
 * 消息通道平台注册表（007 Part C + 008 多接入方式）。
 *
 * 新增平台 = 在这里加一条 + 建一个 dsh-bot-* adapter 插件，UI 自动出现。
 * 每个平台可含多种"接入方式"（如 群机器人 Webhook / 企业应用 AppID+AppSecret），
 * 接入方式决定字段组、引导步骤与测试连接方式。
 */

export interface ChannelField {
  /** 字段 id（表单 key）。 */
  id: string
  /** 显示标签。 */
  label: string
  /** password 打码 / text 明文（webhook URL 等）。 */
  type: 'password' | 'text'
  placeholder: string
  /** 存到 dsh credentials 的 ref（引用式，不落明文）。 */
  ref: string
}

export interface ChannelGuideStep {
  /** 步骤说明文字。 */
  text: string
  /** 可选：可点击的引导链接。 */
  url?: string
  /** 链接显示文字。 */
  urlLabel?: string
}

/** 一种接入方式（微信 webhook / 公众号 / 钉钉群机器人 / 企业应用…）。 */
export interface ChannelMode {
  id: string
  /** 方式名（如"群机器人 Webhook"）。 */
  label: string
  /** 方式说明（如"只能推送，最简"）。 */
  description: string
  fields: ChannelField[]
  guide: ChannelGuideStep[]
  /** 是否提供"测试连接"按钮。 */
  testable?: boolean
}

/** 访问控制策略值。 */
export type ChannelPolicy = 'open' | 'allowlist' | 'disabled'

/** 平台访问控制（白名单）配置：DM 与群聊的策略 + 允许列表，存 credentials 引用式。 */
export interface ChannelAccess {
  /** DM 策略 ref（值：open/allowlist/disabled）。 */
  dmPolicyRef: string
  /** DM 允许用户 ref（值：逗号分隔的用户 ID）。 */
  allowedUsersRef: string
  /** 群聊策略 ref。 */
  groupPolicyRef: string
  /** 群聊允许群 ref（逗号分隔的群 ID）。 */
  allowedGroupsRef: string
}

export interface ChannelPlatform {
  id: string
  name: string
  /** dsh 侧 adapter 插件名。 */
  adapterName?: string
  /** 平台接入说明。 */
  note: string
  modes: ChannelMode[]
  /** 访问控制（白名单）配置；缺省则该平台不做白名单校验（沿用开放）。 */
  access?: ChannelAccess
  /** 预留平台（无 adapter 插件，仅可保存配置）。 */
  reserved?: boolean
}

export const PLATFORMS: ChannelPlatform[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    adapterName: 'dsh-bot-telegram',
    note: '官方 Bot API 长轮询接收消息，agent 回复自动回发。',
    access: {
      dmPolicyRef: 'TELEGRAM_DM_POLICY',
      allowedUsersRef: 'TELEGRAM_ALLOWED_USERS',
      groupPolicyRef: 'TELEGRAM_GROUP_POLICY',
      allowedGroupsRef: 'TELEGRAM_ALLOWED_GROUPS',
    },
    modes: [
      {
        id: 'bot',
        label: 'Bot Token',
        description: '官方唯一接入凭证，创建机器人即得',
        fields: [
          {
            id: 'botToken',
            label: 'Bot Token',
            type: 'password',
            placeholder: '123456:ABC-DEF…',
            ref: 'TELEGRAM_BOT_TOKEN',
          },
        ],
        guide: [
          { text: '1. 打开 @BotFather', url: 'https://t.me/BotFather', urlLabel: '打开 @BotFather' },
          { text: '2. 发送 /newbot 创建新机器人' },
          { text: '3. 命名机器人（username 需以 bot 结尾，如 my_agent_bot）' },
          { text: '4. 复制返回的 HTTP API Token（形如 123456:ABC-…）' },
          { text: '5. 粘贴到下方并保存' },
        ],
        testable: true,
      },
    ],
  },
  {
    id: 'wechat',
    name: '微信',
    adapterName: 'dsh-bot-wechat',
    note: '两种接入方式：群机器人最简（只能推送）；公众号/开放平台功能全（可收发）。',
    access: {
      dmPolicyRef: 'WECHAT_DM_POLICY',
      allowedUsersRef: 'WECHAT_ALLOWED_USERS',
      groupPolicyRef: 'WECHAT_GROUP_POLICY',
      allowedGroupsRef: 'WECHAT_ALLOWED_GROUPS',
    },
    modes: [
      {
        id: 'webhook',
        label: '群机器人 Webhook',
        description: '只能推送，最简',
        fields: [
          {
            id: 'webhook',
            label: '群机器人 Webhook',
            type: 'text',
            placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
            ref: 'WECHAT_BOT_WEBHOOK',
          },
        ],
        guide: [
          { text: '1. 在企业微信群「群设置 → 群机器人」添加机器人' },
          { text: '2. 复制机器人的 Webhook 地址', url: 'https://developer.work.weixin.qq.com/document/path/91770', urlLabel: '企微机器人文档' },
          { text: '3. 粘贴到下方并保存' },
        ],
        testable: true,
      },
      {
        id: 'mp',
        label: '公众号 / 开放平台',
        description: '可收发消息，功能全',
        fields: [
          { id: 'appId', label: 'AppID', type: 'text', placeholder: 'wx……', ref: 'WECHAT_APP_ID' },
          { id: 'appSecret', label: 'AppSecret', type: 'password', placeholder: '输入应用密钥', ref: 'WECHAT_APP_SECRET' },
        ],
        guide: [
          { text: '1. 登录微信公众平台', url: 'https://mp.weixin.qq.com', urlLabel: '打开微信公众平台' },
          { text: '2. 进入「开发 → 基本配置」' },
          { text: '3. 复制 AppID 与 AppSecret' },
          { text: '4. 在「服务器配置」填写回调 URL（接收消息用）' },
          { text: '5. 粘贴 AppID/AppSecret 保存' },
        ],
        testable: true,
      },
    ],
  },
  {
    id: 'feishu',
    name: '飞书',
    adapterName: 'dsh-bot-feishu',
    note: '飞书开放平台应用，APP_ID + APP_SECRET 自动换取访问令牌（带缓存刷新）。',
    access: {
      dmPolicyRef: 'FEISHU_DM_POLICY',
      allowedUsersRef: 'FEISHU_ALLOWED_USERS',
      groupPolicyRef: 'FEISHU_GROUP_POLICY',
      allowedGroupsRef: 'FEISHU_ALLOWED_GROUPS',
    },
    modes: [
      {
        id: 'app',
        label: '企业自建应用',
        description: '官方接入凭证为 AppID + AppSecret',
        fields: [
          { id: 'appId', label: 'APP ID', type: 'text', placeholder: 'cli_xxxxxxxx', ref: 'FEISHU_APP_ID' },
          { id: 'appSecret', label: 'APP Secret', type: 'password', placeholder: '输入应用密钥', ref: 'FEISHU_APP_SECRET' },
        ],
        guide: [
          { text: '1. 在飞书开放平台创建企业自建应用', url: 'https://open.feishu.cn', urlLabel: '打开飞书开放平台' },
          { text: '2. 开启机器人能力（应用能力 → 机器人）' },
          { text: '3. 复制 APP ID 与 APP Secret（凭证与基础信息）' },
          { text: '4. 配置事件订阅（接收消息需回调地址，可选）' },
          { text: '5. 粘贴到下方并保存' },
        ],
        testable: true,
      },
    ],
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    adapterName: 'dsh-bot-dingtalk',
    note: '两种接入方式：群机器人最简（只能推送）；企业应用可收发消息。',
    access: {
      dmPolicyRef: 'DINGTALK_DM_POLICY',
      allowedUsersRef: 'DINGTALK_ALLOWED_USERS',
      groupPolicyRef: 'DINGTALK_GROUP_POLICY',
      allowedGroupsRef: 'DINGTALK_ALLOWED_GROUPS',
    },
    modes: [
      {
        id: 'webhook',
        label: '群机器人（Webhook + 加签）',
        description: '只能推送，最简',
        fields: [
          { id: 'webhook', label: 'Webhook', type: 'text', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=…', ref: 'DINGTALK_BOT_WEBHOOK' },
          { id: 'secret', label: '加签密钥', type: 'password', placeholder: 'SEC…（可留空）', ref: 'DINGTALK_BOT_SECRET' },
        ],
        guide: [
          { text: '1. 在钉钉群「群设置 → 智能群助手」添加机器人' },
          { text: '2. 选择自定义（Webhook）机器人，复制 Webhook 地址', url: 'https://open.dingtalk.com/document/orgapp/custom-robots-send-group-messages', urlLabel: '钉钉机器人文档' },
          { text: '3. 开启加签时复制密钥，粘贴到下方并保存' },
        ],
        testable: true,
      },
      {
        id: 'app',
        label: '企业应用',
        description: '可收发消息，功能全',
        fields: [
          { id: 'appKey', label: 'AppKey', type: 'text', placeholder: 'ding……', ref: 'DINGTALK_APP_KEY' },
          { id: 'appSecret', label: 'AppSecret', type: 'password', placeholder: '输入应用密钥', ref: 'DINGTALK_APP_SECRET' },
        ],
        guide: [
          { text: '1. 在钉钉开放平台创建企业内部应用', url: 'https://open.dingtalk.com', urlLabel: '打开钉钉开放平台' },
          { text: '2. 获取 AppKey / AppSecret（应用开发 → 凭证与基础信息）' },
          { text: '3. 启用机器人（应用能力 → 机器人，配置回调）' },
          { text: '4. 粘贴到下方并保存' },
        ],
        testable: true,
      },
    ],
  },
  {
    id: 'qq',
    name: 'QQ',
    adapterName: 'dsh-bot-qq',
    note: 'QQ 开放平台机器人，AppID + AppSecret 接入（Token 鉴权已废弃）。',
    access: {
      dmPolicyRef: 'QQ_DM_POLICY',
      allowedUsersRef: 'QQ_ALLOWED_USERS',
      groupPolicyRef: 'QQ_GROUP_POLICY',
      allowedGroupsRef: 'QQ_ALLOWED_GROUPS',
    },
    modes: [
      {
        id: 'app',
        label: 'AppID + AppSecret',
        description: '官方接入凭证（Token 已弃用）',
        fields: [
          { id: 'appId', label: 'AppID（机器人 ID）', type: 'text', placeholder: '输入机器人 AppID', ref: 'QQ_BOT_APP_ID' },
          { id: 'appSecret', label: 'AppSecret（机器人密钥）', type: 'password', placeholder: '输入机器人密钥', ref: 'QQ_BOT_APP_SECRET' },
        ],
        guide: [
          { text: '1. 在 QQ 开放平台创建应用', url: 'https://q.qq.com', urlLabel: '打开 QQ 开放平台' },
          { text: '2. 启用 C2C 单聊与群聊消息 intents（开发设置 → 事件订阅）' },
          { text: '3. 复制 AppID（机器人 ID）与 AppSecret（开发凭证）' },
          { text: '4. 粘贴到下方并保存' },
        ],
        testable: true,
      },
    ],
    reserved: true,
  },
  {
    id: 'discord',
    name: 'Discord',
    note: 'Discord Bot（预留：adapter 待实现，当前仅保存配置）。',
    modes: [
      {
        id: 'bot',
        label: 'Bot Token',
        description: '官方唯一接入凭证',
        fields: [
          { id: 'token', label: 'Bot Token', type: 'password', placeholder: '输入机器人 Token', ref: 'DISCORD_BOT_TOKEN' },
        ],
        guide: [
          { text: '1. 打开 Discord 开发者后台', url: 'https://discord.com/developers', urlLabel: '打开 Discord 开发者后台' },
          { text: '2. 新建 Application（应用）' },
          { text: '3. 左侧「Bot」页创建 Bot' },
          { text: '4. 开启 Message Content Intent（Bot 页 → Privileged Gateway Intents）' },
          { text: '5. 复制 Bot Token（点 Reset Token）' },
          { text: '6. 粘贴到下方并保存（可生成邀请链接加入服务器）' },
        ],
      },
    ],
    reserved: true,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    note: 'WhatsApp 配对（预留：adapter 待实现，当前仅保存配置）。',
    modes: [
      {
        id: 'pair',
        label: '手机号 + 配对码',
        description: '官方配对接入',
        fields: [
          { id: 'phone', label: '手机号', type: 'text', placeholder: '+86…', ref: 'WHATSAPP_NUMBER' },
          { id: 'pairingCode', label: '配对码', type: 'password', placeholder: '输入配对码', ref: 'WHATSAPP_PAIRING_CODE' },
        ],
        guide: [
          { text: '1. 安装 WhatsApp Business 并准备一台空闲设备' },
          { text: '2. 登录后复制配对码（设备间配对）' },
          { text: '3. 粘贴手机号与配对码后保存' },
        ],
      },
    ],
    reserved: true,
  },
  {
    id: 'email',
    name: 'Email',
    adapterName: 'dsh-bot-email',
    note: 'SMTP 发送 + IMAP 收信轮询，把邮件变成 agent 的入口和出口。',
    access: {
      dmPolicyRef: 'EMAIL_DM_POLICY',
      allowedUsersRef: 'EMAIL_ALLOWED_USERS',
      groupPolicyRef: 'EMAIL_GROUP_POLICY',
      allowedGroupsRef: 'EMAIL_ALLOWED_GROUPS',
    },
    modes: [
      {
        id: 'smtp',
        label: 'SMTP + IMAP',
        description: '人人有邮箱，最简单',
        fields: [
          { id: 'imapHost', label: 'IMAP 服务器', type: 'text', placeholder: 'imap.qq.com', ref: 'EMAIL_IMAP_HOST' },
          { id: 'imapPort', label: 'IMAP 端口', type: 'text', placeholder: '993', ref: 'EMAIL_IMAP_PORT' },
          { id: 'email', label: '邮箱地址', type: 'text', placeholder: 'you@example.com', ref: 'EMAIL_ADDRESS' },
          { id: 'password', label: '密码 / 授权码', type: 'password', placeholder: '输入邮箱密码或授权码', ref: 'EMAIL_PASSWORD' },
          { id: 'smtpHost', label: 'SMTP 服务器', type: 'text', placeholder: 'smtp.qq.com', ref: 'EMAIL_SMTP_HOST' },
          { id: 'smtpPort', label: 'SMTP 端口', type: 'text', placeholder: '465', ref: 'EMAIL_SMTP_PORT' },
        ],
        guide: [
          { text: '1. 准备一个邮箱（QQ 邮箱 / Gmail / 163 均可）' },
          { text: '2. 开启 SMTP/IMAP 服务并获取授权码', url: 'https://service.mail.qq.com/cgi-bin/help?subtype=1&id=28&no=1001256', urlLabel: 'QQ 邮箱授权码说明' },
          { text: '3. 填写 IMAP/SMTP 服务器、邮箱与授权码' },
          { text: '4. 保存并测试发送' },
        ],
        testable: true,
      },
    ],
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    adapterName: 'dsh-bot-webhooks',
    note: '生成一个本地入站 URL，任何系统（GitHub CI / 监控 / 脚本）POST 消息进来，agent 就能收到。',
    access: {
      dmPolicyRef: 'WEBHOOKS_DM_POLICY',
      allowedUsersRef: 'WEBHOOKS_ALLOWED_USERS',
      groupPolicyRef: 'WEBHOOKS_GROUP_POLICY',
      allowedGroupsRef: 'WEBHOOKS_ALLOWED_GROUPS',
    },
    modes: [
      {
        id: 'inbound',
        label: '入站 Webhook',
        description: '通用入口，POST 即入队',
        fields: [
          { id: 'port', label: '监听端口', type: 'text', placeholder: '8899', ref: 'WEBHOOKS_PORT' },
          { id: 'token', label: 'Webhook Token', type: 'password', placeholder: '自动生成或自定义', ref: 'WEBHOOKS_TOKEN' },
        ],
        guide: [
          { text: '1. 设置监听端口（默认 8899）与访问 Token' },
          { text: '2. 保存后复制生成的入站 URL' },
          { text: '3. 在其他系统 POST JSON 消息：{"text": "你好"} 到该 URL' },
          { text: '4. 例：curl -X POST -H "Content-Type: application/json" -d \'{"text":"hi"}\' http://127.0.0.1:8899/webhook/<token>' },
        ],
        testable: false,
      },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    adapterName: 'dsh-bot-slack',
    note: 'Slack Bot（Socket Mode 免公网，agent 可收发消息）。',
    access: {
      dmPolicyRef: 'SLACK_DM_POLICY',
      allowedUsersRef: 'SLACK_ALLOWED_USERS',
      groupPolicyRef: 'SLACK_GROUP_POLICY',
      allowedGroupsRef: 'SLACK_ALLOWED_GROUPS',
    },
    modes: [
      {
        id: 'socket',
        label: 'Bot Token（Socket Mode）',
        description: '免公网，官方推荐',
        fields: [
          { id: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'xoxb-…', ref: 'SLACK_BOT_TOKEN' },
          { id: 'appToken', label: 'App-Level Token', type: 'password', placeholder: 'xapp-…（Socket Mode 必需）', ref: 'SLACK_APP_TOKEN' },
        ],
        guide: [
          { text: '1. 打开 Slack API 创建 App', url: 'https://api.slack.com/apps', urlLabel: '打开 Slack API' },
          { text: '2. 左侧「Socket Mode」开启（需 App-Level Token，以 xapp- 开头）' },
          { text: '3. 在「Bot Tokens」添加 Bot Token（以 xoxb- 开头）' },
          { text: '4. 订阅事件：message.channels / message.groups / message.im' },
          { text: '5. 把 Bot 邀请进频道后保存' },
        ],
        testable: true,
      },
    ],
  },
]

/** 全部平台的凭据 ref（去重，含连接字段 + 访问控制策略 ref）。 */
export const ALL_CHANNEL_REFS = [
  ...new Set([
    ...PLATFORMS.flatMap((p) => p.modes.flatMap((m) => m.fields.map((f) => f.ref))),
    ...PLATFORMS.flatMap((p) => (p.access ? [p.access.dmPolicyRef, p.access.allowedUsersRef, p.access.groupPolicyRef, p.access.allowedGroupsRef] : [])),
  ]),
]

/** 某接入方式是否已配置：其全部字段 ref 均已配置。 */
export function modeConfigured(m: ChannelMode, configuredRefs: Set<string>): boolean {
  return m.fields.length > 0 && m.fields.every((f) => configuredRefs.has(f.ref))
}

/** 平台是否已配置：任一接入方式的全部字段配齐即算已配置。 */
export function platformConfigured(p: ChannelPlatform, configuredRefs: Set<string>): boolean {
  return p.modes.some((m) => modeConfigured(m, configuredRefs))
}

/** 平台第一个已配置的接入方式（用于展开时默认选中）；无则返回第一个。 */
export function defaultMode(p: ChannelPlatform, configuredRefs: Set<string>): ChannelMode {
  return p.modes.find((m) => modeConfigured(m, configuredRefs)) ?? p.modes[0]
}
