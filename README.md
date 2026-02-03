# JSDOM-extract-merge

A minimal HTML text extraction and translation merge API based on jsdom. Extracts text content with inline HTML tags preserved and merges translations back into the original HTML structure.

## Features

- **Text Extraction**: Extract text content with inline HTML tags (em, strong, code, a, etc.) preserved
- **Path-Based Navigation**: Each extracted text has a unique path for precise DOM node reference
- **Translation Merge**: Merge translated content back into original HTML structure
- **Complete Workflow**: Two endpoints (`POST /extract` and `POST /merge`) for translation pipeline
- **Token Authentication**: Simple Bearer token authentication
- **Zero Configuration**: Works out of the box with sensible defaults
- **Stateless**: No caching, no database, no persistent storage
- **Lightweight**: Built with Node.js native HTTP module, minimal dependencies
- **Docker Ready**: Single command deployment
- **Documentation**: Visit `GET /` for inline API documentation

## Quick Start

### Using Docker (Recommended)

```bash
# Generate a secure token
TOKEN=$(openssl rand -base64 32)
echo "Your token: $TOKEN"

# Build and run
docker build -t jsdom-extract-merge .
docker run -d \
  --name jsdom-extract-merge \
  -p 3000:3000 \
  -e API_TOKEN=$TOKEN \
  --restart unless-stopped \
  jsdom-extract-merge
```

### Using Node.js Directly

```bash
# Install dependencies
npm install

# Set environment variable
export API_TOKEN=your-secure-token-here

# Start server
npm start
```

## API Documentation

### Endpoints

#### 1. Extract Text

**`POST /extract`**

Extract all text content with inline HTML tags from the provided HTML string.

##### Request Headers

```http
Content-Type: application/json
Authorization: Bearer <your-token>
```

##### Request Body

```json
{
  "html": "<string>"
}
```

| Field | Type   | Required | Description                     |
|-------|--------|----------|---------------------------------|
| `html` | string | Yes      | Raw HTML string to process      |

##### Response

###### Success (200 OK)

```json
{
  "texts": [
    { "path": "html.0.body.0.div.0.h1.0", "text": "Title" },
    { "path": "html.0.body.0.div.0.p.0", "text": "Paragraph with <strong>bold</strong>" }
  ]
}
```

- **path**: Unique DOM path for each text block (used for merge)
- **text**: HTML fragment with inline tags preserved

#### 2. Merge Translations

**`POST /merge`**

Merge translated content back into the original HTML structure.

##### Request Headers

```http
Content-Type: application/json
Authorization: Bearer <your-token>
```

##### Request Body

```json
{
  "html": "<string>",
  "translations": [
    { "path": "<string>", "text": "<string>" }
  ]
}
```

| Field          | Type   | Required | Description                                      |
|----------------|--------|----------|--------------------------------------------------|
| `html`         | string | Yes      | Original HTML string                              |
| `translations` | array  | Yes      | Array of translations with corresponding paths   |
| `translations[].path` | string | Yes | DOM path from /extract response                  |
| `translations[].text` | string | Yes | Translated content (may contain inline HTML tags) |

##### Response

###### Success (200 OK)

```json
{
  "transhtml": "<div><p>Hello<span><br>你好</span></p></div>"
}
```

Returns the original HTML with translations appended to each block.

##### Error Responses

| Status Code | Error               | Description                                             |
|-------------|---------------------|---------------------------------------------------------|
| 401         | `AUTH_REQUIRED`     | Missing or invalid Authorization header/token           |
| 400         | `INVALID_INPUT`     | Invalid JSON, missing required fields, or size exceeds 10MB |
| 400         | `INVALID_PATH`      | Path not found in HTML structure                        |
| 500         | `PROCESSING_ERROR`  | HTML parsing/merge failed                               |
| 404         | `NOT_FOUND`         | Invalid endpoint                                        |

### Health Check

**`GET /healthz`**

Simple health check endpoint.

```text
200 OK
OK
```

## Logging

The API outputs structured JSON logs to stdout/stderr, following standard logging practices. Logs include:

- **Level**: `INFO`, `WARN`, `ERROR`
- **Timestamp**: ISO 8601 format
- **Request ID**: Unique identifier for each request
- **Context**: Additional details (IP, sizes, error messages)

### Log Format

```json
{
  "timestamp": "2026-02-03T02:50:00.000Z",
  "level": "INFO",
  "message": "Request completed successfully",
  "requestId": "abc123xyz",
  "htmlSize": 5432,
  "textCount": 42
}
```

### Viewing Logs

#### Docker

```bash
# View all logs
docker logs -f jsdom-extractor

# View only errors
docker logs -f jsdom-extractor 2>/dev/stderr | grep ERROR
```

#### Standard Output

All logs are written to stdout/stderr, making them compatible with:

- Docker logging drivers
- Log aggregation services (ELK, Loki, CloudWatch)
- Container orchestration (Kubernetes logs)

## Usage Examples

### Complete Translation Workflow

```bash
# Step 1: Extract text with paths
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{"html": "<div><h1>Title</h1><p>Paragraph with <strong>bold</strong></p></div>"}'
```

Response:
```json
{
  "texts": [
    {"path": "html.0.body.0.div.0.h1.0", "text": "Title"},
    {"path": "html.0.body.0.div.0.p.0", "text": "Paragraph with <strong>bold</strong>"}
  ]
}
```

```bash
# Step 2: (External) Translate the texts
# Step 3: Merge translations back

curl -X POST http://localhost:3000/merge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{
    "html": "<div><h1>Title</h1><p>Paragraph with <strong>bold</strong></p></div>",
    "translations": [
      {"path": "html.0.body.0.div.0.h1.0", "text": "标题"},
      {"path": "html.0.body.0.div.0.p.0", "text": "带有<strong>粗体</strong>的段落"}
    ]
  }'
```

Response:
```json
{
  "transhtml": "<div><h1>Title<span><br>标题</span></h1><p>Paragraph with <strong>bold</strong><span><br>带有<strong>粗体</strong>的段落</span></p></div>"
}
```

### JavaScript/Node.js

```javascript
// Step 1: Extract
const extractRes = await fetch('http://localhost:3000/extract', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token-here'
  },
  body: JSON.stringify({
    html: '<div><h1>Title</h1><p>Content</p></div>'
  })
});
const { texts } = await extractRes.json();
// [{path: "...", text: "Title"}, {path: "...", text: "Content"}]

// Step 2: Translate (using your translation service)
const translations = texts.map(item => ({
  path: item.path,
  text: await translate(item.text) // your translation function
}));

// Step 3: Merge
const mergeRes = await fetch('http://localhost:3000/merge', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token-here'
  },
  body: JSON.stringify({
    html: '<div><h1>Title</h1><p>Content</p></div>',
    translations
  })
});
const { transhtml } = await mergeRes.json();
```

### Python

```python
import requests

# Step 1: Extract
extract_res = requests.post(
    'http://localhost:3000/extract',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your-token-here'
    },
    json={
        'html': '<div><h1>Title</h1><p>Content</p></div>'
    }
)
texts = extract_res.json()['texts']

# Step 2: Translate
translations = [
    {'path': item['path'], 'text': translate(item['text'])}
    for item in texts
]

# Step 3: Merge
merge_res = requests.post(
    'http://localhost:3000/merge',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your-token-here'
    },
    json={
        'html': '<div><h1>Title</h1><p>Content</p></div>',
        'translations': translations
    }
)
transhtml = merge_res.json()['transhtml']
```

## Configuration

The API is configured via environment variables:

| Variable   | Required | Default | Description                    |
|------------|----------|---------|--------------------------------|
| `PORT`     | No       | 3000    | Port to listen on              |
| `API_TOKEN`| Yes      | (none)  | Bearer token for authentication |

### Environment File

Create a `.env` file (use `.env.example` as template):

```env
API_TOKEN=your-secure-token-here
PORT=3000
```

## Limits & Constraints

- **Input Size**: Maximum 10MB per request
- **Content Type**: Only `application/json` accepted
- **HTML Processing**: Extracts all text nodes in depth-first order
- **No Rate Limiting**: Trust-based authentication, implement rate limiting at reverse proxy level if needed

## Deployment

### Docker Compose Example

```yaml
version: '3.8'
services:
  jsdom-extractor:
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

### Nginx Reverse Proxy (with HTTPS)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /extract {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M;
    }
}
```

## Security Considerations

1. **Generate Strong Tokens**: Use `openssl rand -base64 32` or similar for API tokens
2. **Use HTTPS**: Always deploy behind a reverse proxy with SSL/TLS
3. **Token Rotation**: Restart container with new token periodically
4. **Resource Limits**: Configure Docker memory/CPU limits
5. **Firewall**: Restrict access to only necessary ports (80/443 externally)

## Dependencies

- `jsdom`: DOM environment for HTML parsing and text node extraction

## How It Works

The API uses jsdom to create a virtual DOM from the provided HTML string. It then traverses the DOM tree starting from the `<body>` element, extracting HTML fragments while preserving inline semantic tags.

**Algorithm**:
1. Parse HTML using JSDOM
2. Traverse the DOM tree from `document.body`
3. For block-level elements (div, p, h1-h6, li, etc.):
   - If they contain no nested block elements, extract their innerHTML
   - This preserves all inline tags (span, em, strong, a, code, mark, etc.)
4. Return array of HTML fragment strings

**Example**:
```html
<div><span>W</span>elcome <em>here</em> and see <code>example</code></div>
```
→ `["<span>W</span>elcome <em>here</em> and see <code>example</code>"]`

```html
<p>First paragraph</p>
<p>Second with <strong>bold</strong> and <a href="/">link</a></p>
```
→ `["First paragraph", "Second with <strong>bold</strong> and <a href=\"/\">link</a>"]`

## Known Limitations

- Does not execute JavaScript or render dynamic content
- Cannot process URLs directly - HTML must be provided as text
- No caching - each request is processed independently
- Returns content from all elements including `<script>` and `<style>` tags (if present)
- Inline tags are preserved as-is; no HTML sanitization or escaping is performed
- Path-based merge requires the original HTML structure to remain unchanged
- Single point of failure - no redundancy built-in

## License

MIT

## Based On

- [jsdom](https://github.com/jsdom/jsdom) - Pure-JavaScript implementation of the DOM and HTML standards
