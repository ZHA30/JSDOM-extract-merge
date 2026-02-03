# JSDOM-extract-merge

HTML 文本提取与翻译合并 API。基于 jsdom 实现，支持行内标签保留，通过 path 精确定位 DOM 节点。

## 特性

- **智能提取**: 递归提取块级元素中的文本内容，保留所有行内标签（em、strong、code、a 等）
- **路径定位**: 为每个文本块生成唯一 DOM 路径，支持精确定位和回填
- **媒体过滤**: 自动跳过 figure、svg、video、audio 等无需翻译的媒体元素
- **双语合并**: 将翻译内容无缝合并回原 HTML 结构
- **Bearer 认证**: 简单的 Token 认证机制
- **轻量架构**: 基于 Node.js 原生 HTTP 模块，无框架依赖

## 快速开始

### Docker（推荐）

```bash
# 生成安全 token
TOKEN=$(openssl rand -base64 32)

# 构建并运行
docker build -t jsdom-extract-merge .
docker run -d -p 3000:3000 -e API_TOKEN=$TOKEN jsdom-extract-merge
```

### Node.js

```bash
npm install
export API_TOKEN=your-token
npm start
```

## API 文档

### 端点总览

| 端点 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 服务标识 |
| `/healthz` | GET | 健康检查 |
| `/extract` | POST | 提取文本内容和路径 |
| `/merge` | POST | 合并翻译内容 |

### 1. 提取文本

**`POST /extract`**

提取 HTML 中的文本内容，保留行内标签并生成 DOM 路径。

**请求头**:
```http
Content-Type: application/json
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "html": "<div><h1>Title</h1><p>Content with <strong>bold</strong></p></div>"
}
```

**响应** (200 OK):
```json
{
  "texts": [
    { "path": "html.0.body.0.div.0.h1.0", "text": "Title" },
    { "path": "html.0.body.0.div.0.p.0", "text": "Content with <strong>bold</strong>" }
  ]
}
```

**字段说明**:
- `path`: DOM 节点路径，用于 merge 时定位
- `text`: 提取的 HTML 片段，保留行内标签

### 2. 合并翻译

**`POST /merge`**

将翻译内容合并回原 HTML 结构。

**请求头**:
```http
Content-Type: application/json
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "html": "<div><h1>Title</h1><p>Content</p></div>",
  "translations": [
    { "path": "html.0.body.0.div.0.h1.0", "text": "标题" },
    { "path": "html.0.body.0.div.0.p.0", "text": "内容" }
  ]
}
```

**响应** (200 OK):
```json
{
  "transhtml": "<div><h1>Title<span><br>标题</span></h1><p>Content<span><br>内容</span></p></div>"
}
```

**字段说明**:
- `html`: 原始 HTML 字符串
- `translations`: 翻译数组，每项包含 `path` 和 `text`
- `transhtml`: 合并后的完整 HTML

### 错误响应

| 状态码 | 错误类型 | 描述 |
|--------|----------|------|
| 401 | `AUTH_REQUIRED` | 缺少或无效的 Authorization 头 |
| 400 | `INVALID_INPUT` | 无效 JSON、缺少必填字段或超过大小限制 |
| 400 | `INVALID_PATH` | 指定的路径在 HTML 中不存在 |
| 500 | `PROCESSING_ERROR` | HTML 处理失败 |

## 使用示例

### 完整工作流

```bash
# 1. 提取文本
curl -X POST http://localhost:3000/extract \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div><p>Hello <em>world</em></p></div>"}'
```

```json
{
  "texts": [
    {"path": "html.0.body.0.div.0.p.0", "text": "Hello <em>world</em>"}
  ]
}
```

```bash
# 2. 翻译（外部服务）
# 3. 合并
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

```json
{
  "transhtml": "<div><p>Hello <em>world</em><span><br>你好 <em>世界</em></span></p></div>"
}
```

### JavaScript

```javascript
// 提取
const { texts } = await fetch('/extract', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ html: '<div><p>Hello</p></div>' })
}).then(r => r.json());

// 翻译
const translations = texts.map(t => ({
  path: t.path,
  text: await translate(t.text)
}));

// 合并
const { transhtml } = await fetch('/merge', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    html: '<div><p>Hello</p></div>',
    translations
  })
}).then(r => r.json());
```

## 配置

| 环境变量 | 必填 | 默认值 | 描述 |
|----------|------|--------|------|
| `PORT` | 否 | 3000 | 服务端口 |
| `API_TOKEN` | 是 | 无 | Bearer 认证令牌 |

### .env 文件

```env
API_TOKEN=your-secure-token-here
PORT=3000
```

## 工作原理

### 提取流程

1. 使用 JSDOM 解析 HTML
2. 遍历 DOM 树，识别块级元素
3. 提取块级元素的 innerHTML（保留行内标签）
4. 生成唯一 DOM 路径（如 `html.0.body.0.div.0.p.0`）
5. 返回 `{path, text}` 数组

### 路径格式

```
html.0.body.0.div.0.p.0
│     │  │    │    │    │
│     │  │    │    │    └─ 第 1 个 p 元素
│     │  │    │    └────── 第 1 个 div 元素
│     │  │    └─────────── 第 1 个 body 子元素
│     │  └──────────────── 第 1 个 html 子元素
│     └─────────────────── 第 1 个 html 元素
└───────────────────────── 根元素
```

### 媒体元素过滤

以下元素会被自动跳过：

- `<figure>` - 图片/图表
- `<picture>` - 图片容器
- `<svg>` - SVG 图形
- `<canvas>` - 画布
- `<iframe>` - 嵌入内容
- `<video>` - 视频
- `<audio>` - 音频
- `<map>` - 图片映射
- `<object>` - 嵌入对象
- `<embed>` - 嵌入内容

## 限制

- 最大 HTML 大小：10MB
- 不执行 JavaScript
- 不处理 URL（需提供 HTML 文本）
- 保留 `<script>` 和 `<style>` 内容（如果存在）
- 无速率限制（建议在反向代理层实现）

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
      - API_TOKEN=${API_TOKEN}
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

1. 使用 `openssl rand -base64 32` 生成强 token
2. 始终通过 HTTPS 部署
3. 定期轮换 token
4. 配置适当的资源限制
5. 在反向代理层实现速率限制

## 依赖

- [jsdom](https://github.com/jsdom/jsdom) ^25.0.1

## 许可证

MIT
