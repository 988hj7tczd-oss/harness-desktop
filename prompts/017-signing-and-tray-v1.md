---
title: 上线硬门槛 1+2：代码签名公证 + 托盘图标
status: done
created: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（发布准备，基于 001-016）
completed: 2026-08-15（A 签名配置+SIGNING.md 就绪（无证书如实未签名）；B 托盘实现+运行时验证通过；GUI 视觉/证书签名待 owner 实测）
---

# 任务：代码签名公证 + 托盘图标（上线硬门槛）

项目：~/development/harness-desktop
基于：001-016 已验收（已 commit 486f4ef 快照备份）

## 背景
上线前硬门槛：①macOS 代码签名 + 公证（否则用户被系统拦截"无法验证开发者"）
②托盘图标（当前启动最小化后无恢复入口，用户卡死）

---

## Part A：macOS 代码签名 + 公证（硬门槛 1）

### A1. 现状
- electron-builder.yml：mac 配置存在但未签名（REPORT 已知限制 5）
- 安装时系统提示"无法验证开发者"，普通用户直接放弃

### A2. 方案（需要用户提供证书，先做配置+流程）
- electron-builder.yml 增加签名配置：
  ```yaml
  mac:
    category: public.app-category.developer-tools
    notarize: true
    # 签名身份从环境变量/钥匙串读取，不硬编码
  ```
- 签名流程（文档化到 docs/SIGNING.md）：
  1. 注册 Apple Developer（个人 99$/年）→ 获取 Developer ID Application 证书
  2. 钥匙串导入证书 + 私钥
  3. electron-builder 自动签名（CSC_LINK/CSC_KEY_PASSWORD 环境变量）
  4. 公证：notarize（Apple 服务验证）→ 自动 staple
- **重要**：没有证书也能先做"代码逻辑准备"：
  - 确认 electron-builder 签名/公证配置正确
  - 写 SIGNING.md 流程文档（用户拿到证书后照做）
  - CI/脚本留签名开关（无证书时跳过，有证书时签名）
- 如果用户已有证书 → 实测签名 + 公证 + 安装验证

### A3. 验证
- 有证书：`pnpm build` 产出签名 dmg → 双击安装无拦截提示 → 公证状态 staples valid
- 无证书：配置就绪 + 文档齐全，用户拿到证书后一步可签

---

## Part B：托盘图标（硬门槛 2）

### B1. 现状
- electron/main.ts：launchMinimized 时只是隐藏窗口，**无托盘图标** → 用户无入口恢复
- 011 限制 3 确认

### B2. 实现
- **彩色鲸鱼 = 项目现有 logo**（src/components/WhaleLogo.tsx，随机渐变动态鲸鱼，
  品牌区 Brand.tsx 已在用；源 SVG 在 src/assets/brand/favicon.svg + build/brand/favicon.svg）
- 系统托盘（Tray）：
  - **托盘图标用鲸鱼，但要分场景处理**（macOS 菜单栏规范）：
    - macOS 菜单栏（status bar）：**优先用单色 template image**
      （16x16 纯黑+alpha，系统自动适配深浅菜单栏）——否则彩色在菜单栏糊成一块
      - 从 favicon.svg 提取单色鲸鱼路径 → 转 template png（16x16 + 2x）
    - 若确实想用彩色鲸鱼：生成 16x16 彩色 png 实测——菜单栏深色时能看清才保留，
      看不清则回退 template（以实测为准）
  - 菜单：显示主窗口 / 新建会话（可选）/ 退出
- 行为：
  - 启动最小化（launchMinimized）→ 隐藏窗口 + 托盘图标存在
  - 点托盘图标 → 恢复/显示主窗口
  - 关闭窗口（X）→ 最小化到托盘（不退出，符合桌面应用习惯；可配置）
  - 托盘菜单"退出" → 真正退出（含 dsh 子进程清理）
- 窗口关闭逻辑调整：
  - 默认：点 X 隐藏到托盘（非退出）
  - 托盘菜单退出 → 完整清理退出
  - 首次托盘显示提示（"应用已最小化到托盘"通知，仅一次）
- **应用图标（Dock/安装包）**：现有 build/icon*.png 若来自脚本极简图，
  考虑换成彩色鲸鱼（WhaleLogo 同款）——但需静态 SVG（去掉动态渐变）

### B3. 验证
- 启动 → 托盘出现鲸鱼图标
- 点 X → 窗口隐藏，托盘仍在 → 点图标恢复
- 托盘菜单"退出" → 完全退出（无残留进程）
- launchMinimized 场景同样可用

---

## ✅ 要做（正面）
1. A：electron-builder 签名/公证配置 + SIGNING.md 文档（无证书也能准备就绪）
2. B：Tray 图标（鲸鱼）+ 菜单（显示/退出）+ 关闭到托盘 + 提示通知
3. 保留 001-016 全部功能
4. 纯文字/CSS，不用 emoji

## ❌ 不要做（反面，硬约束）
- **不要把证书硬编码进代码** — 走环境变量/钥匙串，CSC_LINK/CSC_KEY_PASSWORD
- **不要在没有证书时伪造签名/公证** — 如实标注"未签名"状态
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要重写 adapter 隔离层**
- **不要用 emoji / 不动 Brand 品牌区（托盘用鲸鱼是品牌延伸，OK）**
- **不要删除 001-016 已实现功能**
- **不要一次性提交所有 Part** — A → B 分批，每批等 owner 验收
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**
- **不要写明文密钥/证书到日志**

## 验收标准（owner 实测）
1. 有证书：签名 dmg 安装无拦截 + 公证通过；无证书：SIGNING.md 齐全 + 配置就绪
2. 托盘鲸鱼图标出现
3. 点 X → 隐藏到托盘 → 点图标恢复
4. 托盘"退出" → 完全退出无残留
5. launchMinimized 可用
6. pnpm typecheck 零错误，pnpm dev 正常启动

## 交付形式
- 分 Part 提交（A → B），每 Part 等 owner 验收
- 每 Part 报告：改动文件、如何测试、自测结果、已知限制
