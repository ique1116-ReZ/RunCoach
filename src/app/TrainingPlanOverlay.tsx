import { useEffect, useRef, useState } from 'react'
import type { CourseRouteRequest } from '@/routing/cycling-route'

export const TrainingPlanOverlay = ({ open, onClose, onRecommendRoute }: {
  open: boolean
  onClose: () => void
  onRecommendRoute: (course: CourseRouteRequest) => void
}) => {
  const [loaded, setLoaded] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return
      if (event.data?.type !== 'virtualcoach:recommend-course-route') return
      const course = event.data.course as CourseRouteRequest | undefined
      if (!course || typeof course.courseName !== 'string' || !(course.targetDistanceKm > 0)) return
      onRecommendRoute(course)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onRecommendRoute])

  return (
    <div className={`training-plan-backdrop ${open ? '' : 'hidden'}`} role="presentation" aria-hidden={!open} onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="training-plan-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-plan-title"
      >
        <header className="training-plan-toolbar">
          <div className="training-plan-heading">
            <span className="training-plan-mark" aria-hidden="true">↗</span>
            <div>
              <strong id="training-plan-title">骑行训练计划</strong>
              <small>设置目标与时间，生成完整 12 周安排</small>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭训练计划">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        {!loaded && <div className="training-plan-loading" role="status">正在载入计划引擎…</div>}
        <iframe
          ref={frameRef}
          className={loaded ? 'loaded' : ''}
          src={`${import.meta.env.BASE_URL}cycling-training-plan.html`}
          title="骑行训练计划生成器"
          onLoad={() => setLoaded(true)}
        />
      </section>
    </div>
  )
}
