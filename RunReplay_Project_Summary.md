# Run Replay 项目总结

## 1. 项目概述

Run Replay 是一个跑步轨迹复盘与对比的可视化工具。支持导入 GPX/FIT 文件，在地图上同步回放两条轨迹，跑者 B 会自动拟合到跑者 A 的路线，实时显示配速、心率和区间标签，用于训练复盘与策略对比。

## 2. 当前技术栈

### 前端
- **框架**：React + TypeScript
- **构建**：Vite
- **地图渲染**：MapLibre GL
- **样式**：纯 CSS

### 后端
- **当前无后端**（纯 Web 前端）
- 解析、对齐、渲染逻辑全部在前端完成

### 数据解析
- **GPX 解析**：`fast-xml-parser`
- **FIT 解析**：`fit-file-parser`

## 3. 当前功能进度

### 已完成
- 导入 **GPX/FIT**（最多 2 个）
- 轨迹清洗、距离累积、同步回放
- **心率/速度区间标识** 切换
- 双轨迹叠加渲染 + 高亮轨迹
- 跑者 B 自动拟合到跑者 A 的路线，便于同路线对比
- 回放控制（播放/暂停/快进/进度拖动）
- 实时显示 **配速、心率、区间标签**（跑者A/B）
- 心率基准 **A/B 分别设置**（LTHR 或 HRmax）
- 在线地图支持（MapTiler Cloud key）
- 接入外部 LLM（Kimi / DeepSeek）做单次训练分析和 A/B 对比分析
- HTML 看板保留预览入口，作为辅助能力

### 已修复问题
- FIT 坐标二次转换导致“海上定位”
- 回放进度速度单位问题
- 轨迹线条可见性（加粗 + 描边）

## 4. 当前项目结构

```
/Users/suunto/Documents/RunReplay
├── src
│   ├── app
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── styles.css
│   │   └── mapStyle.ts
│   └── shared
│       ├── align.ts
│       ├── geo.ts
│       ├── gpx.ts
│       ├── fit.ts
│       ├── types.ts
│       └── fit-file-parser.d.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env.local
```

## 5. 地图模式说明

- **在线模式**：MapTiler Cloud 样式（通过 `.env.local` 配置 `VITE_MAPTILER_KEY`）

## 6. LLM 接入说明

- 左侧栏提供 Kimi / DeepSeek 选择与 API Key 输入
- 单次分析适合分析一份训练 FIT 的节奏、心率、爬升和风险点
- 对比分析支持两种场景：
  - 同一运动员不同时期的训练/比赛
  - 不同运动员在同一路线上的训练/比赛
- 跑者 B 在对比时会先按跑者 A 的路线做拟合，尽量削弱 GPS 微小偏差对分析的影响

## 7. 待办方向（下一步）

1. FIT 解析字段适配更多设备
2. 心率区间覆盖率提示 / 缺失提示
3. 路线对齐改进（DTW / map-matching）
4. 分段对比、区间复盘报告
5. UI 进一步优化（区间策略视图）

---

文档生成时间：2026-05-27
