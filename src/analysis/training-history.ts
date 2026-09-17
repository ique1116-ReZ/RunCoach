import type { Run } from '@runs/types'

export const TRAINING_HISTORY_WINDOW_DAYS = 28

export type TrainingHistorySummary = {
  asOf: string
  windowDays: number
  weeklyMin: number | null
  longestMin: number | null
  longestKm: number | null
  weeklyLoad: number | null
  maxLoad: number | null
  loadDays: number
  rideCount: number
  sourceFiles: string[]
  loadSource: 'device' | 'power-with-ftp' | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const round = (value: number | undefined, decimals = 1) =>
  value === undefined || !Number.isFinite(value) ? undefined : Number(value.toFixed(decimals))
const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10)
const isRide = (run: Run) => run.activityType === 'cycling' || run.activityType === 'unknown'

const runDurationMs = (run: Run) => {
  if (Number.isFinite(run.totalTime) && run.totalTime > 0) return run.totalTime
  const first = run.points[0]?.time
  const last = run.points.at(-1)?.time
  return first !== undefined && last !== undefined && last > first ? last - first : 0
}

const numberFromSummary = (run: Run, keys: string[]) => {
  const wanted = new Set(keys.map(key => key.toLowerCase().replace(/[\s_-]/g, '')))
  for (const entry of run.summaryEntries) {
    const key = entry.key.toLowerCase().replace(/[\s_-]/g, '')
    if (!wanted.has(key)) continue
    const value = Number(entry.value)
    if (Number.isFinite(value) && value >= 0) return value
  }
  return undefined
}

const deviceLoad = (run: Run) => numberFromSummary(run, [
  'training_stress_score',
  'tss',
  'training_load'
])

const ftpFromSummary = (run: Run) => numberFromSummary(run, [
  'functional_threshold_power',
  'threshold_power',
  'ftp'
])

const powerLoad = (run: Run) => {
  const ftp = ftpFromSummary(run)
  if (!ftp || ftp <= 0) return undefined
  const powers = run.points
    .map(point => point.power)
    .filter((value): value is number => finite(value) && value >= 0)
  const averagePower = powers.length
    ? Math.sqrt(powers.reduce((sum, value) => sum + value * value, 0) / powers.length)
    : run.aggregateMetrics.avgPower
  const durationHours = runDurationMs(run) / 3_600_000
  if (!finite(averagePower) || averagePower <= 0 || durationHours <= 0) return undefined
  return 100 * durationHours * Math.pow(averagePower / ftp, 2)
}

export const buildTrainingHistorySummary = (
  runs: Run[],
  options: { asOf?: number; windowDays?: number } = {}
): TrainingHistorySummary => {
  const asOfMs = options.asOf ?? Date.now()
  const windowDays = options.windowDays ?? TRAINING_HISTORY_WINDOW_DAYS
  const windowStart = asOfMs - windowDays * DAY_MS
  const eligible = runs.filter(run => {
    const start = run.points[0]?.time
    return isRide(run) && start !== undefined && start >= windowStart && start <= asOfMs
  })
  const durations = eligible
    .map(run => runDurationMs(run))
    .filter(value => value > 0)
  const loads = eligible.map(run => {
    const device = deviceLoad(run)
    return device !== undefined ? { value: device, source: 'device' as const, run } : { value: powerLoad(run), source: 'power-with-ftp' as const, run }
  }).filter(item => item.value !== undefined)
  const hasCompleteLoadCoverage = eligible.length > 0 && loads.length === eligible.length
  const loadSource = hasCompleteLoadCoverage
    ? loads.every(item => item.source === 'device') ? 'device' as const : 'power-with-ftp' as const
    : null
  const uniqueLoadDays = new Set(loads.map(item => dayKey(item.run.points[0]?.time as number)))

  return {
    asOf: new Date(asOfMs).toISOString(),
    windowDays,
    weeklyMin: durations.length ? round(durations.reduce((sum, value) => sum + value, 0) / windowDays * 7 / 60_000) ?? null : null,
    longestMin: durations.length ? round(Math.max(...durations) / 60_000) ?? null : null,
    longestKm: eligible.length ? round(Math.max(...eligible.map(run => run.totalDistance)) / 1000, 2) ?? null : null,
    weeklyLoad: hasCompleteLoadCoverage ? round(loads.reduce((sum, item) => sum + (item.value as number), 0) / windowDays * 7) ?? null : null,
    maxLoad: hasCompleteLoadCoverage ? round(Math.max(...loads.map(item => item.value as number))) ?? null : null,
    loadDays: uniqueLoadDays.size,
    rideCount: eligible.length,
    sourceFiles: eligible.map(run => run.sourcePath),
    loadSource
  }
}
