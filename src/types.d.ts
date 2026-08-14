/// <reference types="vite/client" />
import type { HarnessApi } from '../shared/types'

declare global {
  interface Window {
    harness: HarnessApi
  }
}

export {}
