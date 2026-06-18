# Run Replay (Web)

## 启动

```bash
npm install
npm run dev
```

## MapTiler 配置（在线底图）

创建 `.env.local`：  

```bash
VITE_MAPTILER_KEY=你的key
```

默认使用 MapTiler `streets-v2` 样式。请确保配置了 `VITE_MAPTILER_KEY`。

`VITE_ORS_KEY=你的 OpenRouteService key`

## 功能

- 本地导入最多 2 个 GPX / FIT 文件
- 地图上同步回放
- 跑者 B 会自动拟合到跑者 A 的路线，便于同路对比
- 心率/速度区间仅用于光标与提示，不改变主轨迹颜色
- 可接入外部 LLM（Kimi / DeepSeek）做单次训练分析和 A/B 对比分析
- HTML 看板仅保留预览入口，作为辅助功能

## LLM 配置

在左侧栏填写对应平台的 API Key，并选择 `Kimi` 或 `DeepSeek`。

- Kimi API Base URL: `https://api.moonshot.cn/v1`
- DeepSeek API Base URL: `https://api.deepseek.com`

## 地图说明

当前使用 MapTiler Cloud 在线底图。
