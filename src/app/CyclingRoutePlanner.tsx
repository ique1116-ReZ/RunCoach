import { useEffect, useState, type FormEvent } from 'react'
import type { LngLat, RouteResult } from '@/routing/ors'
import { searchAmapPois, type Place, type PoiSuggestion } from '@/routing/cycling-trip'

const usePoiSuggestions = (query: string, enabled: boolean) => {
  const [items, setItems] = useState<PoiSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!enabled || query.trim().length < 2) { setItems([]); setLoading(false); setError(''); return }
    setItems([])
    setError('')
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => {
      setLoading(true)
      void searchAmapPois(query, undefined, { signal: controller.signal })
        .then(hits => { if (!controller.signal.aborted) setItems(hits) })
        .catch(cause => { if (!controller.signal.aborted) setError(String((cause as Error)?.message ?? cause)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 300)
    return () => { globalThis.clearTimeout(timer); controller.abort() }
  }, [query, enabled])
  return { items, loading, error }
}

export const CyclingRoutePlanner = ({ currentLocation, mapReady, mapPicking, pickedPoint, onPickMap, onClose, onPlan }: {
  currentLocation: LngLat | null
  mapReady: boolean
  mapPicking: 'start' | 'end' | null
  pickedPoint: { field: 'start' | 'end'; coord: LngLat; revision: number } | null
  onPickMap: (field: 'start' | 'end') => void
  onClose: () => void
  onPlan: (start: string | Place, end: string | Place, preferGreenway: boolean) => Promise<RouteResult[]>
}) => {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [startPoint, setStartPoint] = useState<Place | null>(null)
  const [endPoint, setEndPoint] = useState<Place | null>(null)
  const [useCurrent, setUseCurrent] = useState(false)
  const [preferGreenway, setPreferGreenway] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const startSearch = usePoiSuggestions(start, !startPoint && !useCurrent && !mapPicking)
  const endSearch = usePoiSuggestions(end, !endPoint && !mapPicking)

  useEffect(() => {
    if (!pickedPoint) return
    const place = { name: pickedPoint.field === 'start' ? '地图起点' : '地图终点', coord: pickedPoint.coord }
    const text = pickedPoint.field === 'start' ? '地图已选起点' : '地图已选终点'
    if (pickedPoint.field === 'start') { setStartPoint(place); setStart(text); setUseCurrent(false) }
    else { setEndPoint(place); setEnd(text) }
    setError('')
  }, [pickedPoint])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if ((!useCurrent && !start.trim()) || !end.trim()) { setError('请填写起点和终点'); return }
    if (useCurrent && !currentLocation) { setError('当前位置不可用，请手动填写起点'); return }
    setBusy(true)
    setError('')
    try {
      await onPlan(useCurrent ? { name: '当前位置', coord: currentLocation as LngLat } : startPoint ?? start.trim(), endPoint ?? end.trim(), preferGreenway)
      onClose()
    } catch (cause) {
      setError(String((cause as Error)?.message ?? cause))
    } finally {
      setBusy(false)
    }
  }

  if (mapPicking) return null

  return (
    <div className="cycling-planner-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <form className="cycling-planner" role="dialog" aria-modal="true" aria-label="生成骑行路线" onSubmit={event => { void submit(event) }}>
        <div className="choice-head"><span>生成骑行路线</span><button className="choice-x" type="button" onClick={onClose} disabled={busy} aria-label="关闭">✕</button></div>
        <label className="cycling-planner-field">起点 POI
          <input value={start} onChange={event => { setStart(event.target.value); setStartPoint(null) }} disabled={useCurrent || busy} placeholder="输入地点名，如人民广场" autoFocus autoComplete="off" />
        </label>
        {!startPoint && startSearch.items.length > 0 && !useCurrent && (
          <div className="cycling-poi-suggestions" role="listbox" aria-label="起点候选地点">
            {startSearch.items.map((item, index) => <button type="button" role="option" aria-selected="false" key={`${item.id}-${index}`} onClick={() => { setStartPoint({ name: [item.name, item.district].filter(Boolean).join(' · '), coord: item.coord }); setStart(item.name); setError('') }}><strong>{item.name}</strong><small>{item.district} {item.address}</small></button>)}
          </div>
        )}
        {startSearch.loading && <small className="cycling-poi-feedback">正在联想起点…</small>}
        {startSearch.error && <small className="cycling-planner-error">{startSearch.error}</small>}
        {startPoint && <small className="cycling-poi-selected">已选起点：{startPoint.name}</small>}
        <button className="cycling-planner-map-pick" type="button" disabled={!mapReady || busy} onClick={() => onPickMap('start')}>在地图上选起点</button>
        <label className="cycling-planner-check"><input type="checkbox" checked={useCurrent} disabled={!currentLocation || busy} onChange={event => setUseCurrent(event.target.checked)} />用当前位置作起点</label>
        <label className="cycling-planner-field">终点 POI
          <input value={end} onChange={event => { setEnd(event.target.value); setEndPoint(null) }} disabled={busy} placeholder="输入地点名，如世纪公园" autoComplete="off" />
        </label>
        {!endPoint && endSearch.items.length > 0 && (
          <div className="cycling-poi-suggestions" role="listbox" aria-label="终点候选地点">
            {endSearch.items.map((item, index) => <button type="button" role="option" aria-selected="false" key={`${item.id}-${index}`} onClick={() => { setEndPoint({ name: [item.name, item.district].filter(Boolean).join(' · '), coord: item.coord }); setEnd(item.name); setError('') }}><strong>{item.name}</strong><small>{item.district} {item.address}</small></button>)}
          </div>
        )}
        {endSearch.loading && <small className="cycling-poi-feedback">正在联想终点…</small>}
        {endSearch.error && <small className="cycling-planner-error">{endSearch.error}</small>}
        {endPoint && <small className="cycling-poi-selected">已选终点：{endPoint.name}</small>}
        <button className="cycling-planner-map-pick" type="button" disabled={!mapReady || busy} onClick={() => onPickMap('end')}>在地图上选终点</button>
        <label className="cycling-planner-check"><input type="checkbox" checked={preferGreenway} disabled={busy} onChange={event => setPreferGreenway(event.target.checked)} />优先含绿道名称的路线</label>
        <p className="cycling-planner-note">会比较高德返回的骑行路线。绿道偏好依据道路名称，不能保证全程绿道；出发前请核对现场通行情况。</p>
        {error && <p className="cycling-planner-error" role="alert">{error}</p>}
        <button className="cycling-planner-submit" type="submit" disabled={busy}>{busy ? '正在规划…' : '生成骑行路线'}</button>
      </form>
    </div>
  )
}
