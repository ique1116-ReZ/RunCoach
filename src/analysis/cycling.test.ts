import { describe, expect, it } from 'vitest'
import type { Run } from '@runs/types'
import { buildCyclingAnalysis } from './cycling'

const ride: Run = {
  id: 'cycling-analysis', name: '短途骑行', activityType: 'cycling', sourcePath: 'ride.fit', sourceType: 'fit',
  points: [
    { lat: 31.2, lon: 121.5, time: 1700000000000, hr: 100, speed: 6, power: 120, elevation: 4, metrics: {}, distFromStart: 0 },
    { lat: 31.201, lon: 121.501, time: 1700000030000, hr: 120, speed: 7, power: 150, elevation: 10, metrics: {}, distFromStart: 60 },
    { lat: 31.202, lon: 121.502, time: 1700000060000, hr: 150, speed: 10, power: 240, elevation: 30, metrics: {}, distFromStart: 140 },
    { lat: 31.203, lon: 121.503, time: 1700000090000, hr: 140, speed: 8, power: 180, elevation: 30, metrics: {}, distFromStart: 220 }
  ],
  totalDistance: 220, totalTime: 90000, metricKeys: ['heart_rate', 'speed', 'power', 'elevation'], summaryEntries: [], lapSummaries: [], aggregateMetrics: {},
  heartRateReference: { base: 'HRmax', value: 180, source: 'test' }
}

const buildFlowRide = (options: { volatile?: boolean; includeOptional?: boolean } = {}): Run => {
  const stepSeconds = 30
  const pointCount = 25
  const startedAt = 1700000000000
  const points = Array.from({ length: pointCount }, (_, index) => {
    const speed = options.volatile ? (index % 2 === 0 ? 3 : 13) : 8 + (index % 3 - 1) * 0.08
    const hr = options.volatile ? (index % 2 === 0 ? 105 : 168) : 140 + (index % 3 - 1)
    return {
      lat: 31.2 + index * 0.0001,
      lon: 121.5 + index * 0.0001,
      time: startedAt + index * stepSeconds * 1000,
      hr,
      speed,
      power: options.includeOptional ? 190 + (index % 3 - 1) * 2 : undefined,
      cadence: options.includeOptional ? 88 + (index % 3 - 1) : undefined,
      elevation: 4,
      metrics: {},
      distFromStart: index * 8 * stepSeconds
    }
  })
  return {
    id: options.volatile ? 'volatile-flow-ride' : 'stable-flow-ride',
    name: '稳定骑行',
    activityType: 'cycling',
    sourcePath: 'flow.fit',
    sourceType: 'fit',
    points,
    totalDistance: points.at(-1)?.distFromStart ?? 0,
    totalTime: (pointCount - 1) * stepSeconds * 1000,
    metricKeys: options.includeOptional
      ? ['heart_rate', 'speed', 'power', 'cadence']
      : ['heart_rate', 'speed'],
    summaryEntries: [],
    lapSummaries: [],
    aggregateMetrics: {},
    heartRateReference: { base: 'HRmax', value: 180, source: 'test' }
  }
}

describe('buildCyclingAnalysis', () => {
  it('按逐点时间计算心率五区占比条和三项训练刺激', () => {
    const analysis = buildCyclingAnalysis(ride)
    expect(analysis.heartRateZones.available).toBe(true)
    expect(analysis.heartRateZones.referenceBpm).toBe(180)
    expect(analysis.heartRateZones.zones.reduce((sum, zone) => sum + zone.seconds, 0)).toBe(90)
    expect(analysis.heartRateZones.zones.some(zone => zone.percent > 0)).toBe(true)
    expect(analysis.heartRateZones.zones).toHaveLength(5)
    expect(analysis.heartRateZones.zones.every(zone => /^[█░]{10}$/.test(zone.barText))).toBe(true)
    expect(analysis.capabilities.map(capability => capability.name)).toEqual(['续航能力', '爬坡能力', '冲刺能力'])
    expect(analysis.capabilities.find(capability => capability.name === '冲刺能力')?.evidence.join('')).toContain('5 秒最佳平均功率')
    expect(analysis.capabilities.every(capability => capability.trainingStimulus.includes('可能'))).toBe(true)
    expect(analysis.heartRateZones).not.toHaveProperty('note')
    expect(analysis).not.toHaveProperty('note')
  })

  it('FIT timerTime 存在时按有效计时统计，暂停区间不进入心率时间', () => {
    const pausedRide: Run = {
      ...ride,
      points: [
        { ...ride.points[0], time: 1700000000000, timerTime: 0 },
        { ...ride.points[1], time: 1700001800000, timerTime: 30000 },
        { ...ride.points[2], time: 1700003600000, timerTime: 60000 },
        { ...ride.points[3], time: 1700005400000, timerTime: 90000 }
      ],
      totalTime: 90000
    }
    const analysis = buildCyclingAnalysis(pausedRide)
    expect(analysis.heartRateZones.zones.reduce((sum, zone) => sum + zone.seconds, 0)).toBe(90)
    expect(analysis.capabilities.find(capability => capability.name === '续航能力')?.evidence.join('')).toContain('1.5 分钟')
  })

  it('计时字段不完整时整段回退时间戳，避免混用两个时间轴', () => {
    const partiallyTimedRide: Run = {
      ...ride,
      points: ride.points.map((point, index) => index === 2 ? point : { ...point, timerTime: index * 30000 }),
      totalTime: 90000
    }
    const analysis = buildCyclingAnalysis(partiallyTimedRide)
    expect(analysis.heartRateZones.zones.reduce((sum, zone) => sum + zone.seconds, 0)).toBe(90)
  })

  it('无功率或功率覆盖不足 80% 时完全省略冲刺能力', () => {
    const withoutPower = buildCyclingAnalysis({
      ...ride,
      metricKeys: ride.metricKeys.filter(key => key !== 'power'),
      points: ride.points.map(point => ({ ...point, power: undefined }))
    })
    expect(withoutPower.capabilities.map(capability => capability.name)).toEqual(['续航能力', '爬坡能力'])
    expect(JSON.stringify(withoutPower)).not.toMatch(/冲刺|功率/)

    const partialPower = buildCyclingAnalysis({
      ...ride,
      points: ride.points.map((point, index) => ({ ...point, power: index < 2 ? point.power : undefined }))
    })
    expect(partialPower.capabilities.map(capability => capability.name)).toEqual(['续航能力', '爬坡能力'])
  })

  it('没有逐点心率时保持静默，不生成缺失说明', () => {
    const noHeartRate = { ...ride, points: ride.points.map(point => ({ ...point, hr: undefined })) }
    const analysis = buildCyclingAnalysis(noHeartRate)
    expect(analysis.heartRateZones.available).toBe(false)
    expect(analysis.heartRateZones).not.toHaveProperty('note')
  })

  it('没有锚点时要求用户提供，提供后按 PRD 比例和向上取整边界分区', () => {
    const withoutReference = buildCyclingAnalysis({ ...ride, heartRateReference: undefined })
    expect(withoutReference.heartRateZones).toEqual(expect.objectContaining({
      available: false,
      referenceRequired: true,
      basis: 'unavailable'
    }))

    const hrmax = buildCyclingAnalysis(ride)
    expect(hrmax.heartRateZones.zones.map(zone => zone.rangeText)).toEqual([
      '≤131 bpm', '132–145 bpm', '146–152 bpm', '153–161 bpm', '≥162 bpm'
    ])

    const lthr = buildCyclingAnalysis({
      ...ride,
      heartRateReference: { base: 'LTHR', value: 170, source: 'test' }
    })
    expect(lthr.heartRateZones.zones.map(zone => zone.rangeText)).toEqual([
      '≤137 bpm', '138–152 bpm', '153–159 bpm', '160–169 bpm', '≥170 bpm'
    ])
  })

  it('稳定连续骑行满足规则时识别极光路段', () => {
    const analysis = buildCyclingAnalysis(buildFlowRide({ includeOptional: true }))
    expect(analysis.flowSegment?.name).toBe('极光路段')
    expect(analysis.flowSegment?.alias).toBe('心流路段')
    expect(analysis.flowSegment?.durationSeconds).toBeGreaterThanOrEqual(8 * 60)
    expect(analysis.flowSegment?.evidence.join('')).toContain('平均心率')
    expect(analysis.flowSegment).not.toHaveProperty('note')
  })

  it('速度和心率大幅波动时不生成极光路段', () => {
    const analysis = buildCyclingAnalysis(buildFlowRide({ volatile: true }))
    expect(analysis.flowSegment).toBeUndefined()
  })

  it('没有功率和踏频时仍可识别极光路段且不提缺失指标', () => {
    const analysis = buildCyclingAnalysis(buildFlowRide())
    expect(analysis.flowSegment).toBeDefined()
    expect(analysis.flowSegment?.averagePower).toBeUndefined()
    expect(analysis.flowSegment?.averageCadence).toBeUndefined()
    expect(analysis.flowSegment?.evidence.join('')).not.toMatch(/功率|踏频|缺少|未记录|无法/)
    expect(JSON.stringify(analysis)).not.toMatch(/功率|踏频|缺少|未记录|无法/)
  })
})
