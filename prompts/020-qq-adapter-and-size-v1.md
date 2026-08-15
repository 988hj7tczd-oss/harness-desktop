---
title: 建议 8+9：QQ adapter 补全 + 体积审计
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（功能补全，基于 001-016）
---

# 任务：QQ adapter 补全 + 打包体积审计

项目：~/development/harness-desktop
基于：001-016 已验收

## 背景
上线前建议：⑧QQ/Discord/WhatsApp adapter 未实现（channelRegistry 标 reserved）
⑨打包体积 ~500MB 影响转化率

---

## Part A：QQ adapter 补全（建议 8，最高优先）

### A1. 现状
- channelRegistry 里 QQ 标 `reserved: true`（只能保存配置 + 测试，不能收发）
- 用户有真实 QQ 凭证（AppID 1905427180 + AppSecret，已验证有效）
- 008 已实现 QQ 测试连接（AppSecret → Access Token，官方新鉴权）

### A2. 实现（参考 Telegram adapter 模板 + QQ 官方 API v2）
- plugins/dsh-bot-qq/index.js（参考 dsh-bot-telegram 结构）：
  - **WebSocket 长连接**到 QQ Gateway（官方 api-v2 用 WS 收消息，不是轮询/webhook）
  - 凭证：AppID + AppSecret → Access Token（已实现的 getAppAccessToken 复用）
  - intents：C2C 单聊 + 群聊 @消息
  - 入站：handleInbound(platform, chatId, text) → botGateway
  - 出站：adapter.send(chatId, text) → QQ REST API 发消息
- 参考文档：
  - ~/dsh-src 里 QQ 相关（如有）
  - QQ 官方 api-v2 文档（bot.q.qq.com/wiki/develop/api-v2/）
  - Hermes qqbot adapter（~/.hermes/hermes-agent/website/docs/user-guide/messaging/qqbot.md）
- 注册到 profile-setup（cordis.patch.yml）+ channelRegistry 去掉 reserved

### A3. 验证
- 配真实 QQ 凭证 → 测试连接通过
- QQ 发消息 → agent 回复（端到端）
- 沙箱模式：QQ 沙箱 bot 用 sandbox.q.qq.com（008 发现过，加配置项）

### A4. Discord/WhatsApp
- 本轮不做（工作量优先 QQ），channelRegistry 保持 reserved
- 但预留清晰：注释说明"待实现，参考 QQ/Telegram 模式"

---

## Part B：打包体积审计（建议 9）

### B1. 现状
- 打包 ~500MB（asar:false + 完整复制 node_modules）
- 体积影响下载转化率

### B2. 审计步骤
- 分析体积构成：electron-builder 产出的 app 内各目录大小
  ```bash
  du -sh out/mac*/harness-desktop.app/Contents/Resources/* 2>/dev/null | sort -rh | head -20
  ```
- 找出大头（通常：node_modules 里 dsh 全家桶 / Electron 框架本身 ~200MB）
- 可裁剪项：
  - dsh 依赖闭包：@deepseek-ai/* 只用部分包？检查是否有未用包
  - 平台相关模块：仅 mac 打包时排除 win 依赖
  - 资源压缩：图标/字体
- **不裁剪**：node-pty/koffi（原生模块必需）、dsh 引擎（核心）

### B3. 交付
- 体积审计报告（docs/SIZE.md）：各目录大小 + 可优化项 + 建议
- 安全裁剪（明确收益的）：如排除多余平台二进制
- 目标：尽量降到 300-400MB（Electron + dsh 底子，500→300 现实）

---

## ✅ 要做（正面）
1. A：QQ adapter（WS 长连接 + 收发 + 沙箱支持），真实凭证验证
2. B：体积审计报告 + 安全裁剪
3. 保留 001-016 全部功能
4. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要砍掉 node-pty/koffi/dsh 引擎** — 原生模块和核心必需
- **不要为了体积牺牲功能** — 只裁明确多余的东西
- **不要在本轮做 Discord/WhatsApp adapter** — 专注 QQ，预留即可
- **不要把 QQ token 写进代码/日志**
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要用 emoji / 不动 Brand/WhaleLogo**
- **不要删除 001-016 已实现功能**
- **不要一次性提交所有 Part** — A → B 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**

## 验收标准（owner 实测）
1. QQ adapter 真实收发（配真凭证，QQ 发消息 → agent 回复）
2. 沙箱模式可配置（sandbox.q.qq.com）
3. 体积审计报告（docs/SIZE.md）含各目录大小 + 建议
4. 安全裁剪后体积下降（有数据对比）
5. pnpm typecheck 零错误，pnpm dev 正常启动
6. 全界面无新增 emoji

## 交付形式
- 分 Part 提交（A → B），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
