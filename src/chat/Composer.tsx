import { useEffect, useRef, useState } from 'react'

export const Composer = ({ docked, onSend, onUpload }: {
  docked: boolean
  onSend: (t: string) => void
  onUpload: (f: File) => void
}) => {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const submit = () => { const t = text.trim(); if (t) { onSend(t); setText('') } }
  const openFilePicker = () => {
    setMenuOpen(false)
    fileRef.current?.click()
  }

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <div className={`composer ${docked ? 'mini' : ''}`}>
      <div className="composer-actions" ref={actionsRef}>
        <button
          className={`plus ${menuOpen ? 'open' : ''}`}
          title="更多操作"
          aria-label="更多操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(open => !open)}
        >
          +
        </button>
        {menuOpen && (
          <div className="composer-menu" role="menu">
            <button className="composer-menu-item" role="menuitem" onClick={openFilePicker}>
              <span>导入 FIT / GPX</span>
              <small>支持 FIT、GPX、JSON</small>
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".gpx,.fit,.json" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }} />
      </div>
      <input className="composer-input" value={text} placeholder="问问跑步教练，或点 + 导入训练…"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit() }} />
      <button className="send" onClick={submit}>↑</button>
    </div>
  )
}
