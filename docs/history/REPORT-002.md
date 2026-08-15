# harness-desktop 交付报告（002-model-ui-custom-provider-v1）

> 状态：模型选择 UI 改版 + 自定义模型接入完成。真实端点对话待 owner 实测验收。

## 完成情况

| 需求 | 内容 | 状态 |
|---|---|---|
| 1 | ModelPicker 改版：两级（供应商 → 模型）分类选择 | ✅ |
| 2 | 自定义模型接入：设置页新增「自定义接入」区块（增/改/删） | ✅ |
| 3 | 架构：adapter 写方法 + IPC + preload；存 dsh settings（llm-pi-ai） | ✅ |

## 改动文件

- `shared/types.ts`：新增 `CustomProviderConfig / CustomProviderListItem / CustomProviderModel / CustomProviderApi`；HarnessApi 新增 4 个方法
- `adapter/dsh-client.ts`：新增 `settingsDescribe / settingsUpdate / settingsMutate` 低层方法
- `adapter/index.ts`：新增 `listCustomProviders / saveCustomProvider / removeCustomProvider / setProviderApiKey`
- `electron/ipc.ts` + `electron/preload.ts`：新增 `provider:list / provider:save / provider:remove / provider:setKey` 通道
- `src/components/ModelPicker.tsx`：两级选择（供应商下拉 + 模型下拉 + 「供应商 · 模型」当前态显示）
- `src/components/ChatView.tsx`：selection 改为 `{provider, model}`；新增 modelsTick 刷新
- `src/components/SettingsModal.tsx` + `src/components/CustomProviders.tsx`：自定义接入区块（列表 + 表单 + 编辑/删除）
- `src/styles.css`：两级选择器 + 自定义接入样式

## 如何测试

```bash
pnpm dev
```
1. 聊天头部模型选择：先选供应商，再选模型，显示「供应商 · 模型」
2. 设置 → 自定义接入 → 「添加自定义供应商」：填名称 / Provider ID（中文名需手填 ID）/ Base URL / 协议 / Key / 模型列表 → 保存
3. 保存后供应商出现在模型选择分类里；重启应用配置仍在
4. 删除/编辑：列表项右侧按钮

## 自测结果（opencode 实测）

- ✅ 模型选择按供应商分类（两级下拉 + 当前态「DeepSeek · DeepSeek-V4-Flash」）
- ✅ 添加自定义 OpenAI 兼容端点（含 key + 模型）→ 出现在分类、模型可选、显示「公司网关 · 公司大模型」
- ✅ 重启应用后配置仍在（持久化到 dsh settings.yaml 的 llm-pi-ai.providers）
- ✅ 删除/编辑可用；删除后从分类消失
- ✅ 真实链路：`session.selectModel(corp-gw, corp-llm)` 后实际 LLM 请求路由到该 provider（request/header 确认）
- ✅ `pnpm typecheck` 零错误；`pnpm build` 通过；`pnpm dev` 正常启动

## 需要 owner 实测的项

- ⏳ 用自定义真实端点（含有效 key）发起一次对话收到回复
- ⏳ 三种协议（OpenAI 兼容 / OpenAI Responses / Anthropic）各试一种

## 已知限制

1. 中文供应商名不会自动生成 Provider ID（需手填小写 ID）。
2. 编辑时 API Key 留空则不改动原 Key（凭据按 apiKeyEnv 引用存储）。
3. 删除某供应商后，若它曾被设为默认模型，需在设置里重新选默认模型（引擎会回退到部署默认）。
