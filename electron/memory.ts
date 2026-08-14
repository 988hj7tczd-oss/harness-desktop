/**
 * electron/memory.ts —— harness-memory 插件记忆的桌面端读写。
 *
 * 插件把记忆持久化到 `$DSH_HOME/storages/harness_memory.json`（storage-json 单元格式）。
 * 桌面端直接读写该文件展示/管理记忆。注意：运行中的 dsh 持有内存态，
 * 桌面端写入会在 dsh 重启后完整生效（这是不改引擎前提下的最佳路径）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MemoryItem } from '../shared/types.js'

interface MemoryUnit {
  unit: { name: string; version: number }
  global: unknown
  tables: { memories: Record<string, MemoryItem> }
}

function memoryFile(dshHome: string): string {
  return join(dshHome, 'storages', 'harness_memory.json')
}

function readUnit(dshHome: string): MemoryUnit {
  const file = memoryFile(dshHome)
  if (!existsSync(file)) {
    return { unit: { name: 'harness_memory', version: 1 }, global: null, tables: { memories: {} } }
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as MemoryUnit
    if (!parsed.tables?.memories) parsed.tables = { memories: {} }
    return parsed
  } catch {
    return { unit: { name: 'harness_memory', version: 1 }, global: null, tables: { memories: {} } }
  }
}

function writeUnit(dshHome: string, unit: MemoryUnit) {
  const file = memoryFile(dshHome)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(unit, null, 2)}\n`, 'utf8')
}

export function listMemories(dshHome: string): MemoryItem[] {
  const unit = readUnit(dshHome)
  return Object.values(unit.tables.memories).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function addMemory(dshHome: string, text: string, tags: string[] = []): MemoryItem {
  const unit = readUnit(dshHome)
  const now = Date.now()
  const item: MemoryItem = { id: `mem-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, text, tags, createdAt: now, updatedAt: now }
  unit.tables.memories[item.id] = item
  writeUnit(dshHome, unit)
  return item
}

export function deleteMemory(dshHome: string, id: string): boolean {
  const unit = readUnit(dshHome)
  if (!(id in unit.tables.memories)) return false
  delete unit.tables.memories[id]
  writeUnit(dshHome, unit)
  return true
}

export function clearMemories(dshHome: string): void {
  const unit = readUnit(dshHome)
  unit.tables.memories = {}
  writeUnit(dshHome, unit)
}
