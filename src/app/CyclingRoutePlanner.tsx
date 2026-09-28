import { useEffect, useState, type FormEvent } from 'react'
import type { LngLat, RouteResult } from '@/routing/ors'
import { searchAmapPois, type Place, type PoiSuggestion } from '@/routing/cycling-trip'

const MAX_VIA_POINTS = 8

const usePoiSuggestions = (query: string, enabled: boolean) => {
  const [items, setItems] = useState<PoiSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  useEffect(() => {
    if (!enabled || query.trim().length < 2) { setItems([]); setLoading(false); setError(''); setSearched(false); return }
    setItems([])
    setLoading(false)
    setError('')
    setSearched(false)
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => {
      setLoading(true)
      void searchAmapPois(query, undefined, { signal: controller.signal })
        .then(hits => { if (!controller.signal.aborted) { setItems(hits); setSearched(true) } })
        .catch(cause => { if (!controller.signal.aborted) setError(String((cause as Error)?.message ?? cause)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { globalThis.clearTimeout(timer); controller.abort() }
  }, [query, enabled])
  return { items, loading, error, searched }
}

type ViaPoint = { id: number; text: string; place: Place | null }
type PickField = { field: 'start' | 'end' | 'via'; viaId?: number }
type PickedPoint = PickField & { coord: LngLat; revision: number }

export const CyclingRoutePlanner = ({ currentLocation, mapReady, mapPicking, pickedPoint, onPickMap, onClose, onPlan, onViaPointsChange }: {
  currentLocation: LngLat | null
  mapReady: boolean
  mapPicking: PickField | null
  pickedPoint: PickedPoint | null
  onPickMap: (field: PickField) => void
  onClose: () => void
  onPlan: (start: string | Place, end: string | Place, vias: Place[], preferGreenway: boolean) => Promise<RouteResult[]>
  onViaPointsChange: (points: LngLat[]) => void
}) => {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [startPoint, setStartPoint] = useState<Place | null>(null)
  const [endPoint, setEndPoint] = useState<Place | null>(null)
  const [vias, setVias] = useState<ViaPoint[]>([])
  const [nextViaId, setNextViaId] = useState(1)
  const [useCurrent, setUseCurrent] = useState(false)
  const [preferGreenway, setPreferGreenway] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const startSearch = usePoiSuggestions(start, !startPoint && !useCurrent && !mapPicking)
  const endSearch = usePoiSuggestions(end, !endPoint && !mapPicking)
  const viaSearches = [
    usePoiSuggestions(vias[0]?.text ?? '', !!vias[0] && !vias[0].place && mapPicking?.viaId !== vias[0].id),
    usePoiSuggestions(vias[1]?.text ?? '', !!vias[1] && !vias[1].place && mapPicking?.viaId !== vias[1].id),
    usePoiSuggestions(vias[2]?.text ?? '', !!vias[2] && !vias[2].place && mapPicking?.viaId !== vias[2].id),
    usePoiSuggestions(vias[3]?.text ?? '', !!vias[3] && !vias[3].place && mapPicking?.viaId !== vias[3].id),
    usePoiSuggestions(vias[4]?.text ?? '', !!vias[4] && !vias[4].place && mapPicking?.viaId !== vias[4].id),
    usePoiSuggestions(vias[5]?.text ?? '', !!vias[5] && !vias[5].place && mapPicking?.viaId !== vias[5].id),
    usePoiSuggestions(vias[6]?.text ?? '', !!vias[6] && !vias[6].place && mapPicking?.viaId !== vias[6].id),
    usePoiSuggestions(vias[7]?.text ?? '', !!vias[7] && !vias[7].place && mapPicking?.viaId !== vias[7].id)
  ]

  useEffect(() => {
    onViaPointsChange(vias.flatMap(via => via.place ? [via.place.coord] : []))
  }, [vias, onViaPointsChange])

  useEffect(() => {
    if (!pickedPoint) return
    const place: Place = { name: pickedPoint.field === 'start' ? '地图起点' : pickedPoint.field === 'end' ? '地图终点' : '地图途经点', coord: pickedPoint.coord }
    if (pickedPoint.field === 'start') { setStartPoint(place); setStart('地图已选起点'); setUseCurrent(false) }
    else if (pickedPoint.field === 'end') { setEndPoint(place); setEnd('地图已选终点') }
    else if (typeof pickedPoint.viaId === 'number') {
      setVias(current => current.map(via => via.id === pickedPoint.viaId ? { ...via, place, text: '地图已选途经点' } : via))
    }
    setError('')
  }, [pickedPoint])

  const chooseSuggestion = (field: 'start' | 'end' | 'via', suggestion: PoiSuggestion, viaId?: number) => {
    const place = { name: [suggestion.name, suggestion.district].filter(Boolean).join(' · '), coord: suggestion.coord }
    if (field === 'start') { setStartPoint(place); setStart(suggestion.name) }
    else if (field === 'end') { setEndPoint(place); setEnd(suggestion.name) }
    else if (typeof viaId === 'number') setVias(current => current.map(via => via.id === viaId ? { ...via, place, text: suggestion.name } : via))
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if ((!useCurrent && !start.trim()) || !end.trim()) { setError('请填写起点和终点'); return }
    if (useCurrent && !currentLocation) { setError('当前位置不可用，请手动填写起点'); return }
    const unresolvedVia = vias.find(via => !via.place)
    if (unresolvedVia) { setError(`请从联想列表选择途经点「${unresolvedVia.text}」，或在地图上选点`); return }
    setBusy(true)
    setError('')
    try {
      await onPlan(useCurrent ? { name: '当前位置', coord: currentLocation as LngLat } : startPoint ?? start.trim(), endPoint ?? end.trim(), vias.flatMap(via => via.place ? [via.place] : []), preferGreenway)
      onClose()
    } catch (cause) {
      setError(String((cause as Error)?.message ?? cause))
    } finally {
      setBusy(false)
    }
  }

  if (mapPicking) return null

  const renderSuggestions = (field: 'start' | 'end' | 'via', suggestions: ReturnType<typeof usePoiSuggestions>, viaId?: number, selected: boolean = false) => <>
    {!selected && suggestions.items.length > 0 && (
      <div className="cycling-poi-suggestions" role="listbox" aria-label="候选地点">
        {suggestions.items.map((item, index) => <button type="button" role="option" aria-selected="false" key={`${item.id}-${index}`} onClick={() => chooseSuggestion(field, item, viaId)}><strong>{item.name}</strong><small>{item.district} {item.address}</small></button>)}
      </div>
    )}
    {suggestions.loading && <small className="cycling-poi-feedback">正在搜索地点…</small>}
    {suggestions.error && <small className="cycling-planner-error" role="alert">{suggestions.error}</small>}
    {!selected && suggestions.searched && !suggestions.loading && !suggestions.error && suggestions.items.length === 0 && <small className="cycling-poi-feedback">没有匹配地点，请补充名称或在地图上选点</small>}
  </>

  return (
    <div className="cycling-planner-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <form className="cycling-planner" role="dialog" aria-modal="true" aria-label="生成骑行路线" onSubmit={event => { void submit(event) }}>
        <div className="choice-head"><span>生成骑行路线</span><button className="choice-x" type="button" onClick={onClose} disabled={busy} aria-label="关闭">✕</button></div>
        <label className="cycling-planner-field">起点 POI
          <input value={start} onChange={event => { setStart(event.target.value); setStartPoint(null) }} disabled={useCurrent || busy} placeholder="输入地点名，如人民广场" autoFocus autoComplete="off" />
        </label>
        {renderSuggestions('start', startSearch, undefined, !!startPoint || useCurrent)}
        {startPoint && <small className="cycling-poi-selected">已选起点：{startPoint.name}</small>}
        <button className="cycling-planner-map-pick" type="button" disabled={!mapReady || busy} onClick={() => onPickMap({ field: 'start' })}>在地图上选起点</button>
        <label className="cycling-planner-check"><input type="checkbox" checked={useCurrent} disabled={!currentLocation || busy} onChange={event => setUseCurrent(event.target.checked)} />用当前位置作起点</label>
        <label className="cycling-planner-field">终点 POI
          <input value={end} onChange={event => { setEnd(event.target.value); setEndPoint(null) }} disabled={busy} placeholder="输入地点名，如世纪公园" autoComplete="off" />
        </label>
        {renderSuggestions('end', endSearch, undefined, !!endPoint)}
        {endPoint && <small className="cycling-poi-selected">已选终点：{endPoint.name}</small>}
        <button className="cycling-planner-map-pick" type="button" disabled={!mapReady || busy} onClick={() => onPickMap({ field: 'end' })}>在地图上选终点</button>

        <div className="cycling-via-list">
          <div className="cycling-via-head"><strong>途经点（可选）</strong><button type="button" disabled={busy || vias.length >= MAX_VIA_POINTS} onClick={() => { setVias(current => [...current, { id: nextViaId, text: '', place: null }]); setNextViaId(value => value + 1) }}>＋ 添加途经点</button></div>
          {vias.map((via, index) => {
            const search = viaSearches[index]
            return <div className="cycling-via-item" key={via.id}>
              <label className="cycling-planner-field">途经点 {index + 1}
                <input value={via.text} disabled={busy} autoComplete="off" placeholder="输入公园、地铁站或道路名称" onChange={event => setVias(current => current.map(item => item.id === via.id ? { ...item, text: event.target.value, place: null } : item))} />
              </label>
              {renderSuggestions('via', search, via.id, !!via.place)}
              {via.place && <small className="cycling-poi-selected">已选途经点：{via.place.name}</small>}
              <div className="cycling-via-actions"><button className="cycling-planner-map-pick" type="button" disabled={!mapReady || busy} onClick={() => onPickMap({ field: 'via', viaId: via.id })}>地图选点</button><button type="button" className="cycling-via-remove" disabled={busy} onClick={() => setVias(current => current.filter(item => item.id !== via.id))}>删除</button></div>
            </div>
          })}
        </div>
        <label className="cycling-planner-check"><input type="checkbox" checked={preferGreenway} disabled={busy} onChange={event => setPreferGreenway(event.target.checked)} />优先含绿道名称的路线</label>
        <p className="cycling-planner-note">路线会依次经过所有途经点，再到达终点。途经点较多时规划会稍慢。绿道偏好依据道路名称，不能保证全程绿道；出发前请核对现场通行情况。</p>
        {error && <p className="cycling-planner-error" role="alert">{error}</p>}
        <button className="cycling-planner-submit" type="submit" disabled={busy}>{busy ? '正在规划…' : '生成骑行路线'}</button>
      </form>
    </div>
  )
}
