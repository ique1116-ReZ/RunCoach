import { useRef, useState } from 'react'

export const Composer = ({ docked, onSend, onUpload }: {
  docked: boolean
  onSend: (t: string) => void
  onUpload: (f: File) => void
}) => {
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const submit = () => { const t = text.trim(); if (t) { onSend(t); setText('') } }
  return (
    <div className={`composer ${docked ? 'mini' : ''}`}>
      <button className="plus" title="上传 FIT/GPX" onClick={() => fileRef.current?.click()}>+</button>
      <input ref={fileRef} type="file" accept=".gpx,.fit,.json" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }} />
      <input className="composer-input" value={text} placeholder="问问跑步教练，或上传 FIT/GPX…"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }} />
      <button className="send" onClick={submit}>↑</button>
    </div>
  )
}
