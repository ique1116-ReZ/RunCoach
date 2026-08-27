import type { ActivityType, Run } from '@runs/types'
import { sampleAtDistance } from '@runs/align'

export type DashboardSample = {
  distanceKm: number
  time: number
  speedKmh?: number
  heartRate?: number
  power?: number
  cadence?: number
  elevation?: number
  temperature?: number
  grade?: number
}

export type DashboardData = {
  id: string
  name: string
  sourcePath: string
  activityType: ActivityType
  totalDistanceKm: number
  totalTimeMs: number
  averagePace?: string
  averageSpeedKmh?: number
  maxSpeedKmh?: number
  averageHeartRate?: number
  maxHeartRate?: number
  averagePower?: number
  maxPower?: number
  averageCadence?: number
  maxCadence?: number
  totalAscent?: number
  minElevation?: number
  maxElevation?: number
  samples: DashboardSample[]
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

const minimum = (values: Array<number | undefined>) => {
  const valid = finiteValues(values)
  return valid.length ? Math.min(...valid) : undefined
}

const derivedAscent = (run: Run) => {
  let ascent = 0
  for (let index = 1; index < run.points.length; index += 1) {
    const previous = run.points[index - 1].elevation
    const current = run.points[index].elevation
    if (previous !== undefined && current !== undefined && current > previous) ascent += current - previous
  }
  return ascent > 0 ? ascent : undefined
}

const round = (value: number | undefined, decimals = 1) =>
  value === undefined || !Number.isFinite(value)
    ? undefined
    : Number(value.toFixed(decimals))

const paceFromSpeed = (speed: number | undefined) => {
  if (speed === undefined || !Number.isFinite(speed) || speed <= 0) return undefined
  const totalSeconds = Math.round(1000 / speed)
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}/km`
}

const sampleCountFor = (run: Run) => {
  if (run.points.length <= 2) return run.points.length
  return Math.min(180, Math.max(48, run.points.length))
}

export const buildDashboardData = (run: Run): DashboardData => {
  const sampleCount = sampleCountFor(run)
  const firstTime = run.points[0]?.time ?? 0
  const samples = Array.from({ length: sampleCount }, (_, index) => {
    const ratio = sampleCount <= 1 ? 0 : index / (sampleCount - 1)
    const distance = run.totalDistance * ratio
    const point = sampleAtDistance(run, distance)
    if (!point) return null
    return {
      distanceKm: distance / 1000,
      time: firstTime + run.totalTime * ratio,
      speedKmh: point.speed !== undefined ? point.speed * 3.6 : undefined,
      heartRate: point.hr,
      power: point.power,
      cadence: point.cadence,
      elevation: point.elevation,
      temperature: point.temperature,
      grade: point.grade
    } as DashboardSample
  }).filter((sample): sample is DashboardSample => sample !== null)

  const speedValues = run.points.map(point => point.speed)
  const heartRateValues = run.points.map(point => point.hr)
  const powerValues = run.points.map(point => point.power)
  const cadenceValues = run.points.map(point => point.cadence)
  const elevationValues = run.points.map(point => point.elevation)
  const averageSpeed = run.totalTime > 0 && run.totalDistance > 0
    ? run.totalDistance / (run.totalTime / 1000)
    : average(speedValues)
  const averageHeartRate = average(heartRateValues) ?? run.aggregateMetrics.avgHeartRate
  const maxHeartRate = maximum(heartRateValues) ?? run.aggregateMetrics.maxHeartRate
  const averagePower = average(powerValues) ?? run.aggregateMetrics.avgPower
  const maxPower = maximum(powerValues) ?? run.aggregateMetrics.maxPower
  const averageCadence = average(cadenceValues) ?? run.aggregateMetrics.avgCadence
  const maxCadence = maximum(cadenceValues) ?? run.aggregateMetrics.maxCadence

  return {
    id: run.id,
    name: run.name,
    sourcePath: run.sourcePath,
    activityType: run.activityType,
    totalDistanceKm: Number((run.totalDistance / 1000).toFixed(2)),
    totalTimeMs: run.totalTime,
    averagePace: run.activityType === 'cycling' ? undefined : paceFromSpeed(averageSpeed),
    averageSpeedKmh: round(averageSpeed !== undefined ? averageSpeed * 3.6 : undefined),
    maxSpeedKmh: round(maximum(speedValues) !== undefined ? (maximum(speedValues) as number) * 3.6 : undefined),
    averageHeartRate: round(averageHeartRate, 0),
    maxHeartRate: round(maxHeartRate, 0),
    averagePower: round(averagePower, 0),
    maxPower: round(maxPower, 0),
    averageCadence: round(averageCadence, 0),
    maxCadence: round(maxCadence, 0),
    totalAscent: round(run.aggregateMetrics.totalAscent ?? derivedAscent(run), 0),
    minElevation: round(minimum(elevationValues), 0),
    maxElevation: round(maximum(elevationValues), 0),
    samples
  }
}

const csvCell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const csvNumber = (value: number | undefined, decimals = 2) =>
  value === undefined || !Number.isFinite(value) ? '' : value.toFixed(decimals)

export const dashboardToCsv = (run: Run) => {
  const rows = [
    ['activity_type', run.activityType],
    ['activity_name', run.name],
    ['source_file', run.sourcePath],
    ['distance_km', csvNumber(run.totalDistance / 1000)],
    ['duration_seconds', csvNumber(run.totalTime / 1000, 0)],
    [],
    ['time', 'distance_km', 'speed_kmh', 'pace_min_per_km', 'heart_rate_bpm', 'power_w', 'cadence_rpm', 'elevation_m', 'temperature_c', 'grade_percent']
  ]

  for (const point of run.points) {
    const speedKmh = point.speed !== undefined ? point.speed * 3.6 : undefined
    rows.push([
      new Date(point.time).toISOString(),
      csvNumber(point.distFromStart / 1000),
      csvNumber(speedKmh, 1),
      point.speed !== undefined ? csvCell(paceFromSpeed(point.speed)) : '',
      csvNumber(point.hr, 0),
      csvNumber(point.power, 0),
      csvNumber(point.cadence, 0),
      csvNumber(point.elevation, 1),
      csvNumber(point.temperature, 1),
      csvNumber(point.grade, 2)
    ])
  }

  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`
}
