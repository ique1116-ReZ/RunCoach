# Run Replay 项目总结

## 1. 项目概述

Run Replay 是一个跑步路线生成与复盘平台。用户可通过自然语言在地图上生成真实路网路线，下载 GPX 分享，或上传过去的跑步记录（FIT/GPX）进行地图回放和 AI 复盘。

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
- 自然语言生成真实路网路线（支持环线/点到点）
- 通过 OpenRouteService 接入真实路网数据
- 下载 GPX 格式路线分享
- 上传 FIT/GPX 文件回放
- 地图同步回放与进度拖动
- AI 复盘（接入 Kimi / DeepSeek）
- 应用内齿轮（⚙）配置 LLM API Key
- 地图拟合与轨迹清洗

## 4. 当前项目结构

```
src/
├── app/              # 应用核心 + MapLibre 集成
├── agent/            # AI 复盘逻辑
├── chat/             # 聊天对话框
├── routing/          # OpenRouteService 路线生成
├── llm/              # LLM 配置与调用
├── runs/             # 跑步数据解析与处理
└── settings/         # 齿轮配置面板
```

## 5. 技术实现要点

- **地图底图**：MapTiler Cloud（通过 `VITE_MAPTILER_KEY` 配置）
- **路线生成**：OpenRouteService API（`VITE_ORS_KEY` 配置）
- **LLM 集成**：支持 Kimi / DeepSeek，API Key 在应用内配置（不经 `.env`）
- **数据解析**：GPX 与 FIT 格式均支持
- **地图渲染**：MapLibre GL 实时绘制轨迹与回放

---

更新时间：2026-06-18
