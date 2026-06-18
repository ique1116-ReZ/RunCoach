import React, { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { Map } from 'maplibre-gl'
import { mapStyleUrl } from './mapStyle'
import DarkVeil from './DarkVeil'
import type { Run } from '@shared/types'
import { defaultZones, zoneForHr } from '@shared/zones'
import { alignRunToReferenceRoute, sampleAtTime } from '@shared/align'
import { parseGpxFile } from '@shared/gpx'
import { parseJsonFile } from '@shared/json'
import { buildComparisonAnalysisPrompt, buildSingleRunAnalysisPrompt, llmProviderMeta, requestTrainingAnalysis, type ComparisonRelation, type LlmProvider } from '@shared/llm'
import 'maplibre-gl/dist/maplibre-gl.css'
import { parseFitFile } from '@shared/fit'
import { buildComparisonDashboardHtml, buildLlmAnalysisReportHtml, buildTrainingDashboardHtml } from '@shared/report'

const mapCenter: [number, number] = [116.3974, 39.9093]
const routeColors = {
  a: '#2563eb',
  b: '#f97316'
}

const localStorageKeys = {
  provider: 'runReplay.llm.provider',
  model: 'runReplay.llm.model',
  apiKey: 'runReplay.llm.apiKey',
  relation: 'runReplay.llm.relation',
  uiSkin: 'runReplay.ui.skin'
} as const

type UiSkin = 'classic' | 'luxe'
type AppView = 'home' | 'replay'

const speedZones = [
  { id: 's1', min: 0, max: 0.5, label: 'S1 低速', color: '#38bdf8' },
  { id: 's2', min: 0.5, max: 0.65, label: 'S2', color: '#22c55e' },
  { id: 's3', min: 0.65, max: 0.8, label: 'S3', color: '#eab308' },
  { id: 's4', min: 0.8, max: 0.9, label: 'S4', color: '#f97316' },
  { id: 's5', min: 0.9, max: 1.01, label: 'S5 高速', color: '#ef4444' }
]

const elevationChart = {
  width: 1000,
  height: 140,
  padding: 12
}

const buildZoneExpression = (mode: 'hr' | 'speed') => {
  const expression: any[] = ['match', ['get', 'zone']]
  const zones = mode === 'hr' ? defaultZones.zones : speedZones
  for (const zone of zones) {
    expression.push(zone.id, zone.color)
  }
  expression.push('#94a3b8')
  return expression
}

const maxSpeedForRun = (run: Run | null) => {
  if (!run) return 0
  return run.points.reduce((max, point) => Math.max(max, point.speed ?? 0), 0)
}

const speedZoneForPoint = (speed: number | undefined, maxSpeed: number) => {
  if (!speed || !maxSpeed) return null
  const ratio = speed / maxSpeed
  return speedZones.find(zone => ratio >= zone.min && ratio < zone.max) ?? speedZones[speedZones.length - 1]
}

const buildElevationPath = (run: Run | null, minElev: number, maxElev: number) => {
  if (!run) return ''
  if (run.points.length < 2) return ''
  const points = run.points.filter(point => Number.isFinite(point.elevation))
  if (points.length < 2) return ''
  const start = run.points[0].time
  const end = run.points[run.points.length - 1].time
  const span = end - start
  if (span <= 0) return ''

  const { width, height, padding } = elevationChart
  const range = Math.max(maxElev - minElev, 1)
  const toX = (time: number) => padding + ((time - start) / span) * (width - padding * 2)
  const toY = (elevation: number) =>
    height - padding - ((elevation - minElev) / range) * (height - padding * 2)

  let d = ''
  let started = false
  for (const point of points) {
    if (!Number.isFinite(point.elevation)) continue
    const x = toX(point.time)
    const y = toY(point.elevation as number)
    d += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `
    started = true
  }
  return d.trim()
}

const elevationTrend = (run: Run | null, timeMs: number | null) => {
  if (!run || timeMs === null) return null
  const now = sampleAtTime(run, timeMs)
  const prev = sampleAtTime(run, timeMs - 10000)
  if (!now || !prev) return null
  if (!Number.isFinite(now.elevation) || !Number.isFinite(prev.elevation)) return null
  const delta = (now.elevation as number) - (prev.elevation as number)
  if (Math.abs(delta) < 0.8) return '平'
  return delta > 0 ? '上升' : '下降'
}

const buildSegmentGeoJson = (run: Run | null) => {
  if (!run) return { type: 'FeatureCollection', features: [] }
  const features = []
  const points = run.points
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [a.lon, a.lat],
          [b.lon, b.lat]
        ]
      }
    })
  }
  return { type: 'FeatureCollection', features }
}

const buildCursorGeoJson = (
  a: any,
  b: any,
  zoneA: string,
  zoneB: string
) => {
  const featureA = a
    ? {
        type: 'Feature',
        properties: { id: 'a', zone: zoneA },
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] }
      }
    : null
  const featureB = b
    ? {
        type: 'Feature',
        properties: { id: 'b', zone: zoneB },
        geometry: { type: 'Point', coordinates: [b.lon, b.lat] }
      }
    : null

  const features = [featureA, featureB].filter(Boolean) as any[]
  if (!featureA || !featureB) return { type: 'FeatureCollection', features }

  const distA = a?.distFromStart ?? 0
  const distB = b?.distFromStart ?? 0
  const leaderId = distA >= distB ? 'a' : 'b'

  // 地图绘制通常按数组顺序覆盖：把领先者放最后，确保压在上面
  features.sort((x, y) => (x.properties.id === leaderId ? 1 : 0) - (y.properties.id === leaderId ? 1 : 0))
  return { type: 'FeatureCollection', features }
}

const App = () => {
  const mapRef = useRef<Map | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [progress, setProgress] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [renderMode, setRenderMode] = useState<'hr' | 'speed'>('hr')
  const [baseType, setBaseType] = useState<'LTHR' | 'HRmax'>('LTHR')
  const [lthrA, setLthrA] = useState(170)
  const [lthrB, setLthrB] = useState(170)
  const [hrmaxA, setHrmaxA] = useState(190)
  const [hrmaxB, setHrmaxB] = useState(190)
  const [loadError, setLoadError] = useState('')
  const [analysisProvider, setAnalysisProvider] = useState<LlmProvider>('deepseek')
  const [analysisModel, setAnalysisModel] = useState(llmProviderMeta.deepseek.defaultModel)
  const [analysisApiKey, setAnalysisApiKey] = useState('')
  const [comparisonRelation, setComparisonRelation] = useState<ComparisonRelation>('auto')
  const [analysisMode, setAnalysisMode] = useState<'single-a' | 'single-b' | 'comparison'>('single-a')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisMarkdown, setAnalysisMarkdown] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [uiSkin, setUiSkin] = useState<UiSkin>('luxe')
  const [activeView, setActiveView] = useState<AppView>('home')

  const baseValueA = baseType === 'LTHR' ? lthrA : hrmaxA
  const baseValueB = baseType === 'LTHR' ? lthrB : hrmaxB

  const runA = runs[0] ?? null
  const runB = runs[1] ?? null
  const displayRunB = useMemo(
    () => (runA && runB ? alignRunToReferenceRoute(runB, runA) : runB),
    [runA, runB]
  )
  const maxSpeedA = useMemo(() => maxSpeedForRun(runA), [runA])
  const maxSpeedB = useMemo(() => maxSpeedForRun(displayRunB), [displayRunB])

  useEffect(() => {
    try {
      const savedProvider = window.localStorage.getItem(localStorageKeys.provider) as LlmProvider | null
      const savedModel = window.localStorage.getItem(localStorageKeys.model)
      const savedApiKey = window.localStorage.getItem(localStorageKeys.apiKey)
      const savedRelation = window.localStorage.getItem(localStorageKeys.relation) as ComparisonRelation | null
      const savedUiSkin = window.localStorage.getItem(localStorageKeys.uiSkin) as UiSkin | null
      if (savedProvider === 'kimi' || savedProvider === 'deepseek') setAnalysisProvider(savedProvider)
      if (savedModel) setAnalysisModel(savedModel)
      if (savedApiKey) setAnalysisApiKey(savedApiKey)
      if (savedRelation === 'auto' || savedRelation === 'same_athlete' || savedRelation === 'different_athletes') {
        setComparisonRelation(savedRelation)
      }
      if (savedUiSkin === 'classic' || savedUiSkin === 'luxe') setUiSkin(savedUiSkin)
    } catch {
      // localStorage 不可用时保持默认值
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(localStorageKeys.provider, analysisProvider)
      window.localStorage.setItem(localStorageKeys.model, analysisModel)
      window.localStorage.setItem(localStorageKeys.apiKey, analysisApiKey)
      window.localStorage.setItem(localStorageKeys.relation, comparisonRelation)
      window.localStorage.setItem(localStorageKeys.uiSkin, uiSkin)
    } catch {
      // ignore persistence errors
    }
  }, [analysisProvider, analysisModel, analysisApiKey, comparisonRelation, uiSkin])

  useEffect(() => {
    const isKnownDefault =
      analysisModel === llmProviderMeta.deepseek.defaultModel ||
      analysisModel === llmProviderMeta.kimi.defaultModel
    if (!analysisModel || isKnownDefault) {
      setAnalysisModel(llmProviderMeta[analysisProvider].defaultModel)
    }
  }, [analysisProvider, analysisModel])

  const baseDurationSeconds = useMemo(() => {
    if (!runA && !runB) return 0
    const totalMs = runA && runB
      ? (runA.totalTime + runB.totalTime) / 2
      : runA?.totalTime ?? runB?.totalTime ?? 0
    return totalMs / 1000
  }, [runA, runB])

  const baseTimeMs = useMemo(() => {
    if (!runA && !runB) return 0
    const totalMs = runA && runB
      ? (runA.totalTime + runB.totalTime) / 2
      : runA?.totalTime ?? runB?.totalTime ?? 0
    return totalMs
  }, [runA, runB])

  const elapsedMs = useMemo(() => progress * baseTimeMs, [progress, baseTimeMs])

  const currentTimeA = useMemo(() => {
    if (!runA || runA.points.length === 0) return null
    const start = runA.points[0].time
    return start + Math.min(elapsedMs, runA.totalTime)
  }, [runA, elapsedMs])

  const currentTimeB = useMemo(() => {
    if (!displayRunB || displayRunB.points.length === 0) return null
    const start = displayRunB.points[0].time
    return start + Math.min(elapsedMs, displayRunB.totalTime)
  }, [displayRunB, elapsedMs])

  useEffect(() => {
    if (activeView !== 'replay') return
    const map = new maplibregl.Map({
      container: 'map',
      style: mapStyleUrl,
      center: mapCenter,
      zoom: 12,
      maxZoom: 17
    })

    mapRef.current = map

    map.on('load', () => {
      map.addSource('run-a', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('run-b', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('cursor', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

      map.addLayer({
        id: 'run-a-casing',
        type: 'line',
        source: 'run-a',
        paint: {
          'line-color': '#f8fafc',
          'line-width': 8,
          'line-opacity': 0.9
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        }
      })

      map.addLayer({
        id: 'run-a-line',
        type: 'line',
        source: 'run-a',
        paint: {
          'line-color': routeColors.a,
          'line-width': 5
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        }
      })

      map.addLayer({
        id: 'run-b-casing',
        type: 'line',
        source: 'run-b',
        paint: {
          'line-color': '#f8fafc',
          'line-width': 8,
          'line-opacity': 0.9
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        }
      })

      map.addLayer({
        id: 'run-b-line',
        type: 'line',
        source: 'run-b',
        paint: {
          'line-color': routeColors.b,
          'line-width': 5,
          'line-opacity': 0.92
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        }
      })

      map.addLayer({
        id: 'cursor-layer',
        type: 'circle',
        source: 'cursor',
        paint: {
          'circle-radius': 10,
          'circle-color': buildZoneExpression('hr'),
          'circle-stroke-color': '#f8fafc',
          'circle-stroke-width': 2
        }
      })

      map.addLayer({
        id: 'cursor-label-layer',
        type: 'symbol',
        source: 'cursor',
        layout: {
          'text-field': ['upcase', ['get', 'id']],
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#f8fafc'
        }
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [activeView])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const sourceA = map.getSource('run-a') as maplibregl.GeoJSONSource | undefined
    const sourceB = map.getSource('run-b') as maplibregl.GeoJSONSource | undefined

    if (sourceA) sourceA.setData(buildSegmentGeoJson(runA) as any)
    if (sourceB) sourceB.setData(buildSegmentGeoJson(displayRunB) as any)

    const focusRun = runA ?? displayRunB
    if (focusRun?.points.length) {
      const bounds = focusRun.points.reduce(
        (acc, point) => {
          acc[0][0] = Math.min(acc[0][0], point.lon)
          acc[0][1] = Math.min(acc[0][1], point.lat)
          acc[1][0] = Math.max(acc[1][0], point.lon)
          acc[1][1] = Math.max(acc[1][1], point.lat)
          return acc
        },
        [
          [focusRun.points[0].lon, focusRun.points[0].lat],
          [focusRun.points[0].lon, focusRun.points[0].lat]
        ] as [[number, number], [number, number]]
      )
      map.fitBounds(bounds, { padding: 80 })
    }
    // 轨迹颜色固定，不随渲染模式变化（差异由圆点/面板体现）
  }, [runA, displayRunB])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('cursor-layer')) return
    map.setPaintProperty('cursor-layer', 'circle-color', buildZoneExpression(renderMode))
  }, [renderMode])

  useEffect(() => {
    if (!isPlaying) return
    if (!baseDurationSeconds) return
    let raf: number
    let last = performance.now()

    const tick = (now: number) => {
      const delta = (now - last) / 1000
      last = now
      setProgress(prev => {
        const next = prev + (delta * speed) / baseDurationSeconds
        if (next >= 1) {
          setIsPlaying(false)
          return 1
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, speed, baseDurationSeconds])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('cursor') as maplibregl.GeoJSONSource | undefined
    if (!source) return

    const pointA = runA && currentTimeA !== null ? sampleAtTime(runA, currentTimeA) : null
    const pointB = displayRunB && currentTimeB !== null ? sampleAtTime(displayRunB, currentTimeB) : null
    const zoneIdA = renderMode === 'hr'
      ? zoneForHr(pointA?.hr, baseValueA)?.id ?? 'unknown'
      : speedZoneForPoint(pointA?.speed, maxSpeedA)?.id ?? 'unknown'
    const zoneIdB = renderMode === 'hr'
      ? zoneForHr(pointB?.hr, baseValueB)?.id ?? 'unknown'
      : speedZoneForPoint(pointB?.speed, maxSpeedB)?.id ?? 'unknown'
    source.setData(buildCursorGeoJson(pointA, pointB, zoneIdA, zoneIdB) as any)
  }, [progress, runA, displayRunB, currentTimeA, currentTimeB, renderMode, baseValueA, baseValueB, maxSpeedA, maxSpeedB])

  const loadRunFromFile = async (file: File) => {
    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith('.fit')) {
      const buffer = await file.arrayBuffer()
      return await parseFitFile(buffer, file.name)
    }
    if (lowerName.endsWith('.json')) {
      const text = await file.text()
      return await parseJsonFile(text, file.name)
    }
    const xml = await file.text()
    return parseGpxFile(xml, file.name)
  }

  const resetPlayback = () => {
    setProgress(0)
    setIsPlaying(false)
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const selected = Array.from(files).slice(0, 2)
      const loaded: Run[] = []
      for (const file of selected) {
        loaded.push(await loadRunFromFile(file))
      }
      setRuns(loaded)
      resetPlayback()
      setLoadError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setLoadError(`导入失败：${message}`)
    }
  }

  const handleRunnerFile = async (runnerIndex: 0 | 1, files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const file = files[0]
      const loaded = await loadRunFromFile(file)
      setRuns(prev => {
        const next = prev.slice(0, 2)
        next[runnerIndex] = loaded
        return next
      })
      resetPlayback()
      setReportMessage('')
      setPreviewHtml('')
      setPreviewTitle('')
      setLoadError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      const runnerLabel = runnerIndex === 0 ? '跑者A' : '跑者B'
      setLoadError(`${runnerLabel} 导入失败：${message}`)
    }
  }

  const previewDashboard = (run: Run | null, label: string) => {
    if (!run) return
    setPreviewHtml(buildTrainingDashboardHtml(run))
    setPreviewTitle(`${label} 训练看板预览`)
    setReportMessage(`${label} 的训练看板已在应用内打开预览`)
  }

  const previewComparisonDashboard = () => {
    if (!runA || !displayRunB) return
    setPreviewHtml(buildComparisonDashboardHtml(runA, displayRunB))
    setPreviewTitle(`${runA.name} vs ${displayRunB.name} 对比看板预览`)
    setReportMessage('A/B 对比训练看板已在应用内打开预览')
  }

  const currentAnalysisTitle = () => {
    if (analysisMode === 'single-a') return `${runA?.name ?? '跑者A'} 训练分析报告`
    if (analysisMode === 'single-b') return `${runB?.name ?? '跑者B'} 训练分析报告`
    return `${runA?.name ?? '跑者A'} vs ${displayRunB?.name ?? '跑者B'} 对比分析报告`
  }

  const currentAnalysisSubject = () => {
    if (analysisMode === 'single-a') {
      return `针对 ${runA?.name ?? '跑者A'} 的单次训练复盘结论，已整理为适合阅读和留档的独立 HTML 报告。`
    }
    if (analysisMode === 'single-b') {
      return `针对 ${runB?.name ?? '跑者B'} 的单次训练复盘结论，已整理为适合阅读和留档的独立 HTML 报告。`
    }
    return `针对 ${runA?.name ?? '跑者A'} 与 ${displayRunB?.name ?? '跑者B'} 的对比训练结论，已整理为适合阅读和留档的独立 HTML 报告。`
  }

  const analysisPreviewText = useMemo(() => {
    return analysisMarkdown
      .replace(/\r\n/g, '\n')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/^[-*]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\n+/g, ' ')
      .trim()
  }, [analysisMarkdown])

  const previewAnalysisReport = () => {
    if (!analysisMarkdown.trim()) return
    setPreviewHtml(
      buildLlmAnalysisReportHtml({
        title: currentAnalysisTitle(),
        subject: currentAnalysisSubject(),
        markdown: analysisMarkdown,
        providerLabel: llmProviderMeta[analysisProvider].label,
        model: analysisModel.trim()
      })
    )
    setPreviewTitle(currentAnalysisTitle())
    setReportMessage('LLM 分析报告已在应用内打开预览')
  }

  const analyzeRun = async (target: 'a' | 'b') => {
    const run = target === 'a' ? runA : runB
    if (!run) {
      setAnalysisError(target === 'a' ? '请先上传跑者A的文件。' : '请先上传跑者B的文件。')
      return
    }
    if (!analysisApiKey.trim()) {
      setAnalysisError('请先填写对应平台的 API Key。')
      return
    }

    setAnalysisMode(target === 'a' ? 'single-a' : 'single-b')
    setAnalysisLoading(true)
    setAnalysisError('')
    setAnalysisMarkdown('')

    try {
      const prompt = buildSingleRunAnalysisPrompt(run)
      const markdown = await requestTrainingAnalysis(
        {
          provider: analysisProvider,
          model: analysisModel,
          apiKey: analysisApiKey.trim()
        },
        prompt.system,
        prompt.user
      )
      setAnalysisMarkdown(markdown)
      setReportMessage(`已完成 ${target === 'a' ? '跑者A' : '跑者B'} 的 LLM 分析。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setAnalysisError(`LLM 分析失败：${message}`)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const analyzeComparison = async () => {
    if (!runA || !displayRunB) {
      setAnalysisError('请先上传跑者A和跑者B的文件。')
      return
    }
    if (!analysisApiKey.trim()) {
      setAnalysisError('请先填写对应平台的 API Key。')
      return
    }

    setAnalysisMode('comparison')
    setAnalysisLoading(true)
    setAnalysisError('')
    setAnalysisMarkdown('')

    try {
      const prompt = buildComparisonAnalysisPrompt(runA, displayRunB, comparisonRelation)
      const markdown = await requestTrainingAnalysis(
        {
          provider: analysisProvider,
          model: analysisModel,
          apiKey: analysisApiKey.trim()
        },
        prompt.system,
        prompt.user
      )
      setAnalysisMarkdown(markdown)
      setReportMessage('已完成 A/B 对比 LLM 分析。')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setAnalysisError(`LLM 分析失败：${message}`)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const leadDistance = useMemo(() => {
    if (!runA || !displayRunB) return 0
    const pointA = currentTimeA !== null ? sampleAtTime(runA, currentTimeA) : null
    const pointB = currentTimeB !== null ? sampleAtTime(displayRunB, currentTimeB) : null
    return (pointA?.distFromStart ?? 0) - (pointB?.distFromStart ?? 0)
  }, [runA, displayRunB, progress, currentTimeA, currentTimeB])

  const currentA = useMemo(
    () => (runA && currentTimeA !== null ? sampleAtTime(runA, currentTimeA) : null),
    [runA, progress, currentTimeA]
  )
  const currentB = useMemo(
    () => (displayRunB && currentTimeB !== null ? sampleAtTime(displayRunB, currentTimeB) : null),
    [displayRunB, progress, currentTimeB]
  )

  const elevationStats = useMemo(() => {
    const values: number[] = []
    for (const run of [runA, displayRunB]) {
      if (!run) continue
      for (const point of run.points) {
        if (Number.isFinite(point.elevation)) values.push(point.elevation as number)
      }
    }
    if (values.length === 0) {
      return { min: 0, max: 1, hasData: false }
    }
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      hasData: true
    }
  }, [runA, displayRunB])

  const elevationPathA = useMemo(
    () => buildElevationPath(runA, elevationStats.min, elevationStats.max),
    [runA, elevationStats]
  )
  const elevationPathB = useMemo(
    () => buildElevationPath(displayRunB, elevationStats.min, elevationStats.max),
    [displayRunB, elevationStats]
  )

  const cursorXFor = (run: Run | null, timeMs: number | null) => {
    if (!run || timeMs === null) return null
    const first = run.points[0]
    const last = run.points[run.points.length - 1]
    if (!first || !last || last.time <= first.time) return null
    const ratio = Math.min(Math.max((timeMs - first.time) / (last.time - first.time), 0), 1)
    const { width, padding } = elevationChart
    return padding + ratio * (width - padding * 2)
  }

  const cursorXA = cursorXFor(runA, currentTimeA)
  const cursorXB = cursorXFor(displayRunB, currentTimeB)
  const trendA = elevationTrend(runA, currentTimeA)
  const trendB = elevationTrend(displayRunB, currentTimeB)

  const formatPace = (speed?: number) => {
    if (!speed || speed <= 0) return '--'
    const totalSeconds = 1000 / speed
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.floor(totalSeconds % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`
  }

  const zoneA = renderMode === 'hr'
    ? zoneForHr(currentA?.hr, baseValueA)
    : speedZoneForPoint(currentA?.speed, maxSpeedA)
  const zoneB = renderMode === 'hr'
    ? zoneForHr(currentB?.hr, baseValueB)
    : speedZoneForPoint(currentB?.speed, maxSpeedB)

  const goHome = () => {
    setActiveView('home')
    setPreviewHtml('')
  }

  const openReplayWorkspace = () => {
    setActiveView('replay')
  }

  if (activeView === 'home') {
    return (
      <div className={`home-shell home-shell-${uiSkin}`}>
        <div className="app-atmosphere" aria-hidden="true">
          <DarkVeil
            hueShift={uiSkin === 'luxe' ? 24 : 8}
            noiseIntensity={0.04}
            scanlineIntensity={uiSkin === 'luxe' ? 0.08 : 0.03}
            scanlineFrequency={1.6}
            speed={0.38}
            warpAmount={0.16}
            resolutionScale={0.9}
          />
        </div>
        <div className="home-noise" aria-hidden="true" />
        <main className="home-main">
          <section className="home-logo-block">
            <div className="home-logo-mark" aria-label="Suunto">
              <div className="home-logo-icon" aria-hidden="true" />
              <div className="home-logo-wordmark">SUUNTO</div>
            </div>
          </section>

          <section className="module-grid">
            <button className="module-card module-card-primary" onClick={openReplayWorkspace}>
              <strong>训练复盘</strong>
              <p>进入训练回放、双人对比、海拔剖面和 AI 分析工作台。</p>
              <span className="module-card-cta">进入工作台</span>
            </button>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className={`app app-${uiSkin}`}>
      {uiSkin === 'luxe' && (
        <div className="app-atmosphere" aria-hidden="true">
          <DarkVeil
            hueShift={24}
            noiseIntensity={0.04}
            scanlineIntensity={0.08}
            scanlineFrequency={1.6}
            speed={0.38}
            warpAmount={0.16}
            resolutionScale={0.9}
          />
        </div>
      )}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-topline">
            <div className="eyebrow">Suunto Coach</div>
            <div className="skin-switch" role="tablist" aria-label="界面风格切换">
              <button
                className={`skin-switch-button ${uiSkin === 'luxe' ? 'skin-switch-button-active' : ''}`}
                onClick={() => setUiSkin('luxe')}
              >
                新视觉
              </button>
              <button
                className={`skin-switch-button ${uiSkin === 'classic' ? 'skin-switch-button-active' : ''}`}
                onClick={() => setUiSkin('classic')}
              >
                经典版
              </button>
            </div>
          </div>
          <button className="back-link" onClick={goHome}>
            返回首页
          </button>
          <h1>训练复盘工作台</h1>
          <p>导入 GPX / FIT，回放、对比、再交给 LLM 做一次总结。</p>
          <div className="header-badges">
            <span className="header-badge">Dual Run Replay</span>
            <span className="header-badge">AI Report Layer</span>
            <span className="header-badge">Map + Elevation</span>
          </div>
        </div>

        <div className="sidebar-body">
          <section className="panel-card">
            <div className="card-title">导入训练</div>
            <div className="upload-grid">
              <label className="action-chip action-chip-primary">
                跑者 A
                <input
                  type="file"
                  accept=".gpx,.fit,.json"
                  style={{ display: 'none' }}
                  onChange={event => handleRunnerFile(0, event.target.files)}
                />
              </label>
              <label className="action-chip action-chip-primary">
                跑者 B
                <input
                  type="file"
                  accept=".gpx,.fit,.json"
                  style={{ display: 'none' }}
                  onChange={event => handleRunnerFile(1, event.target.files)}
                />
              </label>
            </div>
            <div className="subtle-note">
              支持 `.gpx`、`.fit`、`.json`，最多两条训练。B 会自动拟合到 A 的路线。
            </div>
            {loadError && <div className="inline-error">{loadError}</div>}
          </section>

          <section className="panel-card">
            <div className="card-title">回放</div>
            <div className="compact-row">
              <span>进度</span>
              <span className="muted-pill">{Math.round(progress * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              onChange={event => setProgress(Number(event.target.value))}
            />
            <div className="control-row">
              <button className="action-chip action-chip-secondary" onClick={() => setIsPlaying(p => !p)} disabled={!runA && !runB}>
                {isPlaying ? '暂停' : '播放'}
              </button>
              <select className="select-field" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </div>
            <div className="compact-row">
              <span>领先 / 落后</span>
              <span className="muted-pill">{leadDistance >= 0 ? '+' : ''}{leadDistance.toFixed(1)}m</span>
            </div>
            <div className="compact-row">
              <span>时间轴</span>
              <span className="muted-pill">{Math.round((progress * baseTimeMs) / 1000)}s</span>
            </div>
          </section>

          <section className="panel-card">
            <div className="card-title">区间提示</div>
            <div className="control-row">
              <button className={`action-chip ${renderMode === 'hr' ? 'action-chip-active' : 'action-chip-secondary'}`} onClick={() => setRenderMode('hr')}>
                心率
              </button>
              <button className={`action-chip ${renderMode === 'speed' ? 'action-chip-active' : 'action-chip-secondary'}`} onClick={() => setRenderMode('speed')}>
                速度
              </button>
            </div>
            <div className="subtle-note">只影响光标与提示，不改变主轨迹颜色。</div>
            <div className="compact-row">
              <span>心率基准</span>
              <select className="select-field" value={baseType} onChange={event => setBaseType(event.target.value as 'LTHR' | 'HRmax')}>
                <option value="LTHR">LTHR</option>
                <option value="HRmax">HRmax</option>
              </select>
            </div>
            <div className="compact-row">
              <span>跑者 A</span>
              <input
                className="number-field"
                type="number"
                value={baseType === 'LTHR' ? lthrA : hrmaxA}
                onChange={event =>
                  baseType === 'LTHR'
                    ? setLthrA(Number(event.target.value))
                    : setHrmaxA(Number(event.target.value))
                }
              />
            </div>
            <div className="compact-row">
              <span>跑者 B</span>
              <input
                className="number-field"
                type="number"
                value={baseType === 'LTHR' ? lthrB : hrmaxB}
                onChange={event =>
                  baseType === 'LTHR'
                    ? setLthrB(Number(event.target.value))
                    : setHrmaxB(Number(event.target.value))
                }
              />
            </div>
            <div className="legend legend-muted">
              {(renderMode === 'hr' ? defaultZones.zones : speedZones).map(zone => (
                <div className="legend-item" key={zone.id}>
                  <span className="legend-color" style={{ background: zone.color }} />
                  <span>{zone.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel-card">
            <div className="card-title">AI 分析</div>
            <div className="compact-row">
              <span>平台</span>
              <select
                className="select-field"
                value={analysisProvider}
                onChange={event => {
                  const nextProvider = event.target.value as LlmProvider
                  setAnalysisProvider(nextProvider)
                  setAnalysisModel(prev =>
                    prev === llmProviderMeta.deepseek.defaultModel || prev === llmProviderMeta.kimi.defaultModel || !prev
                      ? llmProviderMeta[nextProvider].defaultModel
                      : prev
                  )
                }}
              >
                <option value="deepseek">DeepSeek</option>
                <option value="kimi">Kimi</option>
              </select>
            </div>
            <div className="compact-row">
              <span>模型</span>
              <input
                className="text-field"
                type="text"
                value={analysisModel}
                onChange={event => setAnalysisModel(event.target.value)}
                placeholder={llmProviderMeta[analysisProvider].defaultModel}
              />
            </div>
            <div className="compact-row">
              <span>API Key</span>
              <input
                className="text-field"
                type="password"
                value={analysisApiKey}
                onChange={event => setAnalysisApiKey(event.target.value)}
                placeholder={`填写 ${llmProviderMeta[analysisProvider].label} API Key`}
              />
            </div>
            <div className="compact-row">
              <span>关系</span>
              <select className="select-field" value={comparisonRelation} onChange={event => setComparisonRelation(event.target.value as ComparisonRelation)}>
                <option value="auto">自动判断</option>
                <option value="same_athlete">同一运动员</option>
                <option value="different_athletes">不同运动员</option>
              </select>
            </div>
            <div className="analysis-actions">
              <button className="action-chip action-chip-secondary" onClick={() => analyzeRun('a')} disabled={!runA || analysisLoading}>
                分析 A
              </button>
              <button className="action-chip action-chip-secondary" onClick={() => analyzeRun('b')} disabled={!runB || analysisLoading}>
                分析 B
              </button>
              <button className="action-chip action-chip-secondary" onClick={analyzeComparison} disabled={!runA || !displayRunB || analysisLoading}>
                对比 A/B
              </button>
            </div>
            <div className="subtle-note">
              {analysisLoading
                ? 'LLM 正在分析中…'
                : analysisMode === 'single-a'
                  ? '当前任务：分析跑者 A'
                  : analysisMode === 'single-b'
                    ? '当前任务：分析跑者 B'
                    : '当前任务：A/B 对比分析'}
            </div>
            {analysisError && <div className="inline-error">{analysisError}</div>}
            {analysisMarkdown && (
              <div className="analysis-output">
                <div className="analysis-output-label">已生成独立 HTML 分析报告</div>
                <div className="analysis-output-text">
                  {analysisPreviewText.slice(0, 180)}
                  {analysisPreviewText.length > 180 ? '…' : ''}
                </div>
                <button className="button analysis-report-button" onClick={previewAnalysisReport}>
                  打开分析报告
                </button>
              </div>
            )}
          </section>

          <section className="panel-card panel-card-quiet">
            <div className="card-title">HTML 看板</div>
            <div className="secondary-actions">
              <button
                className="action-link"
                onClick={() => previewDashboard(runA, runA?.name ?? '跑者A')}
                disabled={!runA}
              >
                预览 A 看板
              </button>
              <button
                className="action-link"
                onClick={() => previewDashboard(runB, runB?.name ?? '跑者B')}
                disabled={!runB}
              >
                预览 B 看板
              </button>
              <button
                className="action-link"
                onClick={previewComparisonDashboard}
                disabled={!runA || !displayRunB}
              >
                预览对比看板
              </button>
            </div>
            <div className="subtle-note">
              这个入口只是辅助预览，不是主要交互。
            </div>
            {reportMessage && <div className="subtle-note">{reportMessage}</div>}
          </section>
        </div>

        <div className="sidebar-footer">
          当前使用 MapTiler Cloud 在线底图
        </div>
      </aside>

      <main className="map-container">
        <div className="map-stage">
          <div className="stage-hud">
            <div>
              <div className="stage-kicker">Live Session</div>
              <strong>{runA?.name ?? '跑者 A'} {displayRunB ? `vs ${displayRunB.name}` : 'Solo Review'}</strong>
            </div>
            <div className="stage-hud-meta">
              <span>{renderMode === 'hr' ? 'Heart Rate Zones' : 'Speed Bands'}</span>
              <span>{baseDurationSeconds ? `${Math.round(baseDurationSeconds)}s timeline` : '等待导入训练'}</span>
            </div>
          </div>
          <div className="top-metrics">
            <div className="metric-card">
              <div className="metric-title">{runA?.name ?? '跑者A'}</div>
              <div className="metric-row">
                <span>配速</span>
                <strong>{formatPace(currentA?.speed)}</strong>
              </div>
              <div className="metric-row">
                <span>心率</span>
                <span className="metric-inline">
                  <strong>{currentA?.hr ? `${Math.round(currentA.hr)} bpm` : '--'}</strong>
                  {zoneA && (
                    <span className="zone-pill" style={{ background: zoneA.color }}>
                      {zoneA.id.toUpperCase()}
                    </span>
                  )}
                </span>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-title">{displayRunB?.name ?? '跑者B'}</div>
              <div className="metric-row">
                <span>配速</span>
                <strong>{formatPace(currentB?.speed)}</strong>
              </div>
              <div className="metric-row">
                <span>心率</span>
                <span className="metric-inline">
                  <strong>{currentB?.hr ? `${Math.round(currentB.hr)} bpm` : '--'}</strong>
                  {zoneB && (
                    <span className="zone-pill" style={{ background: zoneB.color }}>
                      {zoneB.id.toUpperCase()}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
          <div id="map" />
        </div>
        {previewHtml && (
          <div className="report-preview-overlay" onClick={() => setPreviewHtml('')}>
            <div className="report-preview-shell" onClick={event => event.stopPropagation()}>
              <div className="report-preview-header">
                <div>
                  <strong>{previewTitle}</strong>
                  <div className="report-preview-subtitle">应用内预览内容与最终看板保持一致</div>
                </div>
                <button className="button button-secondary" onClick={() => setPreviewHtml('')}>关闭预览</button>
              </div>
              <iframe className="report-preview-frame" srcDoc={previewHtml} title={previewTitle} />
            </div>
          </div>
        )}
        <div className="elevation-panel">
          <div className="elevation-header">
            <span>海拔剖面</span>
            <div className="elevation-legend">
              <span className="elevation-item">
                <span className="elevation-dot a" />
                跑者A
              </span>
              <span className="elevation-item">
                <span className="elevation-dot b" />
                跑者B
              </span>
            </div>
          </div>
          {elevationStats.hasData ? (
            <svg
              className="elevation-chart"
              viewBox={`0 0 ${elevationChart.width} ${elevationChart.height}`}
              preserveAspectRatio="none"
            >
              <path className="elevation-line a" d={elevationPathA} />
              <path className="elevation-line b" d={elevationPathB} />
              {cursorXA !== null && (
                <line
                  className="elevation-cursor a"
                  x1={cursorXA}
                  x2={cursorXA}
                  y1={0}
                  y2={elevationChart.height}
                />
              )}
              {cursorXB !== null && (
                <line
                  className="elevation-cursor b"
                  x1={cursorXB}
                  x2={cursorXB}
                  y1={0}
                  y2={elevationChart.height}
                />
              )}
            </svg>
          ) : (
            <div className="elevation-empty">当前文件未包含海拔数据</div>
          )}
          <div className="elevation-metrics">
            <div className="elevation-metric">
              <span>跑者A</span>
              <span>
                {Number.isFinite(currentA?.elevation) ? `${Math.round(currentA!.elevation as number)} m` : '--'}
                {trendA ? ` · ${trendA}` : ''}
              </span>
            </div>
            <div className="elevation-metric">
              <span>跑者B</span>
              <span>
                {Number.isFinite(currentB?.elevation) ? `${Math.round(currentB!.elevation as number)} m` : '--'}
                {trendB ? ` · ${trendB}` : ''}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
