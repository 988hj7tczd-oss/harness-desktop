/// <reference types="vite/client" />
import type { HarnessApi } from '../shared/types'

declare global {
  interface Window {
    harness: HarnessApi
    /** 026/028 __desktop__ 桥：桌面壳能力（官方 UI 与回退页共用）。 */
    __desktop__: {
      getPort(): Promise<number | null>
      getVersion(): Promise<string>
      notify(title: string, body: string): Promise<void>
      onEnginePort(cb: (port: number | null) => void): () => void
      onMenuEvent(cb: (action: 'new-chat' | 'open-settings') => void): () => void
    }
  }
}

export {}
