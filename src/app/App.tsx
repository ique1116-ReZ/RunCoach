// src/app/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { MapView } from '@/map/MapView'
import { clearRoute, setCurrentLocationMarker, setRouteLine, setRouteTrafficAnalysis, setStartPin, setTrack, fitToCoords } from '@/map/layers'
import { ChatDock } from '@/chat/ChatDock'
import { useChatAgent } from '@/chat/useChatAgent'
import { SettingsGear, type RoutingSettingsRequest } from '@/settings/SettingsGear'
import type { ToolContext } from '@/agent/tools'
import type { RouteResult, RouteTrafficAnalysis, LngLat } from '@/routing/ors'
import { getIpLocation } from '@/routing/ip-location'
import { routeToGpx } from '@/export/gpx-export'
import { recommendCyclingRoute, type CourseRouteRequest, type CourseRouteShape } from '@/routing/cycling-route'
import { isInChina } from '@/routing/region'
import { analyzeRouteTraffic, pendingTrafficAnalysis, unavailableTrafficAnalysis } from '@/routing/traffic-analysis'
import { loadConfig, type LlmConfig } from '@/llm/provider'
import type { Run } from '@runs/types'
import { parseGpxFile } from '@runs/gpx'
import { parseFitFile } from '@runs/fit'
import { parseJsonFile } from '@runs/json'
import { activityTypeLabel } from '@runs/activity'
import { TerrainCard } from './TerrainCard'
import { StartPointCard } from './StartPointCard'
import { PinConfirm } from './PinConfirm'
import { ReplayBar } from './ReplayBar'
import { ActivityDashboard } from './ActivityDashboard'
import { DitherMapBackdrop } from './DitherMapBackdrop'
import { TrainingPlanOverlay } from './TrainingPlanOverlay'
import { RouteShapeCard } from './RouteShapeCard'
import {
  loadCyclingHeartRateProfile,
  loadCoachMode,
  loadHomeBackground,
  resolveCyclingHeartRateReference,
  type CyclingHeartRateProfile,
  type CoachMode,
  type HomeBackground
} from './preferences'
import { APP_NAME, APP_SLUG } from './brand'
import './styles.css'

type LocationFix = {
  coord: LngLat
  source: 'browser' | 'ip'
  accuracyM?: number
  updatedAt: number
}

type PendingReview = {
  runId: string
  fileName: string
  activityType: Run['activityType']
  activityLabel: string
  distanceKm: string
  duration: string
}

type CourseRouteStatus = {
  phase: 'choosing' | 'generating' | 'error'
  courseName: string
  message: string
}

type CourseRouteContext = {
  course: CourseRouteRequest
  start: LngLat
  shape: CourseRouteShape
  variant: number
}

const formatAccuracy = (fix: LocationFix | null) => {
  if (!fix) return '点击重新定位'
  if (fix.source === 'ip') return 'IP 粗略定位'
  if (typeof fix.accuracyM !== 'number') return '浏览器定位'
  if (fix.accuracyM >= 1000) return `约 ${(fix.accuracyM / 1000).toFixed(1)} km`
  return `约 ${Math.max(1, Math.round(fix.accuracyM))} m`
}

const formatDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const pause = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms))

const analyzeTrafficWithRetry = async (route: RouteResult) => {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await analyzeRouteTraffic(route, { signal: AbortSignal.timeout(20000) })
    } catch (error) {
      lastError = error
      if (attempt === 0) await pause(900)
    }
  }
  throw lastError
}

export default function App() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const didAutoCenterRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [docked, setDocked] = useState(false)
  const [startCoord, setStartCoord] = useState<LngLat | null>(null)
  const [locationFix, setLocationFix] = useState<LocationFix | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [routes, setRoutes] = useState<RouteResult[]>([])   // 生成历史，"换一条"不覆盖
  const [routeIdx, setRouteIdx] = useState(0)               // 当前预览/可下载的那条
  const routesRef = useRef<RouteResult[]>([])               // 给 memo 化的 onRoute 用，避免陈旧闭包
  const [run, setRun] = useState<Run | null>(null)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [trainingPlanOpen, setTrainingPlanOpen] = useState(false)
  const [trainingPlanMounted, setTrainingPlanMounted] = useState(false)
  const [courseRouteStatus, setCourseRouteStatus] = useState<CourseRouteStatus | null>(null)
  const [courseRouteMapMode, setCourseRouteMapMode] = useState(false)
  const [courseRouteContext, setCourseRouteContext] = useState<CourseRouteContext | null>(null)
  const [trafficAnalysisRetrying, setTrafficAnalysisRetrying] = useState(false)
  const [routingSettingsRequest, setRoutingSettingsRequest] = useState<RoutingSettingsRequest | undefined>()
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null)
  const [config, setConfig] = useState<LlmConfig | null>(loadConfig())
  const [heartRateProfile, setHeartRateProfile] = useState<CyclingHeartRateProfile>(loadCyclingHeartRateProfile())
  const [coachMode, setCoachMode] = useState<CoachMode>(loadCoachMode())
  const [openHeartRateSettingsRequest, setOpenHeartRateSettingsRequest] = useState(0)
  const [homeBackground, setHomeBackground] = useState<HomeBackground>(loadHomeBackground())
  const runs = useRef<Map<string, Run>>(new Map())

  // 引导卡片 / 选点状态
  const [terrainResolve, setTerrainResolve] = useState<((t: 'trail' | 'road' | null) => void) | null>(null)
  const [startResolve, setStartResolve] = useState<((c: LngLat | null) => void) | null>(null)
  const [routeShapeResolve, setRouteShapeResolve] = useState<((shape: CourseRouteShape | null) => void) | null>(null)
  const [picking, setPicking] = useState(false)
  const [pendingPin, setPendingPin] = useState<LngLat | null>(null)
  const [startMsg, setStartMsg] = useState('')

  const applyLocationFix = useCallback((fix: LocationFix, centerMap = false) => {
    setStartCoord(fix.coord)
    setLocationFix(fix)
    setLocationError('')
    const map = mapRef.current
    if (!map) return
    setCurrentLocationMarker(map, fix.coord)
    if (centerMap) {
      map.flyTo({ center: fix.coord, zoom: fix.source === 'ip' ? 12 : Math.max(map.getZoom(), 15) })
    }
  }, [])

  const locateCurrent = useCallback(async (centerMap = false) => {
    setLocating(true)
    setLocationError('')

    const useIpFallback = async (message: string): Promise<LocationFix | null> => {
      const c = await getIpLocation()
      if (!c) {
        setLocationError('定位失败')
        return null
      }
      const fix: LocationFix = { coord: c, source: 'ip', updatedAt: Date.now() }
      applyLocationFix(fix, centerMap)
      console.warn(`[geo] ${message}，已用 IP 粗略定位:`, c)
      return fix
    }

    if (!navigator.geolocation) {
      const fix = await useIpFallback('navigator.geolocation 不可用')
      setLocating(false)
      return fix
    }

    const fix = await new Promise<LocationFix | null>(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const next: LocationFix = {
            coord: [pos.coords.longitude, pos.coords.latitude],
            source: 'browser',
            accuracyM: pos.coords.accuracy,
            updatedAt: Date.now()
          }
          applyLocationFix(next, centerMap)
          resolve(next)
        },
        err => {
          const reason = err.code === 1 ? '权限被拒'
            : err.code === 2 ? '系统拿不到位置'
            : err.code === 3 ? '定位超时' : '未知错误'
          void useIpFallback(`系统定位失败（${reason}）`).then(resolve)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      )
    })
    setLocating(false)
    return fix
  }, [applyLocationFix])

  useEffect(() => {
    void locateCurrent(false)
  }, [locateCurrent])

  useEffect(() => {
    if (!locationFix || !mapReady || !mapRef.current) return
    setCurrentLocationMarker(mapRef.current, locationFix.coord)
    if (!didAutoCenterRef.current) {
      didAutoCenterRef.current = true
      mapRef.current.flyTo({ center: locationFix.coord, zoom: locationFix.source === 'ip' ? 12 : 14 })
    }
  }, [locationFix, mapReady])

  const requestTerrain = () => new Promise<'trail' | 'road' | null>(resolve => setTerrainResolve(() => resolve))
  const requestStartPoint = () => new Promise<LngLat | null>(resolve => { setStartMsg(''); setStartResolve(() => resolve) })
  const requestRouteShape = () => new Promise<CourseRouteShape | null>(resolve => setRouteShapeResolve(() => resolve))

  const paintRoute = (r: RouteResult) => {
    const map = mapRef.current
    if (map) {
      setRouteLine(map, r.coordinates)
      setRouteTrafficAnalysis(map, r)
      if (r.coordinates[0]) setStartPin(map, r.coordinates[0])
      fitToCoords(map, r.coordinates)
    }
  }

  const publishRoute = (route: RouteResult) => {
    routesRef.current = [...routesRef.current, route]
    setRoutes(routesRef.current)
    setRouteIdx(routesRef.current.length - 1)
    paintRoute(route)
  }

  const updatePublishedTrafficAnalysis = (target: RouteResult, trafficAnalysis: RouteTrafficAnalysis) => {
    const index = routesRef.current.indexOf(target)
    if (index < 0) return
    const updated = { ...target, trafficAnalysis }
    routesRef.current = routesRef.current.map((route, routeIndex) => routeIndex === index ? updated : route)
    setRoutes([...routesRef.current])
    if (index === routesRef.current.length - 1) paintRoute(updated)
  }

  const analyzePublishedRouteTraffic = async (route: RouteResult) => {
    try {
      updatePublishedTrafficAnalysis(route, await analyzeTrafficWithRetry(route))
    } catch (error) {
      console.warn('[route] 自动交通岗分析不可用:', error)
      updatePublishedTrafficAnalysis(route, unavailableTrafficAnalysis(route))
    }
  }

  const startCourseRoute = async (course: CourseRouteRequest) => {
    setTrainingPlanOpen(false)
    setDocked(true)
    setCourseRouteMapMode(true)
    routesRef.current = []
    setRoutes([])
    setRouteIdx(0)
    if (mapRef.current) {
      clearRoute(mapRef.current)
      if (locationFix) mapRef.current.flyTo({ center: locationFix.coord, zoom: locationFix.source === 'ip' ? 12 : 14 })
    }
    setCourseRouteStatus({ phase: 'choosing', courseName: course.courseName, message: '请选择路线起点' })
    const start = await requestStartPoint()
    if (!start) {
      setCourseRouteStatus(null)
      setCourseRouteMapMode(false)
      setTrainingPlanOpen(true)
      return
    }
    setStartCoord(start)
    if (mapRef.current) {
      setStartPin(mapRef.current, start)
      mapRef.current.flyTo({ center: start, zoom: Math.max(mapRef.current.getZoom(), 14) })
    }
    setCourseRouteStatus({ phase: 'choosing', courseName: course.courseName, message: '请选择路线类型' })
    const shape = await requestRouteShape()
    if (!shape) {
      setCourseRouteStatus(null)
      setCourseRouteMapMode(false)
      setTrainingPlanOpen(true)
      return
    }
    setCourseRouteContext({ course, start, shape, variant: 0 })
    setCourseRouteStatus({ phase: 'generating', courseName: course.courseName, message: '正在比较多条候选路线…' })
    try {
      const route = await recommendCyclingRoute(start, course, shape, { variant: 0 })
      route.trafficAnalysis = pendingTrafficAnalysis(route)
      publishRoute(route)
      setCourseRouteStatus(null)
      void analyzePublishedRouteTraffic(route)
    } catch (error: any) {
      const provider = isInChina(start) ? 'amap' : 'ors'
      const message = String(error?.message ?? error)
      if (/Key|密钥/i.test(message)) {
        setRoutingSettingsRequest(current => ({ sequence: (current?.sequence ?? 0) + 1, provider }))
      }
      setCourseRouteStatus({ phase: 'error', courseName: course.courseName, message })
    }
  }

  const ctx: ToolContext = useMemo(() => ({
    runs: runs.current,
    onRunUpdated: (updatedRun: Run) => setRun(updatedRun),
    requestHeartRateSettings: () => setOpenHeartRateSettingsRequest(value => value + 1),
    onRoute: publishRoute,
    requestTerrain,
    requestStartPoint
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const goRoute = (i: number) => {
    if (i < 0 || i >= routes.length) return
    setRouteIdx(i)
    paintRoute(routes[i])
  }

  const { turns, busy, send, pushAssistant } = useChatAgent({ config, ctx, coachMode })
  // 卡片/选点活跃时是“等用户操作”，不算 AI 在思考；只有真正等模型时才显示输入动画
  const cardActive = !!(terrainResolve || startResolve || routeShapeResolve || picking)

  const currentStartContext = () => startCoord
    ? `已知当前定位坐标 ${JSON.stringify(startCoord)}（仅当用户明确要用当前位置/附近时直接用；否则起点未定，调 ask_start_point 让用户选）`
    : '当前定位不可用；起点未定，需要时调 ask_start_point 让用户选'

  const onSend = (text: string) => {
    if (!docked) setDocked(true)
    setPendingReview(null)
    void send(text, currentStartContext())
  }

  const onUpload = async (file: File) => {
    if (!docked) setDocked(true)
    const text = file.name.endsWith('.fit') ? '' : await file.text()
    const imported: Run = file.name.endsWith('.fit')
      ? await parseFitFile(await file.arrayBuffer(), file.name)
      : file.name.endsWith('.json') ? await parseJsonFile(text, file.name) : parseGpxFile(text, file.name)
    const parsed: Run = imported.activityType === 'cycling'
      ? {
          ...imported,
          heartRateReference: resolveCyclingHeartRateReference(heartRateProfile, imported.heartRateReference)
        }
      : imported
    runs.current.set(parsed.id, parsed)
    setRun(parsed)
    setDashboardOpen(false)
    const map = mapRef.current
    if (map) { const t = parsed.points.map(p => [p.lon, p.lat] as LngLat); setTrack(map, t); fitToCoords(map, t) }
    setPendingReview({
      runId: parsed.id,
      fileName: file.name,
      activityType: parsed.activityType,
      activityLabel: activityTypeLabel(parsed.activityType),
      distanceKm: (parsed.totalDistance / 1000).toFixed(2),
      duration: formatDuration(parsed.totalTime)
    })
  }

  const analyzeRide = async (file: File) => {
    await onUpload(file)
    setDashboardOpen(true)
  }

  const reviewUploadedRun = () => {
    if (!pendingReview) return
    const review = pendingReview
    const storedRun = runs.current.get(review.runId)
    if (!storedRun) {
      setPendingReview(null)
      pushAssistant('没有找到刚才导入的训练，请重新上传文件。')
      return
    }
    let uploadedRun = storedRun
    if (review.activityType === 'cycling' && !uploadedRun.heartRateReference) {
      const reference = resolveCyclingHeartRateReference(heartRateProfile)
      if (!reference) {
        setOpenHeartRateSettingsRequest(value => value + 1)
        pushAssistant('请先在右上角设置中填写骑行最大心率、骑行阈值心率，或年龄。保存后再开始 AI 复盘。')
        return
      }
      uploadedRun = { ...uploadedRun, heartRateReference: reference }
      runs.current.set(uploadedRun.id, uploadedRun)
      setRun(uploadedRun)
    }
    setPendingReview(null)
    const request = review.activityType === 'cycling'
      ? coachMode === 'health'
        ? `[上传骑行训练] ${review.fileName}，请按健康陪练方式复盘，用日常语言解释强度、身体得到的锻炼和下一次建议。`
        : `[上传骑行训练] ${review.fileName}，请按进阶训练方式复盘。心率强度区间只给 Z1-Z5 占比图表；再判断本次训练对续航、爬坡、冲刺的刺激，没有可靠功率时不显示冲刺。能力后直接给下一次训练建议。`
      : `[上传${review.activityLabel}训练] ${review.fileName}，请复盘`
    void send(
      request,
      `run_id=${review.runId}; activity_type=${review.activityType}`
    )
  }

  const onMapClick = (c: LngLat) => {
    if (picking) { setPendingPin(c); if (mapRef.current) setStartPin(mapRef.current, c) }
  }

  // 卡片回调
  const pickTerrain = (t: 'trail' | 'road') => { terrainResolve?.(t); setTerrainResolve(null) }
  const cancelTerrain = () => { terrainResolve?.(null); setTerrainResolve(null) }

  const pickCurrent = () => {
    if (locationFix) {
      applyLocationFix(locationFix, true)
      if (mapRef.current) setStartPin(mapRef.current, locationFix.coord)
      startResolve?.(locationFix.coord)
      setStartResolve(null)
      return
    }
    setStartMsg('正在定位…')
    void locateCurrent(true).then(fix => {
      if (fix) {
        if (mapRef.current) setStartPin(mapRef.current, fix.coord)
        startResolve?.(fix.coord)
        setStartResolve(null)
      }
      else { setStartMsg('定位失败了，请改用手动选点') }
    })
  }
  const focusCurrentLocation = () => {
    if (locationFix) applyLocationFix(locationFix, true)
    void locateCurrent(true)
  }
  const pickManual = () => { setPicking(true) }      // 隐藏起点卡、进入选点；startResolve 保留
  const cancelStart = () => { startResolve?.(null); setStartResolve(null); setPicking(false); setPendingPin(null) }
  const confirmPin = () => {
    if (pendingPin) {
      setStartCoord(pendingPin)
      startResolve?.(pendingPin)
      setStartResolve(null)
      setPicking(false)
      setPendingPin(null)
    }
  }
  const cancelPin = () => { setPendingPin(null) }    // 重新点
  const pickRouteShape = (shape: CourseRouteShape) => { routeShapeResolve?.(shape); setRouteShapeResolve(null) }
  const cancelRouteShape = () => { routeShapeResolve?.(null); setRouteShapeResolve(null) }

  const downloadGpx = () => {
    const r = routes[routeIdx]
    if (!r) return
    const blob = new Blob([routeToGpx(r, `${APP_NAME} 路线`)], { type: 'application/gpx+xml' })
    const a = document.createElement('a'); const url = URL.createObjectURL(blob)
    a.href = url; a.download = `${APP_SLUG}-route.gpx`; a.click(); URL.revokeObjectURL(url)
  }

  const returnToTrainingPlan = () => {
    setCourseRouteStatus(null)
    setCourseRouteMapMode(false)
    setTrainingPlanOpen(true)
  }

  const retryTrafficAnalysis = async () => {
    const current = routes[routeIdx]
    if (!current || trafficAnalysisRetrying) return
    setTrafficAnalysisRetrying(true)
    updatePublishedTrafficAnalysis(current, pendingTrafficAnalysis(current))
    try {
      const pendingRoute = routesRef.current[routeIdx]
      updatePublishedTrafficAnalysis(pendingRoute, await analyzeTrafficWithRetry(pendingRoute))
    } catch (error) {
      console.warn('[route] 重新分析交通岗失败:', error)
      const pendingRoute = routesRef.current[routeIdx]
      updatePublishedTrafficAnalysis(pendingRoute, unavailableTrafficAnalysis(pendingRoute))
    } finally {
      setTrafficAnalysisRetrying(false)
    }
  }

  const generateAlternativeCourseRoute = async () => {
    if (!courseRouteContext || courseRouteStatus?.phase === 'generating') return
    const next = { ...courseRouteContext, variant: courseRouteContext.variant + 1 }
    setCourseRouteContext(next)
    setCourseRouteStatus({ phase: 'generating', courseName: next.course.courseName, message: '正在生成另一条候选路线…' })
    try {
      const route = await recommendCyclingRoute(next.start, next.course, next.shape, { variant: next.variant })
      route.trafficAnalysis = pendingTrafficAnalysis(route)
      publishRoute(route)
      setCourseRouteStatus(null)
      void analyzePublishedRouteTraffic(route)
    } catch (error: any) {
      const provider = isInChina(next.start) ? 'amap' : 'ors'
      const message = String(error?.message ?? error)
      if (/Key|密钥/i.test(message)) {
        setRoutingSettingsRequest(current => ({ sequence: (current?.sequence ?? 0) + 1, provider }))
      }
      setCourseRouteStatus({ phase: 'error', courseName: next.course.courseName, message })
    }
  }

  return (
    <div className="app-root">
      <MapView onReady={m => { mapRef.current = m; setMapReady(true) }} onMapClick={onMapClick} picking={picking} />
      <DitherMapBackdrop active={!docked || !mapReady} mode={homeBackground} />
      {!docked && (
        <div className="home-wordmark" aria-hidden="true">
          <span>VIRTUAL</span>
          <span className="home-wordmark-accent">COACH</span>
        </div>
      )}

      <div className="top-right">
        <SettingsGear
          onSaved={setConfig}
          onHeartRateSaved={setHeartRateProfile}
          coachMode={coachMode}
          onCoachModeChange={setCoachMode}
          homeBackground={homeBackground}
          onHomeBackgroundChange={setHomeBackground}
          openHeartRateRequest={openHeartRateSettingsRequest}
          routingSettingsRequest={routingSettingsRequest}
        />
      </div>

      {mapReady && (
        <button
          className={`location-badge ${docked ? 'docked' : ''} ${locating ? 'loading' : ''} ${locationFix?.source === 'ip' ? 'rough' : ''}`}
          onClick={focusCurrentLocation}
          title="重新定位并回到当前位置"
        >
          <span className="location-glyph" aria-hidden="true" />
          <span className="location-copy">
            <strong>{locating ? '定位中' : locationFix ? '当前位置' : '定位未知'}</strong>
            <small>{locationError || formatAccuracy(locationFix)}</small>
          </span>
        </button>
      )}

      {terrainResolve && <TerrainCard onPick={pickTerrain} onCancel={cancelTerrain} />}
      {startResolve && !picking && <StartPointCard onCurrent={pickCurrent} onManual={pickManual} onCancel={cancelStart} message={startMsg} />}
      {routeShapeResolve && <RouteShapeCard onPick={pickRouteShape} onCancel={cancelRouteShape} />}
      {picking && !pendingPin && (
        <div className="pin-confirm">
          <span>在地图上点选起点…</span>
          <button onClick={cancelStart}>✗ 取消</button>
        </div>
      )}
      {picking && pendingPin && <PinConfirm onConfirm={confirmPin} onCancel={cancelPin} />}

      {routes[routeIdx] && (
        <div className="route-card" role="dialog" aria-label="路线预览">
          <div className="route-card-head">
            <h4>{routes[routeIdx].recommendation ? '课程路线预览' : '路线预览'}</h4>
            {routes.length > 1 && (
              <div className="route-nav">
                <button disabled={routeIdx === 0} onClick={() => goRoute(routeIdx - 1)}>←</button>
                <span>{routeIdx + 1}/{routes.length}</span>
                <button disabled={routeIdx === routes.length - 1} onClick={() => goRoute(routeIdx + 1)}>→</button>
              </div>
            )}
          </div>
          {routes[routeIdx].recommendation && (
            <div className="route-course-fit">
              <strong>{routes[routeIdx].recommendation.courseName}</strong>
              <b>{routes[routeIdx].recommendation.routeShape === 'loop' ? '骑行环线' : '单线往返'}</b>
              <span>{routes[routeIdx].recommendation.fitNote}</span>
            </div>
          )}
          <div className="row"><span>实际距离</span><b>{(routes[routeIdx].distanceM / 1000).toFixed(2)} km</b></div>
          {routes[routeIdx].provider && <div className="row"><span>路线引擎</span><b>{routes[routeIdx].provider === 'amap' ? '高德' : 'ORS'}</b></div>}
          {routes[routeIdx].ascentM !== undefined && <div className="row"><span>累计爬升</span><b>{Math.round(routes[routeIdx].ascentM as number)} m</b></div>}
          {routes[routeIdx].recommendation?.clearRoadKm !== undefined && (
            <div className="row"><span>连续训练段</span><b>约 {routes[routeIdx].recommendation.clearRoadKm} km</b></div>
          )}
          {routes[routeIdx].trafficAnalysis && (
            <div className={`route-traffic-analysis ${routes[routeIdx].trafficAnalysis.status}`}>
              <div className="route-map-legend">
                <span><i className="route-legend-line smooth" />顺畅训练段</span>
                <span><i className="route-legend-line normal" />普通路线</span>
                <span><i className="route-legend-signal" />交通岗</span>
              </div>
              {routes[routeIdx].trafficAnalysis.status === 'ready' ? (
                <>
                  <div className="row"><span>已标注交通岗</span><b>{routes[routeIdx].trafficAnalysis.signals.length} 处</b></div>
                  <div className="row"><span>最长连续顺畅段</span><b>{(routes[routeIdx].trafficAnalysis.longestClearM / 1000).toFixed(1)} km</b></div>
                  <div className="row"><span>课程要求</span><b>{(routes[routeIdx].trafficAnalysis.requiredClearM / 1000).toFixed(1)} km</b></div>
                </>
              ) : routes[routeIdx].trafficAnalysis.status === 'analyzing' ? (
                <div className="route-traffic-retry analyzing">
                  <span className="course-route-status-pulse" aria-hidden="true" />
                  <strong>正在自动分析交通岗…</strong>
                </div>
              ) : (
                <div className="route-traffic-retry">
                  <strong className="route-traffic-unavailable">交通岗数据暂不可用</strong>
                  <button type="button" disabled={trafficAnalysisRetrying} onClick={() => { void retryTrafficAnalysis() }}>
                    {trafficAnalysisRetrying ? '分析中…' : '重新分析'}
                  </button>
                </div>
              )}
              <small>{routes[routeIdx].trafficAnalysis.note}</small>
            </div>
          )}
          <p className="route-preview-hint">路线已绘制在地图上，可拖动或缩放查看道路细节。</p>
          <div className="card-btns">
            {routes[routeIdx].recommendation && (
              <button disabled={courseRouteStatus?.phase === 'generating'} onClick={() => { void generateAlternativeCourseRoute() }}>换一条</button>
            )}
            <button onClick={routes[routeIdx].recommendation ? returnToTrainingPlan : () => onSend('换一条')}>
              {routes[routeIdx].recommendation ? '返回课程' : '换一条'}
            </button>
            <button className="primary" onClick={downloadGpx}>下载 GPX</button>
          </div>
        </div>
      )}

      {run && <ReplayBar run={run} map={mapRef.current} onOpenDashboard={() => setDashboardOpen(true)} />}

      {run && dashboardOpen && <ActivityDashboard run={run} onClose={() => setDashboardOpen(false)} />}

      {courseRouteStatus && courseRouteStatus.phase !== 'choosing' && (
        <div className={`course-route-status ${courseRouteStatus.phase}`} role="status" aria-live="polite">
          <span className="course-route-status-pulse" aria-hidden="true" />
          <div>
            <strong>{courseRouteStatus.courseName}</strong>
            <span>{courseRouteStatus.message}</span>
          </div>
          {courseRouteStatus.phase === 'error' && (
            <button type="button" onClick={returnToTrainingPlan} aria-label="返回训练计划">×</button>
          )}
        </div>
      )}

      {trainingPlanMounted && (
        <TrainingPlanOverlay open={trainingPlanOpen} onClose={() => setTrainingPlanOpen(false)} onRecommendRoute={startCourseRoute} />
      )}

      <ChatDock
        turns={turns}
        docked={docked}
        mapFocused={courseRouteMapMode}
        thinking={busy && !cardActive}
        thinkingLabel="正在理解训练需求…"
        pendingReview={pendingReview}
        onReviewUploadedRun={reviewUploadedRun}
        onOpenDashboard={() => setDashboardOpen(true)}
        onDismissPendingReview={() => setPendingReview(null)}
        onOpenTrainingPlan={() => { setTrainingPlanMounted(true); setTrainingPlanOpen(true) }}
        onAnalyzeRide={file => { void analyzeRide(file) }}
        onSend={onSend}
        onUpload={onUpload}
      />
    </div>
  )
}
