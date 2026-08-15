---
title: 彻底删除消息通道（UI + 插件 + 测试）
status: done
created: 2026-08-15
completed: 2026-08-15
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 007-009/013-015 的消息通道部分 + 020 QQ adapter
---

# 任务：彻底删除消息通道（聚焦桌面端核心体验）

项目：~/development/harness-desktop
基于：001-021 已验收（git commit 486f4ef 有完整代码备份，可随时找回）

## 背景（owner 决定）
消息通道折腾太久（QQ 沙箱/token 配置/部分平台收不到消息），决定：
**彻底删除消息通道功能，集中精力把桌面端核心体验完善到真正好用。**
代码在 git 历史（486f4ef 快照）里完整保留，未来想做可恢复。

## 删除范围（必须全删，一个不留）

### A. UI 层
| 文件 | 处理 |
|---|---|
| src/components/MessageChannelsSection.tsx | **删除** |
| src/channelRegistry.ts | **删除** |
| src/components/SettingsModal.tsx | 移除"消息通道"导航项 + 相关渲染 |
| shared/types.ts | 移除 ChannelPlatform/ChannelMode/ChannelAccessConfig 等通道类型 |
| src/styles.css | 移除 channel-* 相关样式 |

### B. 插件层（plugins/dsh-bot-* 全部删除）
| 插件 | 处理 |
|---|---|
| plugins/dsh-bot-gateway/ | **删除** |
| plugins/dsh-bot-telegram/ | **删除** |
| plugins/dsh-bot-qq/ | **删除** |
| plugins/dsh-bot-wechat/ | **删除** |
| plugins/dsh-bot-feishu/ | **删除** |
| plugins/dsh-bot-dingtalk/ | **删除** |
| plugins/dsh-bot-slack/ | **删除** |
| plugins/dsh-bot-email/ | **删除** |
| plugins/dsh-bot-webhooks/ | **删除** |
| plugins/__tests__/gateway-authorize.test.ts | **删除** |

### C. 主进程/集成层
| 文件 | 处理 |
|---|---|
| electron/profile-setup.ts | 移除 dsh-bot-* 插件的 cordis.patch.yml 安装逻辑 |
| electron/ipc.ts | 移除 channel:test 通道 + 相关 handlers |
| electron/preload.ts | 移除 testChannel 等方法暴露 |
| adapter/index.ts | 移除通道相关方法（保留核心：模型/会话/凭证/任务） |
| ~/Library/Application Support/harness-desktop/dsh-home/profiles/web/ | 清理已安装的 bot 插件 bundle（如有） |

### D. 测试层
- plugins/__tests__/ 删除
- adapter/__tests__/events.test.ts 保留（是通用事件转换，不是通道专属）
- src/__tests__/ 保留（chatReducer/tasks 是核心）

## 保留（不要误删）
- **DEEPSEEK_API_KEY 凭证机制**（credentials.set / safeStorage 加密）——核心必需
- **webhook 端口 8899 相关**：如果 webhooks 插件删了，确认没有其他东西依赖
- **消息平台的凭证测试能力**（channel:test）——虽然 UI 删了，但 credentials API 保留
- 任务面板/记忆/技能/外观/流式聊天——全部核心功能
- dsh-bot-gateway 的 workspace 注册逻辑若被核心复用，保留相关部分

## ✅ 要做（正面）
1. 按 A/B/C/D 四层彻底删除消息通道代码
2. SettingsModal 移除"消息通道"导航（布局自然收拢）
3. 清理 profile-setup 插件安装逻辑
4. 清理已安装的 bot 插件 bundle（dsh-home）
5. 确保 typecheck 零错误（删除后无残留引用）
6. 应用正常启动，核心功能不受影响

## ❌ 不要做（反面，硬约束）
- **不要误删核心功能**：凭证管理/模型/会话/任务/记忆/技能/外观/流式聊天
- **不要误删 DEEPSEEK_API_KEY 凭证机制**（safeStorage 加密层保留）
- **不要改 dsh 引擎核心 / 不要升级 dsh 版本（锁 rc.6）**
- **不要重写 adapter 隔离层**（只删通道相关方法）
- **不要删除 adapter/events.ts 的通用事件转换**（流式聊天依赖）
- **不要删除 src/__tests__/chatReducer.test.ts / tasks.test.ts**
- **不要用 emoji / 不动 Brand/WhaleLogo**
- **不要一次性提交所有删除** — 删完先 typecheck + 启动验证再提交
- **不要假装验收通过** — 没跑过 typecheck / 没实测的不写进自测结果
- **不要加未在任务中的功能**

## 验收标准（owner 实测）
1. 设置页**无"消息通道"入口**（导航干净）
2. `find src electron plugins -name "*channel*" -o -name "*dsh-bot*"` 无残留
3. pnpm typecheck 零错误
4. pnpm test 全绿（28 个核心测试还在）
5. pnpm dev 正常启动
6. 发消息 → 流式回复正常（核心链路无损）
7. 设置/任务/记忆/技能/外观全部正常
8. 全界面无新增 emoji

## 交付形式
- 一次提交（删除类任务）
- 报告：删除文件清单、如何测试、自测结果、已知限制
- 等 owner 实测验收
