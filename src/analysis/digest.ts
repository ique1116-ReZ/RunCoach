import type { Run } from '@runs/types'
import { sampleAtDistance } from '@runs/align'

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
  return {
    percent: roundMaybe(percent * 100, 0),
    distanceKm: roundMaybe(distance / 1000, 2),
    pace: point?.speed ? formatPace(point.speed) : '--',
    speedMs: roundMaybe(point?.speed, 2),
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
  return {
    fileName: run.sourcePath,
    name: run.name,
    sourceType: run.sourceType,
    totalDistanceKm: roundMaybe(run.totalDistance / 1000, 2),
    totalDuration: formatDuration(run.totalTime),
    averagePace: run.totalTime > 0 && run.totalDistance > 0 ? formatPace(run.totalDistance / (run.totalTime / 1000)) : '--',
    averageHeartRate: roundMaybe(metricAverage(run, 'heart_rate'), 0),
    maxHeartRate: roundMaybe(metricPeak(run, 'heart_rate'), 0),
    averagePower: roundMaybe(metricAverage(run, 'power'), 0),
    maxPower: roundMaybe(metricPeak(run, 'power'), 0),
    averageCadence: roundMaybe(metricAverage(run, 'cadence'), 0),
    maxCadence: roundMaybe(metricPeak(run, 'cadence'), 0),
    avgElevation: roundMaybe(metricAverage(run, 'elevation'), 0),
    minElevation: roundMaybe(metricLow(run, 'elevation'), 0),
    maxElevation: roundMaybe(metricPeak(run, 'elevation'), 0),
    totalAscent: roundMaybe(run.aggregateMetrics.totalAscent, 0),
    metricKeys: run.metricKeys,
    lapCount: run.lapSummaries.length,
    summaryPreview: run.summaryEntries.slice(0, 14),
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
        pace: pointA.pace === '--' || pointB.pace === '--' ? '--' : `${pointA.pace} vs ${pointB.pace}`,
        hr: pointA.hr !== undefined && pointB.hr !== undefined ? roundMaybe(pointB.hr - pointA.hr, 0) : undefined,
        elevation: pointA.elevation !== undefined && pointB.elevation !== undefined ? roundMaybe(pointB.elevation - pointA.elevation, 0) : undefined,
        power: pointA.power !== undefined && pointB.power !== undefined ? roundMaybe(pointB.power - pointA.power, 0) : undefined,
        cadence: pointA.cadence !== undefined && pointB.cadence !== undefined ? roundMaybe(pointB.cadence - pointA.cadence, 0) : undefined
      }
    }
  })

  return {
    relation,
    alignmentNote: 'B 已按 A 的路线做拟合，差异应主要来自配速、心率和力量策略，而不是纯 GPS 偏差。',
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
