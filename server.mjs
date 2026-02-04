import http from 'http';
import { JSDOM } from 'jsdom';

// Configuration from environment variables
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN;
const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB

// Service identification
const SERVICE_NAME = 'JSDOM-extract-merge';

// Homepage content
const HOMEPAGE_CONTENT = `${SERVICE_NAME}`;

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

// Validate required environment variables
if (!API_TOKEN) {
  log('ERROR', 'API_TOKEN environment variable is required');
  process.exit(1);
}

// Send JSON response helper
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': CONTENT_TYPE_JSON });
  res.end(JSON.stringify(data));
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
  if (!('html' in json) || typeof json.html !== 'string') {
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
  'address', 'article', 'aside', 'blockquote', 'dd', 'div',
  'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
  'nav', 'ol', 'output', 'p', 'pre', 'section', 'table',
  'tfoot', 'ul', 'tr', 'td', 'th', 'thead', 'tbody', 'colgroup'
]);

// Elements that should be skipped during extraction (no translation needed)
const SKIP_ELEMENTS = new Set([
  'picture',     // Picture containers
  'img',         // Images
  'svg',         // SVG graphics
  'canvas',      // Canvas elements
  'iframe',      // Embedded content
  'video',       // Video elements
  'audio',       // Audio elements
  'map',         // Image maps
  'object',      // Embedded objects
  'embed',       // Embedded content
  'track',       // Text tracks for media
  'source'       // Media sources
]);

// Check if an element should be skipped (no translation needed)
function shouldSkipElement(element) {
  return element.nodeType === element.ELEMENT_NODE && SKIP_ELEMENTS.has(element.tagName.toLowerCase());
}

// Check if an element is a block-level element
function isBlockElement(element) {
  return element.nodeType === element.ELEMENT_NODE && BLOCK_ELEMENTS.has(element.tagName.toLowerCase());
}

// Check if an element contains only media elements (no translatable text)
// Note: Caller ensures element is an ELEMENT_NODE
function containsOnlyMedia(element) {
  // Get all text content, excluding media elements
  const clone = element.cloneNode(true);
  
  // Remove all media elements from clone
  const mediaSelectors = Array.from(SKIP_ELEMENTS).join(',');
  const mediaElements = clone.querySelectorAll(mediaSelectors);
  mediaElements.forEach(el => el.remove());
  
  // Get remaining text content
  const textContent = clone.textContent.trim();
  
  // If no text remains, this element only contains media
  return textContent.length === 0;
}

// Generate path for a DOM node (e.g., "html.body.div.0.p.0")
function generatePath(node) {
  const parts = [];
  
  let current = node;
  while (current && current.nodeType === current.ELEMENT_NODE) {
    const tag = current.tagName ? current.tagName.toLowerCase() : '';
    if (tag) {
      // Get parent element
      const parent = current.parentElement;
      if (parent) {
        // Count same-tag siblings before this node
        let index = 0;
        for (let sibling = parent.firstElementChild; sibling; sibling = sibling.nextElementSibling) {
          if (sibling === current) break;
          if (sibling.tagName === current.tagName) {
            index++;
          }
        }
        parts.unshift(`${tag}.${index}`);
      } else {
        // No parent, this is the root element
        parts.unshift(`${tag}.0`);
      }
    }
    current = current.parentElement;
  }
  
  return parts.join('.');
}

// Extract text content with inline HTML tags preserved, along with paths
function extractTextNodes(html, res) {
  try {
    // Create DOM environment using JSDOM
    const dom = new JSDOM(html, { url: 'http://localhost' });
    const doc = dom.window.document;

    const results = [];

    // Recursively walk the DOM tree and extract HTML with inline tags
    function walk(node) {
      if (node.nodeType !== node.ELEMENT_NODE) {
        return;
      }

      // Skip elements that don't need translation (media, embeds, etc.)
      if (shouldSkipElement(node)) {
        return;
      }

      const isBlock = isBlockElement(node);
      const hasBlockChildren = Array.from(node.childNodes).some(child => isBlockElement(child));

      // If this is a block element with no block children, extract its HTML
      if (isBlock && !hasBlockChildren) {
        // Skip elements that contain only media (no translatable text)
        if (containsOnlyMedia(node)) {
          return;
        }
        
        // Get innerHTML to preserve inline tags, but remove media elements
        let clone = node.cloneNode(true);
        const mediaSelectors = Array.from(SKIP_ELEMENTS).join(',');
        const mediaElements = clone.querySelectorAll(mediaSelectors);
        mediaElements.forEach(el => el.remove());
        
        let html = clone.innerHTML;
        // Trim leading/trailing whitespace and normalize internal whitespace
        html = html.trim().replace(/\s+/g, ' ');
        if (html) {
          const path = generatePath(node);
          results.push({ path, text: html });
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

    return results;
  } catch (error) {
    log('ERROR', 'HTML processing exception', { error: error.message, stack: error.stack });
    sendJsonResponse(res, 500, { error: ERRORS.PROCESSING_ERROR });
    return null;
  }
}

// Find a DOM node by path (e.g., "html.0.body.0.div.0.p.0")
function findByPath(doc, path) {
  if (!path) return null;
  
  const parts = path.split('.');
  if (parts.length < 4) return null; // Minimum: html.0.body.0.tag.index
  
  // Start from html element
  let currentNode = doc.documentElement; // html element
  
  // Skip "html.0", start from "body.0"
  let i = 2; // Start at body tag
  while (i < parts.length) {
    const tag = parts[i];
    const index = parseInt(parts[i + 1], 10);
    
    if (isNaN(index)) return null;
    
    // Find the index-th child element with matching tag
    let found = null;
    let currentIndex = 0;
    
    for (let child = currentNode.firstElementChild; child; child = child.nextElementSibling) {
      if (child.tagName.toLowerCase() === tag) {
        if (currentIndex === index) {
          found = child;
          break;
        }
        currentIndex++;
      }
    }
    
    if (!found) {
      log('ERROR', 'Path not found', { path, tag, index, currentTag: currentNode.tagName });
      return null;
    }
    
    currentNode = found;
    i += 2;
  }
  
  return currentNode;
}

// Merge translations into HTML
function mergeTranslations(html, translations, res) {
  try {
    const dom = new JSDOM(html, { url: 'http://localhost' });
    const doc = dom.window.document;
    
    for (const trans of translations) {
      const node = findByPath(doc, trans.path);
      
      if (!node) {
        log('WARN', 'Path not found', { path: trans.path });
        sendJsonResponse(res, 400, { error: 'INVALID_PATH', path: trans.path });
        return null;
      }
      
      // Create bilingual span and append
      const span = doc.createElement('span');
      span.className = 'jsdom-extract-merge';
      span.innerHTML = `<br>${trans.text}`;
      node.appendChild(span);
    }
    
    const transhtml = doc.body.innerHTML;
    dom.window.close();
    
    return transhtml;
  } catch (error) {
    log('ERROR', 'Merge exception', { error: error.message, stack: error.stack });
    sendJsonResponse(res, 500, { error: ERRORS.PROCESSING_ERROR });
    return null;
  }
}

// Replace translations in HTML (pure translation mode)
function replaceTranslations(html, translations, res) {
  try {
    const dom = new JSDOM(html, { url: 'http://localhost' });
    const doc = dom.window.document;
    
    for (const trans of translations) {
      const node = findByPath(doc, trans.path);
      
      if (!node) {
        log('WARN', 'Path not found', { path: trans.path });
        sendJsonResponse(res, 400, { error: 'INVALID_PATH', path: trans.path });
        return null;
      }
      
      // Replace node content with translation
      node.innerHTML = trans.text;
    }
    
    const transhtml = doc.body.innerHTML;
    dom.window.close();
    
    return transhtml;
  } catch (error) {
    log('ERROR', 'Replace exception', { error: error.message, stack: error.stack });
    sendJsonResponse(res, 500, { error: ERRORS.PROCESSING_ERROR });
    return null;
  }
}

// Handle POST /extract endpoint
async function handleExtract(req, res) {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);

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

    // Extract text nodes with paths from HTML
    const results = extractTextNodes(json.html, res);
    if (results === null) {
      log('ERROR', 'HTML processing failed', { requestId });
      return;
    }

    // Return success response with paths and texts
    const textCount = results.length;
    sendJsonResponse(res, 200, { texts: results });
    log('INFO', 'Request completed successfully', { requestId, htmlSize, textCount });
  } catch (error) {
    log('ERROR', 'Unexpected error during processing', { requestId, error: error.message });
    sendJsonResponse(res, 500, { error: ERRORS.PROCESSING_ERROR });
  }
}

// Parse and validate merge input
function parseMergeInput(req, body, res) {
  const contentType = req.headers[HEADER_CONTENT_TYPE];
  if (contentType && !contentType.includes(CONTENT_TYPE_JSON)) {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch (error) {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  if (!('html' in json) || typeof json.html !== 'string') {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  if (!('translations' in json) || !Array.isArray(json.translations)) {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  for (const trans of json.translations) {
    if (!('path' in trans) || typeof trans.path !== 'string') {
      sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
      return null;
    }
    if (!('text' in trans) || typeof trans.text !== 'string') {
      sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
      return null;
    }
  }

  if (json.html.length > MAX_HTML_SIZE) {
    sendJsonResponse(res, 400, { error: ERRORS.INVALID_INPUT });
    return null;
  }

  return json;
}

// Handle POST /merge endpoint
async function handleMerge(req, res) {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);

  if (!validateToken(req, res)) {
    log('WARN', 'Authentication failed', { requestId, ip: req.socket.remoteAddress });
    return;
  }

  log('INFO', 'Merge request received', { requestId });

  try {
    const body = await readRequestBody(req, res);
    const json = parseMergeInput(req, body, res);
    if (!json) {
      log('WARN', 'Invalid merge input', { requestId });
      return;
    }

    const htmlSize = json.html.length;
    const transCount = json.translations.length;
    log('INFO', 'Merge input validated', { requestId, htmlSize, transCount });

    const transhtml = mergeTranslations(json.html, json.translations, res);
    if (transhtml === null) {
      log('ERROR', 'Merge failed', { requestId });
      return;
    }

    sendJsonResponse(res, 200, { transhtml });
    log('INFO', 'Merge completed successfully', { requestId, htmlSize, transCount });
  } catch (error) {
    log('ERROR', 'Unexpected error during merge', { requestId, error: error.message });
    sendJsonResponse(res, 500, { error: ERRORS.PROCESSING_ERROR });
  }
}

// Handle POST /replace endpoint
async function handleReplace(req, res) {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);

  if (!validateToken(req, res)) {
    log('WARN', 'Authentication failed', { requestId, ip: req.socket.remoteAddress });
    return;
  }

  log('INFO', 'Replace request received', { requestId });

  try {
    const body = await readRequestBody(req, res);
    const json = parseMergeInput(req, body, res);
    if (!json) {
      log('WARN', 'Invalid replace input', { requestId });
      return;
    }

    const htmlSize = json.html.length;
    const transCount = json.translations.length;
    log('INFO', 'Replace input validated', { requestId, htmlSize, transCount });

    const transhtml = replaceTranslations(json.html, json.translations, res);
    if (transhtml === null) {
      log('ERROR', 'Replace failed', { requestId });
      return;
    }

    sendJsonResponse(res, 200, { transhtml });
    log('INFO', 'Replace completed successfully', { requestId, htmlSize, transCount });
  } catch (error) {
    log('ERROR', 'Unexpected error during replace', { requestId, error: error.message });
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

  // Homepage - Return service name (GET /)
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(HOMEPAGE_CONTENT);
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

  // Merge endpoint
  if (req.method === 'POST' && req.url === '/merge') {
    await handleMerge(req, res);
    return;
  }

  // Replace endpoint
  if (req.method === 'POST' && req.url === '/replace') {
    await handleReplace(req, res);
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
    endpoints: {
      extract: `http://localhost:${PORT}/extract`,
      merge: `http://localhost:${PORT}/merge`,
      replace: `http://localhost:${PORT}/replace`
    },
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
