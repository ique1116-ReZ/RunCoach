import { Composer } from './Composer'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export const ChatDock = ({ turns, docked, onSend, onUpload }: {
  turns: ChatTurn[]
  docked: boolean
  onSend: (t: string) => void
  onUpload: (f: File) => void
}) => (
  <div className={`chat-dock ${docked ? 'docked' : 'landing'}`}>
    {docked && (
      <div className="chat-msgs">
        {turns.map((t, i) => <div key={i} className={`bubble ${t.role}`}>{t.content}</div>)}
      </div>
    )}
    <Composer docked={docked} onSend={onSend} onUpload={onUpload} />
  </div>
)
