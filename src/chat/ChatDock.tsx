import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Composer } from './Composer'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

const landingPrompts = [
  '从当前位置生成一条 5 公里路跑环线',
  '帮我规划 8 公里轻松跑路线',
  '导入训练后帮我复盘配速和心率'
]

export const ChatDock = ({ turns, docked, thinking, thinkingLabel = '正在思考…', onSend, onUpload }: {
  turns: ChatTurn[]
  docked: boolean
  thinking?: boolean
  thinkingLabel?: string
  onSend: (t: string) => void
  onUpload: (f: File) => void
}) => {
  const msgsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight })
  }, [turns, thinking])

  return (
    <div className={`chat-dock ${docked ? 'docked' : 'landing'}`}>
      {!docked && (
        <div className="landing-intro">
          <div>
            <p className="landing-kicker">RunCoach</p>
            <h1>今天想怎么跑？</h1>
          </div>
          <div className="prompt-chips" aria-label="快捷跑步任务">
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
