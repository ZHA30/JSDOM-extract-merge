# JSDOM-extract-merge

English | [中文文档](README.zh-CN.md)

基于 jsdom 的 HTML 文本提取与翻译合并 API。保留行内标签，使用 DOM 路径精确定位节点。

## 概述

从 HTML 中提取可翻译文本，同时保留行内标记（`<em>`, `<strong>`, `<code>` 等），并生成 DOM 路径用于精确定位和重新插入翻译内容。

## 快速开始

### Docker

```bash
TOKEN=$(openssl rand -base64 32)
docker build -t jsdom-extract-merge .
docker run -d -p 3000:3000 -e API_TOKEN=$TOKEN jsdom-extract-merge
```

### Node.js

```bash
npm install
export API_TOKEN=your-token
npm start
```

## API

### POST /extract

提取包含行内标签和 DOM 路径的文本内容。

**请求：**
```json
{
  "html": "<div><h1>Title</h1><p>Content with <strong>bold</strong></p></div>"
}
```

**响应：**
```json
{
  "texts": [
    { "path": "html.0.body.0.div.0.h1.0", "text": "Title" },
    { "path": "html.0.body.0.div.0.p.0", "text": "Content with <strong>bold</strong>" }
  ]
}
```

### POST /merge

将翻译内容合并回 HTML，生成双语页面（原文 + 译文）。

**请求：**
```json
{
  "html": "<div><h1>Title</h1><p>Content</p></div>",
  "translations": [
    { "path": "html.0.body.0.div.0.h1.0", "text": "标题" },
    { "path": "html.0.body.0.div.0.p.0", "text": "内容" }
  ]
}
```

**响应：**
```json
{
  "transhtml": "<div><h1>Title<span class=\"jsdom-extract-merge\"><br>标题</span></h1><p>Content<span class=\"jsdom-extract-merge\"><br>内容</span></p></div>"
}
```

> **注意：** 翻译内容被包裹在带有 `class="jsdom-extract-merge"` 属性的 `<span>` 元素中，便于样式定制。

### POST /replace

将内容替换为翻译（纯译文模式）。

**请求：**
```json
{
  "html": "<div><h1>Title</h1><p>Content</p></div>",
  "translations": [
    { "path": "html.0.body.0.div.0.h1.0", "text": "标题" },
    { "path": "html.0.body.0.div.0.p.0", "text": "内容" }
  ]
}
```

**响应：**
```json
{
  "transhtml": "<div><h1>标题</h1><p>内容</p></div>"
}
```

## 路径格式

```
html.0.body.0.div.0.p.0
│     │  │    │    │    │
│     │  │    │    │    └─ 第 1 个 <p> 元素
│     │  │    │    └────── 第 1 个 <div> 元素
│     │  │    └─────────── 第 1 个 <body> 子元素
│     │  └──────────────── 第 1 个 <html> 子元素
│     └─────────────────── <html> 元素
└───────────────────────── 根元素
```

## 过滤规则

跳过的元素（不提取）：
- `<picture>`, `<img>`, `<svg>`, `<canvas>`
- `<iframe>`, `<video>`, `<audio>`, `<map>`, `<object>`, `<embed>`
- `<track>`, `<source>`

保留的元素（提取内容）：
- `<figure>` → 处理 `<figcaption>`
- 块级元素：`<div>`, `<p>`, `<h1>-<h6>`, `<section>` 等

行内标签（保留在输出中）：`<a>`, `<em>`, `<strong>`, `<code>`, `<span>` 等

## 配置
 - 双语模式（原文 + 译文）
curl -X POST http://localhost:3000/merge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<div><p>Hello <em>world</em></p></div>",
    "translations": [
      {"path": "html.0.body.0.div.0.p.0", "text": "你好 <em>世界</em>"}
    ]
  }'

# 或使用替换 - 纯译文模式
curl -X POST http://localhost:3000/replac
|----------|----------|---------|-------------|
| `PORT` | 否 | 3000 | 服务端口 |
| `API_TOKEN` | 是 | - | Bearer 认证令牌 |

## 限制

- 最大 HTML 大小：10MB
- 不执行 JavaScript
- 不处理 URL（需提供 HTML 文本）
- 保留 `<script>` 和 `<style>`（如果存在）

## 工作流示例

```bash
# 提取
curl -X POST http://localhost:3000/extract \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div><p>Hello <em>world</em></p></div>"}'

# 翻译（外部服务）

# 合并
curl -X POST http://localhost:3000/merge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<div><p>Hello <em>world</em></p></div>",
    "translations": [
      {"path": "html.0.body.0.div.0.p.0", "text": "你好 <em>世界</em>"}
    ]
  }'
```

## 错误响应

| 状态码 | 错误 | 说明 |
|------|-------|-------------|
| 401 | `AUTH_REQUIRED` | 缺少或无效的 Authorization 头 |
| 400 | `INVALID_INPUT` | 无效 JSON、缺少字段或超过大小限制 |
| 400 | `INVALID_PATH` | HTML 中未找到指定路径 |
| 500 | `PROCESSING_ERROR` | HTML 处理失败 |

## 部署

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
   样式定制

`/merge` 端点将翻译内容包裹在 `<span class="jsdom-extract-merge">` 元素中，便于样式定制：

```css
/* 简单的行内样式 */
.jsdom-extract-merge {
  color: #0066cc;
  font-style: italic;
}

/* 块级样式，更好的分隔效果 */
.jsdom-extract-merge {
  display: block;
  margin-top: 0.5em;
  padding: 0.5em;
  background-color: #f0f8ff;
  border-left: 3px solid #0066cc;
}
```

##    - API_TOKEN=${API_TOKEN}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 3s
      retries: 3
```

### Nginx 反向代理

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        client_max_body_size 10M;
    }
}
```

## 安全建议

1. 生成强令牌：`openssl rand -base64 32`
2. 生产环境始终使用 HTTPS
3. 定期轮换令牌
4. 在反向代理层实现速率限制

## 依赖

- [jsdom](https://github.com/jsdom/jsdom) ^25.0.1

## 许可证

MIT
