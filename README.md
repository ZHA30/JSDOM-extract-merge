# JSDOM-extract-merge

[中文文档](README.zh-CN.md) | English

HTML text extraction and translation merge API using jsdom. Preserves inline tags and uses DOM paths for node targeting.

## Quick Start

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

Extract text content with inline tags and DOM paths.

**Request:**
```json
{
  "html": "<div><h1>Title</h1><p>Content with <strong>bold</strong></p></div>"
}
```

**Response:**
```json
{
  "texts": [
    { "path": "html.0.body.0.div.0.h1.0", "text": "Title" },
    { "path": "html.0.body.0.div.0.p.0", "text": "Content with <strong>bold</strong>" }
  ]
}
```

### POST /merge

Merge translated content back into HTML as bilingual (original + translation).

**Request:**
```json
{
  "html": "<div><h1>Title</h1><p>Content</p></div>",
  "translations": [
    { "path": "html.0.body.0.div.0.h1.0", "text": "标题" },
    { "path": "html.0.body.0.div.0.p.0", "text": "内容" }
  ]
}
```

**Response:**
```json
{
  "transhtml": "<div><h1>Title<span class=\"jsdom-extract-merge\"><br>标题</span></h1><p>Content<span class=\"jsdom-extract-merge\"><br>内容</span></p></div>"
}
```

> **Note:** Translated content is wrapped in a `<span>` element with `class="jsdom-extract-merge"` for easy styling.

### POST /replace

Replace content with translations (pure translation mode).

**Request:**
```json
{
  "html": "<div><h1>Title</h1><p>Content</p></div>",
  "translations": [
    { "path": "html.0.body.0.div.0.h1.0", "text": "标题" },
    { "path": "html.0.body.0.div.0.p.0", "text": "内容" }
  ]
}
```

**Response:**
```json
{
  "transhtml": "<div><h1>标题</h1><p>内容</p></div>"
}
```

## Path Format

```
html.0.body.0.div.0.p.0
│     │  │    │    │    │
│     │  │    │    │    └─ 1st <p> element
│     │  │    │    └────── 1st <div> element
│     │  │    └─────────── 1st <body> child
│     │  └──────────────── 1st <html> child
│     └─────────────────── <html> element
└───────────────────────── root
```

## Filtering

Skipped elements (not extracted):
- `<picture>`, `<img>`, `<svg>`, `<canvas>`
- `<iframe>`, `<video>`, `<audio>`, `<map>`, `<object>`, `<embed>`
- `<track>`, `<source>`

Preserved elements (extracted with content):
- `<figure>` → processes `<figcaption>`
- Block elements: `<div>`, `<p>`, `<h1>-<h6>`, `<section>`, etc.

Inline tags (preserved in output): `<a>`, `<em>`, `<strong>`, `<code>`, `<span>`, etc.

## Configuration
 - Bilingual mode (original + translation)
curl -X POST http://localhost:3000/merge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<div><p>Hello <em>world</em></p></div>",
    "translations": [
      {"path": "html.0.body.0.div.0.p.0", "text": "你好 <em>世界</em>"}
    ]
  }'

# Or use Replace - Pure translation mode
curl -X POST http://localhost:3000/replaciption |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `API_TOKEN` | Yes | - | Bearer authentication token |

## Limits

- Max HTML size: 10MB
- No JavaScript execution
- No URL fetching (HTML must be provided)
- `<script>` and `<style>` preserved if present

## Example Workflow

```bash
# Extract
curl -X POST http://localhost:3000/extract \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div><p>Hello <em>world</em></p></div>"}'

# Translate (external service)

# Merge
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

## Error Responses

| Code | Error | Description |
|------|-------|-------------|
| 401 | `AUTH_REQUIRED` | Missing/invalid Authorization header |
| 400 | `INVALID_INPUT` | Invalid JSON, missing fields, or size exceeded |
| 400 | `INVALID_PATH` | Specified path not found in HTML |
| 500 | `PROCESSING_ERROR` | HTML processing failed |

## Deployment

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

### Nginx Reverse Proxy

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
   Styling Translations

The `/merge` endpoint wraps translations in `<span class="jsdom-extract-merge">` elements for easy styling:

```css
/* Simple inline style */
.jsdom-extract-merge {
  color: #0066cc;
  font-style: italic;
}

/* Block-level style for better separation */
.jsdom-extract-merge {
  display: block;
  margin-top: 0.5em;
  padding: 0.5em;
  background-color: #f0f8ff;
  border-left: 3px solid #0066cc;
}
```

##  }
}
```

## Security

1. Generate strong tokens: `openssl rand -base64 32`
2. Always use HTTPS in production
3. Rotate tokens periodically
4. Implement rate limiting at reverse proxy layer

## Dependencies

- [jsdom](https://github.com/jsdom/jsdom) ^25.0.1

## License

MIT
