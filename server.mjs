import http from 'http';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// Configuration from environment variables
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN;
const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB

// Validate required environment variables
if (!API_TOKEN) {
  log('ERROR', 'API_TOKEN environment variable is required');
  process.exit(1);
}

// Read README content for homepage
let README_CONTENT = '';
try {
  const readmePath = path.join(process.cwd(), 'README.md');
  if (fs.existsSync(readmePath)) {
    README_CONTENT = fs.readFileSync(readmePath, 'utf-8');
  } else {
    throw new Error('README.md not found');
  }
} catch (error) {
  log('WARN', 'README.md not found, using fallback documentation');
  README_CONTENT = `# jsdom Text Extractor API

HTML text node extraction API based on jsdom.

## Quick Start

\`\`\`bash
docker run -d -p 3000:3000 -e API_TOKEN=your-token jsdom-text-extractor
\`\`\`

## API Endpoint

**POST /extract**

Extract all non-empty text nodes from HTML.

\`\`\`json
{
  "html": "<div><p>Hello</p><p>World</p></div>"
}
\`\`\`

Response:
\`\`\`json
{
  "texts": ["Hello", "World"]
}
\`\`\`

## Health Check

**GET /healthz**

Returns \`OK\` if service is running.

## Requirements

- Set \`API_TOKEN\` environment variable
- Send requests with \`Authorization: Bearer <token>\` header
- Max HTML size: 10MB

Documentation: See README.md in repository for full details.
`;
}

// Constants
const CONTENT_TYPE_JSON = 'application/json';
const AUTH_HEADER_PREFIX = 'Bearer ';
const HEADER_AUTH = 'authorization';
const HEADER_CONTENT_TYPE = 'content-type';

// Error types
const ERRORS = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_INPUT: 'INVALID_INPUT',
  PROCESSING_ERROR: 'PROCESSING_ERROR'
};

// Send JSON response helper
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': CONTENT_TYPE_JSON });
  res.end(JSON.stringify(data));
}

// Logging helper
function log(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...context
  };
  const logLine = JSON.stringify(logEntry);

  switch (level) {
    case 'ERROR':
      console.error(logLine);
      break;
    case 'WARN':
      console.warn(logLine);
      break;
    default:
      console.log(logLine);
  }
}

// Process request body with size limit
function readRequestBody(req, res) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_HTML_SIZE) {
        req.destroy(new Error('Request body too large'));
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      resolve(body);
    });

    req.on('error', (error) => {
      if (error.message === 'Request body too large') {
        sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
      }
      reject(error);
    });
  });
}

// Validate Bearer Token
function validateToken(req, res) {
  const authHeader = req.headers[HEADER_AUTH];
  if (!authHeader || !authHeader.startsWith(AUTH_HEADER_PREFIX)) {
    sendJsonResponse(res, 401, { error: ERRORS.AUTH_REQUIRED });
    return false;
  }

  const token = authHeader.substring(AUTH_HEADER_PREFIX.length);
  if (token !== API_TOKEN) {
    sendJsonResponse(res, 401, { error: ERRORS.AUTH_REQUIRED });
    return false;
  }

  return true;
}

// Parse and validate JSON input
function parseInput(req, body, res) {
  // Check Content-Type header
  const contentType = req.headers[HEADER_CONTENT_TYPE];
  if (contentType && !contentType.includes(CONTENT_TYPE_JSON)) {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  // Try to parse JSON
  let json;
  try {
    json = JSON.parse(body);
  } catch (error) {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  // Validate html field
  if (!json.hasOwnProperty('html')) {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  if (typeof json.html !== 'string') {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  // Check size
  if (json.html.length > MAX_HTML_SIZE) {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  return json;
}

// List of block-level elements that should separate text content
const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'canvas', 'dd', 'div',
  'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
  'nav', 'noscript', 'ol', 'output', 'p', 'pre', 'section', 'table',
  'tfoot', 'ul', 'video', 'tr', 'td', 'th', 'thead', 'tbody', 'colgroup'
]);

// Check if an element is a block-level element
function isBlockElement(element) {
  return element.nodeType === element.ELEMENT_NODE && BLOCK_ELEMENTS.has(element.tagName.toLowerCase());
}

// Extract text content with inline HTML tags preserved
function extractTextNodes(html, res) {
  try {
    // Create DOM environment using JSDOM
    const dom = new JSDOM(html, { url: 'http://localhost' });
    const doc = dom.window.document;

    const texts = [];

    // Recursively walk the DOM tree and extract HTML with inline tags
    function walk(node) {
      if (node.nodeType === node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          texts.push(text);
        }
        return;
      }

      if (node.nodeType !== node.ELEMENT_NODE) {
        return;
      }

      const isBlock = isBlockElement(node);
      const hasBlockChildren = Array.from(node.childNodes).some(child => isBlockElement(child));

      // If this is a block element with no block children, extract its HTML
      if (isBlock && !hasBlockChildren) {
        // Get innerHTML to preserve inline tags
        let html = node.innerHTML;
        // Trim leading/trailing whitespace and normalize internal whitespace
        html = html.trim().replace(/\s+/g, ' ');
        if (html) {
          texts.push(html);
        }
        return;
      }

      // Otherwise, recursively process children
      for (const child of node.childNodes) {
        walk(child);
      }
    }

    // Start traversal from document body children
    for (const child of doc.body.childNodes) {
      walk(child);
    }

    // Close the window to free resources
    dom.window.close();

    return texts;
  } catch (error) {
    log('ERROR', 'HTML processing exception', { error: error.message, stack: error.stack });
    sendJsonResponse(res, 500, { error: ERRORS.PROCESSING_ERROR });
    return null;
  }
}

// Handle POST /extract endpoint
async function handleExtract(req, res) {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);

  // Validate token first
  if (!validateToken(req, res)) {
    log('WARN', 'Authentication failed', { requestId, ip: req.socket.remoteAddress });
    return;
  }

  log('INFO', 'Request received', { requestId });

  // Read and validate request body
  try {
    const body = await readRequestBody(req, res);
    const json = parseInput(req, body, res);
    if (!json) {
      log('WARN', 'Invalid input', { requestId });
      return;
    }

    const htmlSize = json.html.length;
    log('INFO', 'Input validated', { requestId, htmlSize });

    // Extract text nodes from HTML
    const texts = extractTextNodes(json.html, res);
    if (texts === null) {
      log('ERROR', 'HTML processing failed', { requestId });
      return;
    }

    // Return success response
    const textCount = texts.length;
    sendJsonResponse(res, 200, { texts });
    log('INFO', 'Request completed successfully', { requestId, htmlSize, textCount });
  } catch (error) {
    log('ERROR', 'Unexpected error during processing', { requestId, error: error.message });
    sendJsonResponse(res, 500, { error: ERRORS.PROCESSING_ERROR });
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Enable CORS (optional, for flexibility)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Homepage - Return README documentation (GET /)
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    res.end(README_CONTENT);
    return;
  }

  // Health check endpoint (GET /healthz)
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Main API endpoint
  if (req.method === 'POST' && req.url === '/extract') {
    await handleExtract(req, res);
    return;
  }

  // 404 for unknown routes
  log('WARN', 'Route not found', { method: req.method, url: req.url });
  res.writeHead(404, { 'Content-Type': CONTENT_TYPE_JSON });
  res.end(JSON.stringify({ error: 'NOT_FOUND' }));
});

// Start server
server.listen(PORT, () => {
  log('INFO', 'jsdom Text Extractor API server is running', {
    port: PORT,
    endpoint: `http://localhost:${PORT}/extract`,
    healthCheck: `http://localhost:${PORT}/healthz`
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('INFO', 'SIGTERM signal received: closing HTTP server');
  server.close(() => {
    log('INFO', 'HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('INFO', 'SIGINT signal received: closing HTTP server');
  server.close(() => {
    log('INFO', 'HTTP server closed');
    process.exit(0);
  });
});
