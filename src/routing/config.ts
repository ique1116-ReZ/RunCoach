export type RoutingConfig = {
  amapKey: string
  orsKey: string
}

const STORAGE_KEY = 'virtualcoach.routing'

const normalize = (value: unknown): RoutingConfig => {
  const candidate = value && typeof value === 'object' ? value as Partial<RoutingConfig> : {}
  return {
    amapKey: typeof candidate.amapKey === 'string' ? candidate.amapKey.trim() : '',
    orsKey: typeof candidate.orsKey === 'string' ? candidate.orsKey.trim() : ''
  }
}

export const loadRoutingConfig = (): RoutingConfig => {
  let saved: unknown
  try {
    saved = typeof localStorage === 'undefined'
      ? undefined
      : JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
  } catch {
    saved = undefined
  }
  const normalized = normalize(saved)
  return {
    amapKey: normalized.amapKey || import.meta.env.VITE_AMAP_WEB_KEY || '',
    orsKey: normalized.orsKey || import.meta.env.VITE_ORS_KEY || ''
  }
}

export const saveRoutingConfig = (config: RoutingConfig): RoutingConfig => {
  const normalized = normalize(config)
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
