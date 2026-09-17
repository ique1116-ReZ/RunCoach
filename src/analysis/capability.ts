import type { Run, TrackPoint } from '@runs/types'

export const CAPABILITY_MAPPING_VERSION = 'rider_app_pixel_v1'
export const CAPABILITY_WINDOW_DAYS = 90

export type CapabilityAxisId = 'sprint' | 'cruise' | 'mediumEndurance' | 'longEndurance' | 'climb'
export type CapabilityMetricId = '30s' | '1m' | '5m' | '20m' | '1h' | '2h' | '5h' | 'climb'
export type CapabilityStatus = 'established' | 'tentative' | 'insufficient'
export type TrainingGoalId = 'efficiency' | 'comeback' | 'climbing' | 'health' | 'distance' | 'cruising'

export type CapabilityExample = {
  runId: string
  fileName: string
  date: string
  value: number
  unit: 'km/h' | 'm/h'
  coverage: number
}

export type CapabilityMeasurement = {
  id: CapabilityMetricId
  label: string
  value?: number
  unit: 'km/h' | 'm/h'
  score?: number
  status: CapabilityStatus
  sampleDays: number
  examples: CapabilityExample[]
}

export type CapabilityAxis = {
  id: CapabilityAxisId
  label: string
  description: string
  score?: number
  status: CapabilityStatus
  measurements: CapabilityMeasurement[]
  missingReason?: string
}

export type CapabilityProfile = {
  mappingVersion: string
  asOf: string
  windowStart: string
  windowDays: number
  analyzedRunCount: number
  eligibleRunCount: number
  validActivityDays: number
  axes: CapabilityAxis[]
}

export type CapabilityTrainingGoal = {
  id: TrainingGoalId
  label: string
  reason: string
  focusAxisIds: CapabilityAxisId[]
  priority: 'primary'
}

export type CapabilityTrainingDirection = {
  headline: string
  summary: string
  goals: CapabilityTrainingGoal[]
}

type SpeedWindow = {
  value: number
  coverage: number
  startTime: number
  endTime: number
  startDistanceM: number
  endDistanceM: number
}

type ClimbWindow = SpeedWindow & { ascentM: number }

type TimedInterval = {
  startTime: number
  endTime: number
  durationSeconds: number
  distanceM: number
  startDistanceM: number
  endDistanceM: number
  startElevation?: number
  endElevation?: number
}

type AnchorId = Exclude<CapabilityMetricId, 'climb'>

const axisDefinitions: Array<Pick<CapabilityAxis, 'id' | 'label' | 'description'>> = [
  { id: 'sprint', label: '冲刺', description: '看看你在短时间里能骑多快' },
  { id: 'cruise', label: '巡航', description: '看看你能把较快速度保持多久' },
  { id: 'mediumEndurance', label: '中长耐力', description: '看看你在中长距离中能否保持节奏' },
  { id: 'longEndurance', label: '长途耐力', description: '看看你在长途骑行中能否保持节奏' },
  { id: 'climb', label: '爬坡', description: '看看你爬坡时提升海拔有多快' }
]

const metricDefinitions: Record<CapabilityMetricId, { label: string; unit: 'km/h' | 'm/h' }> = {
  '30s': { label: '30 秒速度', unit: 'km/h' },
  '1m': { label: '1 分钟速度', unit: 'km/h' },
  '5m': { label: '5 分钟速度', unit: 'km/h' },
  '20m': { label: '20 分钟速度', unit: 'km/h' },
  '1h': { label: '1 小时速度', unit: 'km/h' },
  '2h': { label: '2 小时速度', unit: 'km/h' },
  '5h': { label: '5 小时速度', unit: 'km/h' },
  climb: { label: '有效坡段 VAM', unit: 'm/h' }
}

// Frozen reference anchors from PRD 1.3. Values are km/h, except climb which is m/h.
const anchors: Record<AnchorId | 'climb', number[]> = {
  '30s': [12.8, 18.8, 21.8, 23.9, 25.7, 27.3, 28.7, 30.1, 31.4, 32.8, 34.1, 35.5, 36.8, 38.3, 39.9, 41.7, 43.8, 46.4, 49.7, 54.6, 66.5],
  '1m': [11.9, 17.3, 20, 22, 23.6, 25, 26.3, 27.6, 28.8, 30, 31.5, 32.8, 34.1, 35.5, 37, 38.7, 40.6, 43, 46.3, 50.9, 62],
  '5m': [10.4, 14.7, 16.9, 18.4, 19.7, 20.9, 22, 23, 24.1, 25.1, 26.1, 27.2, 28.3, 29.5, 30.8, 32.2, 33.9, 35.9, 38.6, 42.6, 52.5],
  '20m': [10.9, 14.6, 16.3, 17.6, 18.7, 19.6, 20.5, 21.4, 22.2, 23, 23.9, 24.8, 25.7, 26.6, 27.7, 28.9, 30.3, 31.9, 34.1, 37.4, 45.9],
  '1h': [11.4, 14.8, 16.4, 17.6, 18.5, 19.4, 20.2, 20.9, 21.6, 22.4, 23.1, 23.8, 24.6, 25.4, 26.3, 27.2, 28.3, 29.6, 31.4, 33.9, 39],
  '2h': [11.8, 14.6, 16, 16.9, 17.8, 18.5, 19.2, 19.8, 20.4, 21.1, 21.8, 22.5, 23.2, 24, 24.8, 25.7, 26.7, 28, 29.8, 32.4, 39],
  '5h': [11.5, 14.2, 15.5, 16.3, 17.1, 17.7, 18.3, 18.9, 19.5, 20, 20.6, 21.2, 21.7, 22.3, 23, 23.7, 24.5, 25.5, 26.9, 28.9, 34.3],
  climb: [93, 161, 194, 218, 240, 260, 278, 297, 316, 335, 354, 374, 396, 419, 445, 477, 520, 580, 661, 777, 1140]
}

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)

const round = (value: number | undefined, decimals = 1) =>
  value === undefined || !Number.isFinite(value) ? undefined : Number(value.toFixed(decimals))

const median = (values: number[]) => {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const dateKey = (time: number) => new Date(time).toISOString().slice(0, 10)

const firstActivityTime = (run: Run) => run.points[0]?.time

const isRide = (run: Run) => run.activityType === 'cycling' || run.activityType === 'unknown'

const useTimerTimeline = (run: Run) => run.points.length > 1 && run.points.every(point => finite(point.timerTime))

const timelineDeltaSeconds = (run: Run, current: TrackPoint, next: TrackPoint) => {
  const timerDelta = useTimerTimeline(run) && finite(current.timerTime) && finite(next.timerTime)
    ? (next.timerTime as number) - (current.timerTime as number)
    : undefined
  if (timerDelta !== undefined && timerDelta > 0) return timerDelta / 1000
  return (next.time - current.time) / 1000
}

const buildIntervals = (run: Run): TimedInterval[] => {
  const intervals: TimedInterval[] = []
  for (let index = 0; index < run.points.length - 1; index += 1) {
    const current = run.points[index]
    const next = run.points[index + 1]
    const wallSeconds = (next.time - current.time) / 1000
    const durationSeconds = timelineDeltaSeconds(run, current, next)
    const distanceM = next.distFromStart - current.distFromStart
    if (
      !Number.isFinite(wallSeconds) || wallSeconds <= 0 || wallSeconds > 30 ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 30 ||
      !Number.isFinite(distanceM) || distanceM <= 0
    ) continue

    const speedMps = distanceM / durationSeconds
    // The PRD removes suspicious motor-vehicle sections. A very fast single
    // interval is safer to exclude than let it decide a short ability window.
    if (!Number.isFinite(speedMps) || speedMps < 1 || speedMps > 85 / 3.6) continue
    intervals.push({
      startTime: current.time,
      endTime: next.time,
      durationSeconds,
      distanceM,
      startDistanceM: current.distFromStart,
      endDistanceM: next.distFromStart,
      startElevation: current.elevation,
      endElevation: next.elevation
    })
  }
  return intervals
}

const splitContiguous = (intervals: TimedInterval[]) => {
  const segments: TimedInterval[][] = []
  let current: TimedInterval[] = []
  let previous: TimedInterval | undefined
  for (const interval of intervals) {
    const gap = previous ? interval.startTime - previous.endTime : 0
    // Any omitted interval represents a pause, an invalid speed sample, or a
    // data gap. Do not silently bridge it when building a capability window.
    if (previous && gap > 0) {
      if (current.length) segments.push(current)
      current = []
    }
    current.push(interval)
    previous = interval
  }
  if (current.length) segments.push(current)
  return segments
}

const bestSpeedWindow = (run: Run, targetSeconds: number): SpeedWindow | undefined => {
  let best: SpeedWindow | undefined
  for (const segment of splitContiguous(buildIntervals(run))) {
    const cumulativeSeconds = [0]
    const cumulativeDistance = [0]
    segment.forEach(interval => {
      cumulativeSeconds.push(cumulativeSeconds[cumulativeSeconds.length - 1] + interval.durationSeconds)
      cumulativeDistance.push(cumulativeDistance[cumulativeDistance.length - 1] + interval.distanceM)
    })
    for (let endIndex = 0; endIndex < segment.length; endIndex += 1) {
      const endSeconds = cumulativeSeconds[endIndex + 1]
      const startSeconds = endSeconds - targetSeconds
      if (startSeconds < -1e-6) continue

      let startIndex = 0
      while (startIndex < endIndex && cumulativeSeconds[startIndex + 1] <= startSeconds) startIndex += 1
      if (startIndex > endIndex) continue
      const first = segment[startIndex]
      const offset = Math.max(0, startSeconds - cumulativeSeconds[startIndex])
      const fraction = first.durationSeconds > 0 ? Math.min(offset / first.durationSeconds, 1) : 0
      const distanceM = cumulativeDistance[endIndex + 1] - (cumulativeDistance[startIndex] + first.distanceM * fraction)
      if (distanceM <= 0) continue
      const candidate: SpeedWindow = {
        value: distanceM / (targetSeconds / 3600),
        coverage: 1,
        startTime: first.startTime + offset * 1000,
        endTime: segment[endIndex].endTime,
        startDistanceM: first.startDistanceM + first.distanceM * fraction,
        endDistanceM: segment[endIndex].endDistanceM
      }
      if (!best || candidate.value > best.value) best = candidate
    }
  }
  return best
}

const bestClimbWindow = (run: Run): ClimbWindow | undefined => {
  const climbIntervals = buildIntervals(run).filter(interval => {
    if (!finite(interval.startElevation) || !finite(interval.endElevation)) return false
    const grade = (interval.endElevation as number - interval.startElevation as number) / Math.max(interval.distanceM, 1)
    return grade >= 0.015
  })
  let best: ClimbWindow | undefined
  for (const segment of splitContiguous(climbIntervals)) {
    if (!segment.length) continue
    let ascentM = 0
    const first = segment[0]
    const last = segment[segment.length - 1]
    for (const interval of segment) ascentM += Math.max(0, (interval.endElevation ?? 0) - (interval.startElevation ?? 0))
    const durationSeconds = segment.reduce((total, interval) => total + interval.durationSeconds, 0)
    const distanceM = last.endDistanceM - first.startDistanceM
    if (durationSeconds < 120 || ascentM < 25 || distanceM < 200) continue
    const candidate: ClimbWindow = {
      value: ascentM / (durationSeconds / 3600),
      coverage: 1,
      startTime: first.startTime,
      endTime: last.endTime,
      startDistanceM: first.startDistanceM,
      endDistanceM: last.endDistanceM,
      ascentM
    }
    if (!best || candidate.value > best.value) best = candidate
  }
  return best
}

const mapScore = (value: number, metric: CapabilityMetricId) => {
  const table = anchors[metric]
  if (value <= table[0]) return 0
  if (value >= table[table.length - 1]) return 10
  for (let index = 1; index < table.length; index += 1) {
    if (value <= table[index]) {
      const lowerValue = table[index - 1]
      const upperValue = table[index]
      return ((index - 1) * 0.5) + ((value - lowerValue) / (upperValue - lowerValue)) * 0.5
    }
  }
  return 10
}

const collectMetric = (runs: Run[], metric: CapabilityMetricId) => {
  const byDay = new Map<string, { candidate: SpeedWindow | ClimbWindow; run: Run }>()
  const targetSeconds: Partial<Record<AnchorId, number>> = {
    '30s': 30,
    '1m': 60,
    '5m': 5 * 60,
    '20m': 20 * 60,
    '1h': 60 * 60,
    '2h': 2 * 60 * 60,
    '5h': 5 * 60 * 60
  }

  for (const run of runs) {
    const time = firstActivityTime(run)
    if (!time) continue
    const candidate = metric === 'climb'
      ? bestClimbWindow(run)
      : bestSpeedWindow(run, targetSeconds[metric as AnchorId] as number)
    if (!candidate) continue
    const key = dateKey(time)
    const previous = byDay.get(key)
    if (!previous || candidate.value > previous.candidate.value) byDay.set(key, { candidate, run })
  }

  const daily = [...byDay.entries()]
    .map(([date, item]) => ({
      date,
      value: item.candidate.value,
      run: item.run,
      coverage: item.candidate.coverage
    }))
    .sort((a, b) => b.value - a.value)
  const representative = median(daily.slice(0, 3).map(item => item.value))
  const examples = daily.slice(0, 3).map(item => ({
    runId: item.run.id,
    fileName: item.run.sourcePath,
    date: item.date,
    value: round(item.value, 1) ?? 0,
    unit: metric === 'climb' ? 'm/h' as const : 'km/h' as const,
    coverage: item.coverage
  }))
  return {
    id: metric,
    label: metricDefinitions[metric].label,
    value: round(representative, 1),
    unit: metricDefinitions[metric].unit,
    score: representative === undefined ? undefined : round(mapScore(representative, metric), 1),
    status: representative === undefined ? 'insufficient' as const : (daily.length >= 3 ? 'established' as const : 'tentative' as const),
    sampleDays: daily.length,
    examples
  }
}

const axisWithMetrics = (
  definition: Pick<CapabilityAxis, 'id' | 'label' | 'description'>,
  measurements: CapabilityMeasurement[],
  requiredCount: number,
  combine: (measurements: CapabilityMeasurement[]) => number | undefined,
  missingReason: string
): CapabilityAxis => {
  const available = measurements.filter(measurement => measurement.score !== undefined)
  if (available.length < requiredCount) {
    return { ...definition, status: 'insufficient', measurements, missingReason }
  }
  const score = combine(available)
  const status: CapabilityStatus = available.every(measurement => measurement.status === 'established')
    ? 'established'
    : 'tentative'
  return { ...definition, score: round(score, 1), status, measurements }
}

const createProfile = (runs: Run[], asOfMs: number, windowDays: number): CapabilityProfile => {
  const windowStartMs = asOfMs - windowDays * 24 * 60 * 60 * 1000
  const eligibleRuns = runs.filter(run => {
    const time = firstActivityTime(run)
    return isRide(run) && time !== undefined && time >= windowStartMs && time <= asOfMs
  })
  const validActivityDays = new Set(eligibleRuns.map(run => dateKey(firstActivityTime(run) as number))).size
  const measurement = (metric: CapabilityMetricId) => collectMetric(eligibleRuns, metric)
  const sprintMeasurements = [measurement('30s'), measurement('1m'), measurement('5m')]
  const cruiseMeasurements = [measurement('20m'), measurement('1h')]
  const axes: CapabilityAxis[] = [
    axisWithMetrics(axisDefinitions[0], sprintMeasurements, 2, values => median(values.map(value => value.score as number)), '需要 30 秒、1 分钟、5 分钟中至少 2 个有效速度窗口'),
    axisWithMetrics(axisDefinitions[1], cruiseMeasurements, 1, values => values.reduce((sum, value) => sum + (value.score as number), 0) / values.length, '需要 20 分钟或 1 小时有效速度窗口'),
    axisWithMetrics(axisDefinitions[2], [measurement('2h')], 1, values => values[0]?.score, '需要同一活动内 2 小时有效移动时间'),
    axisWithMetrics(axisDefinitions[3], [measurement('5h')], 1, values => values[0]?.score, '需要同一活动内 5 小时有效移动时间'),
    axisWithMetrics(axisDefinitions[4], [measurement('climb')], 1, values => values[0]?.score, '需要合格连续上坡段以及可用海拔数据')
  ]
  return {
    mappingVersion: CAPABILITY_MAPPING_VERSION,
    asOf: new Date(asOfMs).toISOString(),
    windowStart: new Date(windowStartMs).toISOString(),
    windowDays,
    analyzedRunCount: runs.length,
    eligibleRunCount: eligibleRuns.length,
    validActivityDays,
    axes
  }
}

export const buildCapabilityProfile = (
  runs: Run[],
  options: { asOf?: number; windowDays?: number } = {}
) => createProfile(runs, options.asOf ?? Date.now(), options.windowDays ?? CAPABILITY_WINDOW_DAYS)

const trainingGoalLabels: Record<TrainingGoalId, string> = {
  efficiency: '提高骑行效率',
  comeback: '找回运动状态',
  climbing: '提高爬坡能力',
  health: '健康管理',
  distance: '提升续航距离',
  cruising: '提升巡航能力'
}

const buildGoalReason = (
  profile: CapabilityProfile,
  goalId: TrainingGoalId,
  focusAxisIds: CapabilityAxisId[],
  mode: 'low' | 'missing' | 'consistency' | 'steady'
) => {
  const axisById = new Map(profile.axes.map(axis => [axis.id, axis]))
  const focusLabels = focusAxisIds.map(id => axisById.get(id)?.label).filter(Boolean).join('、')
  if (mode === 'low') {
    const weakest = focusAxisIds
      .map(id => axisById.get(id))
      .find(axis => axis?.score !== undefined)
    return `当前「${weakest?.label ?? focusLabels}」为已形成分数中相对需要优先提升的方向，建议以「${trainingGoalLabels[goalId]}」生成计划，持续训练后用同样条件复测。`
  }
  if (mode === 'missing') {
    return `「${focusLabels}」暂未达到计算条件，不把它当作低分；先以「${trainingGoalLabels[goalId]}」补充针对性训练和有效样本，后续再建立该维度。`
  }
  if (mode === 'consistency') {
    return `当前只有 ${profile.validActivityDays} 个有效骑行日，先以「${trainingGoalLabels[goalId]}」建立稳定训练节奏，再逐步增加专项负荷。`
  }
  return `五维分数已基本建立且没有明显短板，先以「${trainingGoalLabels[goalId]}」保持规律训练、恢复和持续进步。`
}

export const buildCapabilityTrainingDirection = (profile: CapabilityProfile): CapabilityTrainingDirection => {
  const axisById = new Map(profile.axes.map(axis => [axis.id, axis]))
  const available = profile.axes
    .filter(axis => axis.score !== undefined)
    .sort((a, b) => (a.score as number) - (b.score as number))
  const weakest = available[0]
  const isMissing = (ids: CapabilityAxisId[]) => ids.some(id => axisById.get(id)?.score === undefined)
  const goals: CapabilityTrainingGoal[] = []
  const addGoal = (
    id: TrainingGoalId,
    focusAxisIds: CapabilityAxisId[],
    mode: 'low' | 'missing' | 'consistency' | 'steady'
  ) => {
    if (goals.some(goal => goal.id === id)) return
    goals.push({
      id,
      label: trainingGoalLabels[id],
      reason: buildGoalReason(profile, id, focusAxisIds, mode),
      focusAxisIds,
      priority: 'primary'
    })
  }

  // The order follows the plan's six goals: choose the lowest established axis
  // first, then use missing axes as a data-building direction rather than a
  // fabricated weakness.
  if (!available.length) addGoal('comeback', ['mediumEndurance', 'cruise'], 'consistency')
  else if (weakest && weakest.score !== undefined && weakest.score < 5.5 && ['longEndurance', 'mediumEndurance'].includes(weakest.id)) addGoal('distance', ['longEndurance', 'mediumEndurance'], 'low')
  else if (weakest?.id === 'climb' && weakest.score !== undefined && weakest.score < 5.5) addGoal('climbing', ['climb', 'cruise'], 'low')
  else if (weakest?.id === 'cruise' && weakest.score !== undefined && weakest.score < 5.5) addGoal('cruising', ['cruise', 'sprint'], 'low')
  else if (weakest?.id === 'sprint' && weakest.score !== undefined && weakest.score < 5.5) addGoal('efficiency', ['sprint', 'cruise'], 'low')
  else if (isMissing(['longEndurance', 'mediumEndurance'])) addGoal('distance', ['longEndurance', 'mediumEndurance'], 'missing')
  else if (isMissing(['climb'])) addGoal('climbing', ['climb', 'cruise'], 'missing')
  else if (isMissing(['cruise'])) addGoal('cruising', ['cruise', 'sprint'], 'missing')
  else if (isMissing(['sprint'])) addGoal('efficiency', ['sprint', 'cruise'], 'missing')
  else if (profile.validActivityDays < 3 || profile.eligibleRunCount < 3) addGoal('comeback', ['mediumEndurance', 'cruise'], 'consistency')
  else addGoal('health', ['mediumEndurance', 'longEndurance'], 'steady')

  if (!goals.length) addGoal('comeback', ['mediumEndurance', 'cruise'], 'consistency')

  const primary = goals[0]
  return {
    headline: `下一阶段先练「${primary.label}」`,
    summary: `根据 ${profile.eligibleRunCount} 份有效骑行和 ${profile.validActivityDays} 个有效骑行日，AI 会把已形成的分数与待建立的维度分开判断。`,
    goals: [goals[0]]
  }
}

export const buildCapabilityDigest = (
  runs: Run[],
  options: { asOf?: number; windowDays?: number } = {}
) => {
  const profile = buildCapabilityProfile(runs, options)
  return {
    ...profile,
    trainingDirection: buildCapabilityTrainingDirection(profile),
    axes: profile.axes.map(axis => ({
      axis: axis.label,
      score: axis.score,
      status: axis.status,
      description: axis.description,
      missingReason: axis.missingReason,
      measurements: axis.measurements.map(measurement => ({
        label: measurement.label,
        value: measurement.value,
        unit: measurement.unit,
        score: measurement.score,
        status: measurement.status,
        sampleDays: measurement.sampleDays,
        examples: measurement.examples
      }))
    }))
  }
}
