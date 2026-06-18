# RunCoach AI 跑步教练 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 Run Replay 重塑为「满屏地图 + 对话式 AI 跑步教练」：自然语言生成真实路网上的环线/点到点路线（可预览、下载 GPX），并保留训练回放与 AI 复盘。

**Architecture:** 纯前端（无后端），React 19 + TS + Vite + MapLibre GL。AI 教练是一个带工具调用（function calling）的 agent：模型理解意图 → 调用工具 → 工具用 ORS/MapTiler 返回真实数据 → 模型自然语言回复 + 副作用渲染到地图。逻辑模块（routing/export/analysis/llm/agent）做 TDD；地图/对话 UI 走构建门 + 手动验收。

**Tech Stack:** React 19, TypeScript, Vite 7, MapLibre GL 5, Vitest（新增）, OpenRouteService REST, MapTiler REST, Kimi/DeepSeek OpenAI 兼容接口。

## Global Constraints

- 纯前端，不引入后端；所有外部 API 浏览器直连 `fetch`。
- TypeScript `strict: true`（沿用现有 tsconfig）。
- 解析器复用，不重写：`gpx/fit/json/geo/align/zones/types` 迁入 `src/runs/`。
- LLM key 运行时存 `localStorage`；MapTiler/ORS key 构建期走 `.env.local`（`VITE_MAPTILER_KEY` / `VITE_ORS_KEY`）。
- ORS 路由统一用 `foot-walking` profile，请求 `elevation: true` 以拿 `ascent`。
- 环线距离逼近：目标 ±5% 容差，最多 3 轮。
- 所有外部调用显式 try/catch，错误可见可读可重试，绝不静默吞掉。
- AI 严格限定跑步范围，越界一句话礼貌拒绝、不调工具。
- 中文回复；先结论后证据后建议；不编造缺失数据。
- 新模块统一用路径别名 `@/*` → `src/*`。
- 所有金额/距离如实显示，不四舍五入伪装成“正好 5km”。

---

## File Structure

```
src/
├── app/App.tsx, main.tsx, styles.css        # 薄外壳 + 全局样式（重写）
├── map/MapView.tsx, layers.ts               # 地图与图层（新增）
├── chat/ChatDock.tsx, Composer.tsx, useChatAgent.ts  # 对话 UI + 编排（新增）
├── settings/SettingsGear.tsx                # 右上角齿轮 + key 测试/保存（新增）
├── agent/coach.ts, tools.ts                 # 系统提示词 + agent 循环 + 工具（新增）
├── routing/ors.ts, geocode.ts               # ORS 路由 + MapTiler 地名（新增）
├── export/gpx-export.ts                     # 路线 → GPX 下载（新增）
├── analysis/digest.ts                       # 训练摘要（从 llm.ts 抽出）
├── llm/provider.ts                          # provider 配置 + 带工具的 completions + testApiKey（新增）
└── runs/  gpx.ts fit.ts json.ts geo.ts align.ts zones.ts types.ts  # 现 shared/ 迁入
```

**删除（最终任务）：** `runs/report.ts`（原 shared/report.ts，HTML 看板）、`app/DarkVeil.tsx`、`app/DarkVeil.css`。

---

## Task 1: 脚手架 — Vitest、env、目录迁移、别名

**Files:**
- Modify: `package.json`（加 vitest + test 脚本）
- Create: `vitest.config.ts`
- Modify: `vite.config.ts`、`tsconfig.json`（别名）
- Move: `src/shared/*` → `src/runs/*`（git mv）
- Modify: `src/app/App.tsx`（旧 `@shared/...` → `@runs/...` 仅为让旧应用继续构建）
- Modify: `.env.local`（加 `VITE_ORS_KEY`）、`README.md`

**Interfaces:**
- Produces: 别名 `@/*` → `src/*`、`@runs/*` → `src/runs/*`、`@app/*` → `src/app/*`；`npm test` 跑 Vitest。

- [ ] **Step 1: 安装 Vitest**

```bash
cd /Users/rez/RunCoach
npm i -D vitest
```

- [ ] **Step 2: 加 test 脚本**

`package.json` 的 `scripts` 增加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 创建 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src'),
      '@app': resolve('src/app'),
      '@runs': resolve('src/runs')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
```

- [ ] **Step 4: 迁移目录**

```bash
git mv src/shared src/runs
```

（`runs/` 内部均为相对 import，迁移后不受影响。）

- [ ] **Step 5: 更新 `vite.config.ts` 别名**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src'),
      '@app': resolve('src/app'),
      '@runs': resolve('src/runs')
    }
  }
})
```

- [ ] **Step 6: 更新 `tsconfig.json` paths**

```json
"paths": {
  "@/*": ["src/*"],
  "@app/*": ["src/app/*"],
  "@runs/*": ["src/runs/*"]
}
```

- [ ] **Step 7: 修旧 App.tsx 的 import 前缀**

把 `src/app/App.tsx` 里所有 `@shared/` 替换为 `@runs/`（包括 `@shared/json`、`@shared/report` 等），让旧应用继续可构建。不改其它逻辑。

- [ ] **Step 8: 加 ORS env + 文档**

`.env.local` 增加一行（开发 key 已确认）：

```
VITE_ORS_KEY=eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjdkN2E4Yzc0ZjZhNTQ1ZDFhMWZlMzI0YTM2YWFjOTdlIiwiaCI6Im11cm11cjY0In0=
```

`README.md` 的 MapTiler 配置段落下追加：`VITE_ORS_KEY=你的 OpenRouteService key`。

- [ ] **Step 9: 验证构建与测试基线**

```bash
npm run build && npx vitest run
```
Expected: build 通过；vitest 报 “No test files found”（此时尚无测试，正常）。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold vitest, move shared→runs, add @ aliases and ORS env"
```

---

## Task 2: ORS 请求体构建器

**Files:**
- Create: `src/routing/ors.ts`
- Test: `src/routing/ors.test.ts`

**Interfaces:**
- Produces:
  - `type LngLat = [number, number]`（[lon, lat]）
  - `type RouteResult = { kind: 'loop' | 'point_to_point'; coordinates: LngLat[]; distanceM: number; ascentM?: number }`
  - `buildRoundTripBody(start: LngLat, lengthM: number, seed: number, points?: number): object`
  - `buildDirectionsBody(start: LngLat, end: LngLat): object`

- [ ] **Step 1: 写失败测试**

```ts
// src/routing/ors.test.ts
import { describe, it, expect } from 'vitest'
import { buildRoundTripBody, buildDirectionsBody } from './ors'

describe('ORS request bodies', () => {
  it('round trip body 携带 length/seed/points 与 elevation', () => {
    const body = buildRoundTripBody([121.5, 31.2], 5000, 7) as any
    expect(body.coordinates).toEqual([[121.5, 31.2]])
    expect(body.elevation).toBe(true)
    expect(body.options.round_trip.length).toBe(5000)
    expect(body.options.round_trip.seed).toBe(7)
    expect(body.options.round_trip.points).toBe(5)
  })

  it('directions body 含起终点与 elevation', () => {
    const body = buildDirectionsBody([121.5, 31.2], [121.6, 31.25]) as any
    expect(body.coordinates).toEqual([[121.5, 31.2], [121.6, 31.25]])
    expect(body.elevation).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: FAIL（模块/函数不存在）。

- [ ] **Step 3: 写最小实现**

```ts
// src/routing/ors.ts
export type LngLat = [number, number]

export type RouteResult = {
  kind: 'loop' | 'point_to_point'
  coordinates: LngLat[]
  distanceM: number
  ascentM?: number
}

export const buildRoundTripBody = (start: LngLat, lengthM: number, seed: number, points = 5) => ({
  coordinates: [start],
  elevation: true,
  options: { round_trip: { length: lengthM, points, seed } }
})

export const buildDirectionsBody = (start: LngLat, end: LngLat) => ({
  coordinates: [start, end],
  elevation: true
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/routing/ors.ts src/routing/ors.test.ts
git commit -m "feat(routing): ORS request body builders"
```

---

## Task 3: ORS 调用 + geojson 解析

**Files:**
- Modify: `src/routing/ors.ts`
- Test: `src/routing/ors.test.ts`

**Interfaces:**
- Consumes: `buildRoundTripBody`, `buildDirectionsBody`, `RouteResult`
- Produces:
  - `parseGeoJson(json: any, kind: RouteResult['kind']): RouteResult`
  - `postOrs(path: string, body: object): Promise<any>`（内部 fetch，读 `import.meta.env.VITE_ORS_KEY`）

- [ ] **Step 1: 写失败测试（解析 geojson）**

```ts
// 追加到 src/routing/ors.test.ts
import { parseGeoJson } from './ors'

describe('parseGeoJson', () => {
  it('抽取坐标、距离、爬升', () => {
    const json = {
      features: [{
        geometry: { coordinates: [[121.5, 31.2, 4], [121.51, 31.21, 6]] },
        properties: { summary: { distance: 5023.4, ascent: 38.2 } }
      }]
    }
    const r = parseGeoJson(json, 'loop')
    expect(r.kind).toBe('loop')
    expect(r.coordinates).toEqual([[121.5, 31.2], [121.51, 31.21]])
    expect(r.distanceM).toBeCloseTo(5023.4)
    expect(r.ascentM).toBeCloseTo(38.2)
  })

  it('无 feature 时抛错', () => {
    expect(() => parseGeoJson({ features: [] }, 'loop')).toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: FAIL（`parseGeoJson` 不存在）。

- [ ] **Step 3: 实现 parseGeoJson + postOrs**

```ts
// 追加到 src/routing/ors.ts
const ORS_BASE = 'https://api.openrouteservice.org/v2/directions/foot-walking'

export const parseGeoJson = (json: any, kind: RouteResult['kind']): RouteResult => {
  const feature = json?.features?.[0]
  if (!feature?.geometry?.coordinates?.length) {
    throw new Error('ORS 未返回可用路线')
  }
  const coordinates: LngLat[] = feature.geometry.coordinates.map(
    (c: number[]) => [c[0], c[1]] as LngLat
  )
  const summary = feature.properties?.summary ?? {}
  return {
    kind,
    coordinates,
    distanceM: Number(summary.distance ?? 0),
    ascentM: summary.ascent !== undefined ? Number(summary.ascent) : undefined
  }
}

export const postOrs = async (body: object): Promise<any> => {
  const key = import.meta.env.VITE_ORS_KEY
  if (!key) throw new Error('缺少 VITE_ORS_KEY，请在 .env.local 配置')
  const res = await fetch(`${ORS_BASE}/geojson`, {
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

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/routing/ors.ts src/routing/ors.test.ts
git commit -m "feat(routing): ORS geojson parse + POST helper"
```

---

## Task 4: 环线生成 + 凑距离逼近

**Files:**
- Modify: `src/routing/ors.ts`
- Test: `src/routing/ors.test.ts`

**Interfaces:**
- Consumes: `buildRoundTripBody`, `parseGeoJson`, `RouteResult`
- Produces:
  - `generateLoopRoute(start: LngLat, distanceKm: number, seed?: number, deps?: { fetchRoute?: (lengthM: number, seed: number) => Promise<RouteResult> }): Promise<RouteResult>`
  - 算法：目标 ±5%，最多 3 轮，按比例校正请求长度，取最接近者。`deps.fetchRoute` 注入便于测试，默认走 `postOrs`。

- [ ] **Step 1: 写失败测试（逼近逻辑，注入假 fetchRoute）**

```ts
// 追加到 src/routing/ors.test.ts
import { generateLoopRoute } from './ors'

const fakeRoute = (distanceM: number): any => ({
  kind: 'loop', coordinates: [[0, 0], [0.01, 0.01]], distanceM
})

describe('generateLoopRoute 凑距离', () => {
  it('首轮即达标（±5% 内）直接返回', async () => {
    const calls: number[] = []
    const r = await generateLoopRoute([0, 0], 5, 1, {
      fetchRoute: async (lengthM) => { calls.push(lengthM); return fakeRoute(4900) }
    })
    expect(r.distanceM).toBe(4900)
    expect(calls).toEqual([5000]) // 只调一次
  })

  it('首轮偏短则按比例校正后重试', async () => {
    const lengths: number[] = []
    const r = await generateLoopRoute([0, 0], 5, 1, {
      fetchRoute: async (lengthM) => {
        lengths.push(lengthM)
        return fakeRoute(lengths.length === 1 ? 4000 : 5050)
      }
    })
    // 第二轮请求长度 = 5000 * (5000/4000) = 6250
    expect(lengths[0]).toBe(5000)
    expect(lengths[1]).toBe(6250)
    expect(r.distanceM).toBe(5050) // 达标
  })

  it('3 轮都不达标则返回最接近者', async () => {
    const r = await generateLoopRoute([0, 0], 5, 1, {
      fetchRoute: async () => fakeRoute(4000) // 永远偏短
    })
    expect(r.distanceM).toBe(4000) // 最接近（也是唯一）
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: FAIL（`generateLoopRoute` 不存在）。

- [ ] **Step 3: 实现 generateLoopRoute**

```ts
// 追加到 src/routing/ors.ts
const TOLERANCE = 0.05
const MAX_ROUNDS = 3

export const generateLoopRoute = async (
  start: LngLat,
  distanceKm: number,
  seed = 1,
  deps: { fetchRoute?: (lengthM: number, seed: number) => Promise<RouteResult> } = {}
): Promise<RouteResult> => {
  const fetchRoute =
    deps.fetchRoute ??
    (async (lengthM: number, s: number) =>
      parseGeoJson(await postOrs(buildRoundTripBody(start, lengthM, s)), 'loop'))

  const target = distanceKm * 1000
  let requested = target
  let best: RouteResult | null = null

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const result = await fetchRoute(Math.round(requested), seed)
    const off = Math.abs(result.distanceM - target) / target
    if (off <= TOLERANCE) return result
    if (!best || Math.abs(result.distanceM - target) < Math.abs(best.distanceM - target)) {
      best = result
    }
    requested = requested * (target / result.distanceM)
  }
  return best as RouteResult
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/routing/ors.ts src/routing/ors.test.ts
git commit -m "feat(routing): loop route with distance refinement"
```

---

## Task 5: 点到点路线

**Files:**
- Modify: `src/routing/ors.ts`
- Test: `src/routing/ors.test.ts`

**Interfaces:**
- Consumes: `buildDirectionsBody`, `parseGeoJson`, `postOrs`
- Produces: `generatePointToPointRoute(start: LngLat, end: LngLat, deps?: { fetchRoute?: () => Promise<RouteResult> }): Promise<RouteResult>`

- [ ] **Step 1: 写失败测试**

```ts
// 追加到 src/routing/ors.test.ts
import { generatePointToPointRoute } from './ors'

describe('generatePointToPointRoute', () => {
  it('直接返回注入的路线', async () => {
    const r = await generatePointToPointRoute([0, 0], [1, 1], {
      fetchRoute: async () => ({ kind: 'point_to_point', coordinates: [[0, 0], [1, 1]], distanceM: 3200 })
    })
    expect(r.kind).toBe('point_to_point')
    expect(r.distanceM).toBe(3200)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// 追加到 src/routing/ors.ts
export const generatePointToPointRoute = async (
  start: LngLat,
  end: LngLat,
  deps: { fetchRoute?: () => Promise<RouteResult> } = {}
): Promise<RouteResult> => {
  const fetchRoute =
    deps.fetchRoute ??
    (async () => parseGeoJson(await postOrs(buildDirectionsBody(start, end)), 'point_to_point'))
  return fetchRoute()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/routing/ors.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/routing/ors.ts src/routing/ors.test.ts
git commit -m "feat(routing): point-to-point route"
```

---

## Task 6: MapTiler 地名搜索（geocode）

**Files:**
- Create: `src/routing/geocode.ts`
- Test: `src/routing/geocode.test.ts`

**Interfaces:**
- Produces:
  - `type GeoHit = { name: string; center: LngLat }`
  - `parseGeocode(json: any): GeoHit[]`
  - `geocodePlace(query: string): Promise<GeoHit[]>`（读 `VITE_MAPTILER_KEY`）

- [ ] **Step 1: 写失败测试**

```ts
// src/routing/geocode.test.ts
import { describe, it, expect } from 'vitest'
import { parseGeocode } from './geocode'

describe('parseGeocode', () => {
  it('抽取 name 与 center', () => {
    const json = { features: [
      { text: '人民广场', center: [121.475, 31.229] },
      { text: '人民公园', center: [121.470, 31.232] }
    ] }
    const hits = parseGeocode(json)
    expect(hits).toEqual([
      { name: '人民广场', center: [121.475, 31.229] },
      { name: '人民公园', center: [121.470, 31.232] }
    ])
  })

  it('空结果返回空数组', () => {
    expect(parseGeocode({ features: [] })).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/routing/geocode.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// src/routing/geocode.ts
import type { LngLat } from './ors'

export type GeoHit = { name: string; center: LngLat }

export const parseGeocode = (json: any): GeoHit[] =>
  (json?.features ?? []).map((f: any) => ({
    name: f.text ?? f.place_name ?? '未知地点',
    center: [f.center[0], f.center[1]] as LngLat
  }))

export const geocodePlace = async (query: string): Promise<GeoHit[]> => {
  const key = import.meta.env.VITE_MAPTILER_KEY
  if (!key) throw new Error('缺少 VITE_MAPTILER_KEY')
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${key}&limit=5`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`地名搜索失败（${res.status}）`)
  return parseGeocode(await res.json())
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/routing/geocode.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/routing/geocode.ts src/routing/geocode.test.ts
git commit -m "feat(routing): MapTiler geocoding"
```

---

## Task 7: 路线 → GPX 导出

**Files:**
- Create: `src/export/gpx-export.ts`
- Test: `src/export/gpx-export.test.ts`

**Interfaces:**
- Consumes: `RouteResult`, `LngLat`（来自 `@/routing/ors`）；`parseGpxFile`（来自 `@runs/gpx`，用于往返校验）
- Produces: `routeToGpx(route: RouteResult, name?: string): string`

- [ ] **Step 1: 写失败测试（含往返解析）**

```ts
// src/export/gpx-export.test.ts
import { describe, it, expect } from 'vitest'
import { routeToGpx } from './gpx-export'
import { parseGpxFile } from '@runs/gpx'

const route = {
  kind: 'loop' as const,
  coordinates: [[121.5, 31.2], [121.51, 31.21], [121.5, 31.2]] as [number, number][],
  distanceM: 1500
}

describe('routeToGpx', () => {
  it('生成的 GPX 含全部坐标且 lon/lat 顺序正确', () => {
    const xml = routeToGpx(route, '测试环线')
    expect(xml).toContain('<gpx')
    expect(xml).toContain('lat="31.2"')
    expect(xml).toContain('lon="121.5"')
    expect(xml).toContain('测试环线')
  })

  it('可被自己的 gpx 解析器往返读取（点数一致）', () => {
    // routeToGpx 给每个点写入递增时间，使 parseGpxFile 能保留点
    const xml = routeToGpx(route, 'rt')
    const run = parseGpxFile(xml, 'rt.gpx')
    expect(run.points.length).toBe(3)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/export/gpx-export.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// src/export/gpx-export.ts
import type { RouteResult } from '@/routing/ors'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const routeToGpx = (route: RouteResult, name = 'RunCoach Route'): string => {
  const start = Date.now()
  const pts = route.coordinates
    .map(([lon, lat], i) => {
      const time = new Date(start + i * 1000).toISOString()
      return `      <trkpt lat="${lat}" lon="${lon}"><time>${time}</time></trkpt>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RunCoach" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/export/gpx-export.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/export/gpx-export.ts src/export/gpx-export.test.ts
git commit -m "feat(export): route to GPX"
```

---

## Task 8: 训练摘要 digest（从 llm.ts 抽出）

**Files:**
- Create: `src/analysis/digest.ts`
- Test: `src/analysis/digest.test.ts`

**Interfaces:**
- Consumes: `Run`（`@runs/types`）、`sampleAtDistance`（`@runs/align`）
- Produces:
  - `buildRunDigest(run: Run): object`
  - `buildComparisonDigest(runA: Run, runB: Run, relation: 'auto' | 'same_athlete' | 'different_athletes'): object`

说明：把现 `src/runs/llm.ts` 内的 `buildRunDigest` / `buildComparisonDigest` 及其私有 helper（formatPace/metricAverage 等）整体迁入本文件并导出这两个函数。`runs/llm.ts` 不再被引用，最终任务删除。

- [ ] **Step 1: 写失败测试**

```ts
// src/analysis/digest.test.ts
import { describe, it, expect } from 'vitest'
import { buildRunDigest } from './digest'
import type { Run } from '@runs/types'

const run: Run = {
  id: 'r1', name: '晨跑', sourcePath: 'a.gpx', sourceType: 'gpx',
  points: [
    { lat: 0, lon: 0, time: 0, hr: 140, speed: 3, metrics: { heart_rate: 140, speed: 3 }, distFromStart: 0 },
    { lat: 0, lon: 0.01, time: 60000, hr: 160, speed: 3.5, metrics: { heart_rate: 160, speed: 3.5 }, distFromStart: 1000 }
  ],
  totalDistance: 1000, totalTime: 60000,
  metricKeys: ['speed', 'heart_rate'], summaryEntries: [], lapSummaries: [], aggregateMetrics: {}
}

describe('buildRunDigest', () => {
  it('聚合距离/心率，缺失指标为 undefined', () => {
    const d: any = buildRunDigest(run)
    expect(d.totalDistanceKm).toBeCloseTo(1, 2)
    expect(d.averageHeartRate).toBe(150)
    expect(d.maxHeartRate).toBe(160)
    expect(d.averagePower).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/analysis/digest.test.ts`
Expected: FAIL。

- [ ] **Step 3: 迁移实现**

从 `src/runs/llm.ts` 复制 `formatNumber/formatDuration/formatPace/average/maxValue/minValue/roundMaybe/metricAverage/metricPeak/metricLow/asPointDigest/buildRunDigest/buildComparisonDigest` 到 `src/analysis/digest.ts`，把 import 改为：

```ts
import type { Run } from '@runs/types'
import { sampleAtDistance } from '@runs/align'
import type { ComparisonRelation } from '@/llm/provider' // 见 Task 9；或本地定义同名 union
```

并 `export const buildRunDigest`、`export const buildComparisonDigest`。`ComparisonRelation` 若 Task 9 尚未存在，先在本文件本地定义 `export type ComparisonRelation = 'auto' | 'same_athlete' | 'different_athletes'`，Task 9 复用之。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/analysis/digest.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/analysis/digest.ts src/analysis/digest.test.ts
git commit -m "feat(analysis): extract run/comparison digest from llm.ts"
```

---

## Task 9: LLM provider — 配置、带工具的 completions、testApiKey

**Files:**
- Create: `src/llm/provider.ts`
- Test: `src/llm/provider.test.ts`

**Interfaces:**
- Produces:
  - `type LlmProvider = 'kimi' | 'deepseek'`
  - `type ComparisonRelation = 'auto' | 'same_athlete' | 'different_athletes'`
  - `type LlmConfig = { provider: LlmProvider; model: string; apiKey: string }`
  - `type ChatMessage = { role: 'system'|'user'|'assistant'|'tool'; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string }`
  - `llmProviderMeta: Record<LlmProvider, { label: string; baseUrl: string; defaultModel: string }>`
  - `chatCompletion(config: LlmConfig, messages: ChatMessage[], tools?: any[]): Promise<{ message: any }>`
  - `testApiKey(config: LlmConfig): Promise<{ ok: boolean; error?: string }>`
  - `loadConfig(): LlmConfig | null` / `saveConfig(c: LlmConfig): void`（localStorage，key=`runcoach.llm`）

- [ ] **Step 1: 写失败测试（testApiKey 解析 + config 存取）**

```ts
// src/llm/provider.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { testApiKey, saveConfig, loadConfig, llmProviderMeta } from './provider'

afterEach(() => vi.unstubAllGlobals())

describe('provider', () => {
  it('saveConfig/loadConfig 往返', () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v }
    })
    saveConfig({ provider: 'kimi', model: 'kimi-k2.5', apiKey: 'sk-x' })
    expect(loadConfig()).toEqual({ provider: 'kimi', model: 'kimi-k2.5', apiKey: 'sk-x' })
  })

  it('testApiKey: 200 → ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 })))
    const r = await testApiKey({ provider: 'deepseek', model: llmProviderMeta.deepseek.defaultModel, apiKey: 'k' })
    expect(r.ok).toBe(true)
  })

  it('testApiKey: 401 → ok=false 带原因', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))
    const r = await testApiKey({ provider: 'kimi', model: 'kimi-k2.5', apiKey: 'bad' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('401')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/llm/provider.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// src/llm/provider.ts
export type LlmProvider = 'kimi' | 'deepseek'
export type ComparisonRelation = 'auto' | 'same_athlete' | 'different_athletes'
export type LlmConfig = { provider: LlmProvider; model: string; apiKey: string }
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: any[]
  tool_call_id?: string
  name?: string
}

export const llmProviderMeta: Record<LlmProvider, { label: string; baseUrl: string; defaultModel: string }> = {
  kimi: { label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.5' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash' }
}

const STORAGE_KEY = 'runcoach.llm'

export const saveConfig = (c: LlmConfig) => localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
export const loadConfig = (): LlmConfig | null => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as LlmConfig } catch { return null }
}

export const chatCompletion = async (config: LlmConfig, messages: ChatMessage[], tools?: any[]) => {
  const meta = llmProviderMeta[config.provider]
  const body: Record<string, unknown> = {
    model: config.model || meta.defaultModel,
    messages,
    stream: false
  }
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto' }
  if (config.provider === 'kimi' && (config.model || meta.defaultModel).startsWith('kimi-k2.5')) {
    body.thinking = { type: 'disabled' }
  }
  const res = await fetch(`${meta.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM 请求失败（${res.status}）：${text || res.statusText}`)
  }
  const data = await res.json()
  return { message: data?.choices?.[0]?.message }
}

export const testApiKey = async (config: LlmConfig): Promise<{ ok: boolean; error?: string }> => {
  try {
    await chatCompletion(config, [{ role: 'user', content: 'ping' }])
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/llm/provider.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/llm/provider.ts src/llm/provider.test.ts
git commit -m "feat(llm): provider config, tool-calling completions, testApiKey"
```

---

## Task 10: Agent 工具集（schema + 执行器）

**Files:**
- Create: `src/agent/tools.ts`
- Test: `src/agent/tools.test.ts`

**Interfaces:**
- Consumes: `generateLoopRoute`, `generatePointToPointRoute`（`@/routing/ors`）、`geocodePlace`（`@/routing/geocode`）、`buildRunDigest`, `buildComparisonDigest`（`@/analysis/digest`）、`Run`（`@runs/types`）
- Produces:
  - `toolSchemas: any[]`（OpenAI function-calling 格式：generate_loop_route / generate_point_to_point_route / geocode_place / analyze_run / compare_runs）
  - `type ToolContext = { runs: Map<string, Run>; onRoute: (r: RouteResult) => void }`
  - `executeTool(name: string, args: any, ctx: ToolContext): Promise<string>`（返回给模型的 JSON 字符串；路线类工具同时 `ctx.onRoute(route)` 触发地图渲染）

- [ ] **Step 1: 写失败测试**

```ts
// src/agent/tools.test.ts
import { describe, it, expect, vi } from 'vitest'
import { toolSchemas, executeTool } from './tools'

describe('tools', () => {
  it('schema 暴露 5 个工具且名字正确', () => {
    const names = toolSchemas.map((t: any) => t.function.name).sort()
    expect(names).toEqual([
      'analyze_run', 'compare_runs', 'generate_loop_route',
      'generate_point_to_point_route', 'geocode_place'
    ])
  })

  it('generate_loop_route 触发 onRoute 并返回实际距离', async () => {
    const onRoute = vi.fn()
    const out = await executeTool(
      'generate_loop_route',
      { start: [121.5, 31.2], distance_km: 5, seed: 2 },
      { runs: new Map(), onRoute, _fetchLoop: async () => ({ kind: 'loop', coordinates: [[121.5, 31.2]], distanceM: 5020 }) } as any
    )
    expect(onRoute).toHaveBeenCalledOnce()
    expect(JSON.parse(out).distance_km).toBeCloseTo(5.02, 2)
  })

  it('analyze_run 找不到 run 时返回错误说明', async () => {
    const out = await executeTool('analyze_run', { run_id: 'nope' }, { runs: new Map(), onRoute: () => {} })
    expect(JSON.parse(out).error).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/agent/tools.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// src/agent/tools.ts
import { generateLoopRoute, generatePointToPointRoute, type RouteResult, type LngLat } from '@/routing/ors'
import { geocodePlace } from '@/routing/geocode'
import { buildRunDigest, buildComparisonDigest } from '@/analysis/digest'
import type { Run } from '@runs/types'

export type ToolContext = {
  runs: Map<string, Run>
  onRoute: (r: RouteResult) => void
  // 测试注入用，可选：
  _fetchLoop?: (start: LngLat, km: number, seed: number) => Promise<RouteResult>
  _fetchP2P?: (start: LngLat, end: LngLat) => Promise<RouteResult>
}

export const toolSchemas = [
  {
    type: 'function',
    function: {
      name: 'generate_loop_route',
      description: '在真实路网上生成一条回到起点的环线，长度贴近目标公里数',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'array', items: { type: 'number' }, description: '[经度, 纬度]' },
          distance_km: { type: 'number', description: '目标距离（公里），需 > 0' },
          seed: { type: 'number', description: '换一条不同走法时改变此种子' }
        },
        required: ['start', 'distance_km']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_point_to_point_route',
      description: '在真实路网上生成从起点到终点的跑步路线',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'array', items: { type: 'number' }, description: '[经度, 纬度]' },
          end: { type: 'array', items: { type: 'number' }, description: '[经度, 纬度]' }
        },
        required: ['start', 'end']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'geocode_place',
      description: '把地名转成坐标（用户说"从某地出发"时用）',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_run',
      description: '取已上传训练的数据摘要用于复盘',
      parameters: {
        type: 'object',
        properties: { run_id: { type: 'string' } },
        required: ['run_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare_runs',
      description: '对比两份已上传训练的摘要',
      parameters: {
        type: 'object',
        properties: {
          run_id_a: { type: 'string' },
          run_id_b: { type: 'string' },
          relation: { type: 'string', enum: ['auto', 'same_athlete', 'different_athletes'] }
        },
        required: ['run_id_a', 'run_id_b']
      }
    }
  }
]

const ok = (o: unknown) => JSON.stringify(o)
const fail = (msg: string) => JSON.stringify({ error: msg })

export const executeTool = async (name: string, args: any, ctx: ToolContext): Promise<string> => {
  try {
    if (name === 'generate_loop_route') {
      if (!(args.distance_km > 0)) return fail('距离必须大于 0')
      const route = ctx._fetchLoop
        ? await ctx._fetchLoop(args.start, args.distance_km, args.seed ?? 1)
        : await generateLoopRoute(args.start, args.distance_km, args.seed ?? 1)
      ctx.onRoute(route)
      return ok({ distance_km: +(route.distanceM / 1000).toFixed(2), ascent_m: route.ascentM, points: route.coordinates.length })
    }
    if (name === 'generate_point_to_point_route') {
      const route = ctx._fetchP2P
        ? await ctx._fetchP2P(args.start, args.end)
        : await generatePointToPointRoute(args.start, args.end)
      ctx.onRoute(route)
      return ok({ distance_km: +(route.distanceM / 1000).toFixed(2), ascent_m: route.ascentM })
    }
    if (name === 'geocode_place') {
      const hits = await geocodePlace(args.query)
      if (!hits.length) return fail(`没找到"${args.query}"`)
      return ok({ hits: hits.map(h => ({ name: h.name, coord: h.center })) })
    }
    if (name === 'analyze_run') {
      const run = ctx.runs.get(args.run_id)
      if (!run) return fail('找不到该训练，请确认已上传')
      return ok(buildRunDigest(run))
    }
    if (name === 'compare_runs') {
      const a = ctx.runs.get(args.run_id_a)
      const b = ctx.runs.get(args.run_id_b)
      if (!a || !b) return fail('需要两份已上传训练才能对比')
      return ok(buildComparisonDigest(a, b, args.relation ?? 'auto'))
    }
    return fail(`未知工具：${name}`)
  } catch (e: any) {
    return fail(String(e?.message ?? e))
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/agent/tools.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools.ts src/agent/tools.test.ts
git commit -m "feat(agent): tool schemas + executors"
```

---

## Task 11: Agent 主循环 + 系统提示词

**Files:**
- Create: `src/agent/coach.ts`
- Test: `src/agent/coach.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `LlmConfig`（`@/llm/provider`）、`toolSchemas`, `executeTool`, `ToolContext`（`@/agent/tools`）
- Produces:
  - `COACH_SYSTEM_PROMPT: string`
  - `runAgent(config, history: ChatMessage[], ctx: ToolContext, deps?: { complete?: typeof chatCompletion }): Promise<ChatMessage[]>`（返回新增的 assistant/tool 消息序列，处理多轮工具调用，上限 5 轮）

- [ ] **Step 1: 写失败测试（注入假 complete，先工具调用再收尾）**

```ts
// src/agent/coach.test.ts
import { describe, it, expect, vi } from 'vitest'
import { runAgent, COACH_SYSTEM_PROMPT } from './coach'

describe('runAgent', () => {
  it('系统提示词限定跑步范围且要求严格拒绝越界', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('跑步')
    expect(COACH_SYSTEM_PROMPT).toMatch(/拒绝|只能/)
  })

  it('模型先调工具、再据结果给最终回复', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ message: { role: 'assistant', content: '', tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'geocode_place', arguments: '{"query":"人民广场"}' } }
      ] } })
      .mockResolvedValueOnce({ message: { role: 'assistant', content: '好的，已定位。' } })

    const ctx = { runs: new Map(), onRoute: vi.fn() }
    const out = await runAgent(
      { provider: 'kimi', model: 'kimi-k2.5', apiKey: 'k' },
      [{ role: 'user', content: '从人民广场出发' }],
      ctx as any,
      { complete: complete as any, executeTool: async () => '{"hits":[]}' } as any
    )
    expect(complete).toHaveBeenCalledTimes(2)
    expect(out.at(-1)!.content).toContain('已定位')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/agent/coach.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// src/agent/coach.ts
import { chatCompletion, type ChatMessage, type LlmConfig } from '@/llm/provider'
import { toolSchemas, executeTool as defaultExecuteTool, type ToolContext } from '@/agent/tools'

export const COACH_SYSTEM_PROMPT = [
  '你是一位严谨、专业的跑步训练教练兼数据分析师，服务于一个地图跑步工具。',
  '你能做：生成真实路网上的跑步路线（环线/点到点）、复盘上传的训练、对比两份训练、围绕跑步路线/配速/心率/恢复给建议。',
  '严格范围：只处理跑步相关问题。遇到与跑步无关的请求（写代码、查天气、闲聊等），用一句话礼貌拒绝并把话题拉回跑步，绝不调用任何工具。',
  '生成路线时务必调用对应工具，不要自己编造坐标。需要起点坐标时：优先用上下文给的当前位置/地图选点坐标；用户只给地名时先调 geocode_place。',
  '实际距离以工具返回为准、如实告知，不要谎称"正好 5 公里"。',
  '用中文回复，先结论后证据后建议；缺失数据要明说，不编造。'
].join('\n')

type Deps = {
  complete?: typeof chatCompletion
  executeTool?: typeof defaultExecuteTool
}

export const runAgent = async (
  config: LlmConfig,
  history: ChatMessage[],
  ctx: ToolContext,
  deps: Deps = {}
): Promise<ChatMessage[]> => {
  const complete = deps.complete ?? chatCompletion
  const executeTool = deps.executeTool ?? defaultExecuteTool
  const messages: ChatMessage[] = [{ role: 'system', content: COACH_SYSTEM_PROMPT }, ...history]
  const produced: ChatMessage[] = []

  for (let round = 0; round < 5; round += 1) {
    const { message } = await complete(config, messages, toolSchemas)
    const assistant: ChatMessage = {
      role: 'assistant',
      content: message?.content ?? '',
      tool_calls: message?.tool_calls
    }
    messages.push(assistant)
    produced.push(assistant)

    const calls = message?.tool_calls ?? []
    if (!calls.length) break

    for (const call of calls) {
      let args: any = {}
      try { args = JSON.parse(call.function.arguments || '{}') } catch { /* 容错空参 */ }
      const result = await executeTool(call.function.name, args, ctx)
      const toolMsg: ChatMessage = { role: 'tool', tool_call_id: call.id, name: call.function.name, content: result }
      messages.push(toolMsg)
      produced.push(toolMsg)
    }
  }
  return produced
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/agent/coach.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/agent/coach.ts src/agent/coach.test.ts
git commit -m "feat(agent): coach system prompt + tool-calling loop"
```

---

## Task 12: 全套逻辑回归 + 类型门

**Files:** 无新增；验证 Task 2-11 协同。

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 所有测试 PASS。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 error（旧 App.tsx 仍引用 report，但 report 仍在 `runs/`，应通过；如有 `@/llm/provider` 与 digest 的 `ComparisonRelation` 重复定义冲突，统一为从 provider 导入）。

- [ ] **Step 3: Commit（若有修复）**

```bash
git add -A && git commit -m "test: full logic suite green + typecheck" || echo "nothing to commit"
```

---

## Task 13: 地图 — MapView + 图层

**Files:**
- Create: `src/map/MapView.tsx`、`src/map/layers.ts`
- 参考：旧 `src/app/App.tsx` 的 MapLibre 初始化与 `addSource('run-a'...)`、`src/app/mapStyle.ts`

**Interfaces:**
- Produces:
  - `layers.ts`: `setRouteLine(map, coords: LngLat[])`、`setStartPin(map, coord: LngLat | null)`、`setRunnerMarker(map, coord: LngLat | null)`、`setTrack(map, coords: LngLat[])`、`clearRoute(map)`
  - `MapView.tsx`: `<MapView onReady={(map) => void} onMapClick={(coord: LngLat) => void} />`

- [ ] **Step 1: 实现 `layers.ts`**

```ts
// src/map/layers.ts
import type maplibregl from 'maplibre-gl'
import type { LngLat } from '@/routing/ors'

const lineGeo = (coords: LngLat[]) => ({
  type: 'FeatureCollection' as const,
  features: coords.length ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }] : []
})
const pointGeo = (coord: LngLat | null) => ({
  type: 'FeatureCollection' as const,
  features: coord ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: coord } }] : []
})

export const ensureLayers = (map: maplibregl.Map) => {
  const add = (id: string) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: lineGeo([]) }) }
  add('route'); add('track'); add('start'); add('runner')
  if (!map.getLayer('route-line')) map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#2f6df6', 'line-width': 5 } })
  if (!map.getLayer('track-line')) map.addLayer({ id: 'track-line', type: 'line', source: 'track', paint: { 'line-color': '#f2994a', 'line-width': 5 } })
  if (!map.getLayer('start-dot')) map.addLayer({ id: 'start-dot', type: 'circle', source: 'start', paint: { 'circle-radius': 7, 'circle-color': '#36d399', 'circle-stroke-width': 2, 'circle-stroke-color': '#0f1622' } })
  if (!map.getLayer('runner-dot')) map.addLayer({ id: 'runner-dot', type: 'circle', source: 'runner', paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-width': 3, 'circle-stroke-color': '#2f6df6' } })
}

const setSource = (map: maplibregl.Map, id: string, data: any) => {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  src?.setData(data)
}

export const setRouteLine = (map: maplibregl.Map, coords: LngLat[]) => setSource(map, 'route', lineGeo(coords))
export const setTrack = (map: maplibregl.Map, coords: LngLat[]) => setSource(map, 'track', lineGeo(coords))
export const setStartPin = (map: maplibregl.Map, coord: LngLat | null) => setSource(map, 'start', pointGeo(coord))
export const setRunnerMarker = (map: maplibregl.Map, coord: LngLat | null) => setSource(map, 'runner', pointGeo(coord))
export const clearRoute = (map: maplibregl.Map) => { setRouteLine(map, []); setStartPin(map, null) }
```

- [ ] **Step 2: 实现 `MapView.tsx`**

```tsx
// src/map/MapView.tsx
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ensureLayers } from './layers'
import type { LngLat } from '@/routing/ors'

const styleUrl = `https://api.maptiler.com/maps/streets-v2/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`

export const MapView = ({ onReady, onMapClick }: { onReady: (m: maplibregl.Map) => void; onMapClick: (c: LngLat) => void }) => {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = new maplibregl.Map({ container: ref.current, style: styleUrl, center: [121.47, 31.23], zoom: 13 })
    mapRef.current = map
    map.on('load', () => { ensureLayers(map); onReady(map) })
    map.on('click', (e) => onMapClick([e.lngLat.lng, e.lngLat.lat]))
    return () => { map.remove(); mapRef.current = null }
  }, [])
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
}
```

- [ ] **Step 3: 类型门**

Run: `npx tsc --noEmit`
Expected: 0 error。

- [ ] **Step 4: Commit**

```bash
git add src/map/MapView.tsx src/map/layers.ts
git commit -m "feat(map): MapView + route/track/marker layers"
```

---

## Task 14: 设置齿轮 SettingsGear

**Files:**
- Create: `src/settings/SettingsGear.tsx`
- Consumes: `LlmConfig`, `LlmProvider`, `llmProviderMeta`, `testApiKey`, `saveConfig`, `loadConfig`（`@/llm/provider`）

- [ ] **Step 1: 实现组件**

```tsx
// src/settings/SettingsGear.tsx
import { useState } from 'react'
import { type LlmConfig, type LlmProvider, llmProviderMeta, testApiKey, saveConfig, loadConfig } from '@/llm/provider'

export const SettingsGear = ({ onSaved }: { onSaved: (c: LlmConfig) => void }) => {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<LlmConfig>(
    loadConfig() ?? { provider: 'kimi', model: llmProviderMeta.kimi.defaultModel, apiKey: '' }
  )
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<string>('')

  const setProvider = (p: LlmProvider) => setCfg({ ...cfg, provider: p, model: llmProviderMeta[p].defaultModel })

  const onTest = async () => {
    setStatus('测试中…')
    const r = await testApiKey(cfg)
    setStatus(r.ok ? '✓ key 有效' : `✗ 无效：${r.error}`)
  }
  const onSave = () => { saveConfig(cfg); onSaved(cfg); setStatus('已保存'); setOpen(false) }

  return (
    <>
      <button className="gear-btn" title="设置" onClick={() => setOpen(v => !v)}>⚙</button>
      {open && (
        <div className="gear-panel">
          <label>模型平台</label>
          <select value={cfg.provider} onChange={e => setProvider(e.target.value as LlmProvider)}>
            <option value="kimi">Kimi</option>
            <option value="deepseek">DeepSeek</option>
          </select>
          <label>Model</label>
          <input value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value })} />
          <label>API Key</label>
          <div className="key-row">
            <input type={show ? 'text' : 'password'} value={cfg.apiKey} onChange={e => setCfg({ ...cfg, apiKey: e.target.value })} />
            <button onClick={() => setShow(v => !v)}>{show ? '隐藏' : '显示'}</button>
          </div>
          <div className="gear-actions">
            <button onClick={onTest}>测试</button>
            <button className="primary" onClick={onSave}>保存</button>
          </div>
          {status && <div className="gear-status">{status}</div>}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: 类型门**

Run: `npx tsc --noEmit`
Expected: 0 error。

- [ ] **Step 3: Commit**

```bash
git add src/settings/SettingsGear.tsx
git commit -m "feat(settings): gear panel with key test + save"
```

---

## Task 15: 对话 UI — Composer + ChatDock

**Files:**
- Create: `src/chat/Composer.tsx`、`src/chat/ChatDock.tsx`

**Interfaces:**
- Produces:
  - `type ChatTurn = { role: 'user' | 'assistant'; content: string }`
  - `Composer`: `<Composer docked={boolean} onSend={(text: string) => void} onUpload={(file: File) => void} />`
  - `ChatDock`: `<ChatDock turns={ChatTurn[]} docked={boolean} onSend onUpload />`

- [ ] **Step 1: 实现 Composer**

```tsx
// src/chat/Composer.tsx
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
```

- [ ] **Step 2: 实现 ChatDock**

```tsx
// src/chat/ChatDock.tsx
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
```

- [ ] **Step 3: 类型门**

Run: `npx tsc --noEmit`
Expected: 0 error。

- [ ] **Step 4: Commit**

```bash
git add src/chat/Composer.tsx src/chat/ChatDock.tsx
git commit -m "feat(chat): composer + dock (landing→docked)"
```

---

## Task 16: 编排 hook useChatAgent

**Files:**
- Create: `src/chat/useChatAgent.ts`

**Interfaces:**
- Consumes: `runAgent`（`@/agent/coach`）、`ToolContext`（`@/agent/tools`）、`ChatMessage`/`LlmConfig`（`@/llm/provider`）、`Run`（`@runs/types`）、`RouteResult`（`@/routing/ors`）
- Produces:
  - `useChatAgent(args: { config: LlmConfig | null; ctx: ToolContext }): { turns: ChatTurn[]; busy: boolean; send: (text: string, extraContext?: string) => Promise<void>; pushUser: (text: string) => void; pushAssistant: (text: string) => void }`
  - 维护 `ChatMessage[]` 历史；`send` 调 `runAgent`，把 assistant 文本汇入 `turns`；key 缺失时推送一条提示而非崩溃。

- [ ] **Step 1: 实现**

```ts
// src/chat/useChatAgent.ts
import { useState, useRef } from 'react'
import { runAgent } from '@/agent/coach'
import type { ToolContext } from '@/agent/tools'
import type { ChatMessage, LlmConfig } from '@/llm/provider'
import type { ChatTurn } from './ChatDock'

export const useChatAgent = ({ config, ctx }: { config: LlmConfig | null; ctx: ToolContext }) => {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const history = useRef<ChatMessage[]>([])

  const pushUser = (text: string) => setTurns(t => [...t, { role: 'user', content: text }])
  const pushAssistant = (text: string) => setTurns(t => [...t, { role: 'assistant', content: text }])

  const send = async (text: string, extraContext?: string) => {
    pushUser(text)
    if (!config?.apiKey) { pushAssistant('请先点右上角 ⚙ 设置并测试你的 API Key。'); return }
    const userMsg: ChatMessage = { role: 'user', content: extraContext ? `${text}\n\n[上下文] ${extraContext}` : text }
    history.current.push(userMsg)
    setBusy(true)
    try {
      const produced = await runAgent(config, history.current, ctx)
      history.current.push(...produced)
      const finalText = [...produced].reverse().find(m => m.role === 'assistant' && m.content)?.content
      if (finalText) pushAssistant(finalText)
    } catch (e: any) {
      pushAssistant(`出错了：${String(e?.message ?? e)}。可稍后重试或检查 key。`)
    } finally {
      setBusy(false)
    }
  }
  return { turns, busy, send, pushUser, pushAssistant }
}
```

- [ ] **Step 2: 类型门**

Run: `npx tsc --noEmit`
Expected: 0 error。

- [ ] **Step 3: Commit**

```bash
git add src/chat/useChatAgent.ts
git commit -m "feat(chat): useChatAgent orchestration hook"
```

---

## Task 17: 重写 App 外壳 + 起点切换器 + 预览卡 + 回放条

**Files:**
- Rewrite: `src/app/App.tsx`
- Rewrite: `src/app/styles.css`（保留地图/对话/卡片/齿轮样式，去掉旧看板样式）
- Consumes: 全部上述模块；`parseGpxFile`(`@runs/gpx`)、`parseFitFile`/`parseJsonFile`（按现有导出名，从 `@runs/fit`、`@runs/json`）、`sampleAtDistance`(`@runs/align`)

**Interfaces:**
- App 内部状态：`mode: 'landing' | 'working'`、`startSource: 'current' | 'map' | 'place'`、`startCoord: LngLat | null`、`route: RouteResult | null`、`activeRun: Run | null`、`replayT`、`config`。
- 起点来源切换器（右上三段）、路线预览卡（route 非空时显示：实际公里/爬升/路面 + 换一条/下载 GPX）、回放条（activeRun 非空时显示：进度 + 实时配速/心率/距离）。

- [ ] **Step 1: 写 App.tsx（组合外壳）**

```tsx
// src/app/App.tsx
import { useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { MapView } from '@/map/MapView'
import { setRouteLine, setStartPin, setTrack, setRunnerMarker } from '@/map/layers'
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
import './styles.css'

type StartSource = 'current' | 'map' | 'place'

export default function App() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [docked, setDocked] = useState(false)
  const [startSource, setStartSource] = useState<StartSource>('current')
  const [startCoord, setStartCoord] = useState<LngLat | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [config, setConfig] = useState<LlmConfig | null>(loadConfig())
  const runs = useRef<Map<string, Run>>(new Map())

  const ctx: ToolContext = useMemo(() => ({
    runs: runs.current,
    onRoute: (r: RouteResult) => {
      setRoute(r)
      const map = mapRef.current
      if (map) { setRouteLine(map, r.coordinates); if (r.coordinates[0]) setStartPin(map, r.coordinates[0]) }
    }
  }), [])

  const { turns, send } = useChatAgent({ config, ctx })

  const currentStartContext = () => {
    if (startCoord) return `用户选定起点坐标 ${JSON.stringify(startCoord)}`
    return '用户未指定起点，可视为当前位置（地图中心）'
  }

  const onSend = (text: string) => {
    if (!docked) setDocked(true)
    void send(text, currentStartContext())
  }

  const onUpload = async (file: File) => {
    if (!docked) setDocked(true)
    const text = file.name.endsWith('.fit') ? '' : await file.text()
    const parsed: Run = file.name.endsWith('.fit')
      ? await parseFitFile(await file.arrayBuffer(), file.name)
      : file.name.endsWith('.json') ? await parseJsonFile(text, file.name) : parseGpxFile(text, file.name)
    runs.current.set(parsed.id, parsed)
    setRun(parsed)
    const map = mapRef.current
    if (map) setTrack(map, parsed.points.map(p => [p.lon, p.lat] as LngLat))
    void send(`[上传训练] ${file.name}，请复盘`, `run_id=${parsed.id}`)
  }

  const onMapClick = (c: LngLat) => { if (startSource === 'map') { setStartCoord(c); mapRef.current && setStartPin(mapRef.current, c) } }

  const downloadGpx = () => {
    if (!route) return
    const blob = new Blob([routeToGpx(route, 'RunCoach 路线')], { type: 'application/gpx+xml' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'runcoach-route.gpx'; a.click()
  }

  return (
    <div className="app-root">
      <MapView onReady={m => { mapRef.current = m }} onMapClick={onMapClick} />

      <div className="top-right">
        <div className="start-seg">
          {(['current', 'map', 'place'] as StartSource[]).map(s => (
            <button key={s} className={startSource === s ? 'on' : ''} onClick={() => setStartSource(s)}>
              {s === 'current' ? '📍当前' : s === 'map' ? '🗺选点' : '🔎地名'}
            </button>
          ))}
        </div>
        <SettingsGear onSaved={setConfig} />
      </div>

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

- [ ] **Step 2: 写 ReplayBar（同文件或拆出 `src/chat/ReplayBar.tsx`）**

```tsx
// src/app/ReplayBar.tsx
import { useState } from 'react'
import type maplibregl from 'maplibre-gl'
import type { Run } from '@runs/types'
import { sampleAtDistance } from '@runs/align'
import { setRunnerMarker } from '@/map/layers'
import type { LngLat } from '@/routing/ors'

export const ReplayBar = ({ run, map }: { run: Run; map: maplibregl.Map | null }) => {
  const [pct, setPct] = useState(0)
  const dist = run.totalDistance * pct
  const s = sampleAtDistance(run, dist)
  if (s && map) setRunnerMarker(map, [s.lon, s.lat] as LngLat)
  const pace = s?.speed ? `${Math.floor((1000 / s.speed) / 60)}:${String(Math.round((1000 / s.speed) % 60)).padStart(2, '0')}/km` : '--'
  return (
    <div className="replay-bar">
      <input type="range" min={0} max={1} step={0.001} value={pct} onChange={e => setPct(Number(e.target.value))} />
      <div className="replay-live">
        <span>{(dist / 1000).toFixed(2)} km</span>
        <span>配速 {pace}</span>
        <span>心率 {s?.hr ?? '--'}</span>
      </div>
    </div>
  )
}
```

（在 App.tsx 顶部 `import { ReplayBar } from './ReplayBar'`。`sampleAtDistance` 返回的 `Sample` 含 `lat/lon/speed/hr`，见 `@runs/align`；如字段名不同，按实际返回结构调整。）

- [ ] **Step 3: 写 `styles.css`（关键类，去旧看板样式）**

为以下类提供样式（深色、扁平描边、无阴影——遵守用户偏好）：`.app-root`、`.top-right`、`.start-seg`(+`.on`)、`.gear-btn`/`.gear-panel`/`.gear-actions`/`.gear-status`/`.key-row`、`.route-card`(+`.row`/`.card-btns`/`.primary`)、`.replay-bar`/`.replay-live`、`.chat-dock`(+`.landing`/`.docked`)、`.chat-msgs`、`.bubble`(+`.user`/`.assistant`)、`.composer`(+`.mini`)、`.plus`/`.composer-input`/`.send`。落地态 `.chat-dock.landing` 居中底部、`.docked` 收到左下角，用 `transition` 做位移动画。**禁止 box-shadow**，统一 1px border。

- [ ] **Step 4: 更新 `main.tsx`**

确认 `src/app/main.tsx` 渲染 `<App />`（默认导出），移除任何对旧组件的引用。

- [ ] **Step 5: 构建门 + 手动启动**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 error，构建通过。
然后 `npm run dev`，浏览器打开：地图满屏、底部对话框居中。

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/app/ReplayBar.tsx src/app/styles.css src/app/main.tsx
git commit -m "feat(app): map+chat shell, start switcher, route card, replay bar"
```

---

## Task 18: 清理废弃文件 + 文档 + e2e 验收

**Files:**
- Delete: `src/runs/report.ts`、`src/app/DarkVeil.tsx`、`src/app/DarkVeil.css`、`src/runs/llm.ts`（逻辑已迁 digest）
- Modify: `README.md`、`RunReplay_Project_Summary.md`（更新为新定位，去掉 HTML 看板段落）

- [ ] **Step 1: 确认无引用后删除**

```bash
cd /Users/rez/RunCoach
grep -rn "report\|DarkVeil\|@runs/llm\|shared/llm" src/ || echo "no refs"
git rm src/runs/report.ts src/app/DarkVeil.tsx src/app/DarkVeil.css src/runs/llm.ts
```
（若 grep 仍有引用，先在引用处改掉再删。）

- [ ] **Step 2: 构建 + 全量测试门**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 全绿。

- [ ] **Step 3: 更新文档**

`README.md`：功能列表改为「自然语言生成真实路网路线（环线/点到点）、下载 GPX、上传 FIT/GPX 回放与 AI 复盘」；配置段含 `VITE_MAPTILER_KEY` 与 `VITE_ORS_KEY`，LLM key 在应用内齿轮配置。删除「HTML 看板」相关描述。

- [ ] **Step 4: 手动 e2e 验收清单（逐项实跑）**

```
[ ] 落地态：地图满屏 + 底部居中对话框
[ ] ⚙ 填入 LLM key → 测试显示 ✓ → 保存
[ ] 「从我当前位置生成一条 5 公里环线」→ 地图画出闭环 + 预览卡显示 ~5.0km
[ ] 「换一条」→ 同距离不同走法
[ ] 下载 GPX → 文件可被其它工具/本应用打开
[ ] 切「🗺选点」→ 点地图落起点 →「来条 8km 环线」→ 从该点生成
[ ] 「从人民广场出发跑到外滩」→ 触发地名+点到点
[ ] 上传一条 FIT → 地图回放 + 拖动进度看配速/心率 + 左栏出 AI 复盘
[ ] 越界提问「帮我写段 Python」→ AI 一句话礼貌拒绝、不调工具
[ ] 关掉 key 或填错 → 友好提示，不崩溃
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove HTML dashboard + DarkVeil, refresh docs, e2e pass"
```

---

## Self-Review（计划完成后的核对结果）

- **Spec 覆盖**：§2 架构→Task 1；§3 模块→各 Task；§4 UI（落地/工作态、起点三选一、齿轮、预览卡、回放条）→Task 13-17；§5 agent（提示词/工具/上传/换一条）→Task 10-11、17；§6 数据流→Task 16-17；§7 凑距离→Task 4；§8 错误处理→分散在 Task 3/4/6/9/16/17；§9 测试→Task 2-12；§10 删除→Task 18。**无遗漏。**
- **偏离记录**：①`routing/elevation.ts` 取消，爬升改用 ORS `elevation:true` 的 `ascent`（YAGNI，已在 Global Constraints 注明）。②目录用 `runs/` 而非保留 `shared/`，Task 1 用 `git mv` 完成且保持旧应用可构建。
- **类型一致性**：`LngLat`/`RouteResult` 全程统一来自 `@/routing/ors`；`ChatMessage`/`LlmConfig`/`ComparisonRelation` 统一来自 `@/llm/provider`（digest 若临时本地定义需在 Task 9 后改为 import）；图层函数名 `setRouteLine/setStartPin/setTrack/setRunnerMarker/clearRoute` 在 Task 13 定义、Task 17 一致使用。
- **占位符扫描**：逻辑任务均含完整测试与实现代码；UI 任务含完整组件代码；样式任务（Task 17 Step 3）以明确类清单 + 约束描述代替逐行 CSS（属可接受的样式实现指引，非逻辑占位）。
