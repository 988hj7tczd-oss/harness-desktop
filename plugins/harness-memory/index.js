/**
 * harness-memory —— dsh 记忆插件（dsh-memory）。
 *
 * 职责：
 *  - 用 ctx.storage 的 domain 能力持久化记忆（表：memories）
 *  - 注册 system-prompt section，把已保存的记忆注入模型上下文（跨会话召回）
 *  - 提供 memory.save / memory.forget 工具，让 agent 在对话中自行存取记忆
 *
 * 加载方式：作为 dsh bundle（声明 dsh.bundle.patch）安装进 profile。
 */
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** 稳定插件名。 */
export const name = 'harness-memory'

/** 需要的服务：存储域 / 系统提示 / 工具注册。 */
export const inject = ['storageDomain', 'systemPrompt', 'tools']

/** 插件配置。 */
export const Config = z.object({
  /** 最多注入多少条记忆到系统提示。 */
  maxMemories: z.number().default(50),
  /** system-prompt section 的排序位置（越小越靠前）。 */
  sectionOrder: z.number().default(150),
})

/** 记忆记录 schema。 */
const memorySchema = zod.object({
  id: zod.string(),
  text: zod.string(),
  tags: zod.array(zod.string()).default([]),
  createdAt: zod.number(),
  updatedAt: zod.number(),
})

/** 记忆域的声明。 */
const MemoryDomain = defineDomain({
  name: 'harness_memory',
  version: 1,
  tables: {
    memories: domainTable(memorySchema),
  },
})

/** 记忆分类组（按 tag 归类，让 agent 明确区分偏好/约定/做法）。 */
const CATEGORIES = [
  { key: 'preference', label: '用户偏好', match: ['preference', '偏好'] },
  { key: 'project', label: '项目约定', match: ['project', '约定'] },
  { key: 'practice', label: '成功做法', match: ['practice', '做法'] },
]

function categoryOf(tags) {
  for (const c of CATEGORIES) {
    if (tags.some((t) => c.match.includes(String(t).toLowerCase()))) return c
  }
  return null
}

/**
 * 生成系统提示中的记忆段落（按分类分组注入）。
 * @param table - 记忆表。
 * @param maxMemories - 最多展示条数。
 */
function renderMemories(table, maxMemories) {
  const entries = [...table.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt)
  const recent = entries.slice(0, maxMemories)
  if (recent.length === 0) return ''
  const groups = new Map()
  for (const [, m] of recent) {
    const cat = categoryOf(m.tags)
    const key = cat ? cat.key : 'other'
    if (!groups.has(key)) groups.set(key, { label: cat ? cat.label : '其他', items: [] })
    groups.get(key).items.push(m)
  }
  const blocks = []
  for (const [key, g] of groups) {
    if (g.items.length === 0) continue
    const lines = g.items.map((m) => `- ${m.text}`)
    blocks.push(`【${g.label}】\n${lines.join('\n')}`)
  }
  if (blocks.length === 0) return ''
  return `以下是用户保存的长期记忆，供你在后续对话中随时引用（跨会话生效）：\n\n${blocks.join('\n\n')}`
}

/**
 * 应用插件：打开存储域、注册系统提示 section、注册记忆工具。
 * @param ctx - Cordis 上下文。
 * @param config - 插件配置。
 */
export function apply(ctx, config) {
  // 打开记忆域（生命周期由本插件的 effect 管理）
  const domainHandlePromise = ctx.storageDomain.open(MemoryDomain)
  let table = null

  ctx.effect(() => {
    domainHandlePromise
      .then((domain) => {
        table = domain.table('memories')
      })
      .catch((err) => {
        ctx.logger?.error(`harness-memory: 打开存储域失败: ${err?.message ?? err}`)
      })
    return () => {
      domainHandlePromise
        .then((domain) => domain.close())
        .catch(() => undefined)
    }
  })

  // system-prompt section：注入记忆（函数形式，每次组装时求值）
  ctx.systemPrompt.section({
    name: 'memory:recall',
    order: config.sectionOrder,
    text: () => {
      if (!table) return ''
      return renderMemories(table, config.maxMemories)
    },
  })

  // 工具：保存一条记忆
  ctx.tools.register(defineTool({
    name: 'memory_save',
    description:
      '保存一条跨会话的长期记忆。用于记录用户偏好、项目关键约定、需要长期记住的事实。' +
      '同一事实再次保存会覆盖（按文本去重）。每次保存请用简洁明确的句子。',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: '要记住的内容，一句话，明确具体。',
      },
      tags: {
        type: 'array',
        description: '可选的标签，帮助归类（如 preference / project / fact）。',
        items: { type: 'string' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          saved: { type: 'boolean', required: true },
          total: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.saved
          ? `记忆已保存（当前共 ${value.total} 条）。`
          : '记忆保存失败。',
      }],
    },
    async execute(args) {
      if (!table) throw new Error('memory_save: 记忆存储尚未就绪')
      const text = String(args.text).trim()
      if (!text) throw new Error('memory_save: 内容不能为空')
      const now = Date.now()
      const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t)) : []
      const existing = [...table.entries()].find(([, m]) => m.text === text)
      if (existing) {
        await table.put(existing[0], { ...existing[1], tags, updatedAt: now })
      } else {
        const id = `mem-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        await table.put(id, { id, text, tags, createdAt: now, updatedAt: now })
      }
      return { saved: true, total: table.size }
    },
  }))

  // 工具：删除一条记忆
  ctx.tools.register(defineTool({
    name: 'memory_forget',
    description: '删除一条已保存的长期记忆（必须提供记忆 id 或完整内容文本）。',
    parameters: {
      id: {
        type: 'string',
        description: '要删除的记忆 id（可从系统提示中的记忆列表获得）。',
      },
      text: {
        type: 'string',
        description: '或提供完整内容文本来删除。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          removed: { type: 'boolean', required: true },
          total: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.removed
          ? `记忆已删除（剩余 ${value.total} 条）。`
          : '未找到匹配的记忆。',
      }],
    },
    async execute(args) {
      if (!table) throw new Error('memory_forget: 记忆存储尚未就绪')
      let removed = false
      if (args.id) {
        removed = await table.delete(String(args.id))
      } else if (args.text) {
        const entry = [...table.entries()].find(([, m]) => m.text === String(args.text).trim())
        if (entry) removed = await table.delete(entry[0])
      }
      return { removed, total: table.size }
    },
  }))
}

export default { name, inject, Config, apply }
