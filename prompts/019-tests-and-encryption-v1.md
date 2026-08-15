---
title: 建议 6+7：基础单测 + safeStorage 加密
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（质量加固，基于 001-016）
---

# 任务：基础单测（Vitest）+ safeStorage 密钥加密

项目：~/development/harness-desktop
基于：001-016 已验收

## 背景
上线前建议：⑥零测试是最大风险（17 轮迭代全靠手工验收）
⑦API key 明文存储（安全意识的用户会问）

---

## Part A：Vitest 基础单测（建议 6）

### A1. 现状
- 全项目零 test 文件、无 test runner 配置
- 交付报告里的"单元测试 PASS"是临时脚本，不可复跑

### A2. 实施
- 引入 Vitest（devDependency，最小侵入）：
  ```bash
  pnpm add -D vitest
  ```
- package.json 加 `"test": "vitest run"` + `"test:watch": "vitest"`
- 重点覆盖（核心资产优先）：
  1. **src/chatReducer.ts**（最关键）：
     - 乐观消息去重（opt- 替换，不重复显示）
     - assistant-start/delta/end 流式归并
     - tool-call/result 卡片状态
  2. **adapter/events.ts**（隔离层转换）：
     - normalizeSessionEvent：assistant/chunk → assistant-delta
     - turn/start → assistant-start
     - 错误事件 → assistant-end + error
  3. **src/tasks.ts**（任务状态机）：
     - queued→running→done/failed
     - 复盘触发条件
  4. **插件 JS**：node:test 或 vitest 跑（dsh-bot-gateway 的 checkAccess 白名单逻辑）
- 测试文件放 `src/__tests__/` 或同目录 `*.test.ts`

### A3. 验证
- `pnpm test` 全绿
- 覆盖 chatReducer 乐观去重/流式/工具卡（3 个核心场景）

---

## Part B：safeStorage 加密 API Key（建议 7）

### B1. 现状
- API key 明文存 `$DSH_HOME/.credentials.yaml`
- readSavedCredentials 直接读文件
- 密钥泄漏风险（磁盘明文）

### B2. 实施
- Electron safeStorage（macOS Keychain / Windows DPAPI / Linux libsecret）：
  - 主进程 `safeStorage.encryptString(key)` → base64 存文件
  - 读时 `safeStorage.decryptString()` → 明文注入引擎
- 改造点：
  - electron/settings-store.ts 或新 credential-store：敏感字段走 safeStorage
  - dsh-home/.credentials.yaml 里的 DEEPSEEK_API_KEY 等敏感值加密存储
  - 引擎需要明文时：解密后通过环境变量/进程参数传入（不留盘）
- 兼容：
  - 已有明文 credentials → 迁移逻辑（启动时检测，自动加密迁移）
  - 引擎读不到加密值时 fallback 到解密流程
- ⚠️ 注意：dsh 引擎自身的凭证读取逻辑不能改（黑盒）——只加密我们读写的那层
  （桌面端 → 引擎的注入路径）

### B3. 验证
- 保存 key → 磁盘文件是密文（看不到明文）
- 启动后 agent 正常对话（解密注入成功）
- 旧明文数据自动迁移

---

## ✅ 要做（正面）
1. A：Vitest + 核心单测（chatReducer/events/tasks/checkAccess）
2. B：safeStorage 加密敏感凭证 + 旧数据迁移
3. 保留 001-016 全部功能
4. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要改 dsh 引擎的凭证读取逻辑** — 只加密我们这层的读写/注入
- **不要把密钥写进测试代码/日志**
- **不要引入重型测试框架** — 只要 Vitest，不引 jest/cypress
- **不要为测试而大改业务代码** — 保持现有结构
- **不要用 emoji / 不动 Brand/WhaleLogo**
- **不要删除 001-016 已实现功能**
- **不要一次性提交所有 Part** — A → B 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**

## 验收标准（owner 实测）
1. `pnpm test` 全绿（chatReducer 乐观去重/流式/工具卡 + events 转换 + tasks 状态机）
2. 保存 API key 后磁盘是密文（cat 文件看不到明文）
3. 重启应用 agent 正常对话（解密注入成功）
4. 旧明文 key 自动迁移为密文
5. pnpm typecheck 零错误，pnpm dev 正常启动
6. 全界面无新增 emoji

## 交付形式
- 分 Part 提交（A → B），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
