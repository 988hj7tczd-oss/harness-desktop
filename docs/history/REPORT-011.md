# harness-desktop 交付报告（011 测试连接修复 + 外观配置）

> 状态：Part A/B 完成并实测（typecheck/build 通过，真实凭证测试/浅色视觉待 owner 实测）。

## Part A：修复测试连接用已保存凭证（Bug）
- **根因**：`channel:test` 只读表单临时值（`values[p.id]`），保存凭证后表单清空 → 传空值 → 测试报"凭证无效"
- **修复**（electron/ipc.ts）：测试连接**优先用已保存的 credentials**，表单有输入才覆盖
  - 新增 `readSavedCredentials(dshHome)`：直接读 `$DSH_HOME/.credentials.yaml`（dsh credentials 本地文件，yaml 解析）
  - 新增 `pick(form, ref)` / `credentialSource(form, ref)` 帮助函数
  - **全部平台统一**：telegram / wechat(mp+webhook) / feishu / dingtalk(app+webhook) / qq / slack / email
- **来源标识**：测试成功后显示"（已保存凭证）"或"（表单凭证）"，区分来源
- 表单为空 + 未保存 → 仍提示"请先填写 xxx"
- 修复后：用户 QQ 真实凭证保存 → 直接点测试 → 用已保存凭证 → 成功

## Part B：设置-通用加"外观"配置
| 配置项 | 选项 | 实现 |
|---|---|---|
| 主题模式 | 深色 / 浅色 / 跟随系统 | `html[data-theme]` + CSS 变量覆盖 |
| 主题色 | DeepSeek 蓝 / 绿 / 紫 / 橙 | `html[data-accent]` + `--hd-accent-*` 别名 |
| 字体大小 | 小 / 中 / 大 | `--hd-font-size*` |
| 消息密度 | 舒适 / 紧凑 | `--hd-msg-gap` / `--hd-msg-padding` |
| 启动行为 | 开机自启 / 启动最小化到后台 | `app.setLoginItemSettings` |

- **实现**：
  - `AppSettings.appearance`（AppearanceConfig，存 app-settings.json，重启保留）
  - `App.tsx` effect 把 appearance 写到 `<html>` 的 data-theme/data-accent/data-font-size/data-density 属性 → CSS 变量即时生效
  - 全站 `var(--dsw-deepseek-*)` → `var(--hd-accent-*)`（主题色切换生效），蓝色 rgba 底 → `color-mix(in srgb, var(--hd-accent-400) X%, transparent)`
  - 浅色主题覆盖全部背景/边框/文字 token，修正 3 处硬编码深色文字（`color: rgb(15,17,21)` → `var(--dsw-bg-base)`）与品牌字标（`#fff` → `var(--dsw-label-primary)`）保证对比度
  - 新组件 `AppearanceSection.tsx`（设置 → 通用 → 外观区）
  - 新 IPC `app:setAutoLaunch`（自启，含 openAsHidden）

## 改动文件
- `electron/ipc.ts`：channel:test 全部平台用已保存凭证 + readSavedCredentials + app:setAutoLaunch
- `electron/main.ts`：启动时应用自启/最小化设置
- `shared/types.ts`：+AppearanceConfig + AppSettings.appearance + setAutoLaunch API
- `electron/settings-store.ts`：外观默认值
- `electron/preload.ts`：+setAutoLaunch
- `src/App.tsx`：appearance → html 属性
- `src/components/AppearanceSection.tsx`（新）：外观配置 UI
- `src/components/SettingsModal.tsx`：通用页挂外观区
- `src/styles.css`：data-theme/accent/font/density 变量 + 全站 --hd-accent 替换 + 浅色对比度修复

## 自测结果
- ✅ `pnpm typecheck` 零错误；`pnpm build` 通过；`pnpm dev:renderer` 200
- ✅ 无新增 emoji
- ✅ 全部平台测试连接走已保存凭证逻辑（表单空 → 读 yaml 已存值）

## 需要 owner 实测
- ⏳ 保存 QQ 凭证后直接点"测试连接"→ 成功（不再报无效）
- ⏳ 表单重新输入新值点测试 → 用表单值
- ⏳ 切浅色主题 → 界面可读；换主题色 → 主色按钮/选中态变色
- ⏳ 字体大小/密度即时生效；重启后外观保留
- ⏳ 开机自启 / 启动最小化开关

## 已知限制
1. **测试连接读取已存凭证**走 `$DSH_HOME/.credentials.yaml` 直接解析（yaml 包为传递依赖，未加新依赖）；若 dsh 改为加密存储需同步调整。
2. **跟随系统**主题在系统切浅色时即时生效（CSS media query）；应用内无手动刷新需求。
3. **启动最小化**仅隐藏主窗口，dsh 引擎仍后台运行；无系统托盘图标（本轮未做托盘）。
