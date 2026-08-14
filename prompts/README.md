# 📂 提示词管理规范

本项目所有**方案提示词**统一存放在本文件夹（`prompts/`），禁止散落别处。

## 命名规范
- 格式：`NNN-<阶段或模块>-<版本>.md`
- `NNN` 为三位序号（001, 002, ...），按创建时间递增
- 版本用 `v1/v2/...`，迭代时**复制新文件**，不改旧文件（保留历史）

## 文件状态标注
每个提示词文件头部必须有状态标记（status 字段）：
- `draft` — 草稿，未交付
- `active` — 已交付 codex/opencode 执行中
- `done` — 已验收通过
- `superseded` — 已被新版本替代

## 当前清单
| 文件 | 状态 | 说明 |
|---|---|---|
| 001-harness-desktop-mvp-v1.md | done | harness-desktop MVP（Phase 0-3 已验收） |
| 002-model-ui-custom-provider-v1.md | done | 模型 UI 改版 + 自定义接入（已验收） |
| 003-ui-redesign-v1.md | done | UI 重构：官方风格 + 左下角设置 + 转圈特效（已验收） |
| 004-settings-console-and-bots-v1.md | done | 设置控制台补全 + 消息通道（Part A 完成；Part B 架构/Telegram 就绪待真实 token 验收） |
| 005-agent-evolution-loop-v1.md | done | Agent 进化闭环：任务面板 + 记忆进化 + 技能沉淀（已验收） |
| 006-fix-and-cleanup-v1.md | done | 修复复盘污染 + 补技能提炼 + 全局去 emoji + 微信/飞书/钉钉通道（已验收） |
| 007-channels-redesign-v1.md | done | 消息通道重做：竖排列表 + 按平台定制接入 + 引导（已验收） |
| 008-channel-credentials-fix-v1.md | done | 修正平台凭证：QQ 改 AppID+AppSecret、微信/钉钉加企业应用接入（已验收） |
| 009-channel-security-and-platforms-v1.md | done | 通道安全白名单 + 分步引导 + 错误透传 + Email/Webhooks/Slack 平台（已验收） |
| 010-empty-state-composer-v1.md | done | 空状态首页加完整输入套件（已验收） |
| 011-fix-test-credentials-and-appearance-v1.md | done | 修复测试连接用已保存凭证 + 设置通用加外观配置（已验收） |
| 012-security-hardening-v1.md | done | 安全加固 6 项：sandbox/CSP/导航防护/单实例/消息分页/附件限制（已验收） |
| 013-fix-bot-gateway-e2e-v1.md | done | 修复 bot-gateway 2 个致命 bug（webhooks 空token + workspace 注册）（已验收） |
| 014-fix-agent-model-e2e-v1.md | done | 修复 bot-gateway Bug 3（agent 缺 model）+ 端到端闭环验收（已验收） |
| 015-streaming-ui-and-webhook-reply-v1.md | done | 会话窗口流式优化 + webhook 回复回传（已验收，引擎端验证通过） |
| 016-fix-event-subscription-race-v1.md | active | 修复事件订阅竞态（引擎就绪前 subscribe 丢失 → UI 无流式/无回复显示） |
