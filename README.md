# RunCoach AI 跑步教练

RunCoach 是一个面向跑步场景的 AI Web 应用，用自然语言完成两件事：

1. 和 LLM 对话生成自定义距离的真实路网跑步路线，并导出 GPX。
2. 上传真实 FIT/GPX/JSON 运动文件，展示轨迹回放，并由 AI 做训练复盘分析。

项目重点展示从“自然语言意图”到“可执行路线/可解释训练洞察”的闭环，适合运动设备、跑步训练和运动数据产品场景。

## 项目文档

| 文档 | 内容 |
|---|---|
| PRD 文档 | 产品需求、功能范围、验收标准 |
| AI 协作记录 | AI 协作过程、关键决策、验证记录 |

## 快速启动

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址，通常是：

```text
http://127.0.0.1:5173/
```

## 环境配置

创建 `.env.local`：

```bash
VITE_MAPTILER_KEY=你的 MapTiler key
VITE_ORS_KEY=你的 OpenRouteService key
```

用途：

- `VITE_MAPTILER_KEY`：地图底图与地名搜索。
- `VITE_ORS_KEY`：真实路网路线生成。

LLM API Key 不写入 `.env.local`。打开页面后点击右上角齿轮，配置 Kimi 或 DeepSeek 的 API Key，并点击“测试”确认可用。

## 使用流程

### 1. LLM 生成路线并导出 GPX

1. 打开页面，确认地图加载、定位到当前位置。
2. 在底部对话框输入：

```text
帮我从当前位置生成一条 6 公里的轻松跑环线，尽量适合城市慢跑
```

3. 若信息不全，AI 会按需弹卡片引导：先问越野 / 路跑，再问起点（当前位置 / 手动选点）；手动选点时地图光标变十字，点图落针并确认。一句话说全则直接生成。
4. AI 调用路线工具，地图展示真实路网路线（越野偏山路步道、路跑走道路）。
5. 右上角路线卡展示实际距离和累计爬升；不满意可点“换一条”。
6. 点击“下载 GPX”，导出 `runcoach-route.gpx`（含每点高程 `<ele>`）。

### 2. 导入真实 FIT 并 AI 复盘

1. 点击对话框左侧 `+`。
2. 上传真实 FIT/GPX/JSON 运动文件。
3. 地图显示真实运动轨迹。
4. 底部回放条可拖动查看距离、配速、心率。
5. AI 自动基于解析出的训练摘要做复盘分析。

## 技术架构

- React 19 + TypeScript + Vite
- MapLibre GL 地图渲染
- MapTiler 底图与地名搜索
- OpenRouteService 路线生成
- Kimi / DeepSeek OpenAI-compatible tool calling
- `fit-file-parser` 解析 FIT
- `fast-xml-parser` 解析 GPX
- Vitest 覆盖核心逻辑

核心模块：

- `src/agent/`：AI 教练系统提示词、工具 schema、工具执行。
- `src/routing/`：地名搜索、真实路网路线生成、环线距离逼近。
- `src/export/`：GPX 导出。
- `src/runs/`：FIT/GPX/JSON 解析。
- `src/analysis/`：训练摘要与对比摘要。
- `src/map/`：地图初始化与路线/轨迹图层。
- `src/chat/`：对话框与文件上传入口。

## 质量验证

```bash
npm test
npm run build
```

当前验证结果：

- 7 个测试文件通过。
- 31 个测试通过。
- 生产构建通过。

构建时可能出现 chunk size warning，主要来自地图和解析库体积，对应用主流程不构成功能阻塞。

## 项目亮点

- 路线坐标不由 AI 编造，而是通过真实路网工具生成。
- FIT 复盘基于真实运动文件解析结果，AI 只负责解释和建议。
- AI agent 有明确的跑步领域边界和工具调用边界。
- 路线规划、GPX 导出、真实训练复盘形成完整使用闭环。

