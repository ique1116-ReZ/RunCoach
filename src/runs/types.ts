export type HeartRateBase = 'LTHR' | 'HRmax'

export type ActivityType = 'running' | 'cycling' | 'unknown'

export type MetricValue = number | undefined

export type SummaryValue = string | number | boolean

export type SummaryEntry = {
  key: string
  value: SummaryValue
}

export type RunLap = {
  index: number
  entries: SummaryEntry[]
}

export type AggregateMetrics = Partial<{
  avgHeartRate: number
  maxHeartRate: number
  avgPower: number
  maxPower: number
  avgCadence: number
  maxCadence: number
  totalAscent: number
}>

export type HeartRateReference = {
  base: HeartRateBase
  value: number
  source: string
}

export type Zone = {
  id: string
  min: number
  max: number
  label: string
  color: string
}

export type ZoneConfig = {
  base: HeartRateBase
  zones: Zone[]
}

export type TrackPoint = {
  lat: number
  lon: number
  time: number
  /** Device timer time in milliseconds from the activity start (FIT only). */
  timerTime?: number
  hr?: number
  speed?: number
  elevation?: number
  power?: number
  cadence?: number
  temperature?: number
  grade?: number
  verticalSpeed?: number
  verticalOscillation?: number
  verticalRatio?: number
  strideLength?: number
  metrics: Record<string, MetricValue>
  distFromStart: number
}

export type Run = {
  id: string
  name: string
  activityType: ActivityType
  sourcePath: string
  sourceType: 'fit' | 'gpx' | 'json'
  points: TrackPoint[]
  totalDistance: number
  totalTime: number
  metricKeys: string[]
  summaryEntries: SummaryEntry[]
  lapSummaries: RunLap[]
  aggregateMetrics: AggregateMetrics
  heartRateReference?: HeartRateReference
}
