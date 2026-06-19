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

- 自然语言生成真实路网路线（环线/点到点）
- 下载 GPX 格式路线
- 上传 FIT/GPX 文件回放与 AI 复盘

## 配置

环境变量配置在 `.env.local`：

```bash
VITE_MAPTILER_KEY=你的MapTiler key
VITE_ORS_KEY=你的OpenRouteService key
```

LLM API Key 在应用内齿轮（⚙）图标配置，支持 Kimi 或 DeepSeek。

## 地图说明

当前使用 MapTiler Cloud 在线底图。
