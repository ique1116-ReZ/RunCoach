import type { Run, SensorPoint } from './types'

export const validHeartRate = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0 && value < 255

export const validPower = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0 && value < 65535

/** Shared time weighting for HR zones and effort, independent of GPS coverage. */
export const sensorTimeline = (run: Run) => {
  const points = [...(run.sensorPoints ?? run.points)]
    .filter(point => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time)
    .filter((point, index, all) => index === 0 || point.time > all[index - 1].time)
  const timer = points.length > 0 && points.every(point => Number.isFinite(point.timerTime))
  const start = points[0]?.time ?? 0
  const position = (point: SensorPoint) => timer ? point.timerTime! / 1000 : (point.time - start) / 1000
  const intervals = points.slice(1).map((point, i) => position(point) - position(points[i]))
    .filter(seconds => seconds > 0 && seconds <= 30).sort((a, b) => a - b)
  // Typical record cadence distinguishes regular smart recording from interruptions.
  const cadence = intervals.length ? intervals[Math.floor((intervals.length - 1) / 2)] : 1
  const duration = Math.max(0, run.totalTime / 1000)
  return points.map((point, index) => {
    const next = points[index + 1]
    const offset = Math.max(0, position(point))
    const elapsed = next ? (next.time - point.time) / 1000 : cadence
    const active = next ? position(next) - position(point) : cadence
    // Never stretch a value across missing records or a device pause.
    const seconds = Math.max(0, Math.min(active, elapsed > cadence + 0.01 ? cadence : elapsed, duration - offset))
    return { point, seconds, offset }
  })
}
