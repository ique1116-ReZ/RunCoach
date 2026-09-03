import { useEffect, useMemo, useRef, useState } from 'react'

import {
  getLocalWorkoutFrameUrls,
  getWorkoutExercise,
  getWorkoutLicenseUrls,
  workoutExercises,
  type WorkoutExercise,
  type WorkoutExerciseType
} from './library'
import { equipmentLabels, exerciseTypeLabels, filterWorkoutLibrary, labelFor, muscleLabels } from './catalog'
import {
  filterWorkoutPlans,
  workoutPlans,
  workoutPlanFocusLabels,
  workoutPlanLevelLabels,
  workoutPlanPhaseLabels,
  workoutPlanSettingLabels,
  type WorkoutPlan,
  type WorkoutPlanFocus,
  type WorkoutPlanLevel,
  type WorkoutPlanSetting
} from './plans'

const PAGE_SIZE = 24
type LibraryView = 'plans' | 'exercises'

const ExercisePreview = ({ exercise, frameIndex, large = false }: {
  exercise: WorkoutExercise
  frameIndex: number
  large?: boolean
}) => {
  const frames = getLocalWorkoutFrameUrls(exercise.slug)
  if (!frames) return null

  return (
    <div className={`workout-preview ${large ? 'large' : ''}`}>
      <img
        src={frames[frameIndex]}
        alt={`${exercise.name} 动作预览，第 ${frameIndex + 1} 帧`}
        loading={large ? 'eager' : 'lazy'}
        decoding="async"
      />
      <span className="workout-frame-indicator" aria-hidden="true">
        {frames.map((_, index) => <i key={index} className={index === frameIndex ? 'active' : ''} />)}
      </span>
    </div>
  )
}

const ExerciseDetails = ({ exercise, frameIndex, onClose }: {
  exercise: WorkoutExercise
  frameIndex: number
  onClose: () => void
}) => {
  const licenses = getWorkoutLicenseUrls()

  return (
    <div className="workout-detail-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="workout-detail" role="dialog" aria-modal="true" aria-labelledby="workout-detail-title">
        <button type="button" className="workout-detail-close" onClick={onClose} aria-label="关闭动作详情">×</button>
        <ExercisePreview exercise={exercise} frameIndex={frameIndex} large />
        <div className="workout-detail-copy">
          <p className="workout-library-kicker">动作详情</p>
          <h2 id="workout-detail-title">{exercise.name}</h2>
          <code>{exercise.slug}</code>
          <dl className="workout-detail-facts">
            <div><dt>主要部位</dt><dd>{labelFor(exercise.primaryMuscle, muscleLabels)}</dd></div>
            <div><dt>辅助部位</dt><dd>{exercise.secondaryMuscles.length ? exercise.secondaryMuscles.map(muscle => labelFor(muscle, muscleLabels)).join(' · ') : '—'}</dd></div>
            <div><dt>器械</dt><dd>{labelFor(exercise.equipment, equipmentLabels)}</dd></div>
            <div><dt>训练方式</dt><dd>{exerciseTypeLabels[exercise.exerciseType]}</dd></div>
          </dl>
          <div className="workout-detail-frames" aria-label="动作三帧">
            {getLocalWorkoutFrameUrls(exercise.slug)?.map((url, index) => <img key={url} src={url} alt={`${exercise.name} 第 ${index + 1} 帧`} />)}
          </div>
          <p className="workout-license-note">
            插图由 Bryl Lim 创作，采用 CC BY-SA 4.0；部分动作源自 Everkinetic。
            <a href={licenses.attribution} target="_blank" rel="noreferrer">查看署名</a>
            <a href={licenses.assetLicense} target="_blank" rel="noreferrer">查看许可</a>
          </p>
        </div>
      </section>
    </div>
  )
}

const PlanArtwork = ({ plan, frameIndex, large = false }: { plan: WorkoutPlan; frameIndex: number; large?: boolean }) => {
  const featured = plan.exercises
    .filter(item => item.phase === 'main' || item.phase === 'accessory')
    .slice(0, large ? 4 : 3)
    .map(item => getWorkoutExercise(item.exerciseSlug))
    .filter((exercise): exercise is WorkoutExercise => Boolean(exercise))

  return (
    <div className={`workout-plan-art ${large ? 'large' : ''}`} aria-hidden="true">
      {featured.map(exercise => {
        const frame = getLocalWorkoutFrameUrls(exercise.slug)?.[frameIndex]
        return frame ? <img key={exercise.id} src={frame} alt="" loading={large ? 'eager' : 'lazy'} /> : null
      })}
      <span>{workoutPlanFocusLabels[plan.focus]}</span>
    </div>
  )
}

const PlanDetails = ({ plan, frameIndex, onClose }: { plan: WorkoutPlan; frameIndex: number; onClose: () => void }) => (
  <div className="workout-detail-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="workout-plan-detail" role="dialog" aria-modal="true" aria-labelledby="workout-plan-detail-title">
      <button type="button" className="workout-detail-close" onClick={onClose} aria-label="关闭训练计划">×</button>
      <header className="workout-plan-detail-head">
        <PlanArtwork plan={plan} frameIndex={frameIndex} large />
        <div>
          <p className="workout-library-kicker">{workoutPlanFocusLabels[plan.focus]} · {plan.durationMinutes} 分钟</p>
          <h2 id="workout-plan-detail-title">{plan.name}</h2>
          <p>{plan.summary}</p>
          <div className="workout-plan-badges">
            <span>{workoutPlanLevelLabels[plan.level]}</span>
            <span>{workoutPlanSettingLabels[plan.setting]}</span>
            <span>{plan.exercises.length} 个动作</span>
          </div>
        </div>
      </header>
      <div className="workout-plan-detail-scroll">
        <div className="workout-plan-method">
          <strong>执行建议</strong>
          <span>按顺序完成；“每侧”需左右都做。RPE 7–8 表示一组结束时约还能规范完成 2–3 次。</span>
        </div>
        <ol className="workout-plan-steps">
          {plan.exercises.map((item, index) => {
            const exercise = getWorkoutExercise(item.exerciseSlug)
            if (!exercise) return null
            const frame = getLocalWorkoutFrameUrls(exercise.slug)?.[frameIndex]

            return (
              <li key={`${item.exerciseSlug}-${index}`}>
                <span className="workout-plan-step-number">{String(index + 1).padStart(2, '0')}</span>
                {frame && <img src={frame} alt={`${exercise.name} 动作预览`} />}
                <span className="workout-plan-step-copy">
                  <small>{workoutPlanPhaseLabels[item.phase]} · {labelFor(exercise.primaryMuscle, muscleLabels)}</small>
                  <strong>{exercise.name}</strong>
                  {item.note && <em>{item.note}</em>}
                </span>
                <span className="workout-plan-prescription">
                  <b>{item.sets} 组 × {item.target}</b>
                  <small>休息 {item.restSeconds} 秒 · {item.intensity}</small>
                </span>
              </li>
            )
          })}
        </ol>
        <p className="workout-plan-safety">适用于无伤病的健康成年人。先用可控负荷熟悉动作；出现锐痛、眩晕或明显不适时停止。伤病、孕期或慢性病人群应先获得专业评估。</p>
      </div>
    </section>
  </div>
)

export const WorkoutLibrary = ({ onClose }: { onClose: () => void }) => {
  const exerciseSearchRef = useRef<HTMLInputElement>(null)
  const planSearchRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<LibraryView>('plans')
  const [query, setQuery] = useState('')
  const [primaryMuscle, setPrimaryMuscle] = useState('')
  const [equipment, setEquipment] = useState('')
  const [exerciseType, setExerciseType] = useState<WorkoutExerciseType | ''>('')
  const [planQuery, setPlanQuery] = useState('')
  const [planFocus, setPlanFocus] = useState<WorkoutPlanFocus | ''>('')
  const [planLevel, setPlanLevel] = useState<WorkoutPlanLevel | ''>('')
  const [planSetting, setPlanSetting] = useState<WorkoutPlanSetting | ''>('')
  const [page, setPage] = useState(1)
  const [frameIndex, setFrameIndex] = useState(0)
  const [selectedExercise, setSelectedExercise] = useState<WorkoutExercise | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<WorkoutPlan | null>(null)

  const muscles = useMemo(() => [...new Set(workoutExercises.map(exercise => exercise.primaryMuscle))].sort(), [])
  const equipmentOptions = useMemo(() => [...new Set(workoutExercises.map(exercise => exercise.equipment))].sort(), [])
  const filtered = useMemo(
    () => filterWorkoutLibrary(workoutExercises, { query, primaryMuscle, equipment, exerciseType }),
    [query, primaryMuscle, equipment, exerciseType]
  )
  const filteredPlans = useMemo(
    () => filterWorkoutPlans({ query: planQuery, focus: planFocus, level: planLevel, setting: planSetting }),
    [planQuery, planFocus, planLevel, planSetting]
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visibleExercises = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasExerciseFilters = Boolean(query || primaryMuscle || equipment || exerciseType)
  const hasPlanFilters = Boolean(planQuery || planFocus || planLevel || planSetting)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setFrameIndex(current => (current + 1) % 3), 720)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => { setPage(1) }, [query, primaryMuscle, equipment, exerciseType])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (selectedPlan) setSelectedPlan(null)
      else if (selectedExercise) setSelectedExercise(null)
      else onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, selectedExercise, selectedPlan])

  const resetExerciseFilters = () => {
    setQuery(''); setPrimaryMuscle(''); setEquipment(''); setExerciseType('')
    exerciseSearchRef.current?.focus()
  }
  const resetPlanFilters = () => {
    setPlanQuery(''); setPlanFocus(''); setPlanLevel(''); setPlanSetting('')
    planSearchRef.current?.focus()
  }

  return (
    <main className="workout-library-page">
      <section className="workout-library-panel" aria-labelledby="workout-library-title">
        <header className="workout-library-head">
          <div>
            <p className="workout-library-kicker">Strength Training · Program Studio</p>
            <h1 id="workout-library-title">力量训练中心</h1>
            <p>独立训练工具 · {workoutPlans.length} 套计划 · 302 个动作 · 906 帧本地预览</p>
          </div>
          <button type="button" className="workout-library-back" onClick={onClose}><span aria-hidden="true">←</span>返回教练</button>
        </header>

        <nav className="workout-library-tabs" aria-label="力量训练内容">
          <button type="button" className={view === 'plans' ? 'active' : ''} onClick={() => setView('plans')}>训练计划 <span>{workoutPlans.length}</span></button>
          <button type="button" className={view === 'exercises' ? 'active' : ''} onClick={() => setView('exercises')}>动作库 <span>{workoutExercises.length}</span></button>
        </nav>

        {view === 'plans' ? (
          <>
            <div className="workout-library-controls">
              <label className="workout-search-field"><span>搜索计划或动作</span><input ref={planSearchRef} type="search" value={planQuery} onChange={event => setPlanQuery(event.target.value)} placeholder="如 全身、核心、squat" /></label>
              <label><span>训练重点</span><select value={planFocus} onChange={event => setPlanFocus(event.target.value as WorkoutPlanFocus | '')}><option value="">全部重点</option>{Object.entries(workoutPlanFocusLabels).map(([focus, label]) => <option key={focus} value={focus}>{label}</option>)}</select></label>
              <label><span>训练水平</span><select value={planLevel} onChange={event => setPlanLevel(event.target.value as WorkoutPlanLevel | '')}><option value="">全部水平</option>{Object.entries(workoutPlanLevelLabels).map(([level, label]) => <option key={level} value={level}>{label}</option>)}</select></label>
              <label><span>训练条件</span><select value={planSetting} onChange={event => setPlanSetting(event.target.value as WorkoutPlanSetting | '')}><option value="">全部条件</option>{Object.entries(workoutPlanSettingLabels).map(([setting, label]) => <option key={setting} value={setting}>{label}</option>)}</select></label>
              <button type="button" className="workout-reset" onClick={resetPlanFilters} disabled={!hasPlanFilters}>重置</button>
            </div>
            <div className="workout-library-status" aria-live="polite"><span>找到 <strong>{filteredPlans.length}</strong> 套训练计划</span><span>普通健康成年人通用模板</span></div>
            <div className="workout-library-scroll">
              {filteredPlans.length ? (
                <div className="workout-plan-grid">
                  {filteredPlans.map(plan => (
                    <button key={plan.id} type="button" className="workout-plan-card" onClick={() => setSelectedPlan(plan)}>
                      <PlanArtwork plan={plan} frameIndex={frameIndex} />
                      <span className="workout-plan-card-copy">
                        <small>{workoutPlanFocusLabels[plan.focus]} · {String(plan.id.split('-').at(-1) ?? '').padStart(2, '0')}</small>
                        <strong>{plan.name}</strong><span>{plan.summary}</span>
                        <i><b>{plan.durationMinutes} 分钟</b><b>{workoutPlanLevelLabels[plan.level]}</b><b>{workoutPlanSettingLabels[plan.setting]}</b></i>
                      </span>
                    </button>
                  ))}
                </div>
              ) : <div className="workout-empty"><strong>没有匹配的计划</strong><p>换个关键词，或清除筛选条件再试。</p><button type="button" onClick={resetPlanFilters}>清除筛选</button></div>}
            </div>
          </>
        ) : (
          <>
            <div className="workout-library-controls">
              <label className="workout-search-field"><span>搜索动作或部位</span><input ref={exerciseSearchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="如 push-up、胸部、核心" /></label>
              <label><span>主要部位</span><select value={primaryMuscle} onChange={event => setPrimaryMuscle(event.target.value)}><option value="">全部部位</option>{muscles.map(muscle => <option key={muscle} value={muscle}>{labelFor(muscle, muscleLabels)}</option>)}</select></label>
              <label><span>器械</span><select value={equipment} onChange={event => setEquipment(event.target.value)}><option value="">全部器械</option>{equipmentOptions.map(option => <option key={option} value={option}>{labelFor(option, equipmentLabels)}</option>)}</select></label>
              <label><span>训练方式</span><select value={exerciseType} onChange={event => setExerciseType(event.target.value as WorkoutExerciseType | '')}><option value="">全部方式</option>{Object.entries(exerciseTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
              <button type="button" className="workout-reset" onClick={resetExerciseFilters} disabled={!hasExerciseFilters}>重置</button>
            </div>
            <div className="workout-library-status" aria-live="polite"><span>找到 <strong>{filtered.length}</strong> 个动作</span><span>第 {Math.min(page, totalPages)} / {totalPages} 页</span></div>
            <div className="workout-library-scroll">
              {visibleExercises.length ? (
                <div className="workout-grid">
                  {visibleExercises.map(exercise => (
                    <button key={exercise.id} type="button" className="workout-card" onClick={() => setSelectedExercise(exercise)} aria-label={`查看 ${exercise.name}，主要训练${labelFor(exercise.primaryMuscle, muscleLabels)}`}>
                      <ExercisePreview exercise={exercise} frameIndex={frameIndex} />
                      <span className="workout-card-copy"><strong>{exercise.name}</strong><span className="workout-card-meta"><b>{labelFor(exercise.primaryMuscle, muscleLabels)}</b><i>{labelFor(exercise.equipment, equipmentLabels)}</i></span><small>{exercise.secondaryMuscles.length ? `辅助：${exercise.secondaryMuscles.map(muscle => labelFor(muscle, muscleLabels)).join(' · ')}` : exerciseTypeLabels[exercise.exerciseType]}</small></span>
                    </button>
                  ))}
                </div>
              ) : <div className="workout-empty"><strong>没有匹配的动作</strong><p>换个关键词，或清除筛选条件再试。</p><button type="button" onClick={resetExerciseFilters}>清除筛选</button></div>}
            </div>
            {filtered.length > PAGE_SIZE && <footer className="workout-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>← 上一页</button><span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>下一页 →</button></footer>}
          </>
        )}

        {selectedExercise && <ExerciseDetails exercise={selectedExercise} frameIndex={frameIndex} onClose={() => setSelectedExercise(null)} />}
        {selectedPlan && <PlanDetails plan={selectedPlan} frameIndex={frameIndex} onClose={() => setSelectedPlan(null)} />}
      </section>
    </main>
  )
}
