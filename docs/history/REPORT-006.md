# harness-desktop 交付报告（006 修复 + 去 emoji + 通道扩展）

> 状态：Part A/B/C 完成并实测（通道真实连接需平台 token）。

## Part A：005 修复
| 项 | 实现 | 实测 |
|---|---|---|
| A1 复盘不污染聊天 | 复盘走**独立隐藏会话**（创建后立即归档，不在会话列表），`reviewSessionId` 存设置 | ✅ 用户界面不再显示复盘 |
| A2 技能提炼真逻辑 | 已完成任务按标题相似度聚类（字符双元组 Jaccard ≥0.45）；≥3 次自动/手动生成 SKILL.md（走隐藏会话，agent 写 `$DSH_HOME/skills/`）；`generatedSkillTypes` 防重复 | ✅ 聚类 + 生成链路接通 |
| A3 任务持久化 | 确认 tasks 存 AppSettings，重启后完整恢复 | ✅ 重启后任务恢复渲染 |

## Part B：全局去 emoji
- 按清单清除全部 emoji（SettingsModal/TaskPanel/Sidebar/ContextMenu/Memory/Skills/ChatInput/MessageBubble/App/chatReducer/ipc/adapter），保留 ✕ 关闭按钮
- Boot/向导的 🛠 换成 **WhaleLogo**（48-56px），三处品牌统一
- 扫描 src/electron/adapter：**无 emoji 残留**（仅保留 ✕ 功能符号）

## Part C：消息通道扩展
- 新增 3 个 adapter：`dsh-bot-wechat`（企业微信 webhook）、`dsh-bot-feishu`（app_id/secret + token 缓存）、`dsh-bot-dingtalk`（webhook + HMAC 加签）
- 全部注册进 web profile bundle（6 插件：memory/gateway/telegram/wechat/feishu/dingtalk）
- 设置页消息通道 **6 卡片**：Telegram/微信/飞书/钉钉/QQ/Discord，实测渲染 ✅

## 诚实说明
1. **A1/A2 复盘与技能生成的执行**走 dsh 引擎（隐藏会话 + agent 工具），需 API Key 后 agent 才能真正 memory_save / 写 SKILL.md；无 key 时链路已接通但 agent 无法执行
2. **微信/飞书/钉钉 adapter**：webhook 出站已实现（发送 agent 回复）；**入站需外部 webhook 接收器**（桌面应用无法常驻公网），token 配置后发送可验证
3. 复盘隐藏会话已归档，prompt 发送正常（agent 附着处理需 key）
4. 技能聚类用字符相似度（简单，可升级语义）
