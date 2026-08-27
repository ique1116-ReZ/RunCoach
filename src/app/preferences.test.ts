import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cyclingHeartRateRatioWarning,
  estimateHrmaxFromAge,
  loadCyclingHeartRateProfile,
  resolveCyclingHeartRateReference,
  saveCyclingHeartRateProfile
} from './preferences'

afterEach(() => vi.unstubAllGlobals())

const stubStorage = (initial: Record<string, string> = {}) => {
  const store = { ...initial }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value }
  })
  return store
}

describe('cycling heart-rate preferences', () => {
  it('按 PRD 公式从 30 岁估算 HRmax 187，并拒绝超龄输入', () => {
    expect(estimateHrmaxFromAge(30)).toBe(187)
    expect(estimateHrmaxFromAge(17)).toBeUndefined()
    expect(estimateHrmaxFromAge(81)).toBeUndefined()
  })

  it('优先使用 LTHR，其次手填 HRmax，最后才用年龄估算', () => {
    expect(resolveCyclingHeartRateReference({ lthr: 168, hrmax: 190, age: 30 })).toEqual({
      base: 'LTHR', value: 168, source: '设置 · 骑行阈值心率'
    })
    expect(resolveCyclingHeartRateReference({ hrmax: 190, age: 30 })).toEqual({
      base: 'HRmax', value: 190, source: '设置 · 最大心率'
    })
    expect(resolveCyclingHeartRateReference({ age: 30 })).toEqual({
      base: 'HRmax', value: 187, source: '临时区间 · 基于年龄估算'
    })
  })

  it('设置中的 LTHR 优先于 FIT HRmax，FIT LTHR 优先于设置 HRmax', () => {
    expect(resolveCyclingHeartRateReference(
      { lthr: 168 },
      { base: 'HRmax', value: 190, source: 'FIT' }
    )?.base).toBe('LTHR')
    expect(resolveCyclingHeartRateReference(
      { hrmax: 190 },
      { base: 'LTHR', value: 168, source: 'FIT' }
    )).toEqual({ base: 'LTHR', value: 168, source: 'FIT' })
  })

  it('持久化只保留有效整数，损坏的 localStorage 返回空配置', () => {
    const store = stubStorage()
    saveCyclingHeartRateProfile({ hrmax: 188, lthr: 168, age: 30 })
    expect(loadCyclingHeartRateProfile()).toEqual(expect.objectContaining({ hrmax: 188, lthr: 168, age: 30 }))

    store['virtualcoach.cyclingHeartRate'] = '{broken'
    expect(loadCyclingHeartRateProfile()).toEqual({})
  })

  it('LTHR 与 HRmax 比例超出 80%～95% 时提示复核', () => {
    expect(cyclingHeartRateRatioWarning({ lthr: 160, hrmax: 190 })).toBeUndefined()
    expect(cyclingHeartRateRatioWarning({ lthr: 120, hrmax: 190 })).toContain('63%')
  })
})
