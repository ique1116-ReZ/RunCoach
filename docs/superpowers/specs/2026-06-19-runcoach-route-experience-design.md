# RunCoach 路线生成体验升级设计

> 状态：设计已确认，待用户终审 → 进入实现计划
> 日期：2026-06-19
> 分支：feat/route-experience（基于含聊天优化的 HEAD）

## 1. 背景

RunCoach 已上线"地图 + AI 跑步教练"。本次针对路线生成做三处改进：

1. **GPX 缺海拔（bug）**：生成的路线覆盖山路，但下载的 GPX 没有每点高程，外部工具看不到爬升曲线。
2. **越野 / 路跑分流**：目前只有一种步行 profile，越野和路跑生成同样的"走道路"路线。应能分辨并生成不同路线。
3. **起点选择体验差**：当前用右上角三段切换器（📍当前/🗺选点/🔎地名），不直观、且交互割裂。改为 AI 引导式卡片：识别到要生成路线时，先问地形、再问起点，手动选点用大头针+确认。

### 成功标准
- 下载的 GPX 每个轨迹点带 `<ele>`，外部工具能看到爬升曲线。
- 用户说"越野"得到偏山路步道的路线，说"路跑"得到走道路的路线。
- 让 AI 生成路线时，若缺地形或起点，自动弹对应卡片引导；信息齐全则零卡片直接生成。
- 撤掉右上角三段切换器。

## 2. 约束（沿用项目既有）
- 纯前端，外部 API 浏览器直连。
- TypeScript strict。
- ORS `elevation: true`（已开）；profile 用 `foot-walking`（路跑）/ `foot-hiking`（越野）。
- 实际距离/高程如实输出。
- 所有外部调用显式 try/catch，不静默吞错。
- CSS 无 box-shadow，扁平 1px 描边（产品负责人硬性偏好）。
- 中文回复；越界严格拒绝。

## 3. ① GPX 海拔修复

ORS 开了 `elevation: true`，返回的 GeoJSON 几何点是 `[lng, lat, ele]`。当前 `parseGeoJson` 只取 `[c[0], c[1]]`，丢了 `c[2]`。

- `RouteResult` 增加 `elevations?: number[]`（与 `coordinates` 等长，缺失点为 `NaN`/跳过）。
- `parseGeoJson(json, kind)`：在映射坐标的同时收集 `c[2]` 进 `elevations`（当任一点存在第三维时才填充该数组，否则保持 `undefined`）。
- `routeToGpx(route, name)`：当 `route.elevations?.[i]` 为有限数时，在该 `<trkpt>` 内写 `<ele>{value}</ele>`。
- 预览卡的"累计爬升"沿用 ORS `summary.ascent`，无需改。

## 4. ③ 越野 / 路跑 profile

- 新类型 `RunProfile = 'foot-walking' | 'foot-hiking'`（位于 `routing/ors.ts`）。
- `postOrs(body, profile)` 用 `https://api.openrouteservice.org/v2/directions/${profile}/geojson`。
- `buildRoundTripBody` / `buildDirectionsBody` 不变（profile 走 URL，不在 body）。
- `generateLoopRoute(start, distanceKm, profile, seed?, deps?)` 与 `generatePointToPointRoute(start, end, profile, deps?)` 新增 `profile` 参数，默认 `foot-walking`，透传给 `postOrs`。
- 地形→profile 映射：`trail → foot-hiking`，`road → foot-walking`。映射放在 `agent/tools.ts`（工具入参收 `terrain: 'trail' | 'road'`，内部转 profile）。

## 5. ② 引导式起点 + 地形卡片

### 5.1 交互流程
AI 识别到"生成跑步路线"意图后，盘点缺什么、**缺什么弹什么**：

1. **地形卡**（仅当用户未在原话指明越野/路跑时）：标题"想跑哪种？"，两个大按钮「🏔 越野跑 / 🛣 路跑」。
2. **起点卡**（仅当起点未知时）：标题"从哪出发？"，两个按钮「📍 当前位置 / 🗺 手动选点」。
   - **当前位置**：用浏览器定位坐标（mount 时已尝试获取）；若定位不可用/被拒，提示并自动切到手动选点。
   - **手动选点**：进入"选点模式"——地图光标变十字/大头针；点地图落一个临时起点 pin，弹出小确认条「把起点设在这里？ ✓确定 ✗取消」；点确定回填该坐标并退出选点模式，点取消可重新点。
3. 地形 + 起点齐全 → AI 用对应 profile 生成路线 → 渲染 + 预览卡 + 下载 GPX。

一句话说全（"从我当前位置来条越野5公里环线"）→ 零卡片直接生成。地名（"从人民广场出发"）→ AI 用 `geocode_place` 解析为起点，不弹卡。

### 5.2 架构（agent 驱动的交互工具）
AI 在缺信息时通过**返回 Promise 的工具**向用户提问，UI 卡片交互完成时 resolve，结果回到 agent 循环，agent 再调路线工具。

- `agent/tools.ts` 新增工具：
  - `ask_run_terrain` → 返回 `{ terrain: 'trail' | 'road' }` 或 `{ cancelled: true }`。
  - `ask_start_point` → 返回 `{ start: [lng, lat] }` 或 `{ cancelled: true }`。
- `ToolContext` 新增处理器（由 App 实现，返回 Promise）：
  - `requestTerrain(): Promise<'trail' | 'road' | null>`（null=取消）
  - `requestStartPoint(): Promise<LngLat | null>`（null=取消）
- 路线工具入参：`generate_loop_route` / `generate_point_to_point_route` 增加 `terrain: 'trail' | 'road'`（executor 内转 profile）。`start` 仍为坐标数组。
- `agent/coach.ts` 系统提示词补充：生成路线前须确定**地形**与**起点**；能从用户原话推断就用，缺失才分别调 `ask_run_terrain` / `ask_start_point`；任一工具返回 `cancelled` 则礼貌停止、不生成路线；拿到地形+起点后调对应路线工具并传 `terrain`。

### 5.3 App 侧实现
- 删除三段切换器 UI 与 `startSource` 状态；保留 mount 时 geolocation（让"当前位置"即时可用）。
- `requestTerrain` / `requestStartPoint` 实现为：设置卡片状态 → 返回一个 Promise，并把它的 resolver 暂存，卡片按钮点击时调用 resolver。
- 新增小组件（扁平、无阴影、复用现有 CSS token）：
  - `app/TerrainCard.tsx`：两按钮，onPick('trail'|'road') / onCancel。
  - `app/StartPointCard.tsx`：两按钮，onPick('current'|'manual') / onCancel。
  - `app/PinConfirm.tsx`：选点模式下的确认条（确定/取消）。
- 选点模式状态 `picking: boolean`；为 true 时 `MapView` 容器加一个 class 使光标变十字/大头针；地图点击落临时 pin（复用 `setStartPin`）并显示 `PinConfirm`。
- `map/MapView.tsx`：接受一个 `picking` 标志切换光标 class（或 App 通过容器 class 控制）。

## 6. 错误处理
- 选"当前位置"但定位被拒/超时 → 卡片内提示"定位不可用"，自动切到手动选点。
- 卡片"取消" → 对应工具回传 `{cancelled:true}`，agent 礼貌停下，不生成路线。
- 越野（foot-hiking）在起点附近找不到路线 → ORS 抛错，executor 回 `{error}`，agent 如实告知"附近没找到合适的越野路线，换个起点或改路跑"。
- 定位/路由/网络错误均可见可读可重试。

## 7. 测试
单测（Vitest，mock 网络）：
- `routing/ors.ts`：`postOrs`/请求按 profile 走对 URL；`parseGeoJson` 从 `[lng,lat,ele]` 收集 `elevations`，2D 输入时 `elevations` 为 `undefined`。
- `export/gpx-export.ts`：有 `elevations` 时每点写 `<ele>` 且仍能被 `runs/gpx` 往返解析；无高程时不写 `<ele>`。
- `agent/tools.ts`：`ask_run_terrain`/`ask_start_point` 调 `ctx.requestTerrain`/`requestStartPoint` 并回传结果（含 cancelled）；`generate_loop_route` 把 `terrain` 转成正确 profile 传入（用注入的 `_fetchLoop` 断言）。
不做单测（手动验收）：卡片 UI、大头针选点、光标变化——real-app 截图验收。

手动验收清单：
- "来条5公里环线" → 弹地形卡 → 选越野 → 弹起点卡 → 手动选点 → 大头针点图 → 确认 → 生成偏山路路线。
- 下载 GPX，确认含 `<ele>`、外部工具能看爬升。
- "从我当前位置来条路跑5公里环线" → 零卡片直接生成走道路路线。
- 卡片点取消 → AI 礼貌停下。
- 定位被拒选当前位置 → 自动转手动。

## 8. 复用 / 删除 / 新增
- **复用**：现有 routing/agent/map/chat 架构、geolocation、预览卡、GPX 下载。
- **删除**：右上角三段起点切换器 + `startSource` 状态。
- **新增**：`RunProfile` 类型与 profile 透传、`elevations` 高程、`ask_run_terrain`/`ask_start_point` 工具与 `requestTerrain`/`requestStartPoint` 处理器、`TerrainCard`/`StartPointCard`/`PinConfirm` 组件、选点模式光标。
