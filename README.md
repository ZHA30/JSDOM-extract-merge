# Cheerio-transerver

A stateless, high-performance HTML parsing middleware service for translation workflows. This service extracts translatable text segments from HTML while preserving inline formatting tags, and merges translated content back into the original HTML structure.

## Features

- **Text Extraction**: Extract translatable text segments from HTML while preserving inline formatting
- **Translation Merging**: Merge translated text back into HTML maintaining original structure
- **Smart Filtering**: Automatically excludes script, style, code, and other non-translatable blocks
- **Inline Tags Preservation**: Preserves `<a>`, `<strong>`, `<em>`, `<i>`, `<span>`, `<u>` within extracted text
- **Security**: Bearer token authentication for all API operations
- **Health Monitoring**: Enhanced health checks with memory, uptime, and version info
- **Docker Ready**: Production-ready Docker configuration with health checks

## Quick Start

### Docker (Recommended)

```bash
# Build and start service
docker-compose up --build

# Or build and run in background
docker-compose up --build -d

# Check service health
curl http://localhost:8080/healthz
```

### Local Development

```bash
# Install dependencies
npm install

# Set API_BEARER_TOKEN environment variable
export API_BEARER_TOKEN=your-secret-token

# Start development server
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `NODE_ENV` | Environment (development, production) | `development` |
| `API_BEARER_TOKEN` | Bearer token for API authentication | **Required** |
| `MAX_PAYLOAD_SIZE` | Maximum request payload size in bytes | `10485760` (10MB) |
| `REQUEST_TIMEOUT` | Request timeout in milliseconds | `30000` (30s) |
| `GRACEFUL_SHUTDOWN_TIMEOUT` | Graceful shutdown timeout in milliseconds | `30000` (30s) |

## API Endpoints

### Health Check

```http
GET /healthz
```

Returns service health status for Docker/Kubernetes health probes.

**Response:**
```json
{
  "status": "ok",
  "uptime": 123.456,
  "timestamp": "2026-02-03T00:00:00.000Z",
  "memory": {
    "rss": 35679232,
    "heapTotal": 18874368,
    "heapUsed": 11234567,
    "external": 1234567
  },
  "version": "1.0.0"
}
```

### Extract Text Segments

```http
POST /extract
Content-Type: application/json
Authorization: Bearer your-secret-token

{
  "html": "<p>Hello <strong>world</strong></p>",
  "options": {
    "extractAttributes": ["alt", "title"],
    "ignoredClasses": ["notranslate", "code-snippet"],
    "preserveWhitespace": false
  }
}
```

**Request Body:**
- `html` (required): HTML content to parse
- `options` (optional):
  - `extractAttributes`: Array of attributes to extract (alt, placeholder, title)
  - `ignoredClasses`: CSS classes to skip during extraction
  - `preserveWhitespace`: Whether to preserve whitespace in extracted text

**Response:**
```json
{
  "segments": [
    {
      "id": "aHRtbC5ib2R5WzBdLnBbMF0=",
      "text": "Hello <strong>world</strong>",
      "path": "html.body.p[0]",
      "tag": "p",
      "attributes": {}
    }
  ],
  "count": 1
}
```

**Error Responses:**
- `400 INVALID_STRUCTURE`: HTML format is malformed
- `403 UNAUTHORIZED`: Missing or invalid bearer token
- `413 PAYLOAD_TOO_LARGE`: Request exceeds 10MB limit
- `422 VALIDATION_ERROR`: Invalid request format
- `500 PROCESS_TIMEOUT`: Processing exceeded 30s timeout

### Merge Translations

```http
POST /merge
Content-Type: application/json
Authorization: Bearer your-secret-token

{
  "html": "<p>Hello</p>",
  "translations": [
    {
      "id": "aHRtbC5ib2R5WzBdLnBbMF0=",
      "text": "你好"
    }
  ],
  "options": {
    "safetyCheck": true,
    "strictMode": false
  }
}
```

**Request Body:**
- `html` (required): Original HTML content
- `translations` (required): Array of translated segments
  - `id`: Segment ID from extract response
  - `text`: Translated HTML text (may contain inline tags)
- `options` (optional):
  - `safetyCheck`: Validate unclosed tags in translations (default: true)
  - `strictMode`: Throw error if any segment ID is not found (default: false)

**Response:**
```json
{
  "html": "<p>你好</p>",
  "mergedCount": 1
}
```

**Error Responses:**
- `400 INVALID_STRUCTURE`: HTML format is malformed or unclosed tags detected
- `403 UNAUTHORIZED`: Missing or invalid bearer token
- `413 PAYLOAD_TOO_LARGE`: Request exceeds 10MB limit
- `422 VALIDATION_ERROR`: Invalid request format
- `500 PROCESS_TIMEOUT`: Processing exceeded 30s timeout

## Examples

### Extract and Merge

```bash
TOKEN="your-secret-token"

# 1. Extract text segments
EXTRACT_RESPONSE=$(curl -s -X POST http://localhost:8080/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "html": "<div><h1>Welcome</h1><p>Read <a href=\"/doc\">this</a> guide.</p></div>"
  }')

echo "$EXTRACT_RESPONSE"

# 2. Translate (use your translation service)
# Example: "Welcome" -> "欢迎"

# 3. Merge translations back
curl -X POST http://localhost:8080/merge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "html": "<div><h1>Welcome</h1><p>Read <a href=\"/doc\">this</a> guide.</p></div>",
    "translations": [
      {
        "id": "html.body.div[0].h1[0]",
        "text": "欢迎"
      },
      {
        "id": "html.body.div[0].p[0]",
        "text": "阅读 <a href=\"/doc\">本</a> 指南。"
      }
    ],
    "options": {
      "safetyCheck": true
    }
  }'
```

## Tag Handling

### Container Tags (Extracted as segments)
`p`, `div`, `li`, `h1-h6`, `section`, `article`, `aside`, `blockquote`, `dd`, `dt`, `dl`, `fieldset`, `figcaption`, `figure`, `footer`, `header`, `main`, `nav`, `ol`, `ul`, `td`, `th`, `tr`, `tbody`, `thead`, `tfoot`

### Inline Tags (Preserved within text)
These tags are not split and remain within extracted text:

| Tag | Description |
|-----|-------------|
| `<a>` | Anchor link |
| `<b>`, `<strong>` | Bold text |
| `<i>`, `<em>` | Italic text |
| `<u>` | Underlined text |
| `<span>` | Generic inline container |
| `<mark>` | Highlighted text |
| `<small>` | Small text |
| `<sub>`, `<sup>` | Subscript/superscript |
| `<time>` | Time/date |
| `<q>` | Inline quote |
| `<s>`, `<strike>`, `<del>` | Strikethrough/deleted text |
| `<ins>` | Inserted text |

### Excluded Tags (Ignored completely)
`script`, `style`, `pre`, `code`, `canvas`, `svg`, `noscript`, `iframe`, `video`, `audio`, `object`, `embed`, `applet`, `meta`, `link`

## Deployment

### Docker

```bash
# Build image
docker build -t cheerio-transerver:latest .

# Run container
docker run -d \
  -p 8080:8080 \
  -e API_BEARER_TOKEN=your-production-token \
  -e NODE_ENV=production \
  cheerio-transerver:latest
```

### Docker Compose

```bash
# Start service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop service
docker-compose down
```

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
