---
title: 模型选择 UI 改版（供应商分类 + 自定义接入）
status: active
created: 2026-08-14
owner: Zhuanz（验收）
executor: codex / opencode
supersedes: 无（对 001 的迭代）
---

# 任务：模型选择 UI 改版 + 自定义模型接入

项目：~/development/harness-desktop
基于：001 已完成 Phase 0-3（Electron 壳 + 极简 UI + 记忆插件）

## 背景
当前模型选择是**平铺下拉**（ModelPicker 把 37 个 provider 的模型全部 flatMap 进一个
原生 select），用户看不到供应商分类；且没有"自定义接入"入口，用户无法添加自己的
OpenAI 兼容端点（如公司网关、自建服务器、第三方中转）。

## 已验证的技术事实（dsh 官方支持，直接可用）
1. dsh 有完整的 **llm-pi-ai 配置区**（settings.describe 返回 namespaces，含
   llm-pi-ai 命名空间，writable:true）
2. dsh 支持**自定义 provider**：在 settings.yaml 的 llm-pi-ai.providers 下配置
   {providerId: {apiKeyEnv, api, baseURL, models}}，例如：
   - providerId：小写唯一 ID（永久，用于请求/会话/凭据引用）
   - api：协议（如 openai-completions / anthropic-messages）
   - baseURL：端点地址
   - models：至少一个模型 {id, name}
3. 凭据用引用式存储（settings 只存 apiKeyEnv 引用，真实 key 进 .credentials.yaml）
4. adapter 层已有读方法：llm.providers / llm.models；**缺写方法**（需新增）
5. API 信封：POST /api/<method>，{type:"client-request", rpcId, method, payload}
   → {type:"server-response", rpcId, result:{ok, value|error}}

## 需求

### 1. 模型选择 UI 按供应商分类（ModelPicker 改版）
- 弃用当前"全部模型平铺在一个 select"的做法
- 改成**两级结构**：先选供应商（分类），再选该供应商下的模型
  - 界面形式：供应商下拉/分组列表 + 模型下拉，联动；或自定义分组下拉组件
  - 供应商分组显示：DeepSeek / OpenAI / Anthropic / 自定义（用户添加的）
- 当前选中模型要在界面清晰可见（显示供应商名 + 模型名，如 "DeepSeek · V4-Flash"）

### 2. 自定义模型接入（新增"自定义接入"入口）
- 在设置页新增"自定义接入"区块/入口，表单字段：
  - 供应商名称（显示名）
  - Provider ID（小写，自动从名称生成或手填）
  - Base URL（如 https://api.xxx.com/v1）
  - API 协议（下拉：OpenAI 兼容 / Anthropic 兼容 / 其他，映射到 dsh 的 api 字段）
  - API Key
  - 模型列表（可添加多个：模型 ID + 显示名）
- 保存后写入 dsh settings（llm-pi-ai 命名空间），并刷新模型列表，新供应商出现在分类里
- 支持删除/编辑已添加的自定义供应商

### 3. 架构要求（延续 001 的隔离原则）
- adapter 层新增写方法（如 saveCustomProvider / listCustomProviders / removeCustomProvider），
  封装 dsh settings API，renderer 不接触 dsh wire 格式
- IPC 新增对应通道，preload 暴露
- 自定义 provider 存 dsh settings（llm-pi-ai 命名空间），不存应用自有存储

## 验收标准（owner 实测）
- 模型选择界面按供应商分类显示，可逐级选择
- 添加一个自定义 OpenAI 兼容端点（含 key + 模型）后：
  - 新供应商出现在分类里，模型可选
  - 重启应用后配置仍在（持久化成功）
- 用自定义 provider 发起一次对话能收到回复（真实链路）
- pnpm typecheck 零错误；pnpm dev 正常启动

## 交付形式
- 代码写入本仓库，分阶段提交（UI 改版 → 自定义接入 → 验证）
- 完成后报告：改动文件、如何测试、自测结果、已知限制
- 每阶段完成等 owner 验收后再继续
