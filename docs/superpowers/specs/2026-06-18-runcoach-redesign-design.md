# RunCoach 重构设计 — AI 跑步教练（地图 + 对话）

> 状态：设计已确认，待用户终审 → 进入实现计划
> 日期：2026-06-18

## 1. 背景与目标

现有项目 **Run Replay** 是一个纯前端的跑步轨迹复盘/对比工具（React + TS + Vite + MapLibre GL，无后端，浏览器直连 Kimi/DeepSeek 做训练分析）。`App.tsx` 已膨胀到 1182 行，且包含一套要废弃的 HTML 看板预览。

本次重构把它重塑为一个 **AI 跑步教练**：首页是满屏地图 + 底部对话框（形似 Claude/GPT），用户用自然语言让 AI 教练**生成真实路网上的跑步路线**（环线 / 点到点）、**复盘上传的训练**、并在地图上**回放**。

定位较高：该作业有可能被部署到 Suunto 官网，因此质量、打磨、品牌适配都要做到位。

### 成功标准
- 进入首页即满屏地图 + 居中底部对话框，简洁高级。
- 能用一句话生成**任意公里数**、贴**真实步道/道路**的环线，实际距离落在目标 ±5% 内，可预览、可下载 GPX。
- 能用一句话生成 A→B 点到点路线。
- 起点支持：当前位置 / 地图选点 / 说地名。
- 保留训练**回放**与 AI **复盘 / A-B 对比**。
- AI 严格限定在跑步范围，越界明确拒绝。
- 右上角设置齿轮可输入、测试、保存 LLM key。

### 非目标 / 明确移除
- **移除 HTML 看板预览生成**（`report.ts` 及相关 UI）。
- 不引入后端（保持纯前端，外部 API 浏览器直连）。
- 点到点的高级偏好（避开台阶/坡度优化等）暂不做，留待后续。

## 2. 整体架构与技术栈

纯前端，无后端。React 19 + TypeScript + Vite + MapLibre GL。浏览器直连三类外部服务：

| 服务 | 用途 | Key 位置 |
|---|---|---|
| **MapTiler** | 底图瓦片、地名搜索 (geocoding)、高程 (爬升) | `.env.local`（构建期） |
| **OpenRouteService (ORS)** | 路由：环线 `round_trip` + 点到点 `directions`，`foot-walking` profile | `.env.local`（构建期） |
| **Kimi / DeepSeek** | AI 教练对话 + 工具调用 (function calling) | 浏览器 `localStorage`（运行时，齿轮面板） |

核心理念：**AI 教练 = 带工具调用的 agent**。模型不自己算地理坐标——它理解用户意图 → 决定调用哪个工具 → 工具（ORS/地名搜索）返回真实数据 → 模型用自然语言回复，同时副作用渲染到地图。

> 说明：MapTiler 的 routing API 在 2026-06 仍是 beta，未正式开放，因此路由能力由 ORS 提供；MapTiler 仅负责底图 / 地名 / 高程。

### 密钥（开发环境已确认可用）
- MapTiler key：`wPkFX6Kyvt4TToj2T5Vj`（付费账号）→ `.env.local` 的 `VITE_MAPTILER_KEY`
- ORS key（免费账号，2000 次/日）→ `.env.local` 的 `VITE_ORS_KEY`
- LLM key：用户在齿轮面板运行时填入，存 `localStorage`

## 3. 模块结构

把 1182 行的 `App.tsx` 按职责拆成小而清晰、可独立测试的单元：

```
src/
├── app/
│   ├── App.tsx          # 薄外壳：组合 map + chat + 状态编排（目标 <200 行）
│   ├── main.tsx
│   └── styles.css
├── map/
│   ├── MapView.tsx      # MapLibre 初始化、底图、相机
│   └── layers.ts        # 增删改：路线线条 / 起点 pin / 回放跑者点 / 轨迹
├── chat/
│   ├── ChatDock.tsx     # 对话外壳：居中→左下角动画、消息列表
│   ├── Composer.tsx     # 输入框 + “+”上传按钮
│   └── useChatAgent.ts  # 驱动 agent 循环、流式渲染、串联副作用
├── agent/
│   ├── coach.ts         # 系统提示词（严格跑步范围）+ agent 主循环
│   └── tools.ts         # 工具定义 (schema) + 执行器
├── routing/
│   ├── ors.ts           # ORS 环线/点到点封装 + 距离逼近
│   ├── geocode.ts       # MapTiler 地名 → 坐标
│   └── elevation.ts     # MapTiler 高程（爬升）
├── runs/                # 复用现有解析器（原 shared/ 迁入）
│   ├── gpx.ts  fit.ts  json.ts  geo.ts  align.ts  zones.ts  types.ts
├── analysis/
│   └── digest.ts        # 训练摘要（复用现 llm.ts 的 buildRunDigest 等）
├── export/
│   └── gpx-export.ts    # 路线/轨迹 → GPX 下载
└── llm/
    └── provider.ts      # Kimi/DeepSeek 配置 + 带工具调用的 chat completions + testApiKey
```

**复用**：`gpx / fit / json / geo / align / zones / types` 原样迁入 `runs/`；现 `llm.ts` 的摘要逻辑拆进 `analysis/digest.ts`。
**删除**：`report.ts`、`DarkVeil.tsx` / `DarkVeil.css`、HTML 预览相关 UI 与左侧栏旧布局。
**新增**：`map/ chat/ agent/ routing/ export/ llm/` 六组。

## 4. UI / 交互设计

**一个屏幕，三种状态，地图始终是主角，对话是半透明叠加层。**

### 4.1 落地态
- 满屏地图（MapTiler `streets-v2`），默认定位到当前位置。
- 对话框**居中悬浮在底部**，形似 Claude/GPT：左侧 `+` 按钮（上传 FIT/GPX/JSON），中间输入框，右侧发送。
- 右上角：设置齿轮 + 起点来源切换器。

### 4.2 工作态（路线生成 / 回放 / 复盘共用外壳）
- 回车后，对话框以动画**收到屏幕左下角**，变成紧凑聊天栏（消息列表 + 底部迷你输入条）。
- 主区留给地图，按当前功能渲染不同内容：
  - **路线生成态**：地图画出真实路线（环线起终点重合，绿色起点标记）；右上角“路线预览”卡（实际距离 / 累计爬升 / 路面 + “换一条” / “下载 GPX”）。
  - **回放/复盘态**：上传轨迹在地图上回放；底部播放条（进度 scrubber + 播放/暂停）+ 实时配速/心率/距离；左侧聊天栏出 AI 复盘文字。

### 4.3 起点来源（三种，统一归一为“一个坐标”）
右上角三段切换器 + 聊天自然语言皆可驱动：
- **📍 当前位置**：浏览器 Geolocation（默认）。
- **🗺 地图选点**：点地图落 pin，可拖动微调，出现“就从这里生成”确认。
- **🔎 说地名**：聊天里说“从人民广场出发” → `geocode_place`（MapTiler）转坐标。

### 4.4 设置齿轮（右上角）
轻量面板（抽屉/弹层）：
- Provider 选择：Kimi / DeepSeek
- Model：默认 `kimi-k2.5` / `deepseek-v4-flash`，可改
- API Key 输入（密码态，可切换显示）
- **「测试」**：调用 `provider.testApiKey()` 发最小请求验证 → 当场显示 ✓ 有效 / ✗ 无效（带原因，如 401 / 网络错）
- **「保存」**：写入 `localStorage`，下次自动带出

分工：LLM key 走齿轮（运行时填、可测可存）；MapTiler / ORS key 走 `.env.local`（构建期，不暴露给终端用户）。

## 5. AI 教练 Agent

### 5.1 系统提示词（严格范围）
- 身份：严谨的跑步训练教练 / 数据分析师。
- 范围：仅跑步路线、训练、配速、心率、恢复等。
- **越界严格拒绝**：礼貌一句话挡回（如“我只能帮你处理跑步路线和训练相关的问题哦”），不展开、不调用任何工具。
- 输出中文，先结论后证据后建议；不编造缺失数据，缺失要明说。

### 5.2 工具集

| 工具 | 入参 | 返回 / 副作用 |
|---|---|---|
| `generate_loop_route` | start{lng,lat}, distance_km, seed? | 真实环线几何 + 实际距离/爬升 → 画地图 + 预览卡 |
| `generate_point_to_point_route` | start, end, distance_km? | A→B 真实路线 + 距离/爬升 → 画地图 + 预览卡 |
| `geocode_place` | query 文本 | 候选坐标（地名 → 坐标） |
| `analyze_run` | runId | 该训练摘要 → agent 据此口述复盘 |
| `compare_runs` | runIdA, runIdB | 两份对比摘要 → agent 口述对比 |

### 5.3 文件上传（非工具路径）
用户点 `+` 上传 FIT/GPX/JSON → app 解析成 `Run` → 自动进入回放态 + 计算摘要塞进对话上下文 → agent 自动产出复盘（等价于自动 `analyze_run`）。用户再说“和上一条对比” → 触发 `compare_runs`。

### 5.4 “换一条”
复用 `generate_loop_route` 换 seed，同距离不同走法。

## 6. 数据流

```
用户输入(+起点来源/可选文件) → useChatAgent
  → llm/provider 带工具 schema 发给 Kimi/DeepSeek
  → 模型返回 tool_call: generate_loop_route{start, distance_km, seed}
  → routing/ors 执行（见 §7 逼近算法）
  → 工具结果(几何+实际距离)回填给模型
  → 模型生成自然语言回复 ─→ 渲染到左下聊天栏
                        └→ 副作用: map/layers 画路线 + 右上预览卡
  → 用户「下载 GPX」→ export/gpx-export   或  「换一条」→ 换 seed 重跑
```

## 7. 环线“凑距离”逼近算法

ORS `round_trip.length` 只是近似，需迭代收敛到目标 ±5%：

```
target = distance_km * 1000
requested = target
best = null
最多 3 轮：
  resp   = ORS round_trip(start, length=requested, seed, profile=foot-walking)
  actual = 实测几何长度（haversine 累加）
  if |actual - target| / target ≤ 0.05:  return resp        # 达标
  best = 取离 target 更近者
  requested = requested * (target / actual)                 # 按比例校正
返回 best
```

- 点到点（directions）距离由起终点决定，不做逼近，直接返回实测。
- **实际距离始终如实显示**（预览卡 + 聊天文案），不四舍五入成“正好 5km”骗用户。
- 3 轮内收敛不了 → 返回最接近的一条 + 文案说明（“已尽量接近，实际 4.7km”）。

参数（已确认）：容差 **±5%**，最多 **3 轮**。

## 8. 错误处理

| 场景 | 处理 |
|---|---|
| 浏览器定位被拒/失败 | 提示“定位不可用，点地图选个起点或告诉我地名”，引导到地图选点/地名 |
| ORS 找不到路线（水里/无路网） | 聊天如实说“附近找不到可跑的路，换个起点或距离” |
| 凑距离 3 轮未达标 | 返回最接近的一条，预览卡标注实际公里 + 说明 |
| LLM key 缺失/失效 | 发送前拦截，提示去齿轮面板填/测 key，不静默失败 |
| 越界提问 | agent 严格拒绝，不调工具 |
| FIT/GPX/JSON 解析失败 | 聊天出错误气泡，指出可能损坏/格式不支持，不影响已有状态 |
| ORS/MapTiler 网络错误或限流 | 捕获 → 友好提示“服务繁忙，稍后再试”，保留可重试入口 |

原则：所有外部调用显式 try/catch，错误**可见、可读、可重试**，绝不静默吞掉。

## 9. 测试策略

用 **Vitest**（Vite 原生）。对纯逻辑单元做 **TDD（先测后写）**；UI/集成走手动验收。

| 模块 | 测什么（mock 网络） |
|---|---|
| `routing/ors.ts` | 凑距离算法：±5% 达标即停、按比例校正、3 轮取最优；请求体 profile/length/seed 拼装正确 |
| `routing/geocode.ts` | 地名响应 → 坐标解析；空/多结果处理 |
| `export/gpx-export.ts` | `Run`/路线几何 → 合法 GPX（schema、坐标顺序、可被 `runs/gpx.ts` 往返解析） |
| `analysis/digest.ts` | 摘要聚合（配速/心率/爬升）、缺失指标如实标缺 |
| `agent/tools.ts` | 工具 schema 校验、入参边界（距离>0、起点合法） |
| `runs/*` | 补关键用例（FIT 坐标转换、GPX 往返） |

**不做单测**：UI 交互、真实地图渲染、真实外部 API。
**手动 e2e 验收清单**：生成 5km 环线 → 地图核对 → 下载 GPX → 生成 A→B 点到点 → 回放一条 FIT → 上传越界提问验证严格拒绝 → 齿轮测试/保存 key。

## 10. 复用 / 删除 / 新增 汇总

- **复用**：`runs/` 全部解析器、`analysis/digest.ts`（源自 `llm.ts`）、MapLibre 地图基建。
- **删除**：`report.ts`、`DarkVeil.*`、HTML 看板预览 UI、左侧栏旧布局、`README` 中“HTML 看板”相关说明。
- **新增**：`map/ chat/ agent/ routing/ export/ llm/` 六组模块、设置齿轮、起点切换器、路线预览卡、`.env.local` 增加 `VITE_ORS_KEY`。
