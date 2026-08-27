import type { Run } from '@runs/types'
import { sampleAtDistance } from '@runs/align'
import { buildCyclingAnalysis } from './cycling'

export type ComparisonRelation = 'auto' | 'same_athlete' | 'different_athletes'

const formatNumber = (value: number, decimals = 2) =>
  value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

const formatPace = (speed: number) => {
  if (!Number.isFinite(speed) || speed <= 0) return '--'
  const totalSeconds = 1000 / speed
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`
}

const formatSpeedKmh = (speed: number | undefined) =>
  speed !== undefined && Number.isFinite(speed) && speed >= 0
    ? Number(formatNumber(speed * 3.6, 1))
    : undefined

const average = (values: number[]) => {
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const maxValue = (values: number[]) => {
  if (values.length === 0) return undefined
  return Math.max(...values)
}

const minValue = (values: number[]) => {
  if (values.length === 0) return undefined
  return Math.min(...values)
}

const roundMaybe = (value: number | undefined, decimals = 2) =>
  value === undefined || !Number.isFinite(value) ? undefined : Number(formatNumber(value, decimals))

const metricAverage = (run: Run, key: string) => {
  const values = run.points
    .map(point => {
      if (key === 'heart_rate') return point.hr
      if (key === 'speed') return point.speed
      if (key === 'elevation') return point.elevation
      return point.metrics[key]
    })
    .filter((value): value is number => Number.isFinite(value))
  return average(values)
}

const metricPeak = (run: Run, key: string) => {
  const values = run.points
    .map(point => {
      if (key === 'heart_rate') return point.hr
      if (key === 'speed') return point.speed
      if (key === 'elevation') return point.elevation
      return point.metrics[key]
    })
    .filter((value): value is number => Number.isFinite(value))
  return maxValue(values)
}

const metricLow = (run: Run, key: string) => {
  const values = run.points
    .map(point => {
      if (key === 'heart_rate') return point.hr
      if (key === 'speed') return point.speed
      if (key === 'elevation') return point.elevation
      return point.metrics[key]
    })
    .filter((value): value is number => Number.isFinite(value))
  return minValue(values)
}

const asPointDigest = (run: Run, percent: number) => {
  const distance = run.totalDistance * percent
  const point = sampleAtDistance(run, distance)
  const isCycling = run.activityType === 'cycling'
  return {
    percent: roundMaybe(percent * 100, 0),
    distanceKm: roundMaybe(distance / 1000, 2),
    pace: !isCycling && point?.speed ? formatPace(point.speed) : undefined,
    speedMs: roundMaybe(point?.speed, 2),
    speedKmh: formatSpeedKmh(point?.speed),
    hr: roundMaybe(point?.hr, 0),
    elevation: roundMaybe(point?.elevation, 0),
    power: roundMaybe(point?.power, 0),
    cadence: roundMaybe(point?.cadence, 0),
    grade: roundMaybe(point?.grade, 1),
    temperature: roundMaybe(point?.temperature, 1)
  }
}

export const buildRunDigest = (run: Run) => {
  const checkpoints = [0, 0.25, 0.5, 0.75, 1].map(percent => asPointDigest(run, percent))
  const averageSpeed = run.totalTime > 0 && run.totalDistance > 0
    ? run.totalDistance / (run.totalTime / 1000)
    : metricAverage(run, 'speed')
  const isCycling = run.activityType === 'cycling'
  return {
    fileName: run.sourcePath,
    name: run.name,
    activityType: run.activityType,
    sourceType: run.sourceType,
    totalDistanceKm: roundMaybe(run.totalDistance / 1000, 2),
    totalDuration: formatDuration(run.totalTime),
    averagePace: !isCycling && averageSpeed ? formatPace(averageSpeed) : undefined,
    averageSpeedKmh: formatSpeedKmh(averageSpeed),
    maxSpeedKmh: formatSpeedKmh(metricPeak(run, 'speed')),
    averageHeartRate: roundMaybe(metricAverage(run, 'heart_rate') ?? run.aggregateMetrics.avgHeartRate, 0),
    maxHeartRate: roundMaybe(metricPeak(run, 'heart_rate') ?? run.aggregateMetrics.maxHeartRate, 0),
    averagePower: roundMaybe(metricAverage(run, 'power') ?? run.aggregateMetrics.avgPower, 0),
    maxPower: roundMaybe(metricPeak(run, 'power') ?? run.aggregateMetrics.maxPower, 0),
    averageCadence: roundMaybe(metricAverage(run, 'cadence') ?? run.aggregateMetrics.avgCadence, 0),
    maxCadence: roundMaybe(metricPeak(run, 'cadence') ?? run.aggregateMetrics.maxCadence, 0),
    cadenceUnit: isCycling ? 'rpm' : 'spm',
    avgElevation: roundMaybe(metricAverage(run, 'elevation'), 0),
    minElevation: roundMaybe(metricLow(run, 'elevation'), 0),
    maxElevation: roundMaybe(metricPeak(run, 'elevation'), 0),
    totalAscent: roundMaybe(run.aggregateMetrics.totalAscent, 0),
    metricKeys: run.metricKeys,
    lapCount: run.lapSummaries.length,
    summaryPreview: run.summaryEntries.slice(0, 14),
    analysisFocus: isCycling
      ? '骑行训练：使用 cyclingAnalysis 中的心率分区、能力刺激和可选心流路段；只引用摘要中实际存在的指标，不要使用跑步配速表达。'
      : run.activityType === 'running'
        ? '跑步训练：优先分析配速、心率、步频、爬升和前后程稳定性。'
        : '运动类型未知：结合文件名、原始摘要和用户描述判断；不确定时明确说明，不要武断归类。',
    cyclingAnalysis: isCycling ? buildCyclingAnalysis(run) : undefined,
    checkpoints
  }
}

export const buildComparisonDigest = (runA: Run, runB: Run, relation: ComparisonRelation) => {
  const a = buildRunDigest(runA)
  const b = buildRunDigest(runB)
  const totalDistanceDeltaKm = roundMaybe((runB.totalDistance - runA.totalDistance) / 1000, 2)
  const totalDurationDelta = roundMaybe((runB.totalTime - runA.totalTime) / 1000, 0)

  const checkpointPairs = [0, 0.25, 0.5, 0.75, 1].map(percent => {
    const pointA = asPointDigest(runA, percent)
    const pointB = asPointDigest(runB, percent)
    return {
      percent: pointA.percent,
      a: pointA,
      b: pointB,
      delta: {
        pace: pointA.pace && pointB.pace ? `${pointA.pace} vs ${pointB.pace}` : undefined,
        speedKmh: pointA.speedKmh !== undefined && pointB.speedKmh !== undefined
          ? roundMaybe(pointB.speedKmh - pointA.speedKmh, 1)
          : undefined,
        hr: pointA.hr !== undefined && pointB.hr !== undefined ? roundMaybe(pointB.hr - pointA.hr, 0) : undefined,
        elevation: pointA.elevation !== undefined && pointB.elevation !== undefined ? roundMaybe(pointB.elevation - pointA.elevation, 0) : undefined,
        power: pointA.power !== undefined && pointB.power !== undefined ? roundMaybe(pointB.power - pointA.power, 0) : undefined,
        cadence: pointA.cadence !== undefined && pointB.cadence !== undefined ? roundMaybe(pointB.cadence - pointA.cadence, 0) : undefined
      }
    }
  })

  return {
    relation,
    alignmentNote: '检查点按各自总距离百分比对齐；若路线不同，应结合坡度、海拔和风阻解读速度、心率与功率差异。',
    routeComparison: {
      totalDistanceDeltaKm,
      totalDurationDelta,
      totalAscentDelta: roundMaybe((runB.aggregateMetrics.totalAscent ?? 0) - (runA.aggregateMetrics.totalAscent ?? 0), 0)
    },
    a,
    b,
    checkpointPairs
  }
}
