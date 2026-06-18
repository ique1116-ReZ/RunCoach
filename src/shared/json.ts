import type { Run, RunLap, SummaryEntry, SummaryValue, TrackPoint } from './types'
import { haversineMeters } from './geo'

const metricAliases: Record<string, string> = {
  hr: 'heart_rate',
  HR: 'heart_rate',
  heartRate: 'heart_rate',
  heart_rate: 'heart_rate',
  bpm: 'heart_rate',
  pace: 'pace',
  speed: 'speed',
  Speed: 'speed',
  velocity: 'speed',
  ele: 'elevation',
  altitude: 'elevation',
  Altitude: 'elevation',
  GPSAltitude: 'elevation',
  elevation: 'elevation',
  power: 'power',
  Power: 'power',
  cadence: 'cadence',
  Cadence: 'cadence',
  temperature: 'temperature',
  Temperature: 'temperature',
  temp: 'temperature',
  grade: 'grade',
  Grade: 'grade',
  slope: 'grade',
  verticalSpeed: 'vertical_speed',
  VerticalSpeed: 'vertical_speed',
  vertical_speed: 'vertical_speed',
  verticalOscillation: 'vertical_oscillation',
  VerticalOscillation: 'vertical_oscillation',
  vertical_oscillation: 'vertical_oscillation',
  verticalRatio: 'vertical_ratio',
  vertical_ratio: 'vertical_ratio',
  strideLength: 'stride_length',
  stride_length: 'stride_length',
  groundContactTime: 'ground_contact_time',
  GroundContactTime: 'ground_contact_time',
  contactTimeRatio: 'contact_time_ratio',
  ContactTimeRatio: 'contact_time_ratio',
  flightTime: 'flight_time',
  FlightTime: 'flight_time',
  Distance: 'distance',
  distance: 'distance'
}

const pointArrayKeys = ['points', 'trackPoints', 'trackpoints', 'records', 'samples', 'data']
const timeKeys = ['time', 'timestamp', 'date', 'datetime', 'recordedAt', 'TimeISO8601', 'UTC']
const latKeys = ['lat', 'latitude', 'Latitude']
const lonKeys = ['lon', 'lng', 'longitude', 'Longitude']

const safeNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

const safeTime = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000
  }
  if (!value) return undefined
  const time = Date.parse(String(value))
  return Number.isFinite(time) ? time : undefined
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const radiansToDegreesIfNeeded = (value: number, isLat: boolean) => {
  const degreeLimit = isLat ? 90 : 180
  if (Math.abs(value) <= Math.PI * 2 + 0.1) {
    return (value * 180) / Math.PI
  }
  if (Math.abs(value) > degreeLimit) {
    return value / 1e7
  }
  return value
}

const formatNumber = (value: number, decimals = 2) =>
  value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')

const normalizeMetricKey = (key: string) =>
  metricAliases[key] ?? key.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`).replace(/^_/, '')

const normalizeMetricValue = (key: string, value: number) => {
  if (key === 'heart_rate') {
    return value > 0 && value < 10 ? value * 60 : value
  }
  if (key === 'cadence') {
    return value > 0 && value < 10 ? value * 60 : value
  }
  if (key === 'temperature') {
    return value > 150 ? value - 273.15 : value
  }
  if (key === 'vertical_oscillation') {
    return value > 0 && value < 1 ? value * 1000 : value
  }
  if (key === 'ground_contact_time' || key === 'flight_time') {
    return value > 0 && value < 10 ? value * 1000 : value
  }
  if (key === 'contact_time_ratio' || key === 'vertical_ratio') {
    return value > 0 && value <= 1 ? value * 100 : value
  }
  if (key === 'pace') {
    return value > 0 ? 1000 / (value * 60) : undefined
  }
  return value
}

const metricUnit = (key: string) => {
  switch (key) {
    case 'heart_rate':
      return 'bpm'
    case 'speed':
      return 'm/s'
    case 'elevation':
      return 'm'
    case 'power':
      return 'W'
    case 'cadence':
      return 'spm'
    case 'temperature':
      return '°C'
    case 'grade':
    case 'vertical_ratio':
    case 'contact_time_ratio':
      return '%'
    case 'vertical_speed':
      return 'm/s'
    case 'vertical_oscillation':
      return 'mm'
    case 'ground_contact_time':
    case 'flight_time':
      return 'ms'
    case 'distance':
      return 'm'
    case 'duration':
      return 's'
    default:
      return ''
  }
}

const formatSummaryScalar = (key: string, value: number | string | boolean): SummaryValue => {
  if (typeof value !== 'number') return value
  const normalizedKey = normalizeMetricKey(key)
  const normalizedValue = normalizeMetricValue(normalizedKey, value)
  if (normalizedValue === undefined) return formatNumber(value)
  const unit = metricUnit(normalizedKey)
  if (!unit) return Number(formatNumber(normalizedValue))
  const decimals = normalizedKey === 'heart_rate' || normalizedKey === 'power' || normalizedKey === 'cadence' ? 0 : 2
  return `${formatNumber(normalizedValue, decimals)} ${unit}`
}

const toSummaryEntries = (
  source: Record<string, unknown>,
  prefix = '',
  depth = 0,
  maxDepth = 2
): SummaryEntry[] => {
  if (depth > maxDepth) return []
  const entries: SummaryEntry[] = []
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = prefix ? `${prefix}_${rawKey}` : rawKey
    if (rawValue === null || rawValue === undefined) continue
    if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      entries.push({ key, value: formatSummaryScalar(rawKey, rawValue) })
      continue
    }
    if (Array.isArray(rawValue) && rawValue.length === 1 && isPlainObject(rawValue[0])) {
      entries.push(...toSummaryEntries(rawValue[0], key, depth + 1, maxDepth))
      continue
    }
    if (isPlainObject(rawValue)) {
      entries.push(...toSummaryEntries(rawValue, key, depth + 1, maxDepth))
    }
  }
  return entries
}

const pickValue = (input: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (key in input) return input[key]
  }
  return undefined
}

const findFirstArray = (input: unknown): Record<string, unknown>[] | null => {
  if (Array.isArray(input) && input.every(isPlainObject)) return input
  if (!isPlainObject(input)) return null

  const deviceLog = input.DeviceLog
  if (isPlainObject(deviceLog) && Array.isArray(deviceLog.Samples) && deviceLog.Samples.every(isPlainObject)) {
    return deviceLog.Samples as Record<string, unknown>[]
  }

  for (const key of pointArrayKeys) {
    const candidate = input[key]
    if (Array.isArray(candidate) && candidate.every(isPlainObject)) return candidate as Record<string, unknown>[]
  }

  for (const value of Object.values(input)) {
    if (Array.isArray(value) && value.every(isPlainObject)) return value as Record<string, unknown>[]
    if (isPlainObject(value)) {
      const nested = findFirstArray(value)
      if (nested) return nested
    }
  }

  return null
}

const mergeDeviceLogSamples = (samples: Record<string, unknown>[]) => {
  const merged = new Map<number, Record<string, unknown>>()

  for (const sample of samples) {
    const time = safeTime(pickValue(sample, timeKeys))
    if (!time) continue
    const bucket = merged.get(time) ?? { time }

    for (const [key, rawValue] of Object.entries(sample)) {
      if (key === 'Events' || key === 'ZappSample') continue
      if (rawValue === null || rawValue === undefined) continue
      if (typeof rawValue === 'object' && !Array.isArray(rawValue)) continue
      bucket[key] = rawValue
    }

    const zapp = sample.ZappSample
    if (isPlainObject(zapp)) {
      const channelId = safeNumber(zapp.ChannelId)
      const channelValue = safeNumber(zapp.Value)
      if (channelId === 0 && channelValue !== undefined) bucket.NGP = channelValue
      if (channelId === 2 && channelValue !== undefined) bucket.Grade = channelValue
    }

    merged.set(time, bucket)
  }

  return Array.from(merged.values()).sort((a, b) => Number(a.time) - Number(b.time))
}

const buildTrackPoints = (sourcePoints: Record<string, unknown>[]) => {
  const points: TrackPoint[] = []
  const metricKeys = new Set<string>()

  for (const rawPoint of sourcePoints) {
    const latRaw = safeNumber(pickValue(rawPoint, latKeys))
    const lonRaw = safeNumber(pickValue(rawPoint, lonKeys))
    const time = safeTime(pickValue(rawPoint, timeKeys) ?? rawPoint.time)
    if (latRaw === undefined || lonRaw === undefined || time === undefined) continue

    const lat = radiansToDegreesIfNeeded(latRaw, true)
    const lon = radiansToDegreesIfNeeded(lonRaw, false)
    const metrics: Record<string, number | undefined> = {}

    for (const [key, rawValue] of Object.entries(rawPoint)) {
      if (latKeys.includes(key) || lonKeys.includes(key) || timeKeys.includes(key) || key === 'time') continue
      const numericValue = safeNumber(rawValue)
      if (numericValue === undefined) continue
      const normalizedKey = normalizeMetricKey(key)
      if (normalizedKey === 'distance') continue
      const normalizedValue = normalizeMetricValue(normalizedKey, numericValue)
      if (normalizedValue === undefined || !Number.isFinite(normalizedValue)) continue
      if (normalizedKey === 'pace') {
        metrics.speed = normalizedValue
        metricKeys.add('speed')
        continue
      }
      metrics[normalizedKey] = normalizedValue
      metricKeys.add(normalizedKey)
    }

    points.push({
      lat,
      lon,
      time,
      hr: metrics.heart_rate,
      speed: metrics.speed,
      elevation: metrics.elevation,
      power: metrics.power,
      cadence: metrics.cadence,
      temperature: metrics.temperature,
      grade: metrics.grade,
      verticalSpeed: metrics.vertical_speed,
      verticalOscillation: metrics.vertical_oscillation,
      verticalRatio: metrics.vertical_ratio,
      strideLength: metrics.stride_length,
      metrics,
      distFromStart: 0
    })
  }

  points.sort((a, b) => a.time - b.time)

  let totalDistance = 0
  const cleaned: TrackPoint[] = []
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    const prev = cleaned[cleaned.length - 1]
    if (!prev) {
      cleaned.push(point)
      continue
    }
    if (point.time <= prev.time) continue
    const delta = haversineMeters(prev.lat, prev.lon, point.lat, point.lon)
    if (delta > 80 && point.time - prev.time < 1000) continue
    totalDistance += delta
    const speed = point.speed ?? delta / ((point.time - prev.time) / 1000)
    cleaned.push({
      ...point,
      speed,
      metrics: {
        ...point.metrics,
        speed
      },
      distFromStart: totalDistance
    })
  }

  return {
    points: cleaned,
    totalDistance,
    metricKeys: Array.from(metricKeys).filter(key => cleaned.some(point => Number.isFinite(point.metrics[key])))
  }
}

const buildLapSummaries = (windows: unknown): RunLap[] => {
  if (!Array.isArray(windows)) return []
  const laps = windows
    .map(entry => (isPlainObject(entry) && isPlainObject(entry.Window) ? entry.Window : null))
    .filter(Boolean) as Record<string, unknown>[]

  return laps
    .filter(window => typeof window.Type === 'string' && ['Lap', 'Autolap'].includes(String(window.Type)))
    .map((window, index) => ({
      index: index + 1,
      entries: toSummaryEntries(window, '', 0, 2)
    }))
}

export const parseJsonFile = async (text: string, sourcePath: string): Promise<Run> => {
  const parsed = JSON.parse(text)
  const root = isPlainObject(parsed) ? parsed : {}
  const deviceLog = isPlainObject(root.DeviceLog) ? root.DeviceLog : null
  const rawPoints = findFirstArray(parsed)
  if (!rawPoints || rawPoints.length === 0) {
    throw new Error('JSON 中没有识别到可用的轨迹点数组')
  }

  const sourcePoints = deviceLog ? mergeDeviceLogSamples(rawPoints) : rawPoints
  const { points, totalDistance, metricKeys } = buildTrackPoints(sourcePoints)
  if (points.length === 0) {
    throw new Error('JSON 里有轨迹数组，但没有识别到同时包含时间和经纬度的有效轨迹点')
  }

  const first = points[0]
  const last = points[points.length - 1]
  const totalTime = first && last ? last.time - first.time : 0
  const fallbackName = sourcePath.replace(/\.[^.]+$/, '') || 'JSON Run'
  const header = deviceLog?.Header && isPlainObject(deviceLog.Header) ? deviceLog.Header : null
  const activityWindow = Array.isArray(deviceLog?.Windows)
    ? deviceLog.Windows.find(
        entry =>
          isPlainObject(entry) &&
          isPlainObject(entry.Window) &&
          String(entry.Window.Type) === 'Activity'
      )
    : null
  const activitySummary =
    activityWindow && isPlainObject(activityWindow) && isPlainObject(activityWindow.Window)
      ? activityWindow.Window
      : null
  const headerActivity = typeof header?.Activity === 'string' && header.Activity !== 'null' ? header.Activity : undefined
  const name = String(root.name ?? root.title ?? root.activityName ?? headerActivity ?? fallbackName)

  const avgFromWindow = (key: string) => {
    const value = activitySummary?.[key]
    if (!Array.isArray(value) || !isPlainObject(value[0])) return undefined
    const avg = safeNumber(value[0].Avg)
    if (avg === undefined) return undefined
    const normalized = normalizeMetricValue(normalizeMetricKey(key), avg)
    return typeof normalized === 'number' ? normalized : undefined
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    sourcePath,
    sourceType: 'json',
    points,
    totalDistance,
    totalTime,
    metricKeys,
    summaryEntries: header ? toSummaryEntries(header, '', 0, 2) : toSummaryEntries(root, '', 0, 1),
    lapSummaries: buildLapSummaries(deviceLog?.Windows),
    aggregateMetrics: {
      avgHeartRate: avgFromWindow('HR'),
      avgPower: avgFromWindow('Power'),
      avgCadence: avgFromWindow('Cadence'),
      totalAscent: safeNumber(activitySummary?.Ascent)
    }
  }
}
