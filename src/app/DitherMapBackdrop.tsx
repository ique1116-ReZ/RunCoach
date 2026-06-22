import { useEffect, useRef } from 'react'
import type { HomeBackground } from './preferences'

type DitherMapBackdropProps = {
  active: boolean
  mode: HomeBackground
}

type Point = { x: number; y: number }

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)
const bayer4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
]

const lineField = (value: number, width: number) => {
  const distance = Math.abs(value)
  return Math.exp(-(distance * distance) / width)
}

const lerpPoint = (a: Point, b: Point, av: number, bv: number, level: number): Point => {
  const t = Math.abs(bv - av) < 0.0001 ? 0.5 : (level - av) / (bv - av)
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  }
}

const drawSegment = (ctx: CanvasRenderingContext2D, a: Point, b: Point) => {
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
}

export const DitherMapBackdrop = ({ active, mode }: DitherMapBackdropProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: true })
    if (!canvas || !ctx) return

    let frame = 0
    let width = 0
    let height = 0
    let dpr = 1
    const mouse = { x: 0.5, y: 0.5, active: false }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 1.6)
      width = Math.max(1, Math.floor(rect.width * dpr))
      height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.width = width
      canvas.height = height
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = (event.clientX - rect.left) / rect.width
      mouse.y = (event.clientY - rect.top) / rect.height
      mouse.active = true
    }

    const onPointerLeave = () => {
      mouse.active = false
    }

    const heightField = (nx: number, ny: number, time: number) => {
      const hill = (cx: number, cy: number, radius: number, strength: number) => {
        const dx = nx - cx
        const dy = ny - cy
        return strength * Math.exp(-(dx * dx + dy * dy) / radius)
      }
      const base =
        hill(0.22 + 0.012 * Math.sin(time * 1.4), 0.78, 0.035, 1.25) +
        hill(0.63, 0.43 + 0.012 * Math.cos(time * 1.1), 0.055, 1.08) +
        hill(0.84, 0.72, 0.045, 0.8) +
        hill(0.18, 0.22, 0.06, 0.72) -
        hill(0.46, 0.55, 0.09, 0.5)
      const folds =
        0.18 * Math.sin((nx * 5.8 + ny * 2.2 + time * 0.38) * Math.PI) +
        0.12 * Math.sin((nx * -2.5 + ny * 6.4 - time * 0.28) * Math.PI) +
        0.08 * Math.cos((nx * 9.5 - ny * 3.4 + time * 0.18) * Math.PI)
      const dx = nx - mouse.x
      const dy = ny - mouse.y
      const mouseLift = mouse.active ? Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 0.18) * 0.22 : 0
      return base + folds + mouseLift
    }

    const drawMarkers = (time: number) => {
      const labels = [
        { x: 0.12, y: 0.38, text: '1200', rotate: -0.2 },
        { x: 0.31, y: 0.72, text: '2200', rotate: -0.34 },
        { x: 0.49, y: 0.48, text: '1600', rotate: 0.28 },
        { x: 0.66, y: 0.23, text: '1400', rotate: 0.08 },
        { x: 0.86, y: 0.43, text: '1000', rotate: -0.36 }
      ]
      ctx.save()
      ctx.font = `${11 * dpr}px "IBM Plex Mono", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(235, 240, 242, 0.68)'
      for (const label of labels) {
        ctx.save()
        ctx.translate(label.x * width, label.y * height)
        ctx.rotate(label.rotate + Math.sin(time + label.x * 4) * 0.02)
        ctx.fillText(label.text, 0, 0)
        ctx.restore()
      }

      const peaks = [
        { x: 0.22, y: 0.78, kind: 'peak' },
        { x: 0.63, y: 0.43, kind: 'peak' },
        { x: 0.25, y: 0.2, kind: 'cross' },
        { x: 0.73, y: 0.83, kind: 'cross' }
      ]
      ctx.strokeStyle = 'rgba(245, 247, 248, 0.72)'
      ctx.fillStyle = 'rgba(245, 247, 248, 0.88)'
      ctx.lineWidth = 1 * dpr
      for (const peak of peaks) {
        const x = peak.x * width
        const y = peak.y * height
        if (peak.kind === 'peak') {
          ctx.beginPath()
          ctx.moveTo(x, y - 5 * dpr)
          ctx.lineTo(x + 5 * dpr, y + 5 * dpr)
          ctx.lineTo(x - 5 * dpr, y + 5 * dpr)
          ctx.closePath()
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.moveTo(x - 6 * dpr, y)
          ctx.lineTo(x + 6 * dpr, y)
          ctx.moveTo(x, y - 6 * dpr)
          ctx.lineTo(x, y + 6 * dpr)
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    const drawDither = (time: number) => {
      const pixel = Math.max(3, Math.round(3.6 * dpr))
      const dot = Math.max(1, Math.round(pixel * 0.62))
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#020309'
      ctx.fillRect(0, 0, width, height)
      for (let y = 0; y < height; y += pixel) {
        const ny = y / height
        for (let x = 0; x < width; x += pixel) {
          const nx = x / width
          const bayer = bayer4[((x / pixel) & 3) + (((y / pixel) & 3) * 4)] / 16
          const waveA = Math.sin((nx * 3.1 + ny * 2.4 + time * 3) * Math.PI)
          const waveB = Math.sin((nx * -2.2 + ny * 4.8 - time * 2.1) * Math.PI)
          const waveC = Math.sin((Math.hypot(nx - 0.64, ny - 0.42) * 7.2 - time * 3.4) * Math.PI)
          const waveField = 0.5 + 0.5 * Math.sin((waveA * 0.9 + waveB * 0.72 + waveC * 0.52) * Math.PI)
          const river = lineField(ny - (0.34 + 0.065 * Math.sin(nx * 7.4 + time * 2.2)), 0.00025)
          const dx = nx - mouse.x
          const dy = ny - mouse.y
          const mouseWave = mouse.active
            ? Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 0.2) * (0.5 + 0.5 * Math.sin(Math.sqrt(dx * dx + dy * dy) * 42 - time * 30))
            : 0
          const value = clamp01(waveField * 0.82 + river * 0.14 + mouseWave * 0.28 - 0.2)
          const quantized = Math.floor(value * 4) / 3
          if (quantized <= 0.22 + bayer * 0.48) continue
          const alpha = clamp01(0.16 + quantized * 0.74)
          const shade = Math.round(120 + quantized * 130)
          ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`
          ctx.fillRect(x, y, dot, dot)
        }
      }
    }

    const drawContour = (time: number) => {
      const cell = Math.max(14, Math.round(18 * dpr))
      const cols = Math.ceil(width / cell) + 1
      const rows = Math.ceil(height / cell) + 1
      const values = new Float32Array(cols * rows)

      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#010203'
      ctx.fillRect(0, 0, width, height)

      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.52, 0, width * 0.5, height * 0.52, width * 0.72)
      vignette.addColorStop(0, 'rgba(18, 22, 24, 0.16)')
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.68)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, width, height)

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          values[y * cols + x] = heightField((x * cell) / width, (y * cell) / height, time)
        }
      }

      const levels = [-0.04, 0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92, 1.04, 1.16]
      for (let li = 0; li < levels.length; li += 1) {
        const level = levels[li]
        const major = li % 3 === 0
        ctx.beginPath()
        ctx.lineWidth = (major ? 1.15 : 0.62) * dpr
        ctx.strokeStyle = major ? 'rgba(238, 242, 243, 0.78)' : 'rgba(210, 216, 218, 0.26)'

        for (let gy = 0; gy < rows - 1; gy += 1) {
          for (let gx = 0; gx < cols - 1; gx += 1) {
            const x = gx * cell
            const y = gy * cell
            const p0 = { x, y }
            const p1 = { x: x + cell, y }
            const p2 = { x: x + cell, y: y + cell }
            const p3 = { x, y: y + cell }
            const v0 = values[gy * cols + gx]
            const v1 = values[gy * cols + gx + 1]
            const v2 = values[(gy + 1) * cols + gx + 1]
            const v3 = values[(gy + 1) * cols + gx]
            const points: Point[] = []
            if ((v0 < level) !== (v1 < level)) points.push(lerpPoint(p0, p1, v0, v1, level))
            if ((v1 < level) !== (v2 < level)) points.push(lerpPoint(p1, p2, v1, v2, level))
            if ((v2 < level) !== (v3 < level)) points.push(lerpPoint(p2, p3, v2, v3, level))
            if ((v3 < level) !== (v0 < level)) points.push(lerpPoint(p3, p0, v3, v0, level))
            if (points.length === 2) drawSegment(ctx, points[0], points[1])
            if (points.length === 4) {
              drawSegment(ctx, points[0], points[1])
              drawSegment(ctx, points[2], points[3])
            }
          }
        }
        ctx.stroke()
      }

      ctx.setLineDash([5 * dpr, 7 * dpr])
      ctx.strokeStyle = 'rgba(225, 230, 232, 0.22)'
      ctx.lineWidth = 0.7 * dpr
      ctx.beginPath()
      ctx.moveTo(width * 0.2, height * 0.12)
      ctx.bezierCurveTo(width * 0.34, height * 0.26, width * 0.4, height * 0.5, width * 0.57, height * 0.55)
      ctx.bezierCurveTo(width * 0.75, height * 0.6, width * 0.78, height * 0.36, width * 0.92, height * 0.28)
      ctx.stroke()
      ctx.setLineDash([])

      drawMarkers(time)
    }

    const draw = (timeMs: number) => {
      const time = timeMs * 0.00012
      if (mode === 'dither') drawDither(time)
      else drawContour(time)
      if (!reduceMotion) frame = requestAnimationFrame(draw)
    }

    resize()
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('resize', resize)
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', resize)
    }
  }, [active, mode])

  return <canvas ref={canvasRef} className={`dither-map-bg ${active ? 'active' : 'hidden'}`} aria-hidden="true" />
}
