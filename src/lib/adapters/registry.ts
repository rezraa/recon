import { SOURCE_CONFIGS } from './constants'
import { himalayasAdapter } from './himalayas'
import { jobicyAdapter } from './jobicy'
import { remoteokAdapter } from './remoteok'
import { serplyAdapter } from './serply'
import { themuseAdapter } from './themuse'
import type { SourceAdapter, SourceConfig } from './types'

// ─── Config-Level Registry (existing) ───────────────────────────────────────

export function getAllSources(): SourceConfig[] {
  return Object.values(SOURCE_CONFIGS)
}

export function getSourceByName(name: string): SourceConfig | undefined {
  return SOURCE_CONFIGS[name]
}

export function getOpenSources(): SourceConfig[] {
  return Object.values(SOURCE_CONFIGS).filter((s) => s.type === 'open')
}

export function getKeyRequiredSources(): SourceConfig[] {
  return Object.values(SOURCE_CONFIGS).filter((s) => s.type === 'key_required')
}

export function getSourcesByRegion(region: string): SourceConfig[] {
  return Object.values(SOURCE_CONFIGS).filter(
    (s) => s.regions.includes(region) || s.regions.includes('*'),
  )
}

// ─── Adapter-Level Registry ─────────────────────────────────────────────────

const adapterRegistry: Record<string, SourceAdapter> = {}

export function registerAdapter(adapter: SourceAdapter): void {
  adapterRegistry[adapter.name] = adapter
}

export function getAdapter(name: string): SourceAdapter | undefined {
  return adapterRegistry[name]
}

export function getAllAdapters(): SourceAdapter[] {
  return Object.values(adapterRegistry)
}

export interface SourceRecord {
  name: string
  isEnabled: boolean
}

export function getEnabledAdapters(sources: SourceRecord[]): SourceAdapter[] {
  const enabledNames = new Set(
    sources.filter((s) => s.isEnabled).map((s) => s.name),
  )
  return Object.values(adapterRegistry).filter((a) => enabledNames.has(a.name))
}

export function clearAdapterRegistry(): void {
  for (const key of Object.keys(adapterRegistry)) {
    delete adapterRegistry[key]
  }
}

// ─── Register All Source Adapters ───────────────────────────────────────────

registerAdapter(remoteokAdapter)
registerAdapter(himalayasAdapter)
registerAdapter(themuseAdapter)
registerAdapter(jobicyAdapter)
registerAdapter(serplyAdapter)
