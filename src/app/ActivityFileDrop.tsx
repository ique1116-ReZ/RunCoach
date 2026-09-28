import { useEffect, useRef, useState } from 'react'

export const ActivityFileDrop = ({ onImport }: { onImport: (file: File) => Promise<void> }) => {
  const importRef = useRef(onImport)
  const importing = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { importRef.current = onImport }, [onImport])

  useEffect(() => {
    let depth = 0
    let mounted = true
    const isFile = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const reset = () => { depth = 0; setDragging(false) }
    const enter = (event: DragEvent) => {
      if (!isFile(event)) return
      event.preventDefault()
      depth += 1
      setDragging(true)
    }
    const over = (event: DragEvent) => {
      if (!isFile(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = importing.current ? 'none' : 'copy'
    }
    const leave = (event: DragEvent) => {
      if (!isFile(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = async (event: DragEvent) => {
      if (!isFile(event)) return
      event.preventDefault()
      event.stopPropagation()
      reset()
      if (importing.current) return
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length !== 1) {
        setError('请每次拖入一个运动文件。')
        return
      }
      const file = files[0]
      if (!/\.(fit|gpx|json)$/i.test(file.name)) {
        setError('请拖入 FIT、GPX 或 JSON 运动文件。')
        return
      }
      setError('')
      importing.current = true
      setLoading(true)
      try {
        await importRef.current(file)
      } catch (cause) {
        if (mounted) setError(`导入失败：${cause instanceof Error ? cause.message : '无法读取文件，请重试。'}`)
      } finally {
        importing.current = false
        if (mounted) setLoading(false)
      }
    }
    window.addEventListener('dragenter', enter, true)
    window.addEventListener('dragover', over, true)
    window.addEventListener('dragleave', leave, true)
    window.addEventListener('drop', drop, true)
    window.addEventListener('dragend', reset)
    window.addEventListener('blur', reset)
    return () => {
      mounted = false
      window.removeEventListener('dragenter', enter, true)
      window.removeEventListener('dragover', over, true)
      window.removeEventListener('dragleave', leave, true)
      window.removeEventListener('drop', drop, true)
      window.removeEventListener('dragend', reset)
      window.removeEventListener('blur', reset)
    }
  }, [])

  return <>
    {(dragging || loading) && <div className="activity-file-drop" role="status">
      <div>
        <strong>{loading ? '正在读取运动文件…' : '松开文件，查看本次运动'}</strong>
        <span>支持 FIT / GPX / JSON</span>
      </div>
    </div>}
    {error && <div className="activity-file-drop-error" role="alert">
      <span>{error}</span>
      <button type="button" onClick={() => setError('')} aria-label="关闭导入提示">×</button>
    </div>}
  </>
}
