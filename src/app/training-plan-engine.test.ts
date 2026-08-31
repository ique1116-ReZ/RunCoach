import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

type Course = {
  id: string
  t: string
  m: number
  zmax: number
  oo: boolean
}

type Engine = {
  C: Course[]
  adjust: (
    item: { course: Course; role: string; pickCtx: Record<string, unknown> },
    action: string,
    profile: Record<string, unknown>
  ) => { course: Course; note: string }
}

const loadEngine = (): Engine => {
  const html = readFileSync(new URL('../../public/cycling-training-plan.html', import.meta.url), 'utf8')
  const data = html.match(/<script id="d" type="application\/json">([\s\S]*?)<\/script>/)?.[1]
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])
  const source = scripts.find(script => script.includes('规则引擎排课  ENGINE'))
  if (!data || !source) throw new Error('无法从骑行训练计划页面加载规则引擎')

  const window: { ENG?: Engine } = {}
  vm.runInNewContext(source, {
    window,
    document: { getElementById: () => ({ textContent: data }) }
  })
  if (!window.ENG) throw new Error('骑行训练计划规则引擎未导出')
  return window.ENG
}

const adjustmentContext = {
  zoneCap: 5,
  flags: [],
  hasPower: true,
  hasTrainer: true,
  hasFtp: true,
  stableBase: true,
  weeks: 12,
  longestMin: 300,
  restBefore: true,
  goal: 'health'
}

const profile = {
  zoneCap: 5,
  sessionCap: 120,
  longCap: 300,
  input: {
    venue: 'outdoor',
    flags: [],
    hasPower: true,
    hasTrainer: true,
    sessionCap: 120
  }
}

describe('训练计划临时降档', () => {
  const engine = loadEngine()

  const adjust = (course: Course) => engine.adjust(
    { course, role: 'key', pickCtx: adjustmentContext },
    'easier',
    profile
  ).course

  it('节奏课点击“今天没状态”后必须换成有氧，而不是缩短成另一节节奏课', () => {
    const tempo = engine.C.find(course => course.t === 'tempo' && course.m === 45 && course.oo)
    expect(tempo).toBeTruthy()

    const easier = adjust(tempo as Course)
    expect(easier.t).toBe('endurance')
    expect(easier.zmax).toBeLessThanOrEqual(2)
    expect(easier.m).toBeLessThanOrEqual(45)
  })

  it('原本就是有氧课时继续降为轻松骑', () => {
    const endurance = engine.C.find(course => course.t === 'endurance' && course.m === 45 && course.oo)
    expect(endurance).toBeTruthy()

    const easier = adjust(endurance as Course)
    expect(easier.t).toBe('recovery')
    expect(easier.zmax).toBe(1)
  })
})
