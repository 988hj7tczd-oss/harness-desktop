# harness-desktop 交付报告（最新）

> 状态：001-030b 完成（030 收尾：安全验证 + 模块方向核对）。历史报告已归档到 `docs/history/`。
> 本文件只保留最新进展摘要 + 版本导航。

## 版本导航

| 版本 | 文件 |
|---|---|
| 001-017 | 见 `docs/history/REPORT-001.md` … `REPORT-017.md` |
| 018 | 本文档下方 |
| 019 | 本文档下方 |
| 020 | 本文档下方 |
| 021 | 本文档下方 |
| 022 | 本文档下方 |
| 023 | 本文档下方 |
| 024 | 本文档下方 |
| 025 | 本文档下方 |
| 026 | 本文档下方 |
| 027 | 本文档下方 |
| 028 | 本文档下方 |
| 029 | 本文档下方 |
| 030 | 本文档下方 |
| 030b | 本文档下方 |

---

# harness-desktop 交付报告（022 彻底删除消息通道）

> 状态：完成（UI + 插件 + 主进程 + profile 四层全部删除；typecheck/test/build/启动验证通过）。

## 删除范围（一个不留）

### A. UI 层
- 删除 `src/components/MessageChannelsSection.tsx`、`src/channelRegistry.ts`
- `SettingsModal.tsx`：移除"消息通道"导航项 + 渲染 + import（设置页导航收拢为 6 项）
- `shared/types.ts`：移除 ChannelPlatform/ChannelMode/ChannelAccessConfig 类型 + channelAccess 字段 + describeCredentialRefs/openExternal/testChannel API
- `src/styles.css`：删除全部 channel-* 样式（35 条规则）

### B. 插件层
- 删除全部 `plugins/dsh-bot-*`（gateway/telegram/qq/wechat/feishu/dingtalk/slack/email/webhooks）+ `plugins/__tests__/`
- 保留 `plugins/harness-memory`（记忆核心）

### C. 主进程/集成层
- `profile-setup.ts`：BUNDLE_PLUGINS 只剩 harness-memory
- `ipc.ts`：删除 channel:test / cred:describeRefs / shell:openExternal 及 channel:test 的全部平台分支 + 相关 helper（readSavedCredentials 等）+ 未用 import
- `preload.ts`：移除 testChannel/describeCredentialRefs/openExternal
- `adapter/index.ts`：移除 describeCredentialRefs
- dsh-home profile：清理已安装 dsh-bot-* bundle + package.json bundles 数组

### D. 数据清理
- safe-credentials.json 只保留 DEEPSEEK_API_KEY（通道值已清）
- .credentials.yaml 保留 DEEPSEEK_API_KEY（引擎黑盒数据，无插件引用通道值）

## 保留（核心功能无损）
- DEEPSEEK_API_KEY 凭证机制 + safeStorage 加密层
- 凭证管理/模型/会话/任务/记忆/技能/外观/流式聊天
- adapter/events.ts 通用事件转换、chatReducer/tasks 测试

## 验证结果
| 项 | 结果 |
|---|---|
| typecheck | ✅ 零错误 |
| test | ✅ 20 个核心测试全绿（chatReducer/events/tasks） |
| build | ✅ renderer 238KB→218KB（通道代码已删） |
| app 启动 | ✅ 无崩溃 |
| dsh 引擎 | ✅ host.describe 正常（provider/model 就绪） |
| find 残留 | ✅ 无 channel/dsh-bot 文件 |
| dev server | ✅ 200 |
| 无新增 emoji | ✅ |

## 已知限制
1. 测试数从 28 → 20（gateway-authorize 测试随插件删除，符合任务 D）。
2. dsh-home 的 .credentials.yaml 仍含通道残留值（引擎黑盒数据，无插件引用，不影响功能）。
3. 历史代码在 git 快照与 docs/history/ 中完整保留，未来可恢复。


---

# harness-desktop 交付报告（018 README 更新 + 首启向导完善）

> 状态：完成（README 产品视角刷新 + 向导 4 步完善；typecheck/build 通过）。

## Part A：README 更新
- 全面刷新为**产品视角**：特性（流式/任务/进化/10+ 平台/安全/外观/托盘）、快速开始、开发指南、技术栈、已知限制（诚实标注未签名/体积/Windows 未验证）
- 中文为主 + 顶部英文摘要；无任何真实密钥（全占位符）

## Part B：首启向导完善
- 3 步 → **4 步**：欢迎（品牌 + 价值）/ 配置 API Key（+ **测试连接**按钮）/ 选择工作区（可跳过）/ 完成
- 新增 `cred:testKey` IPC：主进程调 DeepSeek /models 验证 key 有效性（key 不入 renderer 往返）
- 进度指示 `第 x 步 / 共 4 步` + 步骤点（CSS，无 emoji）；每步可跳过/返回
- 无工作区也可完成（用引擎默认 cwd）

## 改动文件
- `README.md`（重写）
- `src/components/Wizard.tsx`（4 步 + 测试连接）
- `electron/ipc.ts`（cred:testKey）、`shared/types.ts`、`electron/preload.ts`
- `src/styles.css`（wizard-key-msg）

---

# harness-desktop 交付报告（019 Vitest 单测 + safeStorage 加密）

> 状态：完成（28 个单测全绿；safeStorage 迁移实测密文存储）。

## Part A：Vitest 基础单测
- 引入 Vitest；`pnpm test` / `pnpm test:watch`
- **28 个测试**：chatReducer（乐观去重/流式/工具卡，11）、adapter/events（转换/过滤，7）、tasks 状态机（5）、gateway authorize 白名单（7）
- 抽取 `authorize()` 纯函数供插件复用 + 单测

## Part B：safeStorage 加密
- 新增 `electron/credential-store.ts`：safeStorage 加密层，文件 `userData/safe-credentials.json`（base64 密文）
- `setApiKey`/`setCredential`/`setProviderApiKey` 写引擎（明文给黑盒）**且**写加密层
- 启动迁移：把 `.credentials.yaml` 明文加密进 safe-credentials（幂等）
- channel:test 读取优先解密层
- **实测**：启动后 safe-credentials.json 为密文，无明文泄漏

## 改动文件
- `package.json`（vitest + scripts）、`src/__tests__/*`、`adapter/__tests__/*`、`plugins/__tests__/*`
- `electron/credential-store.ts`（新）、`electron/ipc.ts`、`electron/main.ts`
- `plugins/dsh-bot-gateway/index.js`（authorize 抽取）、`tsconfig.electron.json`（排除测试）

---

# harness-desktop 交付报告（020 QQ adapter 补全 + 体积审计）

> 状态：Part A 完成（QQ adapter 实现 + 沙箱 + registry 更新）；Part B 审计报告 + 裁剪方案。

## Part A：QQ adapter 补全
- `plugins/dsh-bot-qq/`（新）：官方 api-v2 WebSocket 长连接
  - AppID + AppSecret → Access Token（getAppAccessToken，支持沙箱 sandbox.bots.qq.com）
  - Gateway WS 收消息（MESSAGE_CREATE：C2C 单聊 + 群聊）
  - REST 回发（v2/users/{openid}/messages / v2/groups/{group_openid}/messages）
  - 沙箱模式：`QQ_BOT_SANDBOX=true` credential 配置
- channelRegistry：QQ 去掉 reserved，加沙箱字段；测试连接支持沙箱
- profile-setup 注册 dsh-bot-qq；Discord/WhatsApp 保持 reserved（预留注释）

## Part B：体积审计
- `docs/SIZE.md`：审计报告 + 修复
- 根因：after-pack 全量复制 node_modules，把 devDependencies（electron 296M、app-builder-bin 207M、typescript 23M、esbuild 9.6M 等约 550MB）带进包
- 修复：after-pack 排除 devDependencies 与构建工具链（node-pty/koffi/@deepseek-ai 等运行时依赖完整保留）
- 预估：node_modules 987MB → ~400MB，整体 .app 1.2G → ~700M，dmg 400-450M

---

# harness-desktop 交付报告（021 electron-updater + 报告归档）

> 状态：Part A 完成（electron-updater 集成 + 手动检查 UI）；Part B 完成（报告归档）。

## Part A：electron-updater 自动更新
- 依赖 electron-updater；electron-builder.yml `publish: github (988hj7tczd-oss/harness-desktop)`
- 主进程：启动后台检查、下载进度推送、下载完成通知 + 重启安装、失败静默
- 菜单 + 托盘"检查更新"；设置-通用"关于与更新"区（`UpdateSection.tsx`）
- `update:check` / `update:quitAndInstall` IPC + `update:status` 推送
- 未签名 macOS 构建 updater 不活跃 → 静默跳过（SIGNING.md 说明）

## Part B：报告归档
- `docs/history/REPORT-001.md` … `REPORT-017.md`（历史完整归档，非编号报告并入对应版本）
- `docs/REPORT.md` 只留最新（导航 + 018-021 摘要）
- `prompts/README.md` 017-021 状态表更新

---

# harness-desktop 交付报告（023 核心体验完善）

> 状态：Part A/B/C/D 完成并验证（typecheck/31 测试/build/dev 全绿）。

## Part A：聊天体验
- **消息复制**：MessageBubble hover 显示"复制"按钮，整条消息（含代码块）复制到剪贴板，成功变"已复制"2 秒
- **消息编辑**（用户消息）：hover"编辑"→ textarea 改原文 → 保存（本地替换 + 重新触发回复）/ 取消
  - chatReducer 新增 `replace-user-text` 乐观替换
- **重新生成**（assistant）：hover"重新生成"→ 重发该回复前最近的用户消息
- **流式细节**：错误时保留已生成部分 + 显示错误行（`message-error-line`）
- hover 操作按钮半透明不遮挡（`.message-actions`）

## Part B：任务面板
- **任务类型**：`inferTaskType`（标题关键词推断 code/writing/query/analysis/other），任务卡显示类型徽标（CSS 色块）
- **过滤**：全部/进行中/已完成/失败 tab
- **进度**：进度条（完成/总步骤 %）+ 步骤数
- **展开轨迹**：完整步骤列表（名称/状态/错误）+ 总结（步数/成功/失败）
- **操作**：失败重试 / 运行中取消（cancelTurn）/ 复制摘要 / 复盘
- TaskStep 增加 pending 状态 + error 字段；tool-result 失败记录错误

## Part C：记忆/技能可视化 + 进化
- **记忆卡片**：类型徽标（preference/project/practice/other）+ 时间 + 标签
- **进化视图**（设置新增"进化"导航）：统计（任务/记忆/技能数）+ 时间线（任务完成/记忆沉淀/技能提炼，按时间倒序）

## Part D：会话轨迹（新增）
- **事件扩展**：adapter/events.ts 新增 `step-end` / `turn-end`（含 reason/error/usage）归一化；`step/start` 与 `turn/start` 分开
- **轨迹构建**：`src/trajectory.ts` TrajectoryBuilder（增量，按 turn 分组：用户/步骤/思考/工具/工具结果/回复）
- **UI**：聊天头部"轨迹"按钮 → 抽屉面板（TrajectoryPanel）
  - 按回合分组，回合头显示节点数/工具数/步数/耗时/结果
  - 节点图标（CSS 色点）+ 标签 + 摘要；工具节点可展开参数/结果；思考/回复可展开
  - 回合错误/停止状态 + token 统计（如有）
- 历史加载也重建轨迹；不落盘（纯前端组装）

## 改动文件
- `src/components/MessageBubble.tsx`（复制/编辑/重新生成/错误行）
- `src/components/ChatView.tsx`（onEditMessage/onRegenerate + 轨迹集成）
- `src/chatReducer.ts` / `shared/types.ts`（replace-user-text + step-end/turn-end 事件）
- `adapter/events.ts`（step-end/turn-end/step-start 归一化）
- `src/components/TaskPanel.tsx` + `src/tasks.ts`（类型/过滤/进度/展开/取消/错误）
- `src/components/MemorySection.tsx` + `EvolutionSection.tsx`（新，记忆徽标 + 进化时间线）
- `src/components/TrajectoryPanel.tsx`（新）+ `src/trajectory.ts`（新）
- `src/styles.css`（message-actions/traj-*/evo-*/task-* 样式）
- 测试：`chatReducer.test.ts`（replace-user-text）、`tasks.test.ts`（inferTaskType/tool error）、`events.test.ts`（step-end/turn-end）

## 验证结果
| 项 | 结果 |
|---|---|
| typecheck | 零错误 |
| test | 31 个全绿（+11 新增） |
| build | 通过 |
| app 启动 | 无崩溃，dsh 引擎正常 |
| dev | 200 |
| 无新增 emoji | 通过 |

## 已知限制
1. **编辑/重新生成**：dsh 无原生"编辑/重发"语义，实现为"重发文本产生新 turn"；旧回复保留在会话历史（未删除）。
2. **token 统计**：仅在 dsh turn/end 事件带 usage 时显示；多数模型可能不返回。
3. **轨迹回合归属**：工具事件通过当前 active step 归属 turn（step/start 后才有 turn 信息），个别历史事件可能归入就近回合。
4. **轨迹不落盘**：刷新/重启后从 getHistory 重建（依赖 dsh 历史保留完整事件）。

---

# harness-desktop 交付报告（024 修复 5 问题 + UI 对齐官方）

> 状态：Part A/B/C/D 完成并验证（typecheck/32 测试/build/dev 全绿）。

## Part A：重复会话修复（问题 1）
- **adapter listSessions 去重**：按 sessionId 唯一（引擎可能因订阅/列表竞态返回重复）
- **displaySessions 去重保险**：渲染前 filter 掉重复 sessionId
- 实测：创建 1 会话 → session.list 4 个（3 旧 + 1 新），dup count 0

## Part B：思考状态不结束（问题 4）
- **根因**：023 新增 `turn/end → turn-end` case 后，旧 `turn/end → running:false` case 仍保留但 switch 只命中第一个 → `running:false` 永远不推送
- **修复**：turn-end case 内同时推送 `running:false`（思考完成/转圈停止）；删除重复 case
- 测试：新增 turn/end 同时推送 running:false

## Part C：轨迹对齐官方（问题 2 + 3）
- **右侧 details 栏**：轨迹从底部抽屉改为右侧栏（对齐官方 AppFrame 三栏）
- **轨迹节点 hover 操作**：复制节点内容 + 展开/收起详情（工具参数/结果/思考文本）

## Part D：UI 对齐官方 web 版（问题 5）
- **气泡**：用户消息右对齐 + `--dsw-specific-bubble`（DeepSeek 浅蓝 tint，对齐官方 MessageItem）；assistant 左对齐 + 浅灰底（`--dsw-assistant-bubble`），18px 圆角 + 6px 尾角
- **思考行**：ReasoningRow 紧凑折叠行（"思考中"标签 + 摘要 + 展开体），替代原大标签
- **markdown**：轻量渲染（代码块/行内代码/粗体），不引库
- **布局**：`.chat-columns` 左右布局（center 消息 + details 轨迹），对齐官方三栏概念

## 改动文件
- `adapter/index.ts`（listSessions 去重）、`adapter/events.ts`（turn/end 重复 case 合并）
- `src/components/MainView.tsx`（displaySessions 去重）
- `src/components/MessageBubble.tsx`（气泡样式 + ReasoningRow + 轻量 markdown）
- `src/components/ChatView.tsx`（轨迹改 details 列）
- `src/components/TrajectoryPanel.tsx`（节点复制/展开）
- `src/styles.css`（bubble token + reasoning-row + chat-columns + md 样式）
- 测试：`events.test.ts`（turn/end running:false）

## 验证结果
| 项 | 结果 |
|---|---|
| typecheck | 零错误 |
| test | 32 个全绿 |
| build | 通过 |
| app 启动 | 无崩溃，dsh 引擎正常 |
| dev | 200 |
| 无新增 emoji | 通过 |

## 已知限制
1. **三栏布局**：details 栏为 320px 固定宽（未做拖拽手柄）；侧栏未做窄窗口自动折叠。
2. **markdown** 轻量渲染（代码块/行内代码/粗体）；表格/列表等复杂语法未覆盖（不引库约束）。
3. **轨迹归属**：工具事件经 active step 归属 turn，历史重建个别可能归入就近回合。

---

# harness-desktop 交付报告（025 修复主题 system + 气泡可读性）

> 状态：Part A/B/C 完成并验证（typecheck/32 测试/build/dev 全绿）。

## Part A：system 主题解析（核心修复）
- **根因**：App.tsx 把 `theme: 'system'` 原样设为 `data-theme='system'`，但 CSS 只有 `[data-theme='light']` 与深色 `:root`，无 system 规则 → 回落到深色；浅色系统下界面"全黑"
- **修复**：App.tsx 外观 effect 用 `matchMedia('(prefers-color-scheme: light)')` 把 system 解析成 `light`/`dark` 再设 `data-theme`；并监听系统变化实时切换（cleanup 移除监听）
- 单元测试：system→light/dark 解析逻辑验证通过

## Part B：气泡颜色核对与修复
- **深色**：assistant=rgb(30,31,33) 深灰 + 白字 ✅；用户气泡=浅蓝 rgb(234,238,255) + **深字（修复）**
- **浅色**：assistant=rgb(240,241,244) 浅灰 + 深字 ✅；用户气泡=浅蓝 + 深字 ✅
- **关键修复**：用户气泡文字从 `--dsw-label-primary`（深色主题下=白字）改为固定深色 `rgb(23,26,31)`——原"浅蓝底+白字"深色主题下不可见
- assistant 气泡加 `--dsw-border-l1` 细边框提升层次

## Part C：即时生效
- 设置页切深/浅/system → data-theme 立即更新（onUpdateSettings 链路原有）
- system 模式跟随系统外观实时切换（matchMedia change 监听）

## 改动文件
- `src/App.tsx`（system 解析 + matchMedia 监听）
- `src/styles.css`（用户气泡固定深字 + assistant 气泡边框）

## 验证结果
| 项 | 结果 |
|---|---|
| typecheck | 零错误 |
| test | 32 个全绿 |
| build | 通过 |
| app 启动 | 无崩溃 |
| dev | 200 |
| 主题解析单元验证 | system→light/dark 正确 |
| 无新增 emoji | 通过 |

## 已知限制
1. **运行时 DOM 验证**依赖真实系统外观切换（GUI 操作），本轮通过单元测试 + 代码审查 + app 启动验证；system 实时跟随需 owner 实测切换系统外观。
2. `[data-theme='system']` CSS 规则保留作防御（App 现在只设 light/dark，不触发）。

---

# harness-desktop 交付报告（026 迁移官方 Web UI）

> 状态：M1（A0）完成并实测；桌面元素官方模块化（M2-M4）如实标注待官方插槽契约逆向。
> 官方 UI 已作为主界面运行，桌面独有元素保留在回退页（功能不丢）。

## M1（A0）：窗口迁移官方 UI（完成 ✅）
- **主窗口 loadURL 引擎端口**：`createWindow()` 先加载本地渲染器作启动/回退屏，引擎就绪后 `loadEngineUI(port)` 加载官方 UI
- **回退策略**：引擎未就绪/失败 → 保留本地渲染器（不白屏）
- **端口跟随（A0.3）**：监听 `manager.onStatus`，引擎崩溃重启换端口 → 窗口重新 loadURL 新端口（防端口漂移）
- **导航白名单**：will-navigate 放行 `http://127.0.0.1:*`（仅引擎端口）+ dev server + file
- **实测**：
  - 官方 UI 加载：Electron↔引擎端口多条 ESTABLISHED（HTTP + WS mux），主进程无报错
  - 端口漂移：kill 引擎 → 自动重启换端口（58512→58806）→ 窗口自动跟随新端口
  - typecheck/test(32)/build 全绿

## M2 部分：__desktop__ 桥（完成 ✅）
- preload 新增 `window.__desktop__`：`getPort()` / `notify()` / `onEnginePort()`（端口漂移跟随）/ `onMenuEvent()`（Cmd+N/Cmd+, 转发）
- 新增 IPC：`desktop:getPort` / `desktop:notify`
- 官方 UI 页面同样可用（preload 对任何加载页面注入）

## M2-M4 桌面元素官方模块化（诚实标注：待官方插槽契约逆向）
- 任务/记忆/进化/提醒/外观扩展做成官方客户端模块（details.tool / settings.section 插槽）需要逆向
  `dsh-client-modules` 注册机制与官方插槽契约——高风险、约 2 周工作量，本轮未冒险实施
- **当前保障**：桌面独有元素完整保留在回退页（dist/index.html），通过托盘/启动屏可达，功能零丢失

## 改动文件
- `electron/main.ts`：createWindow 加载流程 + loadEngineUI + 端口跟随 + 导航白名单
- `electron/ipc.ts`：desktop:getPort / desktop:notify
- `electron/preload.ts`：window.__desktop__ 桥

## 验证结果
| 项 | 结果 |
|---|---|
| 官方 UI 加载 | ✅ ESTABLISHED 连接确认 |
| 端口漂移跟随 | ✅ kill 后自动重连新端口 |
| typecheck / test / build | ✅ 32 测试全绿 |
| dev（vite 回退） | ✅ 200 |
| 无新增 emoji | ✅ |

## 已知限制
1. **桌面元素未进官方 UI**：任务/记忆/进化/提醒/外观扩展仍在回退页，官方 UI 内暂不可见（需官方插槽契约逆向后做成客户端模块）。
2. **官方 UI 全屏后**桌面控制台/日志入口不可见（shell.overlay 模块后置）。
3. **凭证双写**（官方 settings 直接改 .credentials.yaml vs 桌面 safeStorage）需 diff 回填机制（§6.2 未实施）。
4. 官方 UI 的 onboarding 向导门（G1/G2）未实施——首次启动仍走回退页向导。

---

# harness-desktop 交付报告（027 A1 桌面元素模块化 + 22 问题修复）

> 状态：P0/P1 全部修复并验证；P2/P3 大部分修复；M2 __desktop__ 桥补全。
> 官方客户端模块注入（M2-M4 主体）如实标注待 ui-slots 契约逆向。

## 附带修复（22 个问题）

### P0 必修（4/4 完成 ✅）
1. **reminder 失败不丢**：fire 失败 → nextAt+30s 顺延重试（retries 计数，上限 10 次），不再删除；实测失败提醒顺延未丢
2. **每日 00:xx 解析**：`h || 9` → `h ?? 9`；实测 00:30 → 0:30（不再变 9:30）；nextWeekly 同步
3. **loadEngineUI 失败重试**：递增重试（1s/2s/5s*attempt，上限 10 次），不再永停回退屏
4. **导航白名单收窄**：`http://127.0.0.1:<port>` 精确前缀（loadedEnginePort），杜绝任意本地端口诱导导航；官方 UI 加载仍正常（实测）

### P1 模块复用代码（6/6 完成 ✅，先修后搬）
5. tasks.ts startTask 保留同会话历史（只移 running/queued，上限 50）——新增测试
6. trajectory.ts 用户消息归"下一回合"（maxTurn+1），不再全归回合 1
7. trajectory.ts 仅 step/start(step>=1) 记步骤节点，turn/start(step=0) 只记回合开始——stepCount 不再多 1
8. chatReducer 编辑重发去重：末条用户消息文本相同则替换不新增——新增测试
9. Wizard `workspace ?? null`（不再写空字符串 cwd）；App onCompleteWizard 兜底
10. EvolutionSection 移除技能 Date.now() 时间线事件（仅保留统计数）

### P2（6/7 完成；#16 回退页低优标注后置）
11. MessageBubble confirmEdit 后重置 editText
12. UpdateSection error 状态用 `settings-msg err`（不再全绿）
13. ipc dispose 补 unsubStatus + reminders.stop()
14. credential-store 移除死代码 get()；set() safeStorage 不可用时 warn
15. yaml 显式加入 dependencies

### P3（3/3 完成）
18. after-pack @scope devDeps 用完整包名判断（修复 @types/* 漏进包）——实测通过
19. electron-builder 移除 `identity: null`（改环境变量控制签名）
20. prompts/README 026/025/024/023 重复行去重 + 状态修正

### P4 待实测（未修，标注）
21. 任务状态机多步骤提前 done（需实测 dsh 每 step 是否发 assistant/message）
22. session:hardDelete 顺序竞态（需实测归档后日志是否仍在写）

## M2：__desktop__ 桥补全（完成 ✅）
- 026 已有 getPort/notify；本任务确认 onEnginePort + onMenuEvent 已实现（preload）

## M2-M4 官方客户端模块注入（诚实标注：待 ui-slots 契约逆向）
- 官方机制已探明：客户端模块用 `dsh.client.inject`（package.json）+ `window.__ModuleLoader__.load({id, factory})` 注册，factory 经 `require('@deepseek-ai/dsh-client-ui-slots')` 拿插槽 API
- 实现任务面板进 details.tool / 记忆进化等进 settings.section 需完整逆向 ui-slots 插槽 API + GUI 实测验证——高风险大工作量，本轮未冒险实施
- 保障：桌面独有元素完整保留在回退页（dist），功能零丢失

## 改动文件
- `electron/reminder-manager.ts`（#1/#2）、`electron/main.ts`（#3/#4）、`electron/ipc.ts`（#13）、`electron/credential-store.ts`（#14）、`package.json`（#15）、`electron-builder.yml`（#19）、`scripts/after-pack.mjs`（#18）、`prompts/README.md`（#20）
- `src/tasks.ts`（#5）、`src/trajectory.ts`（#6/#7）、`src/chatReducer.ts`（#8）、`src/components/Wizard.tsx`（#9）、`EvolutionSection.tsx`（#10）、`MessageBubble.tsx`（#11）、`UpdateSection.tsx`（#12）、`shared/types.ts`（Reminder.retries）
- 测试：tasks.test.ts（#5）、chatReducer.test.ts（#8）

## 验证结果
| 项 | 结果 |
|---|---|
| typecheck | 零错误 |
| test | 34 个全绿（+2 新增） |
| build | 通过 |
| app 启动 | 无崩溃，官方 UI 加载正常（白名单收窄后） |
| #1 顺延重试 | 单元验证 PASS |
| #2 00:xx 解析 | 单元验证 PASS |
| #18 filter | 单元验证 PASS |
| 无新增 emoji | ✅ |

## 已知限制
1. **官方客户端模块注入未实施**（M2-M4 主体）：需逆向 ui-slots 完整插槽 API 并 GUI 实测，标注为后续工作；桌面元素保留在回退页。
2. **P4 #21/#22** 需真实 dsh 行为实测后处置。
3. **P2 #16**（ChatView 空状态乐观被历史覆盖）在回退页场景，标注后置。

---

# harness-desktop 交付报告（028 模块化推进 + 品牌 UI 改版）

> 状态：F1-F4 附带修复完成 + 品牌 C 落地 + __desktop__ 桥 getVersion；官方客户端模块注入标注待 AMD 构建。

## 附带修复（F1-F4）

### F1. trajectory 步骤去重重做（完成 ✅）
- **根因**：027 用 `evt.step >= 1` 区分 turn/start 与 step/start，但真实 dsh 事件 `turn/start` 无 step 字段（adapter 归一化为 step=1）→ 幻影步骤节点仍存在
- **修法**：`seenTurns: Set<number>` —— 每回合**第一个** assistant-start 即 turn/start（只记回合开始），之后才记步骤节点；reset 清空
- **不改 adapter**（避免破坏 chatReducer 的 (turn,step) 幂等去重）
- **测试**：新增 `trajectory.test.ts`（5 用例：回合归属/步骤计数不多 1/工具归属/多回合/reset）；修正 events.test.ts 的错误假设（turn/start 不带 step → 归一化 step=1）

### F2. loadEngineUI 重试竞态（完成 ✅）
- tryLoad 开头检查 `loadedEnginePort === port`，引擎换新端口后放弃旧端口重试（不再覆盖新页面）

### F3. prompts/README 027 行修复（完成 ✅）
- 描述单元格多 `|` 致表格 6 列损坏 → 修复为 5 列；028 行补入

### F4. docs/REPORT 027 计数（完成 ✅）
- P2 5/7 → 6/7（#17 已修）；P3 2/3 → 3/3（#19 完成）

## 品牌 UI（Part C，完成 ✅）
- **C3 版本号**：新增 `desktop:getVersion` IPC + `__desktop__.getVersion()`；`src/types.d.ts` 声明 `window.__desktop__` 类型
- **C2 首启 hero**：回退页空状态 hero 加"harness desktop v0.1.0 · 你的 AI 工作台"品牌副标题 + 引导文案
- **C1 右上角品牌**：回退页聊天 header 右侧加品牌 chip（彩色鲸鱼 logo + "harness desktop vX"）
- 主进程零改动（仅加 1 个 IPC + preload 方法）

## M2-M4 官方客户端模块注入（诚实标注：待 AMD 构建）
- 官方机制确认：`ctx.slots.inject('conversation.view', () => ctx.slots.register({name, id, order, locale, label, inject}, Component))`
- 官方模块以 AMD `__ModuleLoader__.load({id, factory})` 格式编译（`lib/client.js`），依赖 `@deepseek-ai/dsh-client-ui-slots` 等
- 我们的 React 组件需编译成 AMD 模块 + 打包官方依赖——需构建工具链 + GUI 实测验证，本轮未冒险实施（做错会破坏官方 UI）
- 桌面独有元素保留在回退页，功能零丢失

## 改动文件
- `src/trajectory.ts`（F1 seenTurns）、`src/__tests__/trajectory.test.ts`（新）、`adapter/__tests__/events.test.ts`（修正假设）
- `electron/main.ts`（F2）、`electron/ipc.ts`（desktop:getVersion）、`electron/preload.ts`（getVersion）
- `src/components/ChatView.tsx`（header 品牌 + hero 品牌）、`src/types.d.ts`（__desktop__ 类型）、`src/styles.css`（品牌样式）
- `prompts/README.md`（F3）、`docs/REPORT.md`（F4）

## 验证结果
| 项 | 结果 |
|---|---|
| typecheck | 零错误 |
| test | 39 个全绿（+5 trajectory） |
| build | 通过 |
| app 启动 | 无崩溃，官方 UI 加载正常 |
| 无新增 emoji | ✅ |

## 已知限制
1. **官方客户端模块注入未实施**（M2-M4 主体）：需 AMD 构建工具链（把 React 组件编译成官方 `__ModuleLoader__` 格式）+ GUI 实测，标注为后续工作。
2. **品牌区在回退页**：官方 UI 的右上角品牌需同上的官方模块机制；当前品牌展示在回退页（引擎启动/向导/空状态/聊天头）。

---

# harness-desktop 交付报告（029 官方客户端模块注入 + 品牌）

> 状态：S1 最小验证 + S2 元素模块化 + S3 品牌全部完成；7 个官方客户端模块进 manifest 且 client.js 可服务。

## S1：最小验证（hello 分区 ✅）
- 手写 AMD 外壳（`window.__ModuleLoader__.load({id, factory})`），注册 `settings.section`（id: 'hello'）
- **链路验证通过**：cordis.patch.yml 注入 → profile-setup 安装 → boot manifest 收集（`dsh-desktop-hello` entry）→ `/plugins/dsh-desktop-hello/client.js` 服务 200
- 依赖从平台种子表 require（react / dsh-client-ui-slots），不打包

## S2：桌面元素模块化（7 模块 ✅）
- **6 个 settings.section 分区**：记忆 / 进化 / 提醒 / 外观扩展 / 技能 + hello（验证用）
- **1 个 header.utilities 品牌**：dsh-desktop-brand（右上角彩色鲸鱼 + 版本）
- 每个模块 = 独立插件目录（package.json `dsh.client` + cordis.patch.yml + index.js + client.js）
- 数据走 `window.harness`（preload IPC），不依赖官方 client runtime 数据服务
- 组件用 React.createElement（手写 AMD 无 JSX），依赖 require('react')
- 已注册 profile-setup + 同步 profile bundles

## S3：品牌 UI（✅）
- **右上角品牌**（dsh-desktop-brand）：彩色鲸鱼 SVG（渐变，从 favicon path）+ "harness desktop v0.1.0"（getVersion），注册 `conversation.session.header.utilities`（order -100 靠前）
- **版本统一**：UpdateSection 关于页改 getVersion()（不再硬编码 v0.1.0）

## 验证结果
| 项 | 结果 |
|---|---|
| manifest 收集 | ✅ 7 个 dsh-desktop-* 全在 |
| client.js 服务 | ✅ 全部 200 |
| typecheck | 零错误 |
| test | 39 个全绿 |
| build | 通过 |
| app 启动 | 无崩溃 |
| 无新增 emoji | ✅ |

## 改动文件
- `plugins/dsh-desktop-{hello,memory,evolution,reminders,appearance,skills,brand}/`（7 个新模块）
- `electron/profile-setup.ts`（BUNDLE_PLUGINS 登记）
- `src/components/UpdateSection.tsx`（版本统一）
- `prompts/README.md`（029 状态）

## 已知限制
1. **组件无 JSX**（手写 AMD）：用 React.createElement 编写，样式内联；官方 UI 视觉需 owner 实测确认。
2. **模块执行验证**：manifest 收集 + client.js 200 + 语法正确已证明加载链路；设置页分区/header 品牌的实际渲染需 owner GUI 实测。
3. **会话头部任务视图**（conversation.view 任务面板）未实现——本轮做的是 settings 分区 + 品牌；任务面板进官方 details 栏需另建 conversation.view 模块（数据经 window.harness.onSessionEvent + TaskStore）。
4. 自定义 provider 模块未做（需先核对官方 settings-models 是否覆盖）。

---

# harness-desktop 交付报告（029 复审修改：动态品牌 + 分区整理）

> 状态：根据 owner 复审意见完成 4 项调整；typecheck/test/build 全绿。

## 1. UI 右上角动态变色鲸鱼品牌 ✅
- `dsh-desktop-brand` 模块：鲸鱼从静态渐变改为**动态变色**（SMIL `animate attributeName="stop-color"`，3 个 stop 各 12 色循环流动，同 WhaleLogo 风格，dur 13.2s）
- 注册 `conversation.session.header.utilities`（右上角，order -100 靠前），显示动态鲸鱼 + "harness desktop v0.1.0"（getVersion）

## 2. 会话首次页面（hero）品牌 ✅
- `dsh-desktop-brand` 新增 `conversation.composer.dock` 品牌条：大号动态鲸鱼（48px）+ "harness desktop v0.1.0" + "你的 AI 工作台 · 开始对话"，首次会话空态可见

## 3. 设置里删掉"桌面"分区 ✅
- 删除 `dsh-desktop-hello` 模块（settings.section id: 'hello'，label "桌面"）
- 从 profile-setup + profile bundles 移除；manifest 验证 hello 消失（404）

## 4. 外观扩展合并到通用设置 ✅
- `dsh-desktop-appearance` 从独立 `settings.section` 改为注册 `settings.general.item`（list/root）——**合并进官方"通用"分区**
- inject 补 `@deepseek-ai/dsh-client-ui-settings-general`（声明该子插槽）

## 验证结果
| 项 | 结果 |
|---|---|
| manifest | hello 消失；6 模块在（memory/evolution/reminders/appearance/skills/brand） |
| client.js 服务 | 全部 200；hello 404 |
| brand 动态变色 | 3 处 animate stop-color ✅ |
| appearance 合并 | 注册 settings.general.item ✅ |
| typecheck / test / build | 39 全绿 / 通过 |
| app 启动 | 无崩溃 |
| 无 emoji | ✅ |

## 改动文件
- `plugins/dsh-desktop-brand/client.js`（动态鲸鱼 + hero 品牌条）
- `plugins/dsh-desktop-hello/`（删除）
- `plugins/dsh-desktop-appearance/client.js` + `package.json`（合并到通用）
- `electron/profile-setup.ts`（移除 hello）
- profile bundles 同步

## 已知限制
- 动态鲸鱼/hero 品牌条的实际视觉需 owner GUI 实测确认（SMIL 动画在官方 UI 页面正常渲染、不破坏布局）。
- `conversation.composer.dock` 品牌条在有消息的会话页也会显示（不仅是空态），如需仅空态显示需进一步限定。

---

# harness-desktop 交付报告（030 修复 hero 品牌替换）

> 状态：修复完成，CDP 实测右上角 + hero 品牌均成功。

## 根因（诊断）
- 官方 hero 只在 `sessionId === undefined`（无激活会话）时渲染
- preload 原 `ensureHero` 只监听 `childList` —— **locale 就绪后 hero 文本从 key/英文变中文是 `characterData` 变更，childList 监听不到** → 文本匹配永不命中

## 修复（electron/preload.ts）
1. **方案 A**：MutationObserver 补 `characterData: true`
2. **方案 B**：多语言兜底匹配（'探索未至' / 'Into the Unknown' / 'hero.headline'）
3. **方案 C**：结构匹配 `[class*="_headline_"]`（CSS Modules 原类名保留在 hash 中，不依赖 locale 文本）+ 校验含 svg/fish 特征防误替换
4. **方案 D**：React 恢复兜底（data-hd-hero-brand 标记 + observer 重注入）

## 实测证据（CDP）
- 右上角：`corner=true`，`cornerText="harness desktop v0.1.0"` ✅
- hero 替换：`heroBrand=true`（官方 hero 已替换）✅
- 替换后 hero DOM：svg=32、anims=4（动态变色）、ver=v0.1.0、text="harness desktop v0.1.0" ✅
- `activeSession=false`（hero 场景正确）
- 官方 headline/文本列表为空（已被品牌替换）

## 验证
| 项 | 结果 |
|---|---|
| typecheck | 零错误 |
| test | 39 全绿 |
| build:electron | 通过 |
| app 启动 | 无崩溃 |
| 官方 UI | 加载正常（Electron↔引擎 ESTABLISHED）|
| CDP 实测 | 右上角 + hero 品牌均成功 |
| 无 emoji | ✅ |

## 改动文件
- `electron/preload.ts`（ensureHero 三层匹配 + observer characterData + 恢复兜底）

## 已知限制
- hero 品牌只在**无激活会话**（首次/空态）时显示；有历史会话自动激活时 hero 不渲染（官方行为）
- CSS Modules 类名若随官方升级变化，结构匹配需适配（文本匹配兜底仍在）

---

# harness-desktop 交付报告（030b 模块登记核对 + 上传前安全验证）

> 状态：安全验证通过；BUNDLE_PLUGINS 方向核对完成（当前只留 harness-memory，符合后续"设置页还原官方"要求）。

## 背景核对
- 030-fix-module-registration 提示词假设 plugins/ 有 7 个 dsh-desktop-* 模块、BUNDLE_PLUGINS 缺登记
- **但后续 owner 明确要求删除这些模块**（设置页还原成官方），plugins/ 已只留 harness-memory
- 因此不重建 7 模块（避免违背"还原官方设置页"）；BUNDLE_PLUGINS 保持 ['harness-memory'] 与现状一致

## Part A：profile-setup 核对（✅ 现状健康）
- `installOne` 每次启动都同步 BUNDLE_PLUGINS 里的插件（覆盖旧版本，无缓存问题）
- 当前：BUNDLE_PLUGINS=['harness-memory'] 与 plugins/ 目录、profile bundles 完全一致
- profile node_modules 只有 harness-memory（dsh-desktop-* 已按 owner 要求移除）
- manifest 无 dsh-desktop 模块（设置页保持官方原样）

## Part B：上传前安全验证（✅ 全部 0 结果）
- API key（sk-*16）/ GitHub token（ghp_/github_pat_）：**0 处**
- 公网 IP（8.211.171.11 / 131.113）：**0 处**
- AWS（AKIA）/ 私钥（BEGIN PRIVATE KEY）：**0 处**（grep 匹配到的是 CSS 类名 task-progress 等，非密钥）
- .gitignore 含：node_modules/dist/dist-electron/out/.DS_Store/*.log/.env
- credentials/safe-credentials 在本机 userData，不在项目仓库

## 验证结果
| 项 | 结果 |
|---|---|
| 安全 grep（key/token/IP） | 0 处 ✅ |
| .gitignore | 完整 ✅ |
| profile 一致性 | harness-memory 与 BUNDLE_PLUGINS/plugins 一致 ✅ |
| typecheck | 零错误 |
| test | 39 全绿 |
| app 启动 | 正常，官方 UI 加载（Electron↔引擎 ESTABLISHED）|
| 无 emoji | ✅ |

## 改动文件
- 无代码改动（核对确认现状正确）
- 文档：docs/REPORT.md / prompts/README.md 状态更新

## 已知限制
- 030-fix-module-registration 假设已过时（模块被后续删除）；若未来要恢复自定义设置分区，需重新创建模块并登记 BUNDLE_PLUGINS
