# Cheerio-transerver

A stateless, high-performance HTML parsing middleware service for translation workflows. This service extracts translatable text segments from HTML while preserving inline formatting tags, and merges translated content back into the original HTML structure.

## Features

- **Text Extraction**: Extract translatable text segments from HTML while preserving inline formatting
- **Translation Merging**: Merge translated text back into HTML maintaining original structure
- **Smart Filtering**: Automatically excludes script, style, code, and other non-translatable blocks
- **Inline Tags Preservation**: Preserves `<a>`, `<strong>`, `<em>`, `<i>`, `<span>`, `<u>` within extracted text
- **Security**: Bearer token authentication for merge operations
- **Swagger Documentation**: Interactive API documentation at `/api-docs`
- **Health Monitoring**: Enhanced health checks with memory, uptime, and version info
- **Docker Ready**: Production-ready Docker configuration with health checks
- **Graceful Shutdown**: Proper signal handling for zero-downtime deployments

## Quick Start

### Docker (Recommended)

```bash
# Build and start the service
docker-compose up --build

# Or build and run in background
docker-compose up --build -d

# Check service health
curl http://localhost:8080/healthz

# View API documentation
open http://localhost:8080/api-docs
```

### Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
# API_BEARER_TOKEN=your-secret-token

# Start development server
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `NODE_ENV` | Environment (development, production) | `development` |
| `API_BEARER_TOKEN` | Bearer token for /api/merge authentication | **Required** |
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
POST /api/extract
Content-Type: application/json

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
- `413 PAYLOAD_TOO_LARGE`: Request exceeds 10MB limit
- `422 VALIDATION_ERROR`: Invalid request format
- `500 PROCESS_TIMEOUT`: Processing exceeded 30s timeout

### Merge Translations

```http
POST /api/merge
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

### Example 1: Extract and Merge

```bash
# 1. Extract text segments
EXTRACT_RESPONSE=$(curl -s -X POST http://localhost:8080/api/extract \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<div><h1>Welcome</h1><p>Read <a href=\"/doc\">this</a> guide.</p></div>"
  }')

echo "$EXTRACT_RESPONSE"

# 2. Translate (simulated - use your translation service)
# Extract the segment ID
SEGMENT_ID=$(echo "$EXTRACT_RESPONSE" | jq -r '.segments[0].id')

# 3. Merge translations back
curl -X POST http://localhost:8080/api/merge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-secret-token-please-change-in-production" \
  -d '{
    "html": "<div><h1>Welcome</h1><p>Read <a href=\"/doc\">this</a> guide.</p></div>",
    "translations": [
      {
        "'$SEGMENT_ID'": "<h1>欢迎</h1>"
      }
    ]
  }'
```

### Example 2: Extract with Options

```bash
curl -X POST http://localhost:8080/api/extract \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<p class=\"notranslate\">Skip this</p><p>Translate <strong>this</strong></p>",
    "options": {
      "ignoredClasses": ["notranslate"],
      "preserveWhitespace": true
    }
  }'
```

## Container Tags Handling

### Container Tags (Extracted as segments)
`p`, `div`, `li`, `h1-h6`, `section`, `article`, `aside`, `blockquote`, `dd`, `dt`, `dl`, `fieldset`, `figcaption`, `figure`, `footer`, `header`, `main`, `nav`, `ol`, `ul`, `td`, `th`, `tr`, `tbody`, `thead`, `tfoot`

### Inline Tags (Preserved within text)
These tags are not split and remain within the extracted text:

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
| `<abbr>`, `<acronym>` | Abbreviations |
| `<cite>` | Citations |

### Excluded Tags (Ignored completely)
`script`, `style`, `pre`, `code`, `canvas`, `svg`, `noscript`, `iframe`, `video`, `audio`, `object`, `embed`, `applet`, `meta`, `link`

## Architecture

### Design Principles

1. **Black Box Principle**: The API does not interpret translation content - it only handles HTML structure and text extraction/merging.

2. **Semantic Integrity**: Extraction is based on "minimal block-level semantic units", protecting inline formatting from being broken apart.

3. **Idempotence**: After merging translations, the HTML tree depth, attributes, and original indentation remain unchanged (except for text content).

4. **Stateless Protocol**: The server does not store any HTML copies. The correspondence between extracted segments and original HTML is maintained by the caller.

### Segment ID Generation

Segment IDs are generated from CSS path hashes (Base64 encoded).

Example:
- Element: `html.body[0].div[0].p[2]`
- Segment ID: `aHRtbC5ib2R5WzBdLmRpdlswXS5wWzJd`

This ensures precise relocation during merge operations.

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

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set secure `API_Bearer_TOKEN`
- [ ] Configure appropriate timeouts
- [ ] Set up logging aggregation
- [ ] Configure health checks
- [ ] Set resource limits (CPU/Memory)
- [ ] Enable HTTPS/TLS
- [ ] Set up monitoring and alerting

## Error Handling

| HTTP Code | Error Type | Description |
|-----------|------------|-------------|
| 400 | `INVALID_STRUCTURE` | HTML format is malformed or unclosed tags detected |
| 403 | `UNAUTHORIZED` | Missing or invalid bearer token |
| 404 | `NOT_FOUND` | Route not found |
| 413 | `PAYLOAD_TOO_LARGE` | Request exceeds 10MB limit |
| 422 | `VALIDATION_ERROR` | Invalid request format (Zod validation failed) |
| 500 | `PROCESS_TIMEOUT` | Processing exceeded 30s timeout |
| 500 | `INTERNAL_ERROR` | Internal server error |

## Troubleshooting

### Unclosed Tags Warning

If you see `Unclosed tags detected` error in merge operation, check your translation text:

```bash
# Bad: unclosed tag
{"id": "xxx", "text": "Hello <strong>world"}

# Good: properly closed
{"id": "xxx", "text": "Hello <strong>world</strong>"}
```

### Segments Not Found

If merge returns missing IDs, verify:
1. The HTML structure hasn't changed between extract and merge
2. The segment ID matches exactly what was returned from extract
3. Enable `strictMode` to validate all segments are found

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
