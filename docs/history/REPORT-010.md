# harness-desktop 交付报告（010 空状态首页加完整输入套件）

> 状态：完成并实测（typecheck/build 通过，真实发送链路待 owner 实测）。

## 完成内容
- **无会话首页（sessionId=null）** 现在显示：WhaleLogo + "开始对话" + 提示文字，**下方直接渲染完整 ChatInput 套件**（输入框 / 工作区 / 模式 / 模型两级 / 附件 / 发送）
- 空状态**直接发送** = 一步完成：自动 `createSession(workspaceCwd, mode)` → 应用选中模型 → 通知 MainView 激活会话 → 发送消息
- 空状态可切换工作区 / 模式 / 模型（模式走 `onModeChange`，模型走本地 selection，会话内逻辑不受影响）
- 空状态可添加附件
- 未配置 API Key 时沿用 `apiKeyMissing` 提示条（点击去设置）
- 左侧"新会话"原有路径不受影响

## 改动文件
- `src/components/ChatView.tsx`：模型/预设加载拆为独立 effect（不依赖 sessionId）；`!sessionId` 分支渲染 `ChatInput`；新增 `sendFromEmpty` + `onSessionCreated` prop
- `src/components/MainView.tsx`：新增 `activateSession`（激活 + view 切 chat + 刷新列表），传给 ChatView
- `src/styles.css`：`.chat-empty` 改纵向布局；`.chat-empty-hero`（居中）+ `.chat-empty-composer`（底部输入区，max-width 760px）

## 自测结果
- ✅ `pnpm typecheck` 零错误；`pnpm build` 通过；`pnpm dev:renderer` 200
- ✅ 空状态渲染 logo + 文字 + 输入套件；无新增 emoji

## 需要 owner 实测
- ⏳ 空首页输入文字 → 发送 → 自动创建会话并进入聊天，消息已发出
- ⏳ 空状态切换工作区/模式/模型、添加附件
- ⏳ 左侧"新会话"路径仍正常

## 已知限制
1. 空状态模型选择仅本地保存（创建会话后尽力应用）；进入会话后以引擎实际模型为准。
2. 空状态发送创建会话为异步链路，创建失败会在输入区下方显示错误。
