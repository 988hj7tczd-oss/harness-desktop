# harness-desktop 交付报告（004 设置控制台 + 消息通道）

> 状态：Part A（A1-A7）完成并实测。Part B 网关架构 + Telegram adapter 就绪（可加载），真实平台连接待 token 验收。QQ/Discord adapter 待实现。

## Part A：设置控制台（全部实测通过）

| 项 | 实现 | 实测 |
|---|---|---|
| A1 凭证统一 | credentials.describe 枚举全部 ref + set/unset | ✅ 设置/清除/状态切换 |
| A2 定时提醒 | 桌面端 ReminderManager（setTimeout→session.prompt 注入） | ✅ 5s 后注入会话 |
| A3 记忆管理 | 读写 harness-memory 存储文件 | ✅ 增删查 |
| A4 计划模式 | `/plan` 斜杠命令（host 命令表执行） | ✅ ok |
| A5 Web 搜索 | web-search-deepseek 命名空间配置 | ✅ get/set |
| A6 会话导出 | session.history → JSON/Markdown + 保存对话框 | ✅ |
| A7 快捷键 | Menu Cmd+N / Cmd+, / Cmd+W | ✅ 菜单注册 |

**架构说明**：dsh HTTP 网关 `UNARY_ROUTES` 是固定表，插件无法通过 `/api` 暴露自定义 RPC（不改引擎前提下），因此 A2/A3/A4 采用桌面端实现或斜杠命令——这是在不改引擎约束下的最佳路径。

## Part B：消息通道

- **dsh-bot-gateway 插件**（`plugins/dsh-bot-gateway/`）：会话映射存储（ctx.storageDomain）+ 入站 `agent.followup()` + 出站订阅 `session/event` 回发
- **dsh-bot-telegram 插件**（`plugins/dsh-bot-telegram/`）：官方 Bot API 长轮询（getUpdates/sendMessage），token 走 credentials
- **profile-setup**：三个本地插件（memory/gateway/telegram）自动安装 + 登记 bundle
- **设置"消息通道"区**：Telegram/QQ/Discord 三卡（token 配置 + 状态）
- ✅ 插件安装进 profile、dsh 带插件正常启动（host.describe 通过）
- ⚠️ 真实 Telegram 收发、QQ/Discord adapter 需 token 后验证

## 已知限制

1. **A2/A3/A4 非 dsh 原生 RPC**：提醒走桌面端定时器、记忆走存储文件、计划走 `/plan` 命令（因 dsh 无对应公开 RPC）
2. **记忆桌面端写入需重启生效**（运行中插件持内存态，storage-json 不热加载外部改动）
3. **消息通道真实连接未验证**：需真实 Bot Token；QQ/Discord adapter 待实现（当前仅配置 token 占位）
4. **Bot 入站依赖 agent 生命周期**（ctx.agents.create/get），未配 key 时 agent 无法完整处理 turn

---

---

# harness-desktop 交付报告（空状态鲸鱼 + 会话删除修复）

> 状态：完成，实测通过。

## 1. 聊天空状态鲸鱼复用彩色渐变

- 新增 `src/components/WhaleLogo.tsx`：抽出随机 12 色渐变 + SMIL 流动动画；渐变 id 用 `useId()` 唯一化（多实例不冲突）
- `Brand.tsx` 重构：logo 改用 `<WhaleLogo className="brand-logo" />`
- `ChatView.tsx` 空状态：`🐋` emoji → `<WhaleLogo className="chat-empty-logo" />`（64px）
- `styles.css`：删除硬编码 `fill: url(#whale-grad)`（改注入唯一 id）；空状态 svg 64px
- 顺带修复：Brand.tsx 曾引用已删除的 wordmark.svg（导致 renderer 空白）——改回文字字标

实测：品牌区鲸鱼 + 空状态鲸鱼各自渲染、渐变 id 唯一、动画运行。

## 2. 会话删除无反应 —— 根因与修复

**根因**：dsh 的 session 存储持有**内存注册表**，仅外部删除会话日志文件后，`session.list` 仍返回该会话（外部删文件 ≠ dsh 注销会话），所以界面刷新后会话还在，看起来"点击删除没反应"。

**修复**（`electron/ipc.ts` `session:hardDelete`）：
1. 先 `workspace.archiveSession(sessionId)` —— dsh 原生把会话从活跃列表移除（我们的 `listSessions` 已按 archivedSessionIds 过滤，立即消失）
2. 再取消运行中的 turn
3. 最后尽力删除会话日志文件（数据清除）

实测：快捷删除 2→1、右键删除 1→0 均生效；删除全部会话后列表为空。

## 会话标签全部功能复核（实测）

| 功能 | 状态 |
|---|---|
| 重命名 | ✅ |
| 置顶 | ✅ |
| 外观（标签颜色） | ✅ |
| 复制 ID | ✅ |
| 分支 | ✅（需会话有已完成的 turn，空白会话 fork 为 dsh 限制） |
| 归档 | ✅ |
| 快捷删除 | ✅（修复） |
| 右键删除（带确认） | ✅（修复） |
