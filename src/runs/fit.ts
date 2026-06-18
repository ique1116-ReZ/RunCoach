import FitParser from 'fit-file-parser'
import type { Run, RunLap, SummaryEntry, SummaryValue, TrackPoint } from './types'
import { haversineMeters } from './geo'

const semicirclesToDegrees = (value: number) => value * (180 / Math.pow(2, 31))

const normalizeCoord = (value: number | undefined, isLat: boolean) => {
  if (value === undefined || value === null) return undefined
  const limit = isLat ? 90 : 180
  if (Math.abs(value) > limit) {
    return semicirclesToDegrees(value)
  }
  return value
}

const excludedMetricKeys = new Set([
  'position_lat',
  'position_latitude',
  'position_long',
  'position_lon',
  'position_longitude',
  'timestamp',
  'total_timer_time',
  'total_elapsed_time',
  'elapsed_time',
  'timer_time',
  'distance',
  'compressed_speed_distance',
  'enhanced_avg_speed',
  'enhanced_max_speed'
])

const metricAliases: Record<string, string> = {
  altitude: 'elevation',
  enhanced_altitude: 'elevation',
  enhanced_elevation: 'elevation',
  elevation: 'elevation',
  heart_rate: 'heart_rate',
  speed: 'speed',
  enhanced_speed: 'speed',
  power: 'power',
  cadence: 'cadence',
  temperature: 'temperature',
  grade: 'grade',
  vertical_speed: 'vertical_speed',
  vertical_oscillation: 'vertical_oscillation',
  vertical_ratio: 'vertical_ratio',
  stride_length: 'stride_length'
}

const normalizeMetricKey = (key: string) => {
  if (excludedMetricKeys.has(key)) return null
  return metricAliases[key] ?? key
}

const isScalarValue = (value: unknown): value is SummaryValue =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

const toSummaryValue = (value: unknown): SummaryValue | null => {
  if (isScalarValue(value)) return value
  if (value instanceof Date) return value.toISOString()
  return null
}

const extractSummaryEntries = (source: Record<string, unknown> | undefined, excludeKeys: string[] = []) => {
  if (!source) return [] as SummaryEntry[]
  const excluded = new Set(excludeKeys)
  const entries: SummaryEntry[] = []
  for (const [key, rawValue] of Object.entries(source)) {
    if (excluded.has(key)) continue
    const value = toSummaryValue(rawValue)
    if (value === null) continue
    entries.push({ key, value })
  }
  return entries
}

const extractLapSummaries = (laps: any[]): RunLap[] =>
  laps.map((lap, index) => ({
    index: index + 1,
    entries: extractSummaryEntries(lap, ['records', 'lengths', 'start_position_lat', 'start_position_long', 'end_position_lat', 'end_position_long'])
  }))

export const parseFitFile = async (buffer: ArrayBuffer, sourcePath: string): Promise<Run> => {
  const fitParser = new FitParser({
    force: true,
    speedUnit: 'm/s',
    lengthUnit: 'm',
    temperatureUnit: 'celsius',
    elapsedRecordField: true
  })

  const data = await new Promise<any>((resolve, reject) => {
    fitParser.parse(buffer, (error: Error | null, result: any) => {
      if (error) reject(error)
      else resolve(result)
    })
  })

  if (import.meta.env.DEV) {
    const firstRecord = Array.isArray(data?.records) ? data.records[0] : undefined
    const recordKeys = firstRecord ? Object.keys(firstRecord) : []

    console.groupCollapsed(`[FIT debug] ${sourcePath}`)
    console.log('top-level keys:', data ? Object.keys(data) : data)
    console.log('records count:', Array.isArray(data?.records) ? data.records.length : 0)
    console.log('first record keys:', recordKeys)
    console.log('first record sample:', firstRecord)
    console.groupEnd()
  }

  const name = data?.file_id?.type ?? 'FIT Run'
  const records = Array.isArray(data?.records) ? data.records : []
  const sessions = Array.isArray(data?.sessions) ? data.sessions : data?.session ? [data.session] : []
  const laps = Array.isArray(data?.laps) ? data.laps : data?.lap ? [data.lap] : []
  const points: TrackPoint[] = []
  const metricKeys = new Set<string>()

  for (const record of records) {
    const latRaw = record.position_lat ?? record.position_latitude
    const lonRaw = record.position_long ?? record.position_lon ?? record.position_longitude
    if (latRaw === undefined || lonRaw === undefined) continue

    const lat = normalizeCoord(latRaw, true)
    const lon = normalizeCoord(lonRaw, false)
    const time = record.timestamp ? new Date(record.timestamp).getTime() : undefined
    if (lat === undefined || lon === undefined || time === undefined) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !time) continue

    const metrics: Record<string, number | undefined> = {}
    for (const [rawKey, rawValue] of Object.entries(record)) {
      const normalizedKey = normalizeMetricKey(rawKey)
      if (!normalizedKey) continue
      const numericValue = Number(rawValue)
      if (!Number.isFinite(numericValue)) continue
      metrics[normalizedKey] = numericValue
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
    totalDistance += delta
    const speed = point.speed ?? (delta / ((point.time - prev.time) / 1000))
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

  const first = cleaned[0]
  const last = cleaned[cleaned.length - 1]
  const totalTime = first && last ? last.time - first.time : 0

  const summaryEntries = [
    ...extractSummaryEntries(data?.file_id, []),
    ...extractSummaryEntries(sessions[0], ['laps', 'records', 'lengths'])
  ]
  const session = sessions[0] ?? {}

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    sourcePath,
    sourceType: 'fit',
    points: cleaned,
    totalDistance,
    totalTime,
    metricKeys: Array.from(metricKeys).filter(key =>
      cleaned.some(point => Number.isFinite(point.metrics[key]))
    ),
    summaryEntries,
    lapSummaries: extractLapSummaries(laps),
    aggregateMetrics: {
      avgHeartRate: Number.isFinite(session.avg_heart_rate) ? Number(session.avg_heart_rate) : undefined,
      maxHeartRate: Number.isFinite(session.max_heart_rate) ? Number(session.max_heart_rate) : undefined,
      avgPower: Number.isFinite(session.avg_power) ? Number(session.avg_power) : undefined,
      maxPower: Number.isFinite(session.max_power) ? Number(session.max_power) : undefined,
      avgCadence: Number.isFinite(session.avg_cadence) ? Number(session.avg_cadence) : undefined,
      maxCadence: Number.isFinite(session.max_cadence) ? Number(session.max_cadence) : undefined,
      totalAscent: Number.isFinite(session.total_ascent) ? Number(session.total_ascent) : undefined
    }
  }
}
