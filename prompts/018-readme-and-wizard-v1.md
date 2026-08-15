---
title: 上线硬门槛 3+4：README 更新 + 首启向导完善
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（发布准备，基于 001-016）
---

# 任务：README 更新 + 首启向导完善（上线硬门槛）

项目：~/development/harness-desktop
基于：001-016 已验收

## 背景
上线硬门槛：③README 过时（还写着"待验收"，用户/投资人第一眼看到过时文档）
④首启向导需完善（"开箱即用"是核心卖点，首次体验必须顺）

---

## Part A：README 更新（硬门槛 3）

### A1. 现状
- README.md 还写着"owner 实测待验收"（015 已用真实 key 实测过）
- 需要全面刷新为**产品视角**（不是开发视角）

### A2. 目标结构
```markdown
# harness-desktop — DeepSeek Harness 桌面端（开箱即用版）

## ✨ 特性（用户视角）
- 开箱即用：内置 DeepSeek 引擎，装完即聊
- 流式聊天：打字机输出 + 思考过程可视化
- 任务面板：任务追踪/复盘/重试
- Agent 进化：记忆沉淀 + 技能自动提炼
- 10+ 消息平台：Telegram/QQ/微信/飞书/钉钉/Discord/Webhooks…
- 安全：白名单/CSP/单实例
- 外观：深浅主题/主题色/字体/密度

## 🚀 快速开始
- 下载（GitHub Release / 独立站）
- 首启：配 API Key → 开始对话

## 📸 截图（可选，有就放）

## 🛠 开发指南（简版）
- pnpm dev / pnpm build / pnpm test
- 提示词工作流说明（prompts/README.md）

## 📦 技术栈
- Electron + React + dsh 引擎（@deepseek-ai/dsh@0.1.0-rc.6）

## ⚠️ 已知限制（诚实标注）
- 未签名（或已签名）
- 体积 ~500MB
- Windows 未实机验证
```

### A3. 中文为主 + 英文摘要
- 主体中文（目标用户中文）
- 顶部加 1 段英文简介（GitHub 全球可见性）

---

## Part B：首启向导完善（硬门槛 4）

### B1. 现状
- 已有 Wizard.tsx（首启向导）但需完善：模型选择 37 provider 卡片问题（002 修过）、
  key 配置、工作区选择

### B2. 完善内容
- **Step 1 欢迎**：品牌 + 一句话价值（"装完即用的 AI 助手工作台"）
- **Step 2 配置 API Key**：DeepSeek key 输入（默认 provider）+ 测试连接按钮
  （复用 channel:test 能力，或 provider 测试）
- **Step 3 选择工作区**：默认推荐（项目目录/文档目录），可跳过
- **Step 4 完成**：进入聊天（空状态已有点击即聊）
- 每一步：清晰说明 + 可跳过 + 返回修改
- 已配置过 key → 跳过向导直接进聊天（不重复打扰）
- 向导进度指示（Step x/4，CSS 实现，不用 emoji）

### B3. 验证
- 全新环境（清 dsh-home）→ 启动 → 向导 4 步 → 配 key → 进聊天
- 已配 key → 启动直接进聊天
- 向导中测试连接成功/失败反馈

---

## ✅ 要做（正面）
1. A：README 全面刷新（产品视角 + 特性 + 快速开始 + 已知限制）
2. B：首启向导 4 步完善（欢迎/Key/工作区/完成），可跳过 + 进度指示
3. 保留 001-016 全部功能
4. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要把 API Key 写进 README/示例** — 全部用占位符（YOUR_API_KEY）
- **不要夸大功能** — 已知限制如实写（未签名/体积/Windows）
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要重写 adapter 隔离层**
- **不要用 emoji / 不动 Brand/WhaleLogo**
- **不要删除 001-016 已实现功能**
- **不要一次性提交所有 Part** — A → B 分批，每批等 owner 验收
- **不要假装验收通过** — 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥到日志**

## 验收标准（owner 实测）
1. README 产品视角完整（特性/快速开始/已知限制/技术栈）
2. 全新环境首启 → 4 步向导 → 配 key → 进聊天
3. 已配 key → 跳过向导
4. 向导测试连接可用
5. pnpm typecheck 零错误，pnpm dev 正常启动
6. 全界面无新增 emoji

## 交付形式
- 分 Part 提交（A → B），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
