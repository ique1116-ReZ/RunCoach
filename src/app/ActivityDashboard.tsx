import { useEffect, useMemo, useState } from 'react'
import type { Run } from '@runs/types'
import { activityTypeLabel } from '@runs/activity'
import { buildDashboardData, dashboardToCsv, type DashboardData, type DashboardSample } from '@/analysis/dashboard'

type ChartKey = 'speedKmh' | 'heartRate' | 'power' | 'cadence' | 'elevation'

type ChartDefinition = {
  key: ChartKey
  label: string
  unit: string
  color: string
}

const chartDefinitions: ChartDefinition[] = [
  { key: 'speedKmh', label: '速度', unit: 'km/h', color: '#7aa7ff' },
  { key: 'heartRate', label: '心率', unit: 'bpm', color: '#f2994a' },
  { key: 'power', label: '功率', unit: 'W', color: '#d5a2ff' },
  { key: 'cadence', label: '踏频', unit: 'rpm', color: '#36d399' },
  { key: 'elevation', label: '海拔', unit: 'm', color: '#f2c94c' }
]

const numberText = (value: number | undefined, decimals = 1) => {
  if (value === undefined || !Number.isFinite(value)) return '--'
  return value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

const formatDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  const seconds = Math.round(ms / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

const metricValue = (sample: DashboardSample, key: ChartKey) => sample[key]

const metricText = (data: DashboardData, key: ChartKey) => {
  if (key === 'speedKmh') return `${numberText(data.averageSpeedKmh)} km/h`
  if (key === 'heartRate') return `${numberText(data.averageHeartRate, 0)} bpm`
  if (key === 'power') return `${numberText(data.averagePower, 0)} W`
  if (key === 'cadence') return `${numberText(data.averageCadence, 0)} rpm`
  return `${numberText(data.maxElevation, 0)} m`
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const chartGeometry = (data: DashboardData, key: ChartKey, width: number, height: number) => {
  const values = data.samples.map(sample => metricValue(sample, key))
  const valid = values.filter((value): value is number => value !== undefined && Number.isFinite(value))
  if (valid.length < 2) return null

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = Math.max(1, max - min)
  const points: Array<{ x: number; y: number; value: number }> = []
  const segments: string[] = []
  let segment: string[] = []

  data.samples.forEach((sample, index) => {
    const value = metricValue(sample, key)
    if (value === undefined || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment.join(' '))
      segment = []
      return
    }
    const x = data.samples.length <= 1 ? 0 : (index / (data.samples.length - 1)) * width
    const y = height - ((value - min) / range) * height
    points.push({ x, y, value })
    segment.push(`${segment.length ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  })
  if (segment.length) segments.push(segment.join(' '))

  return { min, max, points, paths: segments }
}

const drawCanvasChart = (
  context: CanvasRenderingContext2D,
  data: DashboardData,
  metric: ChartDefinition,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const geometry = chartGeometry(data, metric.key, width, height)
  context.strokeStyle = '#25313d'
  context.lineWidth = 1
  context.font = '20px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillStyle = '#82909c'
  for (let i = 0; i <= 4; i += 1) {
    const gridY = y + (height * i) / 4
    context.beginPath()
    context.moveTo(x, gridY)
    context.lineTo(x + width, gridY)
    context.stroke()
    if (geometry) {
      const value = geometry.max - ((geometry.max - geometry.min) * i) / 4
      context.fillText(`${numberText(value)} ${metric.unit}`, x + width + 16, gridY + 7)
    }
  }
  if (!geometry) {
    context.fillStyle = '#82909c'
    context.fillText('该指标没有足够数据', x + 20, y + height / 2)
    return
  }
  context.strokeStyle = metric.color
  context.lineWidth = 5
  context.lineJoin = 'round'
  context.lineCap = 'round'
  for (const path of geometry.paths) {
    const commands = path.match(/[ML]\s[^ML]+/g) ?? []
    context.beginPath()
    commands.forEach((command, index) => {
      const [commandName, rawX, rawY] = command.trim().split(/\s+/)
      const pointX = x + Number(rawX)
      const pointY = y + Number(rawY)
      if (index === 0 || commandName === 'M') context.moveTo(pointX, pointY)
      else context.lineTo(pointX, pointY)
    })
    context.stroke()
  }
}

const exportDashboardPng = (data: DashboardData, metric: ChartDefinition) => {
  const canvas = document.createElement('canvas')
  canvas.width = 1800
  canvas.height = 1120
  const context = canvas.getContext('2d')
  if (!context) return false

  context.fillStyle = '#091016'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#f1f5f7'
  context.font = '700 44px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText('Virtual Coach', 80, 88)
  context.font = '700 34px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(data.name, 80, 148)
  context.fillStyle = '#9ca8b2'
  context.font = '22px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(`${activityTypeLabel(data.activityType)}  ·  ${data.sourcePath}`, 80, 188)

  const cards = [
    ['距离', `${numberText(data.totalDistanceKm, 2)} km`],
    ['时长', formatDuration(data.totalTimeMs)],
    [data.activityType === 'cycling' ? '平均速度' : '平均配速', data.activityType === 'cycling' ? `${numberText(data.averageSpeedKmh)} km/h` : data.averagePace ?? '--'],
    ['平均心率', `${numberText(data.averageHeartRate, 0)} bpm`],
    ...(data.averagePower !== undefined ? [['平均功率', `${numberText(data.averagePower, 0)} W`] as [string, string]] : []),
    ...(data.averageCadence !== undefined ? [['平均踏频', `${numberText(data.averageCadence, 0)} rpm`] as [string, string]] : [])
  ]
  const cardWidth = 260
  cards.forEach(([label, value], index) => {
    const cardX = 80 + index * (cardWidth + 18)
    context.fillStyle = '#111c24'
    context.fillRect(cardX, 230, cardWidth, 108)
    context.fillStyle = '#82909c'
    context.font = '20px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText(label, cardX + 20, 266)
    context.fillStyle = '#f1f5f7'
    context.font = '700 30px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText(value, cardX + 20, 313)
  })

  context.fillStyle = '#111c24'
  context.fillRect(80, 385, 1640, 555)
  context.fillStyle = '#f1f5f7'
  context.font = '700 28px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(`${metric.label}趋势`, 120, 435)
  context.fillStyle = '#9ca8b2'
  context.font = '20px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(metric.unit, 120, 468)
  drawCanvasChart(context, data, metric, 120, 505, 1450, 360)
  context.fillStyle = '#82909c'
  context.font = '20px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText('0 km', 120, 905)
  context.fillText(`${numberText(data.totalDistanceKm, 2)} km`, 1450, 905)

  const footer = '本看板由 Virtual Coach 在本地生成 · 原始数据未上传'
  context.fillStyle = '#82909c'
  context.font = '18px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(footer, 80, 1030)

  canvas.toBlob(blob => {
    if (blob) downloadBlob(blob, `${data.name || 'activity'}-virtual-coach-dashboard.png`)
  }, 'image/png')
  return true
}

export const ActivityDashboard = ({ run, onClose }: { run: Run; onClose: () => void }) => {
  const data = useMemo(() => buildDashboardData(run), [run])
  const availableCharts = useMemo(
    () => chartDefinitions.filter(definition => data.samples.some(sample => {
      const value = metricValue(sample, definition.key)
      return value !== undefined && Number.isFinite(value)
    })),
    [data]
  )
  const defaultChart = run.activityType === 'cycling'
    ? availableCharts.find(metric => metric.key === 'power') ?? availableCharts[0]
    : availableCharts.find(metric => metric.key === 'speedKmh') ?? availableCharts[0]
  const [activeKey, setActiveKey] = useState<ChartKey>(defaultChart?.key ?? 'speedKmh')
  const [exportNotice, setExportNotice] = useState('')
  const activeMetric = availableCharts.find(metric => metric.key === activeKey) ?? defaultChart
  const geometry = activeMetric ? chartGeometry(data, activeMetric.key, 1000, 280) : null

  useEffect(() => {
    if (activeMetric && activeMetric.key !== activeKey) setActiveKey(activeMetric.key)
  }, [activeKey, activeMetric])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const notifyExport = (message: string) => {
    setExportNotice(message)
    window.setTimeout(() => setExportNotice(''), 2600)
  }

  const handlePng = () => {
    if (!activeMetric || !exportDashboardPng(data, activeMetric)) return
    notifyExport('PNG 看板已导出')
  }

  const handleCsv = () => {
    downloadBlob(new Blob([dashboardToCsv(run)], { type: 'text/csv;charset=utf-8' }), `${data.name || 'activity'}-virtual-coach-data.csv`)
    notifyExport('CSV 数据已导出')
  }

  const summaryCards = [
    { label: '距离', value: `${numberText(data.totalDistanceKm, 2)} km`, tone: 'blue' },
    { label: '时长', value: formatDuration(data.totalTimeMs), tone: 'neutral' },
    data.activityType === 'cycling'
      ? { label: '平均速度', value: `${numberText(data.averageSpeedKmh)} km/h`, tone: 'blue' }
      : { label: '平均配速', value: data.averagePace ?? '--', tone: 'blue' },
    { label: '平均心率', value: `${numberText(data.averageHeartRate, 0)} bpm`, tone: 'orange' },
    ...(data.activityType === 'cycling' && data.averagePower !== undefined
      ? [{ label: '平均功率', value: `${numberText(data.averagePower, 0)} W`, tone: 'purple' }]
      : []),
    ...(data.averageCadence !== undefined
      ? [{ label: data.activityType === 'cycling' ? '平均踏频' : '平均步频', value: `${numberText(data.averageCadence, 0)} ${data.activityType === 'cycling' ? 'rpm' : 'spm'}`, tone: 'green' }]
      : []),
    ...(data.totalAscent !== undefined ? [{ label: '累计爬升', value: `${numberText(data.totalAscent, 0)} m`, tone: 'yellow' }] : [])
  ]

  return (
    <div className="dashboard-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dashboard-panel" role="dialog" aria-modal="true" aria-labelledby="dashboard-title">
        <header className="dashboard-head">
          <div className="dashboard-title-block">
            <div className="dashboard-kicker">Virtual Coach / 数据看板</div>
            <h2 id="dashboard-title">{data.name}</h2>
            <p>{activityTypeLabel(data.activityType)} · {data.sourcePath}</p>
          </div>
          <div className="dashboard-actions">
            <button type="button" onClick={handlePng} title="导出 PNG 图片">导出 PNG</button>
            <button type="button" onClick={handleCsv} title="导出 CSV 原始数据">导出 CSV</button>
            <button type="button" className="dashboard-close" onClick={onClose} aria-label="关闭数据看板">×</button>
          </div>
        </header>

        <div className="dashboard-summary" aria-label="训练概览">
          {summaryCards.map(card => (
            <div className={`dashboard-summary-card ${card.tone}`} key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>

        <div className="dashboard-layout">
          <section className="dashboard-chart-section" aria-label="训练趋势">
            <div className="dashboard-section-head">
              <div>
                <h3>训练趋势</h3>
                <p>按距离查看关键指标变化</p>
              </div>
              <div className="dashboard-tabs" role="tablist" aria-label="选择趋势指标">
                {availableCharts.map(metric => (
                  <button
                    type="button"
                    role="tab"
                    key={metric.key}
                    aria-selected={activeMetric?.key === metric.key}
                    className={activeMetric?.key === metric.key ? 'active' : ''}
                    onClick={() => setActiveKey(metric.key)}
                  >
                    <i style={{ backgroundColor: metric.color }} />{metric.label}
                  </button>
                ))}
              </div>
            </div>
            {activeMetric && geometry ? (
              <div className="dashboard-chart-wrap">
                <div className="dashboard-y-scale">
                  <span>{numberText(geometry.max)} {activeMetric.unit}</span>
                  <span>{numberText((geometry.max + geometry.min) / 2)} {activeMetric.unit}</span>
                  <span>{numberText(geometry.min)} {activeMetric.unit}</span>
                </div>
                <svg className="dashboard-chart" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-label={`${activeMetric.label}趋势图`} role="img">
                  {[0, 25, 50, 75, 100].map(value => <line key={`h-${value}`} className="dashboard-grid-line" x1="0" y1={5 + (value / 100) * 280} x2="1000" y2={5 + (value / 100) * 280} />)}
                  {[0, 25, 50, 75, 100].map(value => <line key={`v-${value}`} className="dashboard-grid-line vertical" x1={value * 10} y1="5" x2={value * 10} y2="285" />)}
                  {geometry.paths.map(path => <path key={path} d={path} className="dashboard-chart-line" style={{ stroke: activeMetric.color }} />)}
                </svg>
                <div className="dashboard-x-scale"><span>0 km</span><span>{numberText(data.totalDistanceKm, 2)} km</span></div>
              </div>
            ) : (
              <div className="dashboard-empty-chart">暂时没有足够的轨迹指标</div>
            )}
          </section>

          <aside className="dashboard-aside">
            <div className="dashboard-aside-section">
              <h3>关键指标</h3>
              <div className="dashboard-metric-list">
                {availableCharts.map(metric => (
                  <div className="dashboard-metric-row" key={metric.key}>
                    <span><i style={{ backgroundColor: metric.color }} />{metric.label}</span>
                    <strong>{metricText(data, metric.key)}</strong>
                  </div>
                ))}
                {data.totalAscent !== undefined && <div className="dashboard-metric-row"><span><i style={{ backgroundColor: '#f2c94c' }} />累计爬升</span><strong>{numberText(data.totalAscent, 0)} m</strong></div>}
              </div>
            </div>
            <div className="dashboard-aside-section dashboard-note">
              <h3>训练类型</h3>
              <strong>{activityTypeLabel(data.activityType)}</strong>
              <p>{data.activityType === 'cycling'
                ? '看板优先展示速度、功率、踏频和心率，适合检查输出稳定性与爬升段表现。'
                : data.activityType === 'running'
                  ? '看板优先展示配速、心率、步频和海拔，适合检查节奏稳定性与坡段变化。'
                  : '文件没有明确运动类型，指标按实际记录展示。'}
              </p>
            </div>
          </aside>
        </div>

        <footer className="dashboard-foot">
          <span>原始数据仅在当前浏览器处理</span>
          {exportNotice && <strong role="status">{exportNotice}</strong>}
        </footer>
      </section>
    </div>
  )
}
