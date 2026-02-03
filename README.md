# Cheerio-transerver

A stateless, high-performance HTML parsing middleware service for translation workflows.

## Features

- **Text Extraction**: Extract translatable text segments from HTML while preserving inline formatting
- **Translation Merging**: Merge translated text back into HTML maintaining original structure
- **Smart Filtering**: Automatically excludes script, style, and code blocks
- **Inline Tags Preservation**: Preserves `<a>`, `<strong>`, `<em>`, `<i>`, `<span>`, `<u>`
- **Security**: Bearer token authentication for all API operations
- **Lightweight**: Minimal dependencies - only cheerio required

## Quick Start

### Docker

```bash
# Build and start service
docker-compose up --build

# Or run in background
docker-compose up --build -d

# Check service health
curl http://localhost:3000/healthz
```

### Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
# API_TOKEN=your-secret-token

# Start server
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment (development, production) | `development` |
| `API_TOKEN` | Bearer token for API authentication | **Required** |
| `MAX_HTML_SIZE` | Maximum HTML size in bytes | `10485760` (10MB) |

## API Endpoints

### Health Check

```http
GET /healthz
```

Returns service health status.

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
Authorization: Bearer your-token

{
  "html": "<p>Hello <strong>world</strong></p>",
  "options": {
    "ignoredClasses": ["notranslate", "code-snippet"],
    "preserveWhitespace": false
  }
}
```

**Request Body:**
- `html` (required): HTML content to parse
- `options` (optional):
  - `ignoredClasses`: CSS classes to skip during extraction
  - `preserveWhitespace`: Whether to preserve whitespace

**Response:**
```json
{
  "segments": [
    {
      "id": "aHRtbC5ib2R5WzBdLnBbMF0=",
      "text": "Hello <strong>world</strong>",
      "path": "html.body.p[0]",
      "tag": "p"
    }
  ],
  "count": 1
}
```

**Error Codes:**
- `403` - Missing or invalid authorization
- `413` - Request exceeds 10MB limit
- `422` - Invalid request format
- `500` - Processing error

### Merge Translations

```http
POST /merge
Content-Type: application/json
Authorization: Bearer your-token

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
  - `safetyCheck`: Validate unclosed tags in translations
  - `strictMode`: Throw error if any segment ID is not found

**Response:**
```json
{
  "html": "<p>你好</p>",
  "mergedCount": 1
}
```

**Error Codes:**
- `400` - Invalid HTML structure or unclosed tags
- `403` - Missing or invalid authorization
- `413` - Request exceeds 10MB limit
- `422` - Invalid request format
- `500` - Processing error

## Example Usage

```bash
TOKEN="your-token"

# Extract segments
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"html":"<div><h1>Welcome</h1><p>Hello <strong>world</strong></p></div>"}'

# Merge translations
curl -X POST http://localhost:3000/merge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "html": "<div><h1>Welcome</h1><p>Hello <strong>world</strong></p></div>",
    "translations": [
      {
        "id": "html.body.div[0].h1[0]",
        "text": "欢迎"
      }
    ]
  }'
```

## Tag Handling

### Container Tags (Extracted as segments)
`p`, `div`, `li`, `h1-h6`, `section`, `article`, `aside`, `blockquote`, `dd`, `dt`, `dl`, `fieldset`, `figcaption`, `figure`, `footer`, `header`, `main`, `nav`, `ol`, `ul`, `td`, `th`, `tr`, `tbody`, `thead`, `tfoot`

### Inline Tags (Preserved within text)
`a`, `b`, `strong`, `i`, `em`, `u`, `span`, `mark`, `small`, `sub`, `sup`, `time`, `q`, `s`, `strike`, `del`, `ins`, `abbr`, `acronym`, `cite`

### Excluded Tags (Ignored)
`script`, `style`, `pre`, `code`, `canvas`, `svg`, `noscript`, `iframe`, `video`, `audio`, `object`, `embed`, `applet`, `meta`, `link`

## Deployment

### Docker

```bash
# Build image
docker build -t cheerio-transerver:latest .

# Run container
docker run -d \
  -p 3000:3000 \
  -e API_TOKEN=your-production-token \
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
