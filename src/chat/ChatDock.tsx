import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Composer } from './Composer'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export const ChatDock = ({ turns, docked, thinking, onSend, onUpload }: {
  turns: ChatTurn[]
  docked: boolean
  thinking?: boolean
  onSend: (t: string) => void
  onUpload: (f: File) => void
}) => {
  const msgsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight })
  }, [turns, thinking])

  return (
    <div className={`chat-dock ${docked ? 'docked' : 'landing'}`}>
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
              <div className="bubble assistant typing"><span></span><span></span><span></span></div>
            </div>
          )}
        </div>
      )}
      <Composer docked={docked} onSend={onSend} onUpload={onUpload} />
    </div>
  )
}
