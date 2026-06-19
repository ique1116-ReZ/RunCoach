# 路线生成体验升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 RunCoach 路线生成加上 GPX 海拔、越野/路跑 profile 分流，并把起点选择改成 AI 引导式卡片（地形卡 / 起点卡 / 大头针确认）。

**Architecture:** 纯前端 React+TS+Vite。ors.ts 保留 ORS 返回的高程并支持 `foot-walking`/`foot-hiking` 双 profile；agent 通过两个"返回 Promise 的交互工具"（`ask_run_terrain`/`ask_start_point`）向用户弹卡片提问，App 用 state 暂存 resolver、卡片按钮 resolve；信息齐全则零卡片直接生成。

**Tech Stack:** React 19, TypeScript(strict), Vite, MapLibre GL, OpenRouteService, Vitest。

## Global Constraints

- 纯前端，外部 API 浏览器直连 fetch。
- TypeScript strict: true。
- ORS `elevation: true`（已开）；profile：`foot-walking`(路跑) / `foot-hiking`(越野)。
- 实际距离/高程如实输出，不伪装。
- 所有外部调用显式 try/catch，错误可见可读，绝不静默吞掉。
- 工具执行错误返回 `{error}` JSON，不抛未捕获异常给上层。
- CSS 禁止 box-shadow，扁平 1px 描边。
- 中文回复；越界严格拒绝。
- 路径别名：`@/* → src/*`、`@runs/* → src/runs/*`。
- UI 任务无单测，以 `npx tsc --noEmit`（零错误）+ `npm run build` 为门。

---

## File Structure

- `src/routing/ors.ts` — 加 `elevations`、`RunProfile`、profile 透传（Task 1、3）
- `src/export/gpx-export.ts` — 写 `<ele>`（Task 2）
- `src/agent/tools.ts` — 新增 `ask_run_terrain`/`ask_start_point`、route 工具加 `terrain`、ToolContext 加处理器（Task 4）
- `src/agent/coach.ts` — 系统提示词（Task 5）
- `src/app/TerrainCard.tsx`、`src/app/StartPointCard.tsx`、`src/app/PinConfirm.tsx` — 新组件（Task 6）
- `src/app/App.tsx`、`src/map/MapView.tsx`、`src/app/styles.css` — 集成 + 选点光标 + 卡片样式、删三段器（Task 7）
- 清理死 CSS + 文档 + 验收（Task 8）

---

## Task 1: ors.ts 解析保留高程

**Files:**
- Modify: `src/routing/ors.ts`
- Test: `src/routing/ors.test.ts`

**Interfaces:**
- Produces: `RouteResult` 增加 `elevations?: number[]`；`parseGeoJson` 在几何点为 3D 时填充 `elevations`（与 `coordinates` 等长），否则 `undefined`。

- [ ] **Step 1: 写失败测试**

```ts
// 追加到 src/routing/ors.test.ts（顶部已 import { parseGeoJson } from './ors'）
describe('parseGeoJson 高程', () => {
  it('3D 坐标时收集 elevations', () => {
    const json = { features: [{
      geometry: { coordinates: [[121.5, 31.2, 4], [121.51, 31.21, 6.5]] },
      properties: { summary: { distance: 1000, ascent: 3 } }
    }] }
    const r = parseGeoJson(json, 'loop')
    expect(r.coordinates).toEqual([[121.5, 31.2], [121.51, 31.21]])
    expect(r.elevations).toEqual([4, 6.5])
  })
  it('2D 坐标时 elevations 为 undefined', () => {
    const json = { features: [{ geometry: { coordinates: [[1, 2], [3, 4]] }, properties: { summary: {} } }] }
    expect(parseGeoJson(json, 'loop').elevations).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: FAIL（`elevations` 未定义/不相等）。

- [ ] **Step 3: 实现**

把 `RouteResult` 改为：

```ts
export type RouteResult = {
  kind: 'loop' | 'point_to_point'
  coordinates: LngLat[]
  distanceM: number
  ascentM?: number
  elevations?: number[]
}
```

把 `parseGeoJson` 的 return 前增加高程收集，并加入返回对象：

```ts
  const raw: number[][] = feature.geometry.coordinates
  const has3d = raw.some(c => c.length >= 3 && Number.isFinite(c[2]))
  const elevations = has3d ? raw.map(c => c[2]) : undefined
  const summary = feature.properties?.summary ?? {}
  return {
    kind,
    coordinates,
    distanceM: Number(summary.distance ?? 0),
    ascentM: summary.ascent !== undefined ? Number(summary.ascent) : undefined,
    elevations
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: PASS（含原有用例）。

- [ ] **Step 5: Commit**

```bash
git add src/routing/ors.ts src/routing/ors.test.ts
git commit -m "feat(routing): keep ORS per-point elevation in RouteResult"
```

---

## Task 2: GPX 写入 `<ele>`

**Files:**
- Modify: `src/export/gpx-export.ts`
- Test: `src/export/gpx-export.test.ts`

**Interfaces:**
- Consumes: `RouteResult.elevations`（Task 1）
- Produces: `routeToGpx` 在该点有有限高程时输出 `<ele>{value}</ele>`。

- [ ] **Step 1: 写失败测试**

```ts
// 追加到 src/export/gpx-export.test.ts
describe('routeToGpx 高程', () => {
  it('有 elevations 时写 <ele>', () => {
    const xml = routeToGpx({ kind: 'loop', coordinates: [[121.5, 31.2], [121.51, 31.21]], distanceM: 1000, elevations: [4, 6.5] } as any, 'ele 路线')
    expect(xml).toContain('<ele>4</ele>')
    expect(xml).toContain('<ele>6.5</ele>')
  })
  it('无 elevations 时不写 <ele>', () => {
    const xml = routeToGpx({ kind: 'loop', coordinates: [[121.5, 31.2]], distanceM: 100 } as any, 'x')
    expect(xml).not.toContain('<ele>')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/export/gpx-export.test.ts`
Expected: FAIL（无 `<ele>`）。

- [ ] **Step 3: 实现**

把 `routeToGpx` 的 map 体改为：

```ts
  const pts = route.coordinates
    .map(([lon, lat], i) => {
      const time = new Date(start + i * 2000).toISOString()
      const ele = route.elevations?.[i]
      const eleTag = ele !== undefined && Number.isFinite(ele) ? `<ele>${ele}</ele>` : ''
      return `      <trkpt lat="${lat}" lon="${lon}">${eleTag}<time>${time}</time></trkpt>`
    })
    .join('\n')
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/export/gpx-export.test.ts`
Expected: PASS（含原有往返用例）。

- [ ] **Step 5: Commit**

```bash
git add src/export/gpx-export.ts src/export/gpx-export.test.ts
git commit -m "feat(export): write <ele> to GPX when elevations present"
```

---

## Task 3: ors.ts profile（越野/路跑）

**Files:**
- Modify: `src/routing/ors.ts`
- Test: `src/routing/ors.test.ts`

**Interfaces:**
- Produces:
  - `type RunProfile = 'foot-walking' | 'foot-hiking'`
  - `postOrs(body: object, profile?: RunProfile)` — URL 用 `…/v2/directions/${profile}/geojson`
  - `generateLoopRoute(start, distanceKm, profile?: RunProfile, seed?, deps?)`
  - `generatePointToPointRoute(start, end, profile?: RunProfile, deps?)`

- [ ] **Step 1: 写失败测试 + 更新既有调用**

新增测试（追加到 `src/routing/ors.test.ts`，文件顶部加 `import { vi } from 'vitest'` 若尚无；`postOrs` 已 export）：

```ts
import { postOrs } from './ors'

describe('postOrs profile', () => {
  it('用对应 profile 的 URL', async () => {
    vi.stubEnv('VITE_ORS_KEY', 'test-key')
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return new Response(JSON.stringify({ features: [] }), { status: 200 }) }))
    await postOrs({}, 'foot-hiking')
    expect(urls[0]).toContain('/v2/directions/foot-hiking/geojson')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
})
```

更新既有调用以匹配新签名（在同文件内，把 `generateLoopRoute` 的 3 处调用与 `generatePointToPointRoute` 的 1 处调用补上 profile 形参）：
- `generateLoopRoute([0, 0], 5, 1, { fetchRoute … })` → `generateLoopRoute([0, 0], 5, 'foot-walking', 1, { fetchRoute … })`（三处：首轮达标 / 比例校正 / 3 轮不达标）
- `generatePointToPointRoute([0, 0], [1, 1], { fetchRoute … })` → `generatePointToPointRoute([0, 0], [1, 1], 'foot-walking', { fetchRoute … })`

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: FAIL（postOrs 不接受 profile / URL 不含 foot-hiking；或既有调用类型不符）。

- [ ] **Step 3: 实现**

把 ors.ts 顶部加类型，并改 `postOrs` 与两个生成函数：

```ts
export type RunProfile = 'foot-walking' | 'foot-hiking'
```

删除 `const ORS_BASE = …` 行，改 `postOrs`：

```ts
export const postOrs = async (body: object, profile: RunProfile = 'foot-walking'): Promise<any> => {
  const key = import.meta.env.VITE_ORS_KEY
  if (!key) throw new Error('缺少 VITE_ORS_KEY，请在 .env.local 配置')
  const res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ORS 请求失败（${res.status}）：${text || res.statusText}`)
  }
  return res.json()
}
```

`generateLoopRoute` 签名与默认 fetchRoute：

```ts
export const generateLoopRoute = async (
  start: LngLat,
  distanceKm: number,
  profile: RunProfile = 'foot-walking',
  seed = 1,
  deps: { fetchRoute?: (lengthM: number, seed: number) => Promise<RouteResult> } = {}
): Promise<RouteResult> => {
  const fetchRoute =
    deps.fetchRoute ??
    (async (lengthM: number, s: number) =>
      parseGeoJson(await postOrs(buildRoundTripBody(start, lengthM, s), profile), 'loop'))
  // …（循环体不变）
```

`generatePointToPointRoute`：

```ts
export const generatePointToPointRoute = async (
  start: LngLat,
  end: LngLat,
  profile: RunProfile = 'foot-walking',
  deps: { fetchRoute?: () => Promise<RouteResult> } = {}
): Promise<RouteResult> => {
  const fetchRoute =
    deps.fetchRoute ??
    (async () => parseGeoJson(await postOrs(buildDirectionsBody(start, end), profile), 'point_to_point'))
  return fetchRoute()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/routing/ors.test.ts && npx tsc --noEmit`
Expected: 测试 PASS；tsc 仅可能因 tools.ts 旧调用报错（下一个 Task 修），本步先确保 ors.ts 自身无误——若 tsc 报 `tools.ts` 调用 `generateLoopRoute` 参数错，属预期，Task 4 修复。

- [ ] **Step 5: Commit**

```bash
git add src/routing/ors.ts src/routing/ors.test.ts
git commit -m "feat(routing): foot-walking/foot-hiking profile support"
```

---

## Task 4: agent 工具 — 地形/起点交互 + terrain→profile

**Files:**
- Modify: `src/agent/tools.ts`
- Test: `src/agent/tools.test.ts`

**Interfaces:**
- Consumes: `generateLoopRoute(start, km, profile, seed)`、`generatePointToPointRoute(start, end, profile)`、`RunProfile`（Task 3）
- Produces:
  - `ToolContext` 增加 `requestTerrain: () => Promise<'trail' | 'road' | null>`、`requestStartPoint: () => Promise<LngLat | null>`；`_fetchLoop` 签名加 profile：`(start, km, seed, profile) => Promise<RouteResult>`；`_fetchP2P`：`(start, end, profile) => Promise<RouteResult>`
  - `toolSchemas` 含 7 个工具（新增 `ask_run_terrain`、`ask_start_point`；route 工具加 `terrain` 必填 enum）
  - `executeTool` 处理两新工具并把 `terrain` 映射 profile

- [ ] **Step 1: 写失败测试**

更新 `src/agent/tools.test.ts`：把"5 个工具"用例改为 7 个，并新增三个用例：

```ts
it('schema 暴露 7 个工具且名字正确', () => {
  const names = toolSchemas.map((t: any) => t.function.name).sort()
  expect(names).toEqual([
    'analyze_run', 'ask_run_terrain', 'ask_start_point', 'compare_runs',
    'generate_loop_route', 'generate_point_to_point_route', 'geocode_place'
  ])
})

it('ask_run_terrain 回传用户选择', async () => {
  const out = await executeTool('ask_run_terrain', {}, {
    runs: new Map(), onRoute() {}, requestTerrain: async () => 'trail', requestStartPoint: async () => null
  } as any)
  expect(JSON.parse(out).terrain).toBe('trail')
})

it('ask_start_point 取消时回 cancelled', async () => {
  const out = await executeTool('ask_start_point', {}, {
    runs: new Map(), onRoute() {}, requestTerrain: async () => null, requestStartPoint: async () => null
  } as any)
  expect(JSON.parse(out).cancelled).toBe(true)
})

it('generate_loop_route 把 trail 映射成 foot-hiking', async () => {
  let seen = ''
  await executeTool('generate_loop_route', { start: [0, 0], distance_km: 5, terrain: 'trail' }, {
    runs: new Map(), onRoute() {}, requestTerrain: async () => null, requestStartPoint: async () => null,
    _fetchLoop: async (_s: any, _k: any, _seed: any, profile: string) => { seen = profile; return { kind: 'loop', coordinates: [[0, 0]], distanceM: 5000 } }
  } as any)
  expect(seen).toBe('foot-hiking')
})
```

（既有"generate_loop_route 触发 onRoute"用例的 `_fetchLoop: async () => (...)` 忽略入参，加第 4 个 profile 参数不影响它，保留即可。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/agent/tools.test.ts`
Expected: FAIL（工具数 5≠7、新工具不存在、profile 未传给 _fetchLoop）。

- [ ] **Step 3: 实现**

`tools.ts` 顶部 import 增加 `RunProfile`：

```ts
import { generateLoopRoute, generatePointToPointRoute, type RouteResult, type LngLat, type RunProfile } from '@/routing/ors'
```

`ToolContext` 改为：

```ts
export type ToolContext = {
  runs: Map<string, Run>
  onRoute: (r: RouteResult) => void
  requestTerrain: () => Promise<'trail' | 'road' | null>
  requestStartPoint: () => Promise<LngLat | null>
  _fetchLoop?: (start: LngLat, km: number, seed: number, profile: RunProfile) => Promise<RouteResult>
  _fetchP2P?: (start: LngLat, end: LngLat, profile: RunProfile) => Promise<RouteResult>
}
```

在 `toolSchemas` 数组里，给 `generate_loop_route` 与 `generate_point_to_point_route` 的 `properties` 各加：

```ts
          terrain: { type: 'string', enum: ['trail', 'road'], description: '越野=trail（山路步道），路跑=road（道路）' }
```

并把它们的 `required` 改为含 `terrain`（loop: `['start', 'distance_km', 'terrain']`；p2p: `['start', 'end', 'terrain']`）。

在数组中追加两个新工具：

```ts
  {
    type: 'function',
    function: {
      name: 'ask_run_terrain',
      description: '当用户没说要越野还是路跑时，弹卡片询问。返回 {terrain} 或 {cancelled:true}',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_start_point',
      description: '当起点未知时，弹卡片让用户选当前位置或手动在地图选点。返回 {start:[lng,lat]} 或 {cancelled:true}',
      parameters: { type: 'object', properties: {} }
    }
  }
```

`executeTool` 里，把 loop/p2p 两个分支改为按 terrain 选 profile，并加两新分支：

```ts
    if (name === 'ask_run_terrain') {
      const t = await ctx.requestTerrain()
      return t ? ok({ terrain: t }) : ok({ cancelled: true })
    }
    if (name === 'ask_start_point') {
      const c = await ctx.requestStartPoint()
      return c ? ok({ start: c }) : ok({ cancelled: true })
    }
    if (name === 'generate_loop_route') {
      if (!(args.distance_km > 0)) return fail('距离必须大于 0')
      const profile: RunProfile = args.terrain === 'trail' ? 'foot-hiking' : 'foot-walking'
      const route = ctx._fetchLoop
        ? await ctx._fetchLoop(args.start, args.distance_km, args.seed ?? 1, profile)
        : await generateLoopRoute(args.start, args.distance_km, profile, args.seed ?? 1)
      ctx.onRoute(route)
      return ok({ distance_km: +(route.distanceM / 1000).toFixed(2), ascent_m: route.ascentM, points: route.coordinates.length })
    }
    if (name === 'generate_point_to_point_route') {
      const profile: RunProfile = args.terrain === 'trail' ? 'foot-hiking' : 'foot-walking'
      const route = ctx._fetchP2P
        ? await ctx._fetchP2P(args.start, args.end, profile)
        : await generatePointToPointRoute(args.start, args.end, profile)
      ctx.onRoute(route)
      return ok({ distance_km: +(route.distanceM / 1000).toFixed(2), ascent_m: route.ascentM })
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/agent/tools.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools.ts src/agent/tools.test.ts
git commit -m "feat(agent): terrain/start ask tools + terrain→profile mapping"
```

---

## Task 5: 系统提示词更新

**Files:**
- Modify: `src/agent/coach.ts`
- Test: `src/agent/coach.test.ts`

**Interfaces:**
- Produces: `COACH_SYSTEM_PROMPT` 指导：生成路线前确定地形+起点；能从原话推断就用，缺失才分别调 `ask_run_terrain`/`ask_start_point`；任一返回 cancelled 则礼貌停止；拿到后用 `terrain` 调路线工具。

- [ ] **Step 1: 写失败测试**

更新 `src/agent/coach.test.ts` 的提示词用例（保留原 2-step 用例不变）：

```ts
it('系统提示词覆盖地形/起点引导与取消处理', () => {
  expect(COACH_SYSTEM_PROMPT).toMatch(/越野|地形/)
  expect(COACH_SYSTEM_PROMPT).toContain('ask_run_terrain')
  expect(COACH_SYSTEM_PROMPT).toContain('ask_start_point')
  expect(COACH_SYSTEM_PROMPT).toMatch(/取消/)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/agent/coach.test.ts`
Expected: FAIL（提示词未含这些词）。

- [ ] **Step 3: 实现**

把 `COACH_SYSTEM_PROMPT` 数组替换为：

```ts
export const COACH_SYSTEM_PROMPT = [
  '你是一位严谨、专业的跑步训练教练兼数据分析师，服务于一个地图跑步工具。',
  '你能做：生成真实路网上的跑步路线（环线/点到点）、复盘上传的训练、对比两份训练、围绕跑步路线/配速/心率/恢复给建议。',
  '严格范围：只处理跑步相关问题。遇到与跑步无关的请求（写代码、查天气、闲聊等），用一句话礼貌拒绝并把话题拉回跑步，绝不调用任何工具。',
  '生成路线前，你必须先确定两件事：① 地形（越野 trail 还是路跑 road）；② 起点。',
  '能从用户原话推断就直接用：例如"越野/trail/山路"→trail，"路跑/road/公路"→road；"从我当前位置/附近"→用上下文给的当前定位坐标；"从某地名出发"→先调 geocode_place 得到坐标。',
  '信息缺失时才询问：不知道地形就调 ask_run_terrain；起点未定就调 ask_start_point（让用户选当前位置或在地图手动选点）。已经知道的就别再问。',
  '若 ask_run_terrain 或 ask_start_point 返回 {cancelled:true}，礼貌停止、不要生成路线。',
  '地形与起点都确定后，调用 generate_loop_route 或 generate_point_to_point_route，并把 terrain 一并传入。不要自己编造坐标。',
  '实际距离/爬升以工具返回为准、如实告知，不要谎称"正好 5 公里"。',
  '用中文回复，先结论后证据后建议；缺失数据要明说，不编造。'
].join('\n')
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/agent/coach.test.ts`
Expected: PASS（含原 2-step 用例）。

- [ ] **Step 5: Commit**

```bash
git add src/agent/coach.ts src/agent/coach.test.ts
git commit -m "feat(agent): coach prompt gathers terrain + start, handles cancel"
```

---

## Task 6: 卡片组件（地形 / 起点 / 大头针确认）

**Files:**
- Create: `src/app/TerrainCard.tsx`、`src/app/StartPointCard.tsx`、`src/app/PinConfirm.tsx`

**Interfaces:**
- Produces:
  - `TerrainCard({ onPick, onCancel }: { onPick: (t: 'trail' | 'road') => void; onCancel: () => void })`
  - `StartPointCard({ onCurrent, onManual, onCancel, message }: { onCurrent: () => void; onManual: () => void; onCancel: () => void; message?: string })`
  - `PinConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void })`

UI/结构任务，无单测；以 Task 7 末尾的 tsc + build 为门。本任务只创建组件文件（不接线），先确保它们独立可编译。

- [ ] **Step 1: 写 TerrainCard**

```tsx
// src/app/TerrainCard.tsx
export const TerrainCard = ({ onPick, onCancel }: {
  onPick: (t: 'trail' | 'road') => void
  onCancel: () => void
}) => (
  <div className="choice-card">
    <div className="choice-head">
      <span>想跑哪种？</span>
      <button className="choice-x" onClick={onCancel}>✕</button>
    </div>
    <div className="choice-opts">
      <button className="choice-opt" onClick={() => onPick('trail')}><span className="emoji">🏔</span>越野跑<small>偏好山路步道</small></button>
      <button className="choice-opt" onClick={() => onPick('road')}><span className="emoji">🛣</span>路跑<small>走道路人行道</small></button>
    </div>
  </div>
)
```

- [ ] **Step 2: 写 StartPointCard**

```tsx
// src/app/StartPointCard.tsx
export const StartPointCard = ({ onCurrent, onManual, onCancel, message }: {
  onCurrent: () => void
  onManual: () => void
  onCancel: () => void
  message?: string
}) => (
  <div className="choice-card">
    <div className="choice-head">
      <span>从哪出发？</span>
      <button className="choice-x" onClick={onCancel}>✕</button>
    </div>
    <div className="choice-opts">
      <button className="choice-opt" onClick={onCurrent}><span className="emoji">📍</span>当前位置<small>用浏览器定位</small></button>
      <button className="choice-opt" onClick={onManual}><span className="emoji">🗺</span>手动选点<small>在地图上点一下</small></button>
    </div>
    {message && <div className="choice-msg">{message}</div>}
  </div>
)
```

- [ ] **Step 3: 写 PinConfirm**

```tsx
// src/app/PinConfirm.tsx
export const PinConfirm = ({ onConfirm, onCancel }: {
  onConfirm: () => void
  onCancel: () => void
}) => (
  <div className="pin-confirm">
    <span>把起点设在这里？</span>
    <button className="primary" onClick={onConfirm}>✓ 确定</button>
    <button onClick={onCancel}>✗ 取消</button>
  </div>
)
```

- [ ] **Step 4: 类型门**

Run: `npx tsc --noEmit`
Expected: 这三个文件不引入新错误（未被引用，但应自洽编译）。

- [ ] **Step 5: Commit**

```bash
git add src/app/TerrainCard.tsx src/app/StartPointCard.tsx src/app/PinConfirm.tsx
git commit -m "feat(app): terrain/start/pin-confirm card components"
```

---

## Task 7: App 集成 — 删三段器、引导卡片、选点模式

**Files:**
- Rewrite: `src/app/App.tsx`
- Modify: `src/map/MapView.tsx`（选点光标）
- Modify: `src/app/styles.css`（卡片 + 选点光标样式）

**Interfaces:**
- Consumes: `TerrainCard`/`StartPointCard`/`PinConfirm`（Task 6）、`ToolContext.requestTerrain`/`requestStartPoint`（Task 4）
- Produces: App 用 state 暂存 resolver；卡片按钮 resolve；选点模式 + 大头针确认；`ctx` 含 `requestTerrain`/`requestStartPoint`。

- [ ] **Step 1: 改 MapView 支持选点光标**

把 `MapView.tsx` 组件签名与容器改为：

```tsx
export const MapView = ({ onReady, onMapClick, picking }: { onReady: (m: maplibregl.Map) => void; onMapClick: (c: LngLat) => void; picking?: boolean }) => {
  // …（effect 不变）…
  return <div ref={ref} style={{ position: 'absolute', inset: 0, cursor: picking ? 'crosshair' : '' }} />
}
```

- [ ] **Step 2: 重写 App.tsx**

```tsx
// src/app/App.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { MapView } from '@/map/MapView'
import { setRouteLine, setStartPin, setTrack, fitToCoords } from '@/map/layers'
import { ChatDock } from '@/chat/ChatDock'
import { useChatAgent } from '@/chat/useChatAgent'
import { SettingsGear } from '@/settings/SettingsGear'
import type { ToolContext } from '@/agent/tools'
import type { RouteResult, LngLat } from '@/routing/ors'
import { routeToGpx } from '@/export/gpx-export'
import { loadConfig, type LlmConfig } from '@/llm/provider'
import type { Run } from '@runs/types'
import { parseGpxFile } from '@runs/gpx'
import { parseFitFile } from '@runs/fit'
import { parseJsonFile } from '@runs/json'
import { TerrainCard } from './TerrainCard'
import { StartPointCard } from './StartPointCard'
import { PinConfirm } from './PinConfirm'
import { ReplayBar } from './ReplayBar'
import './styles.css'

export default function App() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [docked, setDocked] = useState(false)
  const [startCoord, setStartCoord] = useState<LngLat | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [config, setConfig] = useState<LlmConfig | null>(loadConfig())
  const runs = useRef<Map<string, Run>>(new Map())

  // 引导卡片 / 选点状态
  const [terrainResolve, setTerrainResolve] = useState<((t: 'trail' | 'road' | null) => void) | null>(null)
  const [startResolve, setStartResolve] = useState<((c: LngLat | null) => void) | null>(null)
  const [picking, setPicking] = useState(false)
  const [pendingPin, setPendingPin] = useState<LngLat | null>(null)
  const [startMsg, setStartMsg] = useState('')

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setStartCoord([pos.coords.longitude, pos.coords.latitude]),
      () => { /* denied — keep fallback */ }
    )
  }, [])
  useEffect(() => {
    if (startCoord && mapReady && mapRef.current) mapRef.current.flyTo({ center: startCoord, zoom: 14 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady])

  const requestTerrain = () => new Promise<'trail' | 'road' | null>(resolve => setTerrainResolve(() => resolve))
  const requestStartPoint = () => new Promise<LngLat | null>(resolve => { setStartMsg(''); setStartResolve(() => resolve) })

  const ctx: ToolContext = useMemo(() => ({
    runs: runs.current,
    onRoute: (r: RouteResult) => {
      setRoute(r)
      const map = mapRef.current
      if (map) { setRouteLine(map, r.coordinates); if (r.coordinates[0]) setStartPin(map, r.coordinates[0]); fitToCoords(map, r.coordinates) }
    },
    requestTerrain,
    requestStartPoint
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const { turns, send } = useChatAgent({ config, ctx })

  const currentStartContext = () => startCoord
    ? `已知当前定位坐标 ${JSON.stringify(startCoord)}（仅当用户明确要用当前位置/附近时直接用；否则起点未定，调 ask_start_point 让用户选）`
    : '当前定位不可用；起点未定，需要时调 ask_start_point 让用户选'

  const onSend = (text: string) => { if (!docked) setDocked(true); void send(text, currentStartContext()) }

  const onUpload = async (file: File) => {
    if (!docked) setDocked(true)
    const text = file.name.endsWith('.fit') ? '' : await file.text()
    const parsed: Run = file.name.endsWith('.fit')
      ? await parseFitFile(await file.arrayBuffer(), file.name)
      : file.name.endsWith('.json') ? await parseJsonFile(text, file.name) : parseGpxFile(text, file.name)
    runs.current.set(parsed.id, parsed)
    setRun(parsed)
    const map = mapRef.current
    if (map) { const t = parsed.points.map(p => [p.lon, p.lat] as LngLat); setTrack(map, t); fitToCoords(map, t) }
    void send(`[上传训练] ${file.name}，请复盘`, `run_id=${parsed.id}`)
  }

  const onMapClick = (c: LngLat) => {
    if (picking) { setPendingPin(c); if (mapRef.current) setStartPin(mapRef.current, c) }
  }

  // 卡片回调
  const pickTerrain = (t: 'trail' | 'road') => { terrainResolve?.(t); setTerrainResolve(null) }
  const cancelTerrain = () => { terrainResolve?.(null); setTerrainResolve(null) }

  const pickCurrent = () => {
    if (startCoord) { startResolve?.(startCoord); setStartResolve(null); return }
    if (!navigator.geolocation) { setStartMsg('定位不可用，请改用手动选点'); return }
    setStartMsg('正在定位…')
    navigator.geolocation.getCurrentPosition(
      pos => { const c: LngLat = [pos.coords.longitude, pos.coords.latitude]; setStartCoord(c); startResolve?.(c); setStartResolve(null) },
      () => setStartMsg('定位不可用，请改用手动选点')
    )
  }
  const pickManual = () => { setPicking(true) }      // 隐藏起点卡、进入选点；startResolve 保留
  const cancelStart = () => { startResolve?.(null); setStartResolve(null); setPicking(false); setPendingPin(null) }
  const confirmPin = () => { if (pendingPin) { startResolve?.(pendingPin); setStartResolve(null); setPicking(false); setPendingPin(null) } }
  const cancelPin = () => { setPendingPin(null) }    // 重新点

  const downloadGpx = () => {
    if (!route) return
    const blob = new Blob([routeToGpx(route, 'RunCoach 路线')], { type: 'application/gpx+xml' })
    const a = document.createElement('a'); const url = URL.createObjectURL(blob)
    a.href = url; a.download = 'runcoach-route.gpx'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="app-root">
      <MapView onReady={m => { mapRef.current = m; setMapReady(true) }} onMapClick={onMapClick} picking={picking} />

      <div className="top-right">
        <SettingsGear onSaved={setConfig} />
      </div>

      {terrainResolve && <TerrainCard onPick={pickTerrain} onCancel={cancelTerrain} />}
      {startResolve && !picking && <StartPointCard onCurrent={pickCurrent} onManual={pickManual} onCancel={cancelStart} message={startMsg} />}
      {picking && pendingPin && <PinConfirm onConfirm={confirmPin} onCancel={cancelPin} />}

      {route && (
        <div className="route-card">
          <h4>路线预览</h4>
          <div className="row"><span>实际距离</span><b>{(route.distanceM / 1000).toFixed(2)} km</b></div>
          {route.ascentM !== undefined && <div className="row"><span>累计爬升</span><b>{Math.round(route.ascentM)} m</b></div>}
          <div className="card-btns">
            <button onClick={() => onSend('换一条')}>换一条</button>
            <button className="primary" onClick={downloadGpx}>下载 GPX</button>
          </div>
        </div>
      )}

      {run && <ReplayBar run={run} map={mapRef.current} />}

      <ChatDock turns={turns} docked={docked} onSend={onSend} onUpload={onUpload} />
    </div>
  )
}
```

- [ ] **Step 3: 加样式（styles.css 末尾追加，禁止 box-shadow）**

```css
/* ── 引导卡片 ── */
.choice-card {
  position: absolute; z-index: 20; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(360px, 86%); background: var(--panel-bg); backdrop-filter: var(--panel-blur);
  border: 1px solid var(--panel-border); border-radius: 16px; padding: 16px;
}
.choice-head { display: flex; justify-content: space-between; align-items: center; color: var(--text); font-size: 15px; font-weight: 600; margin-bottom: 12px; }
.choice-x { appearance: none; border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 14px; }
.choice-opts { display: flex; gap: 10px; }
.choice-opt {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 16px 10px; border: 1px solid var(--panel-border); border-radius: 12px;
  background: var(--field-bg); color: var(--text); cursor: pointer; font-size: 14px; transition: border-color 150ms;
}
.choice-opt:hover { border-color: var(--accent); }
.choice-opt .emoji { font-size: 24px; }
.choice-opt small { color: var(--text-muted); font-size: 11px; }
.choice-msg { margin-top: 10px; color: var(--orange); font-size: 12px; }

/* ── 大头针确认条 ── */
.pin-confirm {
  position: absolute; z-index: 20; left: 50%; bottom: 90px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  background: var(--panel-bg); backdrop-filter: var(--panel-blur); border: 1px solid var(--panel-border); border-radius: 12px;
  color: var(--text); font-size: 13px;
}
.pin-confirm button { appearance: none; border: 1px solid var(--panel-border); border-radius: 8px; background: var(--field-bg); color: var(--text); padding: 6px 12px; cursor: pointer; font-size: 13px; }
.pin-confirm button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
```

- [ ] **Step 4: 构建门**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc 零错误；build 通过。

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx src/map/MapView.tsx src/app/styles.css
git commit -m "feat(app): guided terrain/start cards, pin-pick mode, drop segmented switcher"
```

---

## Task 8: 清理死 CSS + 全量门 + 验收

**Files:**
- Modify: `src/app/styles.css`（删 `.start-seg`、`.place-search*` 等已无引用的规则）

- [ ] **Step 1: 删除无引用样式**

```bash
cd /Users/rez/RunCoach
grep -n "start-seg\|place-search" src/app/styles.css
```
把 `.start-seg`、`.start-seg .on`/`button`、`.place-search`、`.place-search-input`、`.place-search-btn`、`.place-search-err` 等规则删除（App.tsx 已不再渲染这些类）。`.top-right` 保留（齿轮仍用）。

- [ ] **Step 2: 全量门**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: tsc 零错误；build 通过；全部测试 PASS。

- [ ] **Step 3: 手动 e2e 验收清单**

```
[ ] 「来条5公里环线」→ 弹地形卡 → 选越野 → 弹起点卡 → 手动选点 → 地图光标变十字 → 点图落针 → 确认 → 生成偏山路路线
[ ] 下载 GPX → 文件含 <ele>，外部工具能看爬升曲线
[ ] 「从我当前位置来条路跑5公里环线」→ 零卡片直接生成走道路路线
[ ] 地形卡/起点卡点 ✕ 或大头针取消 → AI 礼貌停下，不生成
[ ] 选「当前位置」但定位被拒 → 卡片提示并引导手动选点
[ ] 右上角不再有三段切换器，只有 ⚙
```

- [ ] **Step 4: Commit**

```bash
git add src/app/styles.css
git commit -m "chore: remove dead switcher/place-search styles"
```

---

## Self-Review（计划完成后的核对结果）

- **Spec 覆盖**：§3 海拤→Task 1+2；§4 profile→Task 3+4；§5 引导卡片（触发/地形卡/起点卡/大头针/推断跳过）→Task 4(工具)+5(提示词)+6(组件)+7(集成)；§6 错误处理→Task 4(cancelled)+7(定位失败转手动);§7 测试→Task 1-5 单测 + Task 8 验收；§8 删三段器→Task 7+8。无遗漏。
- **类型一致性**：`RunProfile` 定义于 Task 3、被 Task 4 import；`RouteResult.elevations` Task 1 定义、Task 2 用；`ToolContext.requestTerrain/requestStartPoint/_fetchLoop(4参)/_fetchP2P(3参)` Task 4 定义、Task 7 提供；卡片组件 props 在 Task 6 定义、Task 7 调用一致。
- **占位符扫描**：各 TDD 任务含完整测试+实现；UI 任务含完整组件/App 代码 + 明确 CSS。无 TODO/占位。
- **偏离记录**：`generateLoopRoute` 把 `profile` 插在 `seed` 前（第 3 参），Task 3 同步更新既有测试调用；route 工具把 `terrain` 设为必填、executor 缺省按 road 兜底（提示词保证先收集）。
