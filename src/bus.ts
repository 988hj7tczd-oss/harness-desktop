/**
 * src/bus.ts —— renderer 内的事件总线。
 *
 * 全局只订阅一次 dsh:event（App 挂载时），再按 sessionId 分发给各聊天视图。
 */
import type { SessionStreamEvent } from '../shared/types'

type Listener = (evt: SessionStreamEvent) => void

const bySession = new Map<string, Set<Listener>>()
const all = new Set<Listener>()

export function subscribeAll(cb: Listener): () => void {
  all.add(cb)
  return () => {
    all.delete(cb)
  }
}

export function subscribeSession(sessionId: string, cb: Listener): () => void {
  let set = bySession.get(sessionId)
  if (!set) {
    set = new Set()
    bySession.set(sessionId, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
  }
}

export function emit(evt: SessionStreamEvent) {
  for (const cb of all) cb(evt)
  if (evt.sessionId) {
    const set = bySession.get(evt.sessionId)
    if (set) for (const cb of set) cb(evt)
  }
}
