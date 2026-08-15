---
title: 建议 10 + 归档：electron-updater + 报告归档
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（发布收尾，基于 001-016）
---

# 任务：electron-updater 自动更新 + docs 报告归档

项目：~/development/harness-desktop
基于：001-016 已验收

## 背景
上线前建议：⑩自动更新（桌面应用标配）+ 报告归档（README 过时的一部分）

---

## Part A：electron-updater 自动更新（建议 10）

### A1. 现状
- 无 electron-updater，发新版靠用户重新下载安装
- 桌面应用标配能力缺失

### A2. 实现
- 添加 electron-updater 依赖
- electron-builder.yml 配置 publish：
  ```yaml
  publish:
    provider: github
    owner: 988hj7tczd-oss
    repo: harness-desktop
  ```
- 主进程集成：
  - 启动时检查更新（autoUpdater.checkForUpdatesAndNotify）
  - 下载进度 → 提示（"正在下载更新 x%"）
  - 下载完成 → 提示重启安装
  - 失败静默（不打扰用户，日志记录）
- 菜单/设置：手动检查更新按钮
- 版本管理：package.json version 与更新源对齐（semver）
- ⚠️ 签名与更新：macOS 自动更新需要签名（与 017 关联）——若未签名，
  更新功能标记为"待签名后启用"或仅 Windows 可用（未签名也能装但会拦截）

### A3. 验证
- 打包产物含 latest-mac.yml / latest.yml（electron-updater 需要）
- 本地模拟：版本升级 → 检查更新 → 提示下载

---

## Part B：docs 报告归档（收尾）

### B1. 现状
- docs/REPORT.md 987 行堆叠 17 份报告
- 应为"最新版报告"，历史归档到 docs/history/

### B2. 实施
- 按版本归档：docs/history/REPORT-001.md ... REPORT-016.md（或按批次）
- docs/REPORT.md 只留最新（016 或当前）
- prompts/README.md 更新：017-021 状态表
- README 开发指南链接更新（与 018 协同）

---

## ✅ 要做（正面）
1. A：electron-updater（检查/下载/安装/手动检查）
2. B：报告归档（docs/history/ + REPORT.md 只留最新）
3. 保留 001-016 全部功能
4. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要在没有签名时宣称自动更新可用** — 如实标注依赖签名
- **不要把更新源指向错误仓库** — owner/repo 必须正确
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要用 emoji / 不动 Brand/WhaleLogo**
- **不要删除 001-016 已实现功能**
- **不要一次性提交所有 Part** — A → B 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥到日志**

## 验收标准（owner 实测）
1. 打包产物含 latest.yml（updater 元数据）
2. 应用内"检查更新"可用（有更新提示/无更新提示正确）
3. 报告归档完成（docs/history/ + REPORT.md 最新）
4. prompts/README.md 017-021 状态表更新
5. pnpm typecheck 零错误，pnpm dev 正常启动
6. 全界面无新增 emoji

## 交付形式
- 分 Part 提交（A → B），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
