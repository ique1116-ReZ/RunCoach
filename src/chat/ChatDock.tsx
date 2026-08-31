import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Composer } from './Composer'
import { APP_NAME } from '@/app/brand'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type PendingReviewNotice = {
  fileName: string
  activityLabel: string
  distanceKm: string
  duration: string
}

const landingPrompts = [
  '从当前位置生成一条 5 公里路跑环线',
  '帮我规划 8 公里轻松跑路线',
  '导入骑行训练，分析心率五区和能力刺激'
]

export const ChatDock = ({
  turns,
  docked,
  mapFocused = false,
  thinking,
  thinkingLabel = '正在思考…',
  pendingReview,
  onReviewUploadedRun,
  onOpenDashboard,
  onDismissPendingReview,
  onOpenTrainingPlan,
  onAnalyzeRide,
  onSend,
  onUpload
}: {
  turns: ChatTurn[]
  docked: boolean
  mapFocused?: boolean
  thinking?: boolean
  thinkingLabel?: string
  pendingReview?: PendingReviewNotice | null
  onReviewUploadedRun?: () => void
  onOpenDashboard?: () => void
  onDismissPendingReview?: () => void
  onOpenTrainingPlan: () => void
  onAnalyzeRide: (file: File) => void
  onSend: (t: string) => void
  onUpload: (f: File) => void
}) => {
  const msgsRef = useRef<HTMLDivElement>(null)
  const analysisFileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight })
  }, [turns, thinking, pendingReview])

  return (
    <div className={`chat-dock ${docked ? 'docked' : 'landing'} ${mapFocused ? 'map-focused' : ''}`} aria-hidden={mapFocused || undefined}>
      {!docked && (
        <div className="landing-intro">
          <div>
            <p className="landing-kicker">{APP_NAME}</p>
            <h1>今天想怎么练？</h1>
          </div>
          <button className="training-plan-launch" type="button" onClick={onOpenTrainingPlan}>
            <span className="training-plan-launch-icon" aria-hidden="true">↗</span>
            <span className="training-plan-launch-copy">
              <strong>生成骑行训练计划</strong>
              <small>按目标、时间和设备生成完整 12 周安排</small>
            </span>
            <span className="training-plan-launch-arrow" aria-hidden="true">→</span>
          </button>
          <button className="training-plan-launch ride-analysis-launch" type="button" onClick={() => analysisFileRef.current?.click()}>
            <span className="training-plan-launch-icon" aria-hidden="true">⌁</span>
            <span className="training-plan-launch-copy">
              <strong>单次骑行数据解析</strong>
              <small>导入 FIT、GPX 或 JSON，查看数据看板与训练复盘</small>
            </span>
            <span className="training-plan-launch-arrow" aria-hidden="true">→</span>
          </button>
          <input
            ref={analysisFileRef}
            type="file"
            accept=".fit,.gpx,.json"
            hidden
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) onAnalyzeRide(file)
              event.target.value = ''
            }}
          />
          <div className="prompt-chips" aria-label="快捷训练任务">
            {landingPrompts.map(prompt => (
              <button key={prompt} onClick={() => onSend(prompt)}>{prompt}</button>
            ))}
          </div>
        </div>
      )}
      {docked && (
        <div className="chat-msgs" ref={msgsRef}>
          {turns.map((t, i) => (
            <div key={i} className={`chat-row ${t.role}`}>
              <div className={`avatar ${t.role}`}>{t.role === 'user' ? '🙂' : '🏃'}</div>
              <div className={`bubble ${t.role}`}>
                {t.role === 'assistant'
                  ? <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown></div>
                  : t.content}
              </div>
            </div>
          ))}
          {pendingReview && (
            <div className="run-ready-card" role="status" aria-live="polite">
              <div className="run-ready-head">
                <span>训练已导入</span>
                {onDismissPendingReview && (
                  <button type="button" className="run-ready-close" onClick={onDismissPendingReview} aria-label="关闭导入提示">×</button>
                )}
              </div>
              <div className="run-ready-name" title={pendingReview.fileName}>{pendingReview.fileName}</div>
              <div className="run-ready-stats">
                <span>{pendingReview.activityLabel}</span>
                <span>{pendingReview.distanceKm} km</span>
                <span>{pendingReview.duration}</span>
              </div>
              <p>轨迹已在地图上，可播放回放、打开数据看板或开始 AI 复盘。</p>
              <div className="run-ready-actions">
                <button type="button" className="run-ready-action secondary" onClick={onOpenDashboard}>打开数据看板</button>
                <button type="button" className="run-ready-action" onClick={onReviewUploadedRun}>开始 AI 复盘</button>
              </div>
            </div>
          )}
          {thinking && (
            <div className="chat-row assistant">
              <div className="avatar assistant">🏃</div>
              <div className="bubble assistant typing" aria-live="polite">
                <span></span><span></span><span></span>
                <em>{thinkingLabel}</em>
              </div>
            </div>
          )}
        </div>
      )}
      <Composer docked={docked} onSend={onSend} onUpload={onUpload} />
    </div>
  )
}
