// src/app/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { MapView } from '@/map/MapView'
import { setCurrentLocationMarker, setRouteLine, setStartPin, setTrack, fitToCoords } from '@/map/layers'
import { ChatDock } from '@/chat/ChatDock'
import { useChatAgent } from '@/chat/useChatAgent'
import { SettingsGear } from '@/settings/SettingsGear'
import type { ToolContext } from '@/agent/tools'
import type { RouteResult, LngLat } from '@/routing/ors'
import { getIpLocation } from '@/routing/ip-location'
import { routeToGpx } from '@/export/gpx-export'
import { loadConfig, type LlmConfig } from '@/llm/provider'
import type { Run } from '@runs/types'
import { parseGpxFile } from '@runs/gpx'
import { parseFitFile } from '@runs/fit'
import { parseJsonFile } from '@runs/json'
import { TerrainCard } from './TerrainCard'
import { StartPointCard } from './StartPointCard'
import { PinConfirm } from './PinConfirm'
import { ReplayBar } from './ReplayBar'
import { DitherMapBackdrop } from './DitherMapBackdrop'
import { loadHomeBackground, type HomeBackground } from './preferences'
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
  distanceKm: string
  duration: string
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
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null)
  const [config, setConfig] = useState<LlmConfig | null>(loadConfig())
  const [homeBackground, setHomeBackground] = useState<HomeBackground>(loadHomeBackground())
  const runs = useRef<Map<string, Run>>(new Map())

  // 引导卡片 / 选点状态
  const [terrainResolve, setTerrainResolve] = useState<((t: 'trail' | 'road' | null) => void) | null>(null)
  const [startResolve, setStartResolve] = useState<((c: LngLat | null) => void) | null>(null)
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

  const paintRoute = (r: RouteResult) => {
    const map = mapRef.current
    if (map) { setRouteLine(map, r.coordinates); if (r.coordinates[0]) setStartPin(map, r.coordinates[0]); fitToCoords(map, r.coordinates) }
  }

  const ctx: ToolContext = useMemo(() => ({
    runs: runs.current,
    onRoute: (r: RouteResult) => {
      routesRef.current = [...routesRef.current, r]
      setRoutes(routesRef.current)
      setRouteIdx(routesRef.current.length - 1)
      paintRoute(r)
    },
    requestTerrain,
    requestStartPoint
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const goRoute = (i: number) => {
    if (i < 0 || i >= routes.length) return
    setRouteIdx(i)
    paintRoute(routes[i])
  }

  const { turns, busy, send } = useChatAgent({ config, ctx })
  // 卡片/选点活跃时是“等用户操作”，不算 AI 在思考；只有真正等模型时才显示输入动画
  const cardActive = !!(terrainResolve || startResolve || picking)

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
    const parsed: Run = file.name.endsWith('.fit')
      ? await parseFitFile(await file.arrayBuffer(), file.name)
      : file.name.endsWith('.json') ? await parseJsonFile(text, file.name) : parseGpxFile(text, file.name)
    runs.current.set(parsed.id, parsed)
    setRun(parsed)
    const map = mapRef.current
    if (map) { const t = parsed.points.map(p => [p.lon, p.lat] as LngLat); setTrack(map, t); fitToCoords(map, t) }
    setPendingReview({
      runId: parsed.id,
      fileName: file.name,
      distanceKm: (parsed.totalDistance / 1000).toFixed(2),
      duration: formatDuration(parsed.totalTime)
    })
  }

  const reviewUploadedRun = () => {
    if (!pendingReview) return
    const review = pendingReview
    setPendingReview(null)
    void send(`[上传训练] ${review.fileName}，请复盘`, `run_id=${review.runId}`)
  }

  const onMapClick = (c: LngLat) => {
    if (picking) { setPendingPin(c); if (mapRef.current) setStartPin(mapRef.current, c) }
  }

  // 卡片回调
  const pickTerrain = (t: 'trail' | 'road') => { terrainResolve?.(t); setTerrainResolve(null) }
  const cancelTerrain = () => { terrainResolve?.(null); setTerrainResolve(null) }

  const pickCurrent = () => {
    if (locationFix) { startResolve?.(locationFix.coord); setStartResolve(null); return }
    setStartMsg('正在定位…')
    void locateCurrent(true).then(fix => {
      if (fix) { startResolve?.(fix.coord); setStartResolve(null) }
      else { setStartMsg('定位失败了，请改用手动选点') }
    })
  }
  const focusCurrentLocation = () => {
    if (locationFix) applyLocationFix(locationFix, true)
    void locateCurrent(true)
  }
  const pickManual = () => { setPicking(true) }      // 隐藏起点卡、进入选点；startResolve 保留
  const cancelStart = () => { startResolve?.(null); setStartResolve(null); setPicking(false); setPendingPin(null) }
  const confirmPin = () => { if (pendingPin) { startResolve?.(pendingPin); setStartResolve(null); setPicking(false); setPendingPin(null) } }
  const cancelPin = () => { setPendingPin(null) }    // 重新点

  const downloadGpx = () => {
    const r = routes[routeIdx]
    if (!r) return
    const blob = new Blob([routeToGpx(r, 'RunCoach 路线')], { type: 'application/gpx+xml' })
    const a = document.createElement('a'); const url = URL.createObjectURL(blob)
    a.href = url; a.download = 'runcoach-route.gpx'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="app-root">
      <MapView onReady={m => { mapRef.current = m; setMapReady(true) }} onMapClick={onMapClick} picking={picking} />
      <DitherMapBackdrop active={!docked || !mapReady} mode={homeBackground} />
      {!docked && (
        <div className="home-logo" aria-hidden="true">
          <img src="/run-ai-coach-logo.png" alt="" />
        </div>
      )}

      <div className="top-right">
        <SettingsGear onSaved={setConfig} homeBackground={homeBackground} onHomeBackgroundChange={setHomeBackground} />
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
      {picking && !pendingPin && (
        <div className="pin-confirm">
          <span>在地图上点选起点…</span>
          <button onClick={cancelStart}>✗ 取消</button>
        </div>
      )}
      {picking && pendingPin && <PinConfirm onConfirm={confirmPin} onCancel={cancelPin} />}

      {routes[routeIdx] && (
        <div className="route-card">
          <div className="route-card-head">
            <h4>路线预览</h4>
            {routes.length > 1 && (
              <div className="route-nav">
                <button disabled={routeIdx === 0} onClick={() => goRoute(routeIdx - 1)}>←</button>
                <span>{routeIdx + 1}/{routes.length}</span>
                <button disabled={routeIdx === routes.length - 1} onClick={() => goRoute(routeIdx + 1)}>→</button>
              </div>
            )}
          </div>
          <div className="row"><span>实际距离</span><b>{(routes[routeIdx].distanceM / 1000).toFixed(2)} km</b></div>
          {routes[routeIdx].ascentM !== undefined && <div className="row"><span>累计爬升</span><b>{Math.round(routes[routeIdx].ascentM as number)} m</b></div>}
          <div className="card-btns">
            <button onClick={() => onSend('换一条')}>换一条</button>
            <button className="primary" onClick={downloadGpx}>下载 GPX</button>
          </div>
        </div>
      )}

      {run && <ReplayBar run={run} map={mapRef.current} />}

      <ChatDock
        turns={turns}
        docked={docked}
        thinking={busy && !cardActive}
        thinkingLabel="正在理解需求并准备跑步工具…"
        pendingReview={pendingReview}
        onReviewUploadedRun={reviewUploadedRun}
        onDismissPendingReview={() => setPendingReview(null)}
        onSend={onSend}
        onUpload={onUpload}
      />
    </div>
  )
}
