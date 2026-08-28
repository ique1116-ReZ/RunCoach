// src/app/ReplayBar.tsx
import { useState, useEffect, useMemo } from 'react'
import type maplibregl from 'maplibre-gl'
import type { Run } from '@runs/types'
import { sampleAtDistance, sampleAtTime } from '@runs/align'
import { setRunnerMarker } from '@/map/layers'
import type { LngLat } from '@/routing/ors'

const replaySpeeds = [1, 2, 4, 8]
const chartHeight = 52
const chartBottom = 48
const chartTop = 5

type ElevationPoint = {
  x: number
  y: number
  distance: number
  elevation: number
}

const classifyGrade = (grade?: number) => {
  if (grade === undefined || !Number.isFinite(grade)) return 'flat'
  if (grade > 2) return 'up'
  if (grade < -2) return 'down'
  return 'flat'
}

const gradeLabel = (grade?: number) => {
  const type = classifyGrade(grade)
  if (type === 'up') return '上坡'
  if (type === 'down') return '下坡'
  return '平路'
}

const formatElevation = (elevation?: number) => {
  if (elevation === undefined || !Number.isFinite(elevation)) return '--'
  return `${Math.round(elevation)} m`
}

const timeAtDistance = (run: Run, distance: number) => {
  const points = run.points
  if (points.length === 0) return 0
  const useTimerTimeline = points.every(point => point.timerTime !== undefined && Number.isFinite(point.timerTime))
  const timelineTime = (index: number) => useTimerTimeline ? points[index].timerTime as number : points[index].time
  if (distance <= 0) return timelineTime(0)
  if (distance >= run.totalDistance) return timelineTime(points.length - 1)

  let low = 0
  let high = points.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midDist = points[mid].distFromStart
    if (midDist === distance) return timelineTime(mid)
    if (midDist < distance) low = mid + 1
    else high = mid - 1
  }

  const right = points[low]
  const left = points[low - 1]
  if (!left || !right) return right ? timelineTime(low) : left ? timelineTime(low - 1) : timelineTime(0)

  const span = right.distFromStart - left.distFromStart
  if (span <= 0) return timelineTime(low)
  const ratio = (distance - left.distFromStart) / span
  return timelineTime(low - 1) + (timelineTime(low) - timelineTime(low - 1)) * ratio
}

export const ReplayBar = ({ run, map, onOpenDashboard }: { run: Run; map: maplibregl.Map | null; onOpenDashboard: () => void }) => {
  const [pct, setPct] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(8)
  const dist = run.totalDistance * pct
  const s = sampleAtDistance(run, dist)
  const isCycling = run.activityType === 'cycling'
  const elevationChart = useMemo(() => {
    if (run.totalDistance <= 0 || run.points.length < 2) return null

    const sampleCount = Math.min(120, Math.max(24, Math.round(run.points.length / 8)))
    const sampled = Array.from({ length: sampleCount }, (_, index) => {
      const ratio = sampleCount === 1 ? 0 : index / (sampleCount - 1)
      const point = sampleAtDistance(run, run.totalDistance * ratio)
      if (!point || point.elevation === undefined || !Number.isFinite(point.elevation)) return null
      return {
        distance: point.distFromStart,
        elevation: point.elevation
      }
    }).filter((point): point is { distance: number; elevation: number } => !!point)

    if (sampled.length < 2) return null

    const elevations = sampled.map(point => point.elevation)
    const min = Math.min(...elevations)
    const max = Math.max(...elevations)
    const range = Math.max(1, max - min)
    const points: ElevationPoint[] = sampled.map(point => ({
      distance: point.distance,
      elevation: point.elevation,
      x: (point.distance / run.totalDistance) * 100,
      y: chartBottom - ((point.elevation - min) / range) * (chartBottom - chartTop)
    }))
    const areaPath = `M ${points[0].x.toFixed(2)} ${chartBottom} ` +
      points.map(point => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ') +
      ` L ${points[points.length - 1].x.toFixed(2)} ${chartBottom} Z`

    return { points, min, max, areaPath }
  }, [run])

  const currentGrade = s?.grade ?? (() => {
    if (!elevationChart || elevationChart.points.length < 2) return undefined
    const nextIndex = elevationChart.points.findIndex(point => point.distance >= dist)
    const right = elevationChart.points[Math.max(1, nextIndex === -1 ? elevationChart.points.length - 1 : nextIndex)]
    const left = elevationChart.points[Math.max(0, elevationChart.points.indexOf(right) - 1)]
    const deltaDistance = right.distance - left.distance
    if (deltaDistance <= 0) return undefined
    return ((right.elevation - left.elevation) / deltaDistance) * 100
  })()
  const currentElevationY = elevationChart && s?.elevation !== undefined
    ? chartBottom - ((s.elevation - elevationChart.min) / Math.max(1, elevationChart.max - elevationChart.min)) * (chartBottom - chartTop)
    : null

  useEffect(() => {
    setPct(0)
    setPlaying(false)
  }, [run.id])

  useEffect(() => {
    if (!playing) return
    if (run.totalTime <= 0) {
      setPlaying(false)
      return
    }

    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const elapsed = now - last
      last = now
      setPct(current => {
        const currentDistance = current * run.totalDistance
        const nextTime = timeAtDistance(run, currentDistance) + elapsed * playbackSpeed
        const useTimerTimeline = run.points.every(point => point.timerTime !== undefined && Number.isFinite(point.timerTime))
        const lastPoint = run.points[run.points.length - 1]
        const lastTime = lastPoint ? (useTimerTimeline ? lastPoint.timerTime as number : lastPoint.time) : 0
        if (nextTime >= lastTime) {
          setPlaying(false)
          return 1
        }
        const nextSample = sampleAtTime(run, nextTime)
        if (!nextSample || run.totalDistance <= 0) return current
        return Math.min(1, Math.max(0, nextSample.distFromStart / run.totalDistance))
      })
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, playbackSpeed, run])

  useEffect(() => {
    if (s && map) setRunnerMarker(map, [s.lon, s.lat] as LngLat)
  }, [s?.lon, s?.lat, map])

  const pace = s?.speed
    ? `${Math.floor((1000 / s.speed) / 60)}:${String(Math.round((1000 / s.speed) % 60)).padStart(2, '0')}/km`
    : '--'
  const speedKmh = s?.speed !== undefined && Number.isFinite(s.speed)
    ? `${(s.speed * 3.6).toFixed(1)} km/h`
    : '--'

  const togglePlaying = () => {
    if (pct >= 1) setPct(0)
    setPlaying(value => !value)
  }

  return (
    <div className="replay-bar">
      <div className="replay-controls">
        <button
          type="button"
          className="replay-toggle"
          onClick={togglePlaying}
          aria-label={playing ? '暂停回放' : '播放回放'}
        >
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={pct}
          aria-label="回放进度"
          onChange={e => setPct(Number(e.target.value))}
        />
        <div className="replay-speed" aria-label="回放倍速">
          {replaySpeeds.map(speed => (
            <button
              key={speed}
              type="button"
              className={playbackSpeed === speed ? 'active' : ''}
              onClick={() => setPlaybackSpeed(speed)}
              aria-pressed={playbackSpeed === speed}
              title={speed === 1 ? '真实速度' : `${speed} 倍速`}
            >
              {speed === 1 ? '真速' : `${speed}x`}
            </button>
          ))}
        </div>
      </div>
      {elevationChart && (
        <div className={`elevation-panel ${classifyGrade(currentGrade)}`}>
          <div className="elevation-head">
            <span>{gradeLabel(currentGrade)}</span>
            <span>海拔 {formatElevation(s?.elevation)}</span>
          </div>
          <svg className="elevation-chart" viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none" aria-hidden="true">
            <path className="elevation-area" d={elevationChart.areaPath} />
            {elevationChart.points.slice(1).map((point, index) => {
              const prev = elevationChart.points[index]
              const deltaDistance = point.distance - prev.distance
              const grade = deltaDistance > 0 ? ((point.elevation - prev.elevation) / deltaDistance) * 100 : 0
              return (
                <line
                  key={`${point.distance}-${index}`}
                  className={`elevation-segment ${classifyGrade(grade)}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={point.x}
                  y2={point.y}
                />
              )
            })}
            <line className="elevation-cursor" x1={pct * 100} y1={chartTop} x2={pct * 100} y2={chartBottom} />
            {currentElevationY !== null && (
              <circle className="elevation-dot" cx={pct * 100} cy={currentElevationY} r="1.8" />
            )}
          </svg>
          <div className="elevation-scale">
            <span>{Math.round(elevationChart.min)} m</span>
            <span>{Math.round(elevationChart.max)} m</span>
          </div>
        </div>
      )}
      <div className="replay-live">
        <span>{(dist / 1000).toFixed(2)} km</span>
        <span>{isCycling ? `速度 ${speedKmh}` : `配速 ${pace}`}</span>
        {isCycling && s?.power !== undefined && <span>功率 {Math.round(s.power)} W</span>}
        {isCycling && s?.cadence !== undefined && <span>踏频 {Math.round(s.cadence)} rpm</span>}
        <span>心率 {s?.hr !== undefined ? Math.round(s.hr) : '--'}</span>
        <button type="button" className="replay-dashboard" onClick={onOpenDashboard}>数据看板</button>
      </div>
    </div>
  )
}
