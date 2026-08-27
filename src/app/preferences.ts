import type { HeartRateReference } from '@runs/types'

export type HomeBackground = 'contour' | 'dither'

export type CyclingHeartRateProfile = {
  hrmax?: number
  lthr?: number
  age?: number
  updatedAt?: string
}

const HOME_BACKGROUND_KEY = 'virtualcoach.homeBackground'
const LEGACY_HOME_BACKGROUND_KEY = 'runcoach.homeBackground'
const CYCLING_HEART_RATE_KEY = 'virtualcoach.cyclingHeartRate'

const isIntegerInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

export const parseOptionalInteger = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

export const estimateHrmaxFromAge = (age: number | undefined): number | undefined => {
  if (!isIntegerInRange(age, 18, 80)) return undefined
  return Math.floor(208 - 0.7 * age + 0.5)
}

export const normalizeCyclingHeartRateProfile = (value: unknown): CyclingHeartRateProfile => {
  if (!value || typeof value !== 'object') return {}
  const candidate = value as CyclingHeartRateProfile
  return {
    ...(isIntegerInRange(candidate.hrmax, 30, 230) ? { hrmax: candidate.hrmax } : {}),
    ...(isIntegerInRange(candidate.lthr, 30, 230) ? { lthr: candidate.lthr } : {}),
    ...(isIntegerInRange(candidate.age, 18, 80) ? { age: candidate.age } : {}),
    ...(typeof candidate.updatedAt === 'string' ? { updatedAt: candidate.updatedAt } : {})
  }
}

export const resolveCyclingHeartRateReference = (
  profile: CyclingHeartRateProfile,
  fitReference?: HeartRateReference
): HeartRateReference | undefined => {
  const normalized = normalizeCyclingHeartRateProfile(profile)

  if (normalized.lthr !== undefined) {
    return { base: 'LTHR', value: normalized.lthr, source: '设置 · 骑行阈值心率' }
  }
  if (fitReference?.base === 'LTHR') return fitReference
  if (normalized.hrmax !== undefined) {
    return { base: 'HRmax', value: normalized.hrmax, source: '设置 · 最大心率' }
  }
  if (fitReference?.base === 'HRmax') return fitReference

  const estimated = estimateHrmaxFromAge(normalized.age)
  return estimated === undefined
    ? undefined
    : { base: 'HRmax', value: estimated, source: '临时区间 · 基于年龄估算' }
}

export const cyclingHeartRateRatioWarning = (profile: CyclingHeartRateProfile): string | undefined => {
  const normalized = normalizeCyclingHeartRateProfile(profile)
  const hrmax = normalized.hrmax ?? estimateHrmaxFromAge(normalized.age)
  if (normalized.lthr === undefined || hrmax === undefined) return undefined
  const ratio = normalized.lthr / hrmax
  if (ratio >= 0.8 && ratio <= 0.95) return undefined
  return `阈值心率约为最大心率的 ${Math.round(ratio * 100)}%，请确认两个数值是否填反或需要更新。`
}

export const isHomeBackground = (value: unknown): value is HomeBackground =>
  value === 'contour' || value === 'dither'

export const loadHomeBackground = (): HomeBackground => {
  const raw = localStorage.getItem(HOME_BACKGROUND_KEY) ?? localStorage.getItem(LEGACY_HOME_BACKGROUND_KEY)
  return isHomeBackground(raw) ? raw : 'contour'
}

export const saveHomeBackground = (value: HomeBackground) => {
  localStorage.setItem(HOME_BACKGROUND_KEY, value)
}

export const loadCyclingHeartRateProfile = (): CyclingHeartRateProfile => {
  const raw = localStorage.getItem(CYCLING_HEART_RATE_KEY)
  if (!raw) return {}
  try {
    return normalizeCyclingHeartRateProfile(JSON.parse(raw))
  } catch {
    return {}
  }
}

export const saveCyclingHeartRateProfile = (profile: CyclingHeartRateProfile) => {
  const normalized = normalizeCyclingHeartRateProfile(profile)
  const saved: CyclingHeartRateProfile = { ...normalized, updatedAt: new Date().toISOString() }
  localStorage.setItem(CYCLING_HEART_RATE_KEY, JSON.stringify(saved))
  return saved
}
