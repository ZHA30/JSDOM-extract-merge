import http from 'http';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

// Configuration from environment variables
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_BEARER_TOKEN || process.env.API_TOKEN;
const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB
const REQUEST_TIMEOUT = 30 * 1000; // 30s

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
  }
} catch (error) {
  log('WARN', 'README.md not found, using fallback documentation');
}

// CONSTANTS
const CONTENT_TYPE_JSON = 'application/json';
const AUTH_HEADER_PREFIX = 'Bearer ';
const HEADER_AUTH = 'authorization';
const HEADER_CONTENT_TYPE = 'content-type';

// Container tags
const CONTAINER_TAGS = [
  'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'section', 'article', 'aside', 'blockquote', 'dd', 'dt', 'dl',
  'fieldset', 'figcaption', 'figure', 'footer', 'header', 'main',
  'nav', 'ol', 'ul', 'td', 'th', 'tr', 'tbody', 'thead', 'tfoot'
];

// Inline tags (preserved within text)
const INLINE_TAGS = [
  'a', 'b', 'strong', 'i', 'em', 'u', 'span', 'mark',
  'small', 'sub', 'sup', 'time', 'q', 's', 'strike',
  'del', 'ins', 'abbr', 'acronym', 'cite'
];

// Excluded tags (ignored completely)
const EXCLUDED_TAGS = [
  'script', 'style', 'pre', 'code', 'canvas', 'svg',
  'noscript', 'iframe', 'video', 'audio', 'object', 'embed',
  'applet', 'meta', 'link'
];

// Error types
const ERRORS = {
  AUTH_REQUIRED: 'UNAUTHORIZED',
  INVALID_INPUT: 'VALIDATION_ERROR',
  INVALID_STRUCTURE: 'INVALID_STRUCTURE',
  PROCESS_TIMEOUT: 'PROCESS_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

// Send JSON response helper
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': CONTENT_TYPE_JSON });
  res.end(JSON.stringify(data));
}

// Logging helper
function log(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, ...context };
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

// Validate Bearer Token
function validateToken(req, res) {
  const authHeader = req.headers[HEADER_AUTH];
  if (!authHeader || !authHeader.toLowerCase().startsWith(AUTH_HEADER_PREFIX.toLowerCase())) {
    sendJsonResponse(res, 403, { error: ERRORS.AUTH_REQUIRED, message: 'Missing or invalid Authorization header' });
    return false;
  }

  const token = authHeader.substring(AUTH_HEADER_PREFIX.length);
  if (token !== API_TOKEN) {
    sendJsonResponse(res, 403, { error: ERRORS.AUTH_REQUIRED, message: 'Invalid token' });
    return false;
  }

  return true;
}

// Parse and validate JSON input
function parseInput(req, body, res, requiredFields = ['html']) {
  // Check Content-Type header
  const contentType = req.headers[HEADER_CONTENT_TYPE];
  if (contentType && !contentType.includes(CONTENT_TYPE_JSON)) {
    sendJsonResponse(res, 422, { error: ERRORS.INVALID_INPUT, message: 'Content-Type must be application/json' });
    return null;
  }

  // Try to parse JSON
  let json;
  try {
    json = JSON.parse(body);
  } catch (error) {
    sendJsonResponse(res, 422, { error: ERRORS.INVALID_INPUT, message: 'Invalid JSON format' });
    return null;
  }

  // Validate required fields
  for (const field of requiredFields) {
    if (!json.hasOwnProperty(field)) {
      sendJsonResponse(res, 422, { error: ERRORS.INVALID_INPUT, message: `Missing required field: ${field}` });
      return null;
    }
    // translations can be array, others must be string
    if (field !== 'translations' && typeof json[field] !== 'string') {
      sendJsonResponse(res, 422, { error: ERRORS.INVALID_INPUT, message: `Invalid type for field: ${field} (must be string)` });
      return null;
    }
    if (field === 'translations' && !Array.isArray(json[field])) {
      sendJsonResponse(res, 422, { error: ERRORS.INVALID_INPUT, message: `Invalid type for field: ${field} (must be array)` });
      return null;
    }
  }

  // Check html size
  const html = json.html || json.translations?.[0]?.html;
  if (html && typeof html === 'string' && html.length > MAX_HTML_SIZE) {
    sendJsonResponse(res, 413, { error: ERRORS.INVALID_INPUT, message: 'Request payload exceeds 10MB limit' });
    return null;
  }

  return json;
}

// Normalize whitespace
function normalizeWhitespace(html) {
  if (!html) return '';
  return html.replace(/\s+/g, ' ').trim();
}

// Check if element is inside an excluded tag
function isInsideExcludedTag($element) {
  let $current = $element.parent();
  while ($current.length > 0) {
    const tagName = $current[0].tagName;
    if (EXCLUDED_TAGS.includes(tagName)) {
      return true;
    }
    $current = $current.parent();
  }
  return false;
}

// Generate CSS path for element
function getPath($element) {
  const path = [];
  let $current = $element;

  while ($current.length > 0) {
    const tagName = $current[0].tagName;

    if (tagName === 'html' || tagName === 'body') {
      path.unshift(tagName);
    } else {
      const siblings = $current.parent().children().filter(function() {
        return this.tagName === tagName;
      });
      const index = siblings.index($current);
      path.unshift(`${tagName}[${index}]`);
    }

    const prevCurrent = $current;
    $current = $current.parent();

    if ($current.length === 0 || prevCurrent[0]?.tagName === 'html') {
      break;
    }
  }

  return path.join('.');
}

// Generate Base64 hash from path
function generatePathHash(path) {
  return Buffer.from(path).toString('base64');
}

// Find element by path hash
function findElementByPathHash($, hash) {
  try {
    const path = Buffer.from(hash, 'base64').toString('utf-8');
    const parts = path.split('.');
    let $element = $.root();

    for (const part of parts) {
      if (part.includes('[') && part.includes(']')) {
        const [tag, indexStr] = part.split('[');
        const index = parseInt(indexStr.replace(']', ''), 10);
        const childrenArray = $element.children().toArray();
        const matchingChildren = childrenArray.filter(child => child.tagName === tag);

        if (matchingChildren.length > index) {
          $element = $(matchingChildren[index]);
        } else {
          return $([]);
        }
      } else {
        const childrenArray = $element.children().toArray();
        const matchingChild = childrenArray.find(child => child.tagName === part);
        if (matchingChild) {
          $element = $(matchingChild);
        } else {
          return $([]);
        }
      }

      if ($element.length === 0) {
        return $([]);
      }
    }

    return $element;
  } catch (error) {
    log('ERROR', 'Error finding element by path hash', { error: error.message });
    return $([]);
  }
}

// Check for unclosed tags
function checkUnclosedTags(text) {
  const stack = [];
  const missingTags = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1].toLowerCase();

    // Skip self-closing tags
    if (fullMatch.endsWith('/>') || ['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tagName)) {
      continue;
    }

    if (fullMatch.startsWith('</')) {
      // Closing tag
      const lastOpen = stack.lastIndexOf(tagName);
      if (lastOpen === -1) {
        missingTags.push(tagName);
        continue;
      }
      stack.splice(lastOpen, 1);
    } else if (!fullMatch.match(/\/\s*>$/)) {
      // Opening tag (not self-closing)
      stack.push(tagName);
    }
  }

  return {
    isValid: missingTags.length === 0 && stack.length === 0,
    missingTags: [...missingTags, ...stack]
  };
}

// Extract options handling
function extractOptions(json, options = {}) {
  options.extractAttributes = json.options?.extractAttributes || [];
  options.ignoredClasses = json.options?.ignoredClasses || [];
  options.preserveWhitespace = json.options?.preserveWhitespace || false;
  return options;
}

// Check if element has ignored classes
function hasIgnoredClass($element, ignoredClasses) {
  if (!ignoredClasses || ignoredClasses.length === 0) {
    return false;
  }
  const classes = $element.attr('class') || '';
  const elementClasses = classes.split(/\s+/).filter(Boolean);
  return ignoredClasses.some(ignored => elementClasses.includes(ignored));
}

// Handle POST /extract endpoint
async function handleExtract(req, res) {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);

  if (!validateToken(req, res)) {
    log('WARN', 'Authentication failed', { requestId });
    return;
  }

  log('INFO', 'Extract request received', { requestId });

  try {
    // Read request body with timeout
    const body = await readRequestBody(req, res);
    const json = parseInput(req, body, res, ['html']);
    if (!json) {
      log('WARN', 'Invalid input', { requestId });
      return;
    }

    const options = extractOptions(json);
    const htmlSize = json.html.length;

    // Load HTML with cheerio
    const $ = cheerio.load(json.html, { decodeEntities: false });

    const selector = CONTAINER_TAGS.join(',');
    const segments = [];

    $(selector).each((index, element) => {
      const $element = $(element);
      const tagName = element.tagName;

      // Skip if inside excluded tag
      if (isInsideExcludedTag($element)) {
        return;
      }

      // Skip if has ignored classes
      if (hasIgnoredClass($element, options.ignoredClasses)) {
        return;
      }

      const pathStr = getPath($element);
      const segId = generatePathHash(pathStr);

      let text = options.preserveWhitespace ? $element.html() : normalizeWhitespace($element.html());

      if (text && text.trim()) {
        segments.push({
          id: segId,
          text: text,
          path: pathStr,
          tag: tagName
        });
      }
    });

    sendJsonResponse(res, 200, { segments, count: segments.length });
    log('INFO', 'Extract completed', { requestId, htmlSize, segmentCount: segments.length });
  } catch (error) {
    log('ERROR', 'Extract processing error', { requestId, error: error.message });
    sendJsonResponse(res, 500, { error: ERRORS.INTERNAL_ERROR, message: 'Internal server error' });
  }
}

// Handle POST /merge endpoint
async function handleMerge(req, res) {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);

  if (!validateToken(req, res)) {
    log('WARN', 'Authentication failed', { requestId });
    return;
  }

  log('INFO', 'Merge request received', { requestId });

  try {
    const body = await readRequestBody(req, res);
    const json = parseInput(req, body, res, ['html', 'translations']);
    if (!json) {
      log('WARN', 'Invalid input', { requestId });
      return;
    }

    const options = json.options || {};
    const htmlSize = json.html.length;

    // Safety check for unclosed tags
    if (options.safetyCheck !== false) {
      for (const translation of json.translations) {
        const { isValid, missingTags } = checkUnclosedTags(translation.text);
        if (!isValid) {
          sendJsonResponse(res, 400, {
            error: ERRORS.INVALID_STRUCTURE,
            message: `Unclosed tags detected in translation ${translation.id}: ${missingTags.join(', ')}`
          });
          return;
        }
      }
    }

    // Load HTML with cheerio
    const $ = cheerio.load(json.html, { decodeEntities: false });

    let successCount = 0;
    const missingIds = [];
    const strictMode = options.strictMode === true;

    for (const translation of json.translations) {
      const $element = findElementByPathHash($, translation.id);

      if ($element.length === 0) {
        missingIds.push(translation.id);
        if (strictMode) {
          sendJsonResponse(res, 422, {
            error: ERRORS.INVALID_INPUT,
            message: `Segment ID not found in HTML: ${translation.id}`,
            missingIds
          });
          return;
        }
      } else {
        $element.html(translation.text);
        successCount++;
      }
    }

    sendJsonResponse(res, 200, {
      html: $.html(),
      mergedCount: successCount,
      ...(missingIds.length > 0 && !strictMode ? { missingIds } : {})
    });
    log('INFO', 'Merge completed', { requestId, htmlSize, mergedCount: successCount });
  } catch (error) {
    log('ERROR', 'Merge processing error', { requestId, error: error.message });
    sendJsonResponse(res, 500, { error: ERRORS.INTERNAL_ERROR, message: 'Internal server error' });
  }
}

// Read request body with size limit and timeout
function readRequestBody(req, res) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      req.destroy(new Error('Request timeout'));
    }, REQUEST_TIMEOUT);

    let body = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_HTML_SIZE) {
        clearTimeout(timeout);
        req.destroy(new Error('Request body too large'));
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      clearTimeout(timeout);
      resolve(body);
    });

    req.on('error', (error) => {
      clearTimeout(timeout);
      if (error.message === 'Request body too large') {
        sendJsonResponse(res, 413, { error: ERRORS.INVALID_INPUT, message: 'Request payload exceeds 10MB limit' });
      }
      reject(error);
    });
  });
}

// Get server memory usage
function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    external: mem.external
  };
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Set headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Homepage - Return README
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    res.end(README_CONTENT);
    return;
  }

  // Health check endpoint
  if (req.method === 'GET' && req.url === '/healthz') {
    const healthData = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: getMemoryUsage(),
      version: '1.0.0'
    };
    sendJsonResponse(res, 200, healthData);
    return;
  }

  // Extract endpoint
  if (req.method === 'POST' && req.url === '/extract') {
    await handleExtract(req, res);
    return;
  }

  // Merge endpoint
  if (req.method === 'POST' && req.url === '/merge') {
    await handleMerge(req, res);
    return;
  }

  // 404
  log('WARN', 'Route not found', { method: req.method, url: req.url });
  res.writeHead(404, { 'Content-Type': CONTENT_TYPE_JSON });
  res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found`, statusCode: 404 }));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  log('INFO', 'Cheerio-transerver server is running', {
    port: PORT,
    endpoints: {
      health: `http://localhost:${PORT}/healthz`,
      extract: `http://localhost:${PORT}/extract`,
      merge: `http://localhost:${PORT}/merge`
    }
  });
});

// Graceful shutdown
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log('INFO', `${signal} received. Starting graceful shutdown...`);

  server.close((err) => {
    if (err) {
      log('ERROR', 'Error closing server', { error: err.message });
      process.exit(1);
    }
    log('INFO', 'Server closed successfully');
    process.exit(0);
  });

  setTimeout(() => {
    log('ERROR', 'Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught exception', { error: error.message, stack: error.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', 'Unhandled rejection', { reason });
  gracefulShutdown('unhandledRejection');
});
