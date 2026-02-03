/**
 * API Routes
 * Defines all endpoint handlers for the service
 */

import { extractTextSegments, mergeTranslations } from './parser.js';
import { asyncHandler, log } from './middleware.js';
import http from 'http';

/**
 * GET /healthz
 * Health check endpoint for Docker and orchestration platforms
 */
export const healthCheckHandler = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * POST /api/extract
 * Extract text segments from HTML
 * 
 * Request:
 * {
 *   "html": "<p>Read <a href='/1'>this</a>.</p>",
 *   "options": {
 *     "extractAttributes": [],
 *     "ignoredClasses": [],
 *     "preserveWhitespace": false
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "segments": [
 *     {
 *       "id": "aHRtbC5ib2R5WzBdLnBbMF0=",
 *       "text": "Read <a href='/1'>this</a>.",
 *       "path": "html.body[0].p[0]",
 *       "tag": "p",
 *       "attributes": {}
 *     }
 *   ],
 *   "count": 1
 * }
 */
export const extractHandler = asyncHandler(async (req, res) => {
  const { html, options } = req.validatedData;

  log('INFO', `Processing extract request, HTML size: ${html.length} bytes`);

  // Extract text segments
  const segments = extractTextSegments(html, options);

  log('INFO', `Extracted ${segments.length} segments`);

  res.json({
    success: true,
    segments: segments.map(seg => ({
      id: seg.id,
      text: seg.text,
      path: seg.path,
      tag: seg.tag,
      attributes: seg.attributes
    })),
    count: segments.length
  });
});

/**
 * POST /api/merge
 * Merge translated text segments back into original HTML
 * Requires Bearer Token authentication
 * 
 * Request:
 * {
 *   "html": "<p>Read <a href='/1'>this</a>.</p>",
 *   "translations": [
 *     {
 *       "id": "aHRtbC5ib2R5WzBdLnBbMF0=",
 *       "text": "阅读 <a href='/1'>这个</a>。"
 *     }
 *   ],
 *   "options": {
 *     "safetyCheck": true
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "html": "<p>阅读 <a href='/1'>这个</a>。</p>",
 *   "mergedCount": 1
 * }
 */
export const mergeHandler = asyncHandler(async (req, res) => {
  const { html, translations, options } = req.validatedData;

  log('INFO', `Processing merge request for ${translations.length} translations`);

  // Merge translations into HTML
  const mergedHtml = mergeTranslations(html, translations, options);

  log('INFO', `Successfully merged ${translations.length} translations`);

  res.json({
    success: true,
    html: mergedHtml,
    mergedCount: translations.length
  });
});

/**
 * Setup all routes
 */
export function setupRoutes(app) {
  // Health check endpoint
  app.get('/healthz', healthCheckHandler);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      success: true,
      service: 'Cheerio HTML Parser API',
      version: '1.0.0',
      endpoints: {
        health: 'GET /healthz',
        extract: 'POST /api/extract',
        merge: 'POST /api/merge'
      },
      documentation: 'See README.md for API usage details'
    });
  });

  // API routes
  app.post('/api/extract', extractHandler);
  app.post('/api/merge', mergeHandler);
}
