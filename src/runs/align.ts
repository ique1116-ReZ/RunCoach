import { Run, TrackPoint } from './types'

const timelineTime = (point: TrackPoint) => point.timerTime ?? point.time

export type Sample = {
  lat: number
  lon: number
  hr?: number
  speed?: number
  elevation?: number
  power?: number
  cadence?: number
  temperature?: number
  grade?: number
  distFromStart: number
}

export const sampleAtTime = (run: Run, timeMs: number): Sample | null => {
  const points = run.points
  if (points.length === 0) return null
  const useTimerTimeline = points.every(point => point.timerTime !== undefined && Number.isFinite(point.timerTime))
  const timelineTime = (point: TrackPoint) => useTimerTimeline ? point.timerTime as number : point.time
  const first = points[0]
  const last = points[points.length - 1]
  if (timeMs <= timelineTime(first)) return first
  if (timeMs >= timelineTime(last)) return last

  let low = 0
  let high = points.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midTime = timelineTime(points[mid])
    if (midTime === timeMs) return points[mid]
    if (midTime < timeMs) low = mid + 1
    else high = mid - 1
  }

  const right = points[low]
  const left = points[low - 1]
  if (!left || !right) return right ?? left ?? null

  const span = timelineTime(right) - timelineTime(left)
  if (span <= 0) return right
  const ratio = (timeMs - timelineTime(left)) / span
  return interpolatePoint(left, right, ratio)
}

export const sampleAtDistance = (run: Run, distance: number): Sample | null => {
  const points = run.points
  if (points.length === 0) return null
  if (distance <= 0) return points[0]
  if (distance >= run.totalDistance) return points[points.length - 1]

  let low = 0
  let high = points.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midDist = points[mid].distFromStart
    if (midDist === distance) return points[mid]
    if (midDist < distance) low = mid + 1
    else high = mid - 1
  }

  const right = points[low]
  const left = points[low - 1]
  if (!left || !right) return right ?? left ?? null

  const span = right.distFromStart - left.distFromStart
  if (span <= 0) return right
  const ratio = (distance - left.distFromStart) / span

  return interpolatePoint(left, right, ratio)
}

export const alignRunToReferenceRoute = (run: Run, referenceRun: Run): Run => {
  if (run.points.length === 0 || referenceRun.points.length === 0) return run

  const runLength = Math.max(run.totalDistance, run.points[run.points.length - 1]?.distFromStart ?? 0)
  const referenceLength = Math.max(
    referenceRun.totalDistance,
    referenceRun.points[referenceRun.points.length - 1]?.distFromStart ?? 0
  )

  if (runLength <= 0 || referenceLength <= 0) return run

  const alignedPoints = run.points.map(point => {
    const ratio = Math.min(Math.max(point.distFromStart / runLength, 0), 1)
    const referencePoint = sampleAtDistance(referenceRun, ratio * referenceLength)
    return {
      ...point,
      lat: referencePoint?.lat ?? point.lat,
      lon: referencePoint?.lon ?? point.lon
    }
  })

  return {
    ...run,
    points: alignedPoints
  }
}

const interpolatePoint = (a: TrackPoint, b: TrackPoint, ratio: number): Sample => {
  const lerp = (x: number, y: number) => x + (y - x) * ratio
  return {
    lat: lerp(a.lat, b.lat),
    lon: lerp(a.lon, b.lon),
    hr: a.hr !== undefined && b.hr !== undefined ? lerp(a.hr, b.hr) : a.hr ?? b.hr,
    speed: a.speed !== undefined && b.speed !== undefined ? lerp(a.speed, b.speed) : a.speed ?? b.speed,
    elevation: a.elevation !== undefined && b.elevation !== undefined ? lerp(a.elevation, b.elevation) : a.elevation ?? b.elevation,
    power: a.power !== undefined && b.power !== undefined ? lerp(a.power, b.power) : a.power ?? b.power,
    cadence: a.cadence !== undefined && b.cadence !== undefined ? lerp(a.cadence, b.cadence) : a.cadence ?? b.cadence,
    temperature: a.temperature !== undefined && b.temperature !== undefined ? lerp(a.temperature, b.temperature) : a.temperature ?? b.temperature,
    grade: a.grade !== undefined && b.grade !== undefined ? lerp(a.grade, b.grade) : a.grade ?? b.grade,
    distFromStart: lerp(a.distFromStart, b.distFromStart)
  }
}

export const distanceToPercent = (run: Run, distance: number) => {
  if (run.totalDistance === 0) return 0
  return distance / run.totalDistance
}

export const percentToDistance = (run: Run, percent: number) => {
  return Math.min(Math.max(percent, 0), 1) * run.totalDistance
}
