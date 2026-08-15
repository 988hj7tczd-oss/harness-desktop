# harness-desktop 交付报告（017 代码签名公证 + 托盘图标）

> 状态：Part A 配置+文档就绪（无证书，如实未签名）；Part B 托盘实现并运行时验证通过。
> 签名/公证需 owner 提供 Apple Developer 证书后实测；托盘视觉/关闭到托盘需 owner GUI 实测。

## Part A：macOS 代码签名 + 公证（硬门槛 1）
- **electron-builder.yml**：
  - `mac.notarize.teamId: ${env.APPLE_TEAM_ID}`（环境变量，不硬编码）
  - `mac.identity: null`（无证书时跳过签名；有证书时 electron-builder 自动签名）
  - 签名/公证凭证走 `CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`
- **docs/SIGNING.md**（新）：完整流程文档
  - 注册 Apple Developer → Developer ID Application 证书 → 导出 p12
  - 本地签名（钥匙串 / 环境变量）两种方式
  - 公证（APPLE_ID + 专用密码 + teamId）+ 自动 staple
  - 验证命令（codesign / spctl / stapler）+ 常见问题 + CI 参考
- **现状**：配置就绪，未配真实证书 → 产物**未签名**（如实标注，不伪造）

## Part B：托盘图标（硬门槛 2）
- **托盘图标**：从 `build/brand/favicon.svg` 生成纯黑+alpha **template** PNG
  （`build/tray/TrayTemplate.png` 16x16 + `TrayTemplate@2x.png` 32x32）
  - 用 sips 渲染 SVG → PIL 强制纯黑 + 缩放
  - macOS 菜单栏自动适配深浅色（template 规范）
- **菜单**：显示主窗口 / 新建会话 / 退出
- **行为**：
  - `createTray()`：nativeImage template + 单击恢复窗口
  - 点 X → `hide()` 到托盘（不退出）+ 首次提示通知
  - 托盘"退出" → `shutdown()`（销毁托盘 + 清理 dsh）
  - `launchMinimized` → 隐藏窗口 + 托盘提示 + 恢复入口
  - `window-all-closed`：有托盘时永不退出
- **electron-builder**：files 增加 `build/tray/**/*` + `build/brand/**/*`

## 实测结果
| 验收项 | 结果 |
|---|---|
| 托盘 template 图加载 | ✅ IMAGE_EMPTY:false, 16x16, IS_TEMPLATE:true |
| Tray 创建/销毁 | ✅ TRAY_CREATED_OK / TRAY_DESTROYED_OK |
| app 启动无崩溃 | ✅（Electron + dsh 正常运行） |
| 关闭到托盘逻辑 | ✅ 代码审查（close→hide，进程不退出） |
| pnpm typecheck / build | ✅ 零错误 |
| dev server | ✅ 200 |
| 无新增 emoji | ✅ |

## 改动文件
- `electron-builder.yml`：mac.notarize + identity 注释 + files 增加 tray/brand
- `electron/main.ts`：createTray / close→hide / window-all-closed 逻辑 / shutdown 销毁托盘 / launchMinimized 提示
- `build/tray/TrayTemplate.png` + `TrayTemplate@2x.png`（新，从 favicon 生成）
- `docs/SIGNING.md`（新）

## 需要 owner 实测
- ⏳ 提供 Apple Developer 证书 → 按 SIGNING.md 完成签名 + 公证 → 安装无拦截
- ⏳ GUI：托盘鲸鱼图标出现 / 点 X 隐藏到托盘 / 点图标恢复 / 托盘退出无残留 / launchMinimized

## 已知限制
1. **未签名**：当前产物会提示"无法验证开发者"，需 owner 配证书后签名（SIGNING.md 已备好流程）。
2. **托盘视觉**：template 图为纯黑鲸鱼轮廓，macOS 自动着色；最终观感需 owner 实测确认（如需彩色鲸鱼可另生成）。
3. **通知**：首次隐藏到托盘/后台运行会弹一次系统通知（不打扰设计）。
