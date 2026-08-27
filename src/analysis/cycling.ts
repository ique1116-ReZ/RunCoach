import type { HeartRateReference, Run, TrackPoint } from '@runs/types'
import { hrmaxZones, lthrZones, zoneForHr } from '@runs/zones'

export type HeartRateZoneSummary = {
  id: string
  label: string
  minPercent?: number
  maxPercent?: number
  minBpm?: number
  maxBpm?: number
  rangeText: string
  seconds: number
  durationText: string
  percent: number
  barText: string
  sampleCount: number
}

export type HeartRateAnalysis = {
  available: boolean
  basis: 'hrmax' | 'lthr' | 'unavailable'
  referenceRequired?: boolean
  referenceSource?: string
  referenceBpm?: number
  zones: HeartRateZoneSummary[]
}

export type CyclingCapabilityName = '续航能力' | '爬坡能力' | '冲刺能力'
export type CyclingCapabilityLevel = '明显刺激' | '一定刺激' | '未明显刺激'

export type CyclingCapabilityAssessment = {
  name: CyclingCapabilityName
  score: number
  level: CyclingCapabilityLevel
  trainingStimulus: string
  evidence: string[]
}

export type CyclingFlowSegment = {
  name: '极光路段'
  alias: '心流路段'
  score: number
  startOffsetSeconds: number
  endOffsetSeconds: number
  startDistanceKm: number
  endDistanceKm: number
  distanceKm: number
  durationSeconds: number
  durationText: string
  averageSpeedKmh: number
  averageHeartRate: number
  averagePower?: number
  averageCadence?: number
  evidence: string[]
}

export type CyclingAnalysis = {
  heartRateZones: HeartRateAnalysis
  capabilities: CyclingCapabilityAssessment[]
  flowSegment?: CyclingFlowSegment
}

type TimedPoint = {
  point: TrackPoint
  seconds: number
}

const finiteValues = (values: Array<number | undefined>) =>
  values.filter((value): value is number => value !== undefined && Number.isFinite(value))

const average = (values: Array<number | undefined>) => {
  const valid = finiteValues(values)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : undefined
}

const maximum = (values: Array<number | undefined>) => {
  const valid = finiteValues(values)
  return valid.length ? Math.max(...valid) : undefined
}

const round = (value: number | undefined, decimals = 1) =>
  value === undefined || !Number.isFinite(value) ? undefined : Number(value.toFixed(decimals))

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

const percentText = (value: number | undefined) => `${Math.round(value ?? 0)}%`

const percentBar = (percent: number) => {
  const filled = Math.round(clamp(percent) / 10)
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`
}

const minutesText = (seconds: number) => {
  const minutes = seconds / 60
  return minutes >= 10 ? `${Math.round(minutes)} 分钟` : `${minutes.toFixed(1)} 分钟`
}

const durationText = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remaining = rounded % 60
  if (hours > 0) return `${hours}小时${minutes}分${remaining}秒`
  return `${minutes}分${remaining}秒`
}

const toTimedPoints = (run: Run): TimedPoint[] => {
  if (run.points.length === 0) return []
  const timed: TimedPoint[] = []
  for (let index = 0; index < run.points.length; index += 1) {
    const point = run.points[index]
    const next = run.points[index + 1]
    const delta = next && Number.isFinite(next.time - point.time) && next.time > point.time
      ? Math.min((next.time - point.time) / 1000, 120)
      : 0
    timed.push({ point, seconds: delta })
  }
  const measuredSeconds = timed.reduce((sum, item) => sum + item.seconds, 0)
  if (measuredSeconds > 0) return timed

  const fallbackSeconds = run.totalTime > 0 ? run.totalTime / 1000 / Math.max(run.points.length, 1) : 0
  return timed.map(item => ({ ...item, seconds: fallbackSeconds }))
}

const weightedAverage = (items: TimedPoint[], selector: (point: TrackPoint) => number | undefined) => {
  const totals = items.reduce((result, item) => {
    const value = selector(item.point)
    if (value === undefined || !Number.isFinite(value)) return result
    result.weighted += value * item.seconds
    result.seconds += item.seconds
    return result
  }, { weighted: 0, seconds: 0 })
  return totals.seconds > 0 ? totals.weighted / totals.seconds : average(items.map(item => selector(item.point)))
}

const deriveGrade = (items: TimedPoint[], index: number) => {
  const current = items[index]?.point
  const next = items[index + 1]?.point
  if (!current || !next || current.elevation === undefined || next.elevation === undefined) return undefined
  const distanceDelta = next.distFromStart - current.distFromStart
  if (!Number.isFinite(distanceDelta) || distanceDelta <= 0) return undefined
  return ((next.elevation - current.elevation) / distanceDelta) * 100
}

const positiveAscent = (run: Run) => {
  if (run.aggregateMetrics.totalAscent !== undefined && Number.isFinite(run.aggregateMetrics.totalAscent)) {
    return run.aggregateMetrics.totalAscent
  }
  let ascent = 0
  for (let index = 1; index < run.points.length; index += 1) {
    const previous = run.points[index - 1].elevation
    const current = run.points[index].elevation
    if (previous !== undefined && current !== undefined && current > previous) ascent += current - previous
  }
  return ascent > 0 ? ascent : undefined
}

const coefficientOfVariation = (values: Array<number | undefined>) => {
  const valid = finiteValues(values)
  if (valid.length < 2) return undefined
  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length
  if (mean <= 0) return undefined
  const variance = valid.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / valid.length
  return Math.sqrt(variance) / mean
}

const metricCoverage = (items: TimedPoint[], selector: (point: TrackPoint) => number | undefined) => {
  const totalSeconds = items.reduce((sum, item) => sum + item.seconds, 0)
  if (totalSeconds <= 0) return 0
  const coveredSeconds = items.reduce((sum, item) => {
    const value = selector(item.point)
    return value !== undefined && Number.isFinite(value) ? sum + item.seconds : sum
  }, 0)
  return coveredSeconds / totalSeconds
}

const meanMaxForDuration = (
  items: TimedPoint[],
  targetSeconds: number,
  selector: (point: TrackPoint) => number | undefined
) => {
  const window: Array<{ seconds: number; value: number }> = []
  let head = 0
  let windowSeconds = 0
  let weightedTotal = 0
  let best: number | undefined

  for (const item of items) {
    if (item.seconds <= 0) continue
    const value = selector(item.point)
    if (value === undefined || !Number.isFinite(value)) {
      window.length = 0
      head = 0
      windowSeconds = 0
      weightedTotal = 0
      continue
    }

    window.push({ seconds: item.seconds, value })
    windowSeconds += item.seconds
    weightedTotal += value * item.seconds

    while (windowSeconds > targetSeconds && head < window.length) {
      const excess = windowSeconds - targetSeconds
      const first = window[head]
      const removedSeconds = Math.min(excess, first.seconds)
      first.seconds -= removedSeconds
      windowSeconds -= removedSeconds
      weightedTotal -= first.value * removedSeconds
      if (first.seconds <= 1e-6) head += 1
    }

    if (windowSeconds >= targetSeconds - 1e-6) {
      const candidate = weightedTotal / targetSeconds
      best = best === undefined ? candidate : Math.max(best, candidate)
    }
  }

  return best
}

const buildFlowCandidate = (run: Run, items: TimedPoint[], startIndex: number, endIndex: number) => {
  const window = items.slice(startIndex, endIndex + 1)
  const durationSeconds = window.reduce((sum, item) => sum + item.seconds, 0)
  if (durationSeconds < 8 * 60) return null

  const speedCoverage = metricCoverage(window, point => point.speed)
  const heartRateCoverage = metricCoverage(window, point => point.hr)
  if (speedCoverage < 0.85 || heartRateCoverage < 0.8) return null

  const speeds = window.map(item => item.point.speed)
  const heartRates = window.map(item => item.point.hr)
  const averageSpeed = weightedAverage(window, point => point.speed)
  const averageHeartRate = weightedAverage(window, point => point.hr)
  const speedCv = coefficientOfVariation(speeds)
  const heartRateCv = coefficientOfVariation(heartRates)
  const heartRateRange = (maximum(heartRates) ?? 0) - (Math.min(...finiteValues(heartRates)) || 0)
  const movingPercent = durationSeconds > 0
    ? window.reduce((sum, item) => (item.point.speed ?? 0) >= 1.5 ? sum + item.seconds : sum, 0) / durationSeconds
    : 0
  if (
    averageSpeed === undefined || averageHeartRate === undefined ||
    speedCv === undefined || heartRateCv === undefined ||
    movingPercent < 0.95 || speedCv > 0.15 || heartRateCv > 0.05 || heartRateRange > 18
  ) return null

  const reference = run.heartRateReference?.value
  const relativeHeartRate = reference && reference > 0 ? averageHeartRate / reference : undefined
  const minRelative = run.heartRateReference?.base === 'LTHR' ? 0.72 : 0.6
  const maxRelative = run.heartRateReference?.base === 'LTHR' ? 1 : 0.92
  if (relativeHeartRate === undefined || relativeHeartRate < minRelative || relativeHeartRate > maxRelative) return null

  const powerCoverage = metricCoverage(window, point => point.power)
  const cadenceCoverage = metricCoverage(window, point => point.cadence)
  const averagePower = powerCoverage >= 0.7 ? weightedAverage(window, point => point.power) : undefined
  const averageCadence = cadenceCoverage >= 0.7 ? weightedAverage(window, point => point.cadence) : undefined
  const powerCv = powerCoverage >= 0.7 ? coefficientOfVariation(window.map(item => item.point.power)) : undefined
  const cadenceCv = cadenceCoverage >= 0.7 ? coefficientOfVariation(window.map(item => item.point.cadence)) : undefined

  const speedStability = clamp(100 - speedCv * 500)
  const heartRateStability = clamp(100 - heartRateCv * 1000)
  const optionalStability = [
    powerCv !== undefined ? clamp(100 - powerCv * 400) : undefined,
    cadenceCv !== undefined ? clamp(100 - cadenceCv * 500) : undefined
  ].filter((value): value is number => value !== undefined)
  const optionalScore = optionalStability.length ? average(optionalStability) ?? 0 : 75
  const score = Math.round(clamp(
    speedStability * 0.35 + heartRateStability * 0.35 + movingPercent * 100 * 0.15 + optionalScore * 0.15
  ))
  if (score < 72) return null

  const startPoint = window[0].point
  const endPoint = items[endIndex + 1]?.point ?? window[window.length - 1].point
  const startDistanceKm = startPoint.distFromStart / 1000
  const endDistanceKm = endPoint.distFromStart / 1000
  const startOffsetSeconds = Math.max(0, (startPoint.time - (run.points[0]?.time ?? startPoint.time)) / 1000)
  const endOffsetSeconds = startOffsetSeconds + durationSeconds
  const evidence = [
    `连续 ${durationText(durationSeconds)}、约 ${(endDistanceKm - startDistanceKm).toFixed(2)} km 无明显中断`,
    `平均速度 ${(averageSpeed * 3.6).toFixed(1)} km/h，速度波动 ${(speedCv * 100).toFixed(1)}%`,
    `平均心率 ${Math.round(averageHeartRate)} bpm，心率波动 ${(heartRateCv * 100).toFixed(1)}%`,
    ...(averagePower !== undefined && powerCv !== undefined
      ? [`平均功率 ${Math.round(averagePower)} W，功率波动 ${(powerCv * 100).toFixed(1)}%`]
      : []),
    ...(averageCadence !== undefined && cadenceCv !== undefined
      ? [`平均踏频 ${Math.round(averageCadence)} rpm，踏频波动 ${(cadenceCv * 100).toFixed(1)}%`]
      : [])
  ]

  return {
    name: '极光路段' as const,
    alias: '心流路段' as const,
    score,
    startOffsetSeconds: Math.round(startOffsetSeconds),
    endOffsetSeconds: Math.round(endOffsetSeconds),
    startDistanceKm: round(startDistanceKm, 2) ?? 0,
    endDistanceKm: round(endDistanceKm, 2) ?? 0,
    distanceKm: round(Math.max(0, endDistanceKm - startDistanceKm), 2) ?? 0,
    durationSeconds: Math.round(durationSeconds),
    durationText: durationText(durationSeconds),
    averageSpeedKmh: round(averageSpeed * 3.6, 1) ?? 0,
    averageHeartRate: Math.round(averageHeartRate),
    averagePower: round(averagePower, 0),
    averageCadence: round(averageCadence, 0),
    evidence
  }
}

const findFlowSegment = (run: Run, items: TimedPoint[]): CyclingFlowSegment | undefined => {
  if (items.length < 2 || run.totalTime < 8 * 60 * 1000) return undefined
  let left = 0
  let windowSeconds = 0
  let best: CyclingFlowSegment | undefined

  for (let right = 0; right < items.length; right += 1) {
    windowSeconds += items[right].seconds
    while (left < right && windowSeconds - items[left].seconds >= 8 * 60) {
      windowSeconds -= items[left].seconds
      left += 1
    }
    const candidate = buildFlowCandidate(run, items, left, right)
    if (!candidate) continue
    if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.durationSeconds > best.durationSeconds)) {
      best = candidate
    }
  }
  return best
}

const countSurges = (items: TimedPoint[], selector: (point: TrackPoint) => number | undefined, threshold: number) => {
  let count = 0
  for (let index = 1; index < items.length; index += 1) {
    const previous = selector(items[index - 1].point)
    const current = selector(items[index].point)
    if (previous === undefined || current === undefined) continue
    if (current - previous >= threshold) count += 1
  }
  return count
}

const buildHeartRateZones = (
  items: TimedPoint[],
  personalReference: HeartRateReference | undefined
): HeartRateAnalysis => {
  const heartRates = items.map(item => item.point.hr)
  const analyzedSeconds = items.reduce((sum, item) => sum + item.seconds, 0)
  if (analyzedSeconds <= 0 || !finiteValues(heartRates).length) {
    return {
      available: false,
      basis: 'unavailable',
      zones: []
    }
  }
  if (!personalReference || personalReference.value <= 0) {
    return {
      available: false,
      basis: 'unavailable',
      referenceRequired: true,
      zones: []
    }
  }
  const referenceBpm = personalReference.value
  const basis = personalReference?.base === 'LTHR'
    ? 'lthr'
    : 'hrmax'

  const zoneDefinitions = personalReference?.base === 'LTHR' ? lthrZones : hrmaxZones
  const zoneTotals = zoneDefinitions.map((zone, index) => {
    const first = index === 0
    const last = index === zoneDefinitions.length - 1
    const minBpm = first ? undefined : Math.ceil((referenceBpm * zone.min) / 100)
    const maxBpm = last ? undefined : Math.ceil((referenceBpm * zone.max) / 100) - 1
    const rangeText = minBpm === undefined
      ? `≤${maxBpm} bpm`
      : maxBpm === undefined
        ? `≥${minBpm} bpm`
        : `${minBpm}–${maxBpm} bpm`
    return {
      ...zone,
      seconds: 0,
      percent: 0,
      sampleCount: 0,
      minBpm,
      maxBpm,
      rangeText
    }
  })
  const heartRateSeconds = items.reduce((sum, item) =>
    item.point.hr !== undefined && Number.isFinite(item.point.hr) ? sum + item.seconds : sum, 0)
  for (const item of items) {
    const zone = zoneForHr(item.point.hr, referenceBpm, zoneDefinitions)
    if (!zone) continue
    const target = zoneTotals.find(candidate => candidate.id === zone.id)
    if (!target) continue
    target.seconds += item.seconds
    target.sampleCount += item.point.hr === undefined ? 0 : 1
  }
  for (const zone of zoneTotals) zone.percent = heartRateSeconds > 0 ? (zone.seconds / heartRateSeconds) * 100 : 0

  return {
    available: true,
    basis,
    referenceSource: personalReference?.source,
    referenceBpm: Math.round(referenceBpm),
    zones: zoneTotals.map((zone, index) => ({
      id: zone.id,
      label: zone.label,
      minPercent: index === 0 ? undefined : zone.min,
      maxPercent: index === zoneTotals.length - 1 ? undefined : zone.max,
      minBpm: zone.minBpm,
      maxBpm: zone.maxBpm,
      rangeText: zone.rangeText,
      seconds: round(zone.seconds, 0) ?? 0,
      durationText: durationText(zone.seconds),
      percent: round(zone.percent, 1) ?? 0,
      barText: percentBar(zone.percent),
      sampleCount: zone.sampleCount
    }))
  }
}

const levelForScore = (score: number): CyclingCapabilityLevel => {
  if (score >= 60) return '明显刺激'
  if (score >= 38) return '一定刺激'
  return '未明显刺激'
}

export const buildCyclingAnalysis = (run: Run): CyclingAnalysis => {
  const items = toTimedPoints(run)
  const heartRate = buildHeartRateZones(items, run.heartRateReference)
  const flowSegment = findFlowSegment(run, items)
  const durationSeconds = run.totalTime > 0 ? run.totalTime / 1000 : items.reduce((sum, item) => sum + item.seconds, 0)
  const durationMinutes = durationSeconds / 60
  const distanceKm = run.totalDistance / 1000
  const averagePower = weightedAverage(items, point => point.power)
  const powerSurges = countSurges(items, point => point.power, Math.max(80, (averagePower ?? 0) * 0.35))
  const powerCoverage = metricCoverage(items, point => point.power)
  const fiveSecondPower = powerCoverage >= 0.8 ? meanMaxForDuration(items, 5, point => point.power) : undefined
  const fifteenSecondPower = powerCoverage >= 0.8 ? meanMaxForDuration(items, 15, point => point.power) : undefined
  const ascent = positiveAscent(run)
  const ascentPerKm = ascent !== undefined && distanceKm > 0 ? ascent / distanceKm : undefined
  const climbSeconds = items.reduce((sum, item, index) => {
    const grade = item.point.grade ?? deriveGrade(items, index)
    return grade !== undefined && grade >= 2 ? sum + item.seconds : sum
  }, 0)
  const climbPercent = durationSeconds > 0 ? (climbSeconds / durationSeconds) * 100 : 0
  const lowIntensityPercent = heartRate.zones
    .filter(zone => zone.id === 'z1' || zone.id === 'z2')
    .reduce((sum, zone) => sum + zone.percent, 0)
  const highIntensityPercent = heartRate.zones
    .filter(zone => zone.id === 'z4' || zone.id === 'z5')
    .reduce((sum, zone) => sum + zone.percent, 0)
  const heartRateConfidence = heartRate.available ? 1 : 0
  const intensityBalance = heartRate.available ? clamp(100 - Math.abs(lowIntensityPercent - 55) * 1.4) : 0
  const durationScore = clamp(durationMinutes * 1.2) + clamp(distanceKm * 2)

  const enduranceScore = clamp(
    durationScore * 0.55 + lowIntensityPercent * 0.35 * heartRateConfidence + (heartRate.available ? intensityBalance * 0.1 * heartRateConfidence : 0)
  )
  const climbingScore = clamp(
    (ascentPerKm === undefined ? 0 : Math.min(ascentPerKm * 5, 45)) + Math.min(climbPercent * 1.3, 35) + highIntensityPercent * 0.2 * heartRateConfidence
  )
  const fiveSecondRatio = fiveSecondPower !== undefined && averagePower !== undefined && averagePower > 0
    ? fiveSecondPower / averagePower
    : undefined
  const fifteenSecondRatio = fifteenSecondPower !== undefined && averagePower !== undefined && averagePower > 0
    ? fifteenSecondPower / averagePower
    : undefined
  const sprintScore = fiveSecondRatio === undefined
    ? undefined
    : clamp(
        Math.min(Math.max(0, fiveSecondRatio - 1) * 110, 55) +
        Math.min(Math.max(0, (fifteenSecondRatio ?? 1) - 1) * 80, 30) +
        Math.min(powerSurges * 5, 15)
      )

  const capabilities: CyclingCapabilityAssessment[] = [
    {
      name: '续航能力',
      score: Math.round(enduranceScore),
      level: levelForScore(enduranceScore),
      trainingStimulus: '较长时间的低至中等强度持续输出，可能促进有氧基础、疲劳耐受和续航能力。',
      evidence: [
        `骑行时长 ${minutesText(durationSeconds)}、距离 ${distanceKm.toFixed(2)} km`,
        ...(heartRate.available ? [`Z1-Z2 低强度占比 ${percentText(lowIntensityPercent)}`] : [])
      ].filter((value): value is string => Boolean(value))
    },
    {
      name: '爬坡能力',
      score: Math.round(climbingScore),
      level: levelForScore(climbingScore),
      trainingStimulus: '持续上坡中的稳定输出，可能提供肌耐力与爬坡节奏方面的训练刺激。',
      evidence: [
        ...(ascent !== undefined ? [`累计爬升 ${Math.round(ascent)} m${ascentPerKm !== undefined ? `（${ascentPerKm.toFixed(1)} m/km）` : ''}`] : []),
        ...(climbPercent > 0 ? [`估算上坡（坡度 >=2%）占骑行时间 ${percentText(climbPercent)}`] : [])
      ]
    },
    ...(sprintScore === undefined ? [] : [{
      name: '冲刺能力' as const,
      score: Math.round(sprintScore),
      level: levelForScore(sprintScore),
      trainingStimulus: '短时间高功率输出可能提供神经肌肉和短时爆发方面的训练刺激。',
      evidence: [
        `5 秒最佳平均功率 ${Math.round(fiveSecondPower ?? 0)} W`,
        ...(fifteenSecondPower !== undefined ? [`15 秒最佳平均功率 ${Math.round(fifteenSecondPower)} W`] : []),
        ...((powerSurges > 0) ? [`检测到约 ${powerSurges} 次明显功率跃升`] : [])
      ]
    }])
  ]

  return {
    heartRateZones: heartRate,
    capabilities,
    flowSegment
  }
}
