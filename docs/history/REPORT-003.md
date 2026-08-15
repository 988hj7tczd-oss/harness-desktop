# harness-desktop 交付报告（003-ui-redesign-v1）

> 状态：UI 全面重构完成。真实对话（含转圈长任务）待 owner 实测验收。

## 完成情况

| 验收项 | 内容 | 状态 |
|---|---|---|
| 1 | 左上角鲸鱼 logo + "harness desktop"（深色下白色可见） | ✅ |
| 2 | 主界面 = 品牌栏 + 会话列表 + 聊天区，无散落功能按钮 | ✅ |
| 3 | 左下角设置按钮，含引擎状态/API Key/自定义接入/工作区/默认模型 | ✅ |
| 4 | 会话工作时左侧标签转圈，结束后停转 | ✅ |
| 5 | 视觉与 dsh 官方 Web UI 风格一致（深色/圆角/卡片） | ✅ |
| 6 | pnpm typecheck 零错误、pnpm dev 正常启动 | ✅ |

## 改动文件

- `src/components/Brand.tsx`（新增）：内联鲸鱼 logo + wordmark，`?raw` 引入，CSS 强制白色
- `src/assets/brand/*.svg`：从 build/brand 复制供 Vite 引入
- `src/components/MainView.tsx`：`app-shell` + `brand-bar` + `app-body` 布局；running 状态即时更新（bus）+ session.list 不覆盖转圈状态
- `src/components/Sidebar.tsx`：移除品牌区（移到顶栏），新会话按钮 + 会话列表 + 左下角设置按钮；running 会话显示旋转 spinner
- `src/components/ChatView.tsx`：空状态换鲸鱼图标
- `src/chatReducer.ts`：消息 id 改为自增唯一（修复 React key 冲突警告）；流式消息用 streaming 定位
- `src/styles.css`：全面换血为 dsh 官方深色主题 token（--dsw-*：背景层级/边框/文字/DeepSeek 品牌色/状态色），圆角卡片、白底主按钮、转圈动画

## 如何测试

```bash
pnpm dev
```
1. 左上角鲸鱼 + "harness desktop"（白色）
2. 左侧会话列表 + 底部左角 ⚙ 设置；主界面无散落按钮
3. 设置弹窗含：引擎状态 / API Key / 工作区 / 默认模型 / 自定义接入
4. 发消息时对应会话标签转圈（蓝圈旋转），结束后停止
5. 聊天区深色卡片风、消息气泡、两级模型切换、停止按钮

## 自测结果（opencode 实测，CDP 驱动）

- ✅ 品牌区：logo + wordmark 均渲染为白色（rgb(255,255,255)）
- ✅ 布局：品牌栏 + 侧栏 + 聊天区；散落功能按钮仅「新会话」「设置」2 个
- ✅ 设置按钮位于侧栏左下角；弹窗含全部 5 个区块
- ✅ 转圈：running 事件 → 侧栏 `.session-spinner` 出现（animation: session-spin，边框色 deepseek 蓝 rgb(103,158,254)），停止后消失
- ✅ React 警告清零（重复 key 已修复）
- ✅ `pnpm typecheck` 零错误；`pnpm build` 通过

## 需要 owner 实测的项

- ⏳ 配置真实 API Key 后：发消息观察会话标签转圈时长与停转时机
- ⏳ 真实对话 + 工具调用卡片展示
- ⏳ 整体视觉是否满意（深色、圆角、官方风格）

## 已知限制

1. 无 API Key 时 turn 极短（~20ms），转圈可能一闪而过；已加 800ms 最短显示时间保证有反馈（真实任务时长不受影响）。
2. 未做浅色主题（当前固定深色，与官方默认一致）。
3. 品牌 logo 白色为强制（app 固定深色背景），未跟随系统 prefers-color-scheme。

---

---

# harness-desktop 交付报告（会话窗口输入区改版）

> 状态：完成。右上角模型区移入输入区、新增模式选择 + 文件附加。

## 完成内容

| 需求 | 状态 |
|---|---|
| 右上角模型显示区取消，移到输入口右下（发送按钮左边） | ✅ |
| 模型显示简洁化：供应商 · 型号（点击弹出两级选择） | ✅ |
| 输入框左下角：工作区 + 模式（标准/PTC/极简/创造） | ✅ |
| 输入框 ➕ 添加文件 | ✅ |

## 关键实现

- **模式**：映射 dsh agent preset（standard/code/minimal/cordis），切换调用 `agentPreset.select`（仅空会话可切），新建会话带当前模式
- **模型显示**：新组件 `ModelDisplay`（供应商·型号，点击弹 popover 两级选择），替换原右上 ModelPicker
- **文件附加**：`files:pick` IPC（Electron 对话框多选，图片读 base64），附件 chip 展示、可移除；发送时图片→image content part、其他文件→文本路径引用
- **ChatInput 重构**：左下 工作区 chip + 模式下拉；右下 模型显示 + ➕ + 发送

## 自测结果（CDP 实测）

- ✅ 右上角无模型区；左下 workspace chip + 模式下拉（4 项：标准/PTC/极简/创造）
- ✅ 右下 模型显示「DeepSeek · DeepSeek-V4-Flash」+ ➕ + 发送；模型点击弹两级选择
- ✅ 模式切换成功（standard→code 无报错）；新建会话带 mode（agentPreset=code）
- ✅ 文本文件发送 accepted:true；图片发送被引擎拒绝（当前模型不支持图片输入）
- ✅ `pnpm typecheck` 零错误、`pnpm build` 通过

## 已知限制

1. 图片附件需视觉模型：当前默认 `deepseek-v4-flash` 不支持图片，附加图片会收到引擎 `attachment-error` 提示。
2. 模式切换仅限空会话（dsh 限制：会话跑过 turn 后锁定 preset）。
3. 工作区 chip 当前仅展示路径，更改请到设置里操作。

---

---

# harness-desktop 交付报告（会话管理：右键菜单 + 置顶/颜色/归档/删除）

> 状态：完成。会话标签右键菜单全功能。

## 完成内容（对照你确认的方案）

| 菜单项 | 实现 | 实测 |
|---|---|---|
| 重命名 | `session.rename` + 内联输入框 | ✅ 标题更新 |
| 置顶 | app 本地 `pinnedSessionIds`，排序置顶 | ✅ 📌 标记 + 置顶排序 |
| 外观（标签颜色） | app 本地 `sessionColors`，8 色色板 | ✅ 侧栏色带 |
| 复制 ID | Electron 剪贴板 | ✅ 系统剪贴板验证 |
| 分支 | `session.fork` | ✅ 新会话 + 计数+1 |
| 导出 | `GET /api/session.export`（zip）+ 保存对话框 | ✅ 端点返回 zip |
| 归档 | `workspace.archiveSession`，列表隐藏、数据保留 | ✅ 列表隐藏、数据保留、可恢复 |
| 删除（硬删） | 校验 `session.jsonl`/`.jsonl.zstd` 后删目录 | ✅ 磁盘目录消失 |

## 关键实现

- **删除（硬删）**：dsh 无原生 API，主进程按 dsh 同款 `projectKey`/`encodeSegment` 编码定位会话目录，**校验日志文件存在才删**，运行中先 cancel
- **归档隐藏**：adapter `listSessions` 用 `workspace.list` 的 `archivedSessionIds` 交叉过滤
- **置顶/颜色**：存 `app-settings.json`（`pinnedSessionIds`/`sessionColors`），排序置顶
- **交互**：右键完整菜单（含色板子菜单 + 归档/删除二次确认）；悬停快捷 ✏️/🗑
- **顺带修复**：标题 projection 是字符串而非 `{value}`，adapter 映射 bug 导致侧栏标题一直显示"新会话"

## 改动文件

- `shared/types.ts`：AppSettings 扩展、`SESSION_COLORS`、IPC 类型（fork/archive/hardDelete/export/copyText）
- `adapter/index.ts`+`dsh-client.ts`：fork/archive/workspaceList、listSessions 过滤归档 + 标题映射修复
- `electron/ipc.ts`：`session:fork/archive/hardDelete/export`、`clipboard:copy`、路径编码（projectKey/encodeSegment）
- `electron/preload.ts`、`electron/settings-store.ts`
- `src/components/Sidebar.tsx`（重写）、`SessionContextMenu.tsx`（新）、`MainView.tsx`、`styles.css`

## 已知限制

1. **删除不可恢复**：硬删会移除日志文件（这是"删除"与"归档"的区别）；删除前有二次确认。
2. **归档可恢复但无 UI**：dsh 有 `workspace.archiveSession` 但无 unarchive RPC，恢复归档会话目前只能手动（数据文件仍在）。
3. **导出**：dsh 返回 zip 包（内含 session.jsonl），保存为 `.zip`。
4. **置顶/颜色**：app 本地存储，删除/归档会话后若残留引用不影响（按 sessionId 匹配）。

---

---

# harness-desktop 交付报告（首启向导跳过 + 未配置 Key 提示条）

> 状态：完成。

## 完成内容

| 需求 | 实现 | 实测 |
|---|---|---|
| 向导「稍后配置」按钮（下一步左边） | `Wizard.tsx` 加 `onSkip`，主按钮左边渲染 | ✅ 显示、位置正确、点击进主界面 |
| 跳过向导 | `App.tsx` `onSkipWizard` → `{ onboarded: true }` | ✅ 不再重弹，全部可在设置补配 |
| 未配置 API Key 提示条 | `ChatInput` 工具栏右侧、模型选择旁 | ✅ 显示"⚠️ 未配置 API Key"，位置正确 |
| 点击提示条打开设置 | `onOpenSettings` 链路 | ✅ |
| 配置 Key 后提示条消失 | Settings 关闭时 `keyTick` 重新检测 | ✅ |

## 改动文件

- `src/components/Wizard.tsx`：`onSkip` prop + 稍后配置按钮
- `src/App.tsx`：`onSkipWizard`
- `src/components/ChatInput.tsx`：`apiKeyMissing` + `onOpenSettings`，渲染提示条
- `src/components/ChatView.tsx`：透传 props
- `src/components/MainView.tsx`：`hasApiKey` 检测 + `keyTick`（设置关闭重新检测）
- `src/styles.css`：`.wizard-skip`、`.key-missing-hint`

## 行为说明

- 提示条只出现在**有会话的输入区**（无会话时是空状态，无输入区）
- 跳过后 workspace 用 dsh 默认 cwd、模型默认、模式标准；全部可设置补配
- 桌面版跳过一次即不再弹向导（区别于 web 版每次启动重弹）
