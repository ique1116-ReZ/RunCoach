import type { Run } from './types'
import { sampleAtDistance } from './align'

export type LlmProvider = 'kimi' | 'deepseek'

export type ComparisonRelation = 'auto' | 'same_athlete' | 'different_athletes'

export type LlmConfig = {
  provider: LlmProvider
  model: string
  apiKey: string
}

type LlmProviderMeta = {
  label: string
  baseUrl: string
  defaultModel: string
}

export const llmProviderMeta: Record<LlmProvider, LlmProviderMeta> = {
  kimi: {
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5'
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash'
  }
}

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

const buildRunDigest = (run: Run) => {
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

const buildComparisonDigest = (runA: Run, runB: Run, relation: ComparisonRelation) => {
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

const systemPrompt = (mode: 'single' | 'comparison', relation?: ComparisonRelation) => {
  const relationText = relation === 'same_athlete'
    ? '这是同一运动员在不同时期的训练或比赛，请重点关注能力变化、恢复状态、疲劳痕迹、配速稳定性和训练适应。'
    : relation === 'different_athletes'
      ? '这是不同运动员在同一路线上的训练或比赛，请重点关注策略风格、配速选择、心率响应和执行差异。'
      : '请根据数据自动判断更接近哪一种情况，并在结论里说明你的判断依据。'

  const modeText = mode === 'single'
    ? '你要分析一份跑步训练/比赛的 FIT 或 GPX 数据。'
    : `你要对比分析两份跑步训练/比赛数据。${relationText}`

  return [
    '你是一位严谨的跑步训练分析教练和数据分析师。',
    modeText,
    '请使用中文输出 Markdown，先给结论，再给证据，再给建议。',
    '不要编造未提供的数据；如果某项指标缺失，要明确说明。',
    '分析重点包括：配速策略、心率响应、后程变化、爬升影响、稳定性、节奏执行、强度控制、风险点、下一步建议。',
    mode === 'comparison'
      ? '比较时请明确指出谁更稳、谁更激进、谁更省力，以及这些差异可能意味着什么。'
      : '单次分析时请明确指出这次训练最值得注意的 3 个信号，以及最实用的 3 条建议。',
    '最后给出一个简短的「一句话总结」。'
  ].join('\n')
}

const userPromptForSingle = (run: Run) =>
  [
    '下面是单次训练摘要，请分析这次训练。',
    '请输出以下结构：',
    '## 结论',
    '## 关键表现',
    '## 风险与异常',
    '## 建议',
    '## 一句话总结',
    '',
    '训练数据：',
    JSON.stringify(buildRunDigest(run), null, 2)
  ].join('\n')

const userPromptForComparison = (runA: Run, runB: Run, relation: ComparisonRelation) =>
  [
    '下面是两次训练/比赛的对比摘要。',
    '请输出以下结构：',
    '## 总结',
    '## 关键差异',
    '## A 的优势与问题',
    '## B 的优势与问题',
    '## 可能原因',
    '## 可执行建议',
    '## 一句话总结',
    '',
    '请根据关系模式给出更贴切的分析：',
    relation,
    '',
    '对比数据：',
    JSON.stringify(buildComparisonDigest(runA, runB, relation), null, 2)
  ].join('\n')

export const buildSingleRunAnalysisPrompt = (run: Run) => ({
  system: systemPrompt('single'),
  user: userPromptForSingle(run)
})

export const buildComparisonAnalysisPrompt = (runA: Run, runB: Run, relation: ComparisonRelation) => ({
  system: systemPrompt('comparison', relation),
  user: userPromptForComparison(runA, runB, relation)
})

export const requestTrainingAnalysis = async (config: LlmConfig, system: string, user: string) => {
  const meta = llmProviderMeta[config.provider]
  const requestBody: Record<string, unknown> = {
    model: config.model || meta.defaultModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    max_tokens: 1800,
    stream: false
  }

  if (config.provider === 'kimi' && (config.model || meta.defaultModel).startsWith('kimi-k2.5')) {
    requestBody.thinking = { type: 'disabled' }
  }

  const response = await fetch(`${meta.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LLM 请求失败（${response.status}）：${text || response.statusText}`)
  }

  const data = await response.json() as any
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) return content.trim()
  throw new Error('LLM 返回内容为空')
}
