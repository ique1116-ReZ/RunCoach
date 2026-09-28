import type { EffortScore, HeartRateReference, Run } from '@runs/types'
import { sensorTimeline, validHeartRate, validPower } from '@runs/sensor-timeline'

export const heartRateCutoffs = (reference: HeartRateReference) => {
  const ratios = reference.base === 'LTHR'
    ? [710, 760, 810, 855, 900, 940, 1000, 1030, 1060]
    : [630, 680, 730, 770, 810, 850, 900, 930, 960]
  return ratios.map((ratio, i) => i === 8
    ? Math.floor(reference.value * ratio / 1000) + 1
    : Math.ceil(reference.value * ratio / 1000))
}

export const weightedPower = (samples: number[]) => {
  if (!samples.length) return undefined
  if (samples.length < 30) return samples.reduce((a, b) => a + b, 0) / samples.length
  let sum = 0
  let fourthPowers = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i]
    if (i >= 30) sum -= samples[i - 30]
    if (i >= 29) fourthPowers += (sum / 30) ** 4
  }
  return (fourthPowers / (samples.length - 29)) ** 0.25
}

export const calculateEffortScore = (run: Run): EffortScore | undefined => {
  const movingSeconds = run.totalTime / 1000
  if (run.activityType !== 'cycling' || !Number.isFinite(movingSeconds) || movingSeconds < 300) return undefined
  const timeline = sensorTimeline(run)
  const base = { movingSeconds, algorithmVersion: 'effort-2026-09-28-v1.1', shortActivity: false }
  const finish = (result: Omit<EffortScore, 'displayValue' | 'needsVerification'>): EffortScore => ({
    ...result,
    displayValue: Math.round(result.value),
    needsVerification: result.value > 500 || result.value / (movingSeconds / 3600) > 150
  })
  if (run.thresholdPower !== undefined && Number.isFinite(run.thresholdPower) && run.thresholdPower > 0) {
    const intervals = timeline.filter(item => item.seconds > 0 && validPower(item.point.power))
      .map(item => ({ start: item.offset, end: item.offset + item.seconds, value: item.point.power! }))
    // Interpolate only brief (<3 s) missing power. Long gaps are removed, never zero-filled.
    const repaired = [...intervals]
    for (let i = 1; i < intervals.length; i++) {
      const previous = intervals[i - 1]
      const next = intervals[i]
      const gap = next.start - previous.end
      if (gap > 0 && gap < 3) {
        for (let t = previous.end; t < next.start; t += 1) {
          repaired.push({ start: t, end: Math.min(t + 1, next.start),
            value: previous.value + (next.value - previous.value) * ((t - previous.end + 1) / (gap + 1)) })
        }
      }
    }
    repaired.sort((a, b) => a.start - b.start)
    const validSeconds = repaired.reduce((sum, item) => sum + item.end - item.start, 0)
    if (validSeconds / movingSeconds >= 0.8) {
      const samples: number[] = []
      for (const item of repaired) {
        for (let second = Math.ceil(item.start); second < item.end; second++) samples.push(item.value)
      }
      const power = weightedPower(samples)
      if (power !== undefined) {
        const intensityFactor = power / run.thresholdPower
        return finish({ ...base, method: 'power', label: '功率计算', coverage: validSeconds / movingSeconds,
          value: 100 * intensityFactor ** 2 * movingSeconds / 3600,
          weightedPower: power, intensityFactor, thresholdPower: run.thresholdPower,
          shortActivity: movingSeconds < 1200 })
      }
    }
  }
  const reference = run.heartRateReference
  if (!reference || !Number.isFinite(reference.value) || reference.value <= 0) return undefined
  const cutoffs = heartRateCutoffs(reference)
  const hourlyPoints = [20, 30, 40, 50, 60, 70, 80, 100, 120, 140]
  const segmentSeconds = Array<number>(10).fill(0)
  for (const { point, seconds } of timeline) {
    if (!validHeartRate(point.hr)) continue
    const index = cutoffs.findIndex(cutoff => point.hr! < cutoff)
    segmentSeconds[index < 0 ? 9 : index] += seconds
  }
  const validSeconds = segmentSeconds.reduce((a, b) => a + b, 0)
  if (validSeconds / movingSeconds < 0.8) return undefined
  return finish({ ...base, method: 'heart_rate', label: '心率估算', coverage: validSeconds / movingSeconds,
    value: segmentSeconds.reduce((sum, seconds, i) => sum + seconds * hourlyPoints[i], 0) / 3600,
    heartRateReference: { ...reference }, segmentSeconds, hourlyPoints, cutoffs })
}

export const getEffortScore = (run: Run) => run.effortScore === undefined
  ? calculateEffortScore(run) : run.effortScore ?? undefined

export const snapshotEffortScore = (run: Run): Run => ({ ...run, effortScore: calculateEffortScore(run) ?? null })
