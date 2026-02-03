# jsdom Text Extractor API

A minimal HTML text node extraction API based on jsdom. Takes raw HTML as input and returns all non-empty text nodes in a JSON array.

## Features

- **Single Responsibility**: Only extracts text nodes from HTML - no URL fetching, file uploads, or additional features
- **Minimal Interface**: One endpoint (`POST /extract`) with a single output field (`texts`)
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
docker build -t jsdom-text-extractor .
docker run -d \
  --name jsdom-extractor \
  -p 3000:3000 \
  -e API_TOKEN=$TOKEN \
  --restart unless-stopped \
  jsdom-text-extractor
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

### Endpoint

**`POST /extract`**

Extract all non-empty text nodes from HTML content using jsdom.

#### Request Headers

```http
Content-Type: application/json
Authorization: Bearer <your-token>
```

#### Request Body

```json
{
  "html": "<string>"
}
```

| Field | Type   | Required | Description                     |
|-------|--------|----------|---------------------------------|
| `html` | string | Yes      | Raw HTML string to process      |

#### Response

##### Success (200 OK)

```json
{
  "texts": ["Extracted text 1", "Extracted text 2", "..."]
}
```

The `texts` array contains text content with the following behavior:

- **Inline elements merged**: Text split by inline elements (e.g., `<span>`, `<em>`, `<strong>`, `<a>`, `<code>`) is seamlessly joined
  - Example: `<div><span>W</span>hat if...</div>` → `"What if..."`
- **Block elements separated**: Each block-level element (e.g., `<p>`, `<h1>`, `<div>`, `<li>`) produces a separate text entry
  - Example: `<h1>Title</h1><p>Content</p>` → `["Title", "Content"]`
- **Whitespace normalized**: Multiple spaces/newlines are collapsed to single spaces

##### Error Responses

| Status Code | Error               | Description                                             |
|-------------|---------------------|---------------------------------------------------------|
| 401         | `AUTH_REQUIRED`     | Missing or invalid Authorization header/token           |
| 400         | `INVALID_INPUT`     | Invalid JSON, missing html field, or html size exceeds 10MB |
| 500         | `PROCESSING_ERROR`  | HTML parsing failed                                     |
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

### cURL

```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{"html": "<div><h1>Title</h1><p>Paragraph 1</p><p>Paragraph 2</p></div>"}'
```

Response:
```json
{
  "texts": ["Title", "Paragraph 1", "Paragraph 2"]
}
```

**Note**: Inline elements like `<span>` or `<em>` are merged seamlessly:
```json
// Input: {"html": "<div><span>W</span>elcome <em>here</em></div>"}
{
  "texts": ["Welcome here"]
}
```

### JavaScript/Node.js

```javascript
const response = await fetch('http://localhost:3000/extract', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token-here'
  },
  body: JSON.stringify({
    html: '<div><h1>Article Title</h1><p>Article content...</p></div>'
  })
});

const result = await response.json();
console.log(result.texts);
// Output: ["Article Title", "Article content..."]
```

### Python

```python
import requests

response = requests.post(
    'http://localhost:3000/extract',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your-token-here'
    },
    json={
        'html': '<div><h1>Article Title</h1><p>Article content...</p></div>'
    }
)

result = response.json()
print(result['texts'])
# Output: ['Article Title', 'Article content...']
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

The API uses jsdom to create a virtual DOM from the provided HTML string. It then traverses the DOM tree starting from the `<body>` element, intelligently extracting text content.

**Algorithm**:
1. Parse HTML using JSDOM
2. Traverse the DOM tree from `document.body`
3. For block-level elements (div, p, h1-h6, li, etc.):
   - If they contain no nested block elements, extract all text as one entry
   - This merges text split by inline elements (span, em, strong, a, code, etc.)
4. Return array of extracted text strings

**Example**:
```html
<div><span>W</span>hat if you could <em>succeed</em>?</div>
```
→ `["What if you could succeed?"]`

```html
<p>First paragraph</p>
<p>Second paragraph with <strong>emphasis</strong></p>
```
→ `["First paragraph", "Second paragraph with emphasis"]`

## Known Limitations

- Does not execute JavaScript or render dynamic content
- Cannot process URLs directly - HTML must be provided as text
- No caching - each request is processed independently
- Returns all text nodes including those from `<script>` and `<style>` tags content (if they contain text)
- Single point of failure - no redundancy built-in

## License

MIT

## Based On

- [jsdom](https://github.com/jsdom/jsdom) - Pure-JavaScript implementation of the DOM and HTML standards
