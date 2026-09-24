import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildCapabilityTrainingDirection, type CapabilityAxis, type CapabilityExample, type CapabilityProfile, type TrainingGoalId } from '@/analysis/capability'
import { APP_NAME } from './brand'

const CENTER = 150
const RADIUS = 108
const AXIS_COUNT = 5

const statusText = {
  established: '已建立',
  tentative: '暂定',
  insufficient: '未达到条件'
} as const

const angleFor = (index: number) => (-Math.PI / 2) + (index * Math.PI * 2) / AXIS_COUNT
const pointFor = (index: number, radius: number) => ({
  x: CENTER + Math.cos(angleFor(index)) * radius,
  y: CENTER + Math.sin(angleFor(index)) * radius
})
const pointText = (point: { x: number; y: number }) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`
const axisPolygon = (radius: number) => Array.from({ length: AXIS_COUNT }, (_, index) => pointText(pointFor(index, radius))).join(' ')

const numberText = (value: number | undefined, decimals = 1) => {
  if (value === undefined || !Number.isFinite(value)) return '--'
  return value.toFixed(decimals).replace(/\.0+$/, '')
}

const exampleText = (example: CapabilityExample) =>
  `${example.date} · ${numberText(example.value)} ${example.unit}`

const validAxisIndexes = (axes: CapabilityAxis[]) => axes
  .map((axis, index) => axis.score === undefined ? undefined : index)
  .filter((index): index is number => index !== undefined)

export const CapabilityRadar = ({
  profile,
  fileNames,
  aiBusy,
  aiConfigured,
  aiStatus,
  aiText,
  parseWarning,
  onClose,
  onGenerateTrainingPlan
}: {
  profile: CapabilityProfile
  fileNames: string[]
  aiBusy?: boolean
  aiConfigured?: boolean
  aiStatus?: 'idle' | 'loading' | 'ready' | 'error'
  aiText?: string | null
  parseWarning?: string
  onClose: () => void
  onGenerateTrainingPlan?: (goalId: TrainingGoalId) => void
}) => {
  const validIndexes = validAxisIndexes(profile.axes)
  const allValid = validIndexes.length === AXIS_COUNT
  const direction = buildCapabilityTrainingDirection(profile)
  const resolvedAiStatus = aiStatus ?? (aiBusy ? 'loading' : aiConfigured ? 'idle' : 'error')
  const statusLabel = resolvedAiStatus === 'loading'
    ? 'AI 分析中'
    : resolvedAiStatus === 'ready'
      ? 'AI 分析完成'
      : resolvedAiStatus === 'error'
        ? '需要设置'
        : '等待分析'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="capability-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="capability-panel" role="dialog" aria-modal="true" aria-labelledby="capability-title">
        <header className="capability-head">
          <div>
            <div className="capability-kicker">{APP_NAME} / 能力画像</div>
            <h2 id="capability-title">五维能力雷达</h2>
            <p>基于本次导入的 {profile.eligibleRunCount} 份骑行 · 近 {profile.windowDays} 天真实表现</p>
          </div>
          <button type="button" className="capability-close" onClick={onClose} aria-label="关闭能力雷达">×</button>
        </header>

        <div className="capability-summary">
          <strong>{validIndexes.length}<span>/5</span></strong>
          <div>
            <b>个维度已形成事实分数</b>
            <small>只展示达到计算条件的维度，未满足条件的维度不补值。</small>
          </div>
          <div className="capability-ai-status" role="status" aria-live="polite">
            <i className={resolvedAiStatus === 'loading' ? 'active' : resolvedAiStatus === 'error' ? 'disabled' : ''} />
            {resolvedAiStatus === 'loading' ? 'AI 正在统一分析…' : resolvedAiStatus === 'ready' ? 'AI 分析已完成' : aiConfigured ? '等待 AI 分析' : '请先在设置中配置 AI Key'}
          </div>
        </div>

        <div className="capability-layout">
          <div className="capability-radar-card">
            <div className="capability-radar-stage">
              <svg viewBox="0 0 300 300" role="img" aria-label="五维能力雷达图">
                {[1, 0.75, 0.5, 0.25].map(level => (
                  <polygon key={level} className="capability-grid" points={axisPolygon(RADIUS * level)} />
                ))}
                {profile.axes.map((axis, index) => {
                  const outer = pointFor(index, RADIUS)
                  const label = pointFor(index, RADIUS + 22)
                  const anchor = label.x < CENTER - 15 ? 'end' : label.x > CENTER + 15 ? 'start' : 'middle'
                  return (
                    <g key={axis.id}>
                      <line className="capability-axis-line" x1={CENTER} y1={CENTER} x2={outer.x} y2={outer.y} />
                      <text className={`capability-axis-label ${axis.score === undefined ? 'muted' : ''}`} x={label.x} y={label.y} textAnchor={anchor}>
                        {axis.label}
                      </text>
                    </g>
                  )
                })}
                {allValid && (
                  <polygon
                    className="capability-area"
                    points={profile.axes.map((axis, index) => pointText(pointFor(index, RADIUS * ((axis.score ?? 0) / 10)))).join(' ')}
                  />
                )}
                {profile.axes.map((axis, index) => {
                  if (axis.score === undefined) return null
                  const point = pointFor(index, RADIUS * (axis.score / 10))
                  const nextIndex = (index + 1) % AXIS_COUNT
                  const nextAxis = profile.axes[nextIndex]
                  const nextPoint = nextAxis.score === undefined
                    ? null
                    : pointFor(nextIndex, RADIUS * (nextAxis.score / 10))
                  return (
                    <g key={`value-${axis.id}`}>
                      {nextPoint && <line className="capability-value-line" x1={point.x} y1={point.y} x2={nextPoint.x} y2={nextPoint.y} />}
                      <circle className="capability-value-point" cx={point.x} cy={point.y} r="4.5" />
                    </g>
                  )
                })}
                <circle className="capability-center" cx={CENTER} cy={CENTER} r="2.5" />
              </svg>
            </div>
            <div className="capability-radar-note">
              分数按 {profile.mappingVersion} 的参考分布映射；不展示排名或百分位。
            </div>
          </div>

          <div className="capability-axis-list">
            {profile.axes.map(axis => (
              <article className={`capability-axis-card ${axis.score === undefined ? 'insufficient' : ''}`} key={axis.id}>
                <div className="capability-axis-card-head">
                  <div>
                    <h3>{axis.label}</h3>
                    <p>{axis.description}</p>
                  </div>
                  {axis.score !== undefined ? (
                    <strong className="capability-score">{numberText(axis.score)}<small>/10</small></strong>
                  ) : (
                    <span className="capability-missing">未达到条件</span>
                  )}
                </div>
                <div className="capability-axis-meta">
                  <span className={`capability-status ${axis.status}`}>{statusText[axis.status]}</span>
                  {axis.score !== undefined && <span>{axis.measurements.filter(item => item.value !== undefined).length} 项事实</span>}
                </div>
                {axis.score === undefined ? (
                  <p className="capability-reason">{axis.missingReason}</p>
                ) : (
                  <div className="capability-measurements">
                    {axis.measurements.filter(item => item.value !== undefined).map(measurement => (
                      <div className="capability-measurement" key={measurement.id}>
                        <span>{measurement.label}</span>
                        <b>{numberText(measurement.value)} {measurement.unit}</b>
                        <small>{measurement.sampleDays} 个骑行日</small>
                      </div>
                    ))}
                    {axis.measurements.flatMap(item => item.examples).slice(0, 2).map((example, index) => (
                      <span className="capability-example" key={`${example.runId}-${example.date}-${index}`} title={example.fileName}>
                        {exampleText(example)}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        <section className={`capability-ai-analysis ${resolvedAiStatus}`} aria-labelledby="capability-ai-title">
          <header className="capability-ai-analysis-head">
            <div>
              <div className="capability-kicker">AI COACH / 下一步</div>
              <h3 id="capability-ai-title">AI 分析与训练方向</h3>
              <p>结合本批骑行事实，告诉你下一阶段该用哪个训练目标生成计划。</p>
            </div>
            <span className="capability-ai-analysis-state">{statusLabel}</span>
          </header>

          {resolvedAiStatus === 'loading' && (
            <div className="capability-ai-loading" role="status" aria-live="polite">
              <span className="capability-ai-loading-mark" aria-hidden="true">✦</span>
              <div>
                <strong>正在统一阅读 {profile.eligibleRunCount} 份骑行</strong>
                <span>会把已形成的能力分数、样本质量和未达到条件的维度分开判断。</span>
              </div>
            </div>
          )}

          {resolvedAiStatus === 'ready' && aiText && (
            <div className="capability-ai-copy">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiText}</ReactMarkdown>
            </div>
          )}

          {resolvedAiStatus === 'error' && (
            <div className="capability-ai-unavailable">
              <strong>{aiText || '暂时没有拿到 AI 文字分析。'}</strong>
              <span>{aiConfigured ? '可以稍后重新批量分析；下面的方向先根据雷达事实给出。' : '配置并测试 API Key 后重新批量导入，即可获得 AI 教练的统一分析。'}</span>
            </div>
          )}

          {resolvedAiStatus !== 'loading' && (
            <div className="capability-goal-direction">
              <div className="capability-goal-direction-head">
                <div>
                  <span className="capability-goal-kicker">建议训练方向</span>
                  <strong>{direction.headline}</strong>
                </div>
                <p>{direction.summary}</p>
              </div>
              <div className="capability-goal-list">
                {direction.goals.map(goal => (
                  <article className="capability-goal-card primary" key={goal.id}>
                    <div className="capability-goal-card-top">
                      <span>优先目标 · 单选</span>
                      <b>{goal.label}</b>
                    </div>
                    <p>{goal.reason}</p>
                    <div className="capability-goal-focus">
                      {goal.focusAxisIds.map(axisId => {
                        const axis = profile.axes.find(item => item.id === axisId)
                        return axis ? <span key={axis.id}>{axis.label}</span> : null
                      })}
                    </div>
                    <button type="button" onClick={() => onGenerateTrainingPlan?.(goal.id)}>
                      用这个目标生成计划 <span aria-hidden="true">→</span>
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        <footer className="capability-foot">
          <div>
            <span>已读取 {fileNames.length} 个文件</span>
            <span>有效骑行日 {profile.validActivityDays} 天</span>
            {parseWarning && <span className="warning">{parseWarning}</span>}
          </div>
          <button type="button" className="capability-foot-close" onClick={onClose}>返回教练对话</button>
        </footer>
      </section>
    </div>
  )
}
