import express from 'express';
import { extractTextSegments, mergeTranslations, checkUnclosedTags } from './parser.js';
import { extractRequestSchema, mergeRequestSchema, validateRequest } from './validators.js';
import { authMiddleware, InvalidStructureError } from './middleware.js';

const router = express.Router();

/**
 * @openapi
 * /healthz:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns service health status for Docker/Kubernetes health probes
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 uptime:
 *                   type: number
 *                   example: 123.456
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 memory:
 *                   type: object
 *                 version:
 *                   type: string
 */
router.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

/**
 * @openapi
 * /:
 *   get:
 *     summary: Service information
 *     description: Returns basic service information
 *     responses:
 *       200:
 *         description: Service information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: Cheerio-transerver
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 description:
 *                   type: string
 */
router.get('/', (req, res) => {
  res.json({
    name: 'Cheerio-transerver',
    version: process.env.npm_package_version || '1.0.0',
    description: 'A stateless HTML parsing middleware service for translation workflows'
  });
});

/**
 * @openapi
 * /api/extract:
 *   post:
 *     summary: Extract text segments from HTML
 *     description: Extracts translatable text segments from HTML while preserving inline formatting tags
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - html
 *             properties:
 *               html:
 *                 type: string
 *                 description: HTML content to parse
 *                 example: '<p>Hello <strong>world</strong></p>'
 *               options:
 *                 type: object
 *                 properties:
 *                   extractAttributes:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [alt, placeholder, title]
 *                     description: Attributes to extract for translation
 *                   ignoredClasses:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: CSS classes to skip during extraction
 *                   preserveWhitespace:
 *                     type: boolean
 *                     description: Whether to preserve whitespace in extracted text
 *     responses:
 *       200:
 *         description: Successfully extracted segments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 segments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Unique segment ID for merge operation
 *                         example: aHRtbC5ib2R5WzBdLnBbMF0=
 *                       text:
 *                         type: string
 *                         description: Extracted HTML text including inline tags
 *                         example: Hello <strong>world</strong>
 *                       path:
 *                         type: string
 *                         description: CSS path to the element
 *                         example: html.body.p[0]
 *                       tag:
 *                         type: string
 *                         description: Tag name of the element
 *                         example: p
 *                       attributes:
 *                         type: object
 *                         description: Extracted attributes
 *       400:
 *         description: Invalid HTML structure
 *       413:
 *         description: Payload too large (>10MB)
 *       422:
 *         description: Validation error
 *       500:
 *         description: Processing timeout or internal error
 */
router.post('/api/extract', validateRequest(extractRequestSchema), (req, res) => {
  try {
    const { html, options } = req.body;

    if (!html || html.trim().length === 0) {
      throw new InvalidStructureError('HTML content is empty');
    }

    const segments = extractTextSegments(html, options);

    res.json({
      segments,
      count: segments.length
    });
  } catch (error) {
    if (error instanceof InvalidStructureError) {
      return res.status(400).json({
        error: 'INVALID_STRUCTURE',
        message: error.message,
        statusCode: 400
      });
    }
    throw error;
  }
});

/**
 * @openapi
 * /api/merge:
 *   post:
 *     summary: Merge translated text back into HTML
 *     description: Replaces translated text segments in the original HTML
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - html
 *               - translations
 *             properties:
 *               html:
 *                 type: string
 *                 description: Original HTML content
 *                 example: '<p>Hello</p>'
 *               translations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Segment ID from extract response
 *                       example: aHRtbC5ib2R5WzBdLnBbMF0=
 *                     text:
 *                       type: string
 *                       description: Translated HTML text
 *                       example: 你好
 *               options:
 *                 type: object
 *                 properties:
 *                   safetyCheck:
 *                     type: boolean
 *                     description: Whether to validate unclosed tags in translations
 *                   strictMode:
 *                     type: boolean
 *                     description: Whether to throw error if any segment ID is not found
 *     responses:
 *       200:
 *         description: Successfully merged translations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 html:
 *                   type: string
 *                   description: Merged HTML with translations
 *                 mergedCount:
 *                   type: integer
 *                   description: Number of segments merged
 *                 missingIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Segment IDs that were not found (if not in strict mode)
 *       400:
 *         description: Invalid HTML structure or unclosed tags detected
 *       403:
 *         description: Unauthorized - missing or invalid bearer token
 *       413:
 *         description: Payload too large (>10MB)
 *       422:
 *         description: Validation error
 *       500:
 *         description: Processing timeout or internal error
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 */
router.post('/api/merge', authMiddleware, validateRequest(mergeRequestSchema), (req, res) => {
  try {
    const { html, translations, options } = req.body;

    if (!html || html.trim().length === 0) {
      throw new InvalidStructureError('HTML content is empty');
    }

    if (options?.safetyCheck) {
      for (const translation of translations) {
        const { isValid, missingTags } = checkUnclosedTags(translation.text);
        if (!isValid) {
          throw new InvalidStructureError(
            `Unclosed tags detected in translation ${translation.id}: ${missingTags.join(', ')}`
          );
        }
      }
    }

    const mergedHtml = mergeTranslations(html, translations, { options });

    // Count how many translations were successfully applied
    // Note: mergeTranslations doesn't return this directly, so we approximate
    const mergedCount = translations.filter(t => {
      // Simple check: if the translated text appears in merged HTML
      // This is not perfect but works for most cases
      return mergedHtml.includes(t.text.substring(0, 20));
    }).length;

    res.json({
      html: mergedHtml,
      mergedCount
    });
  } catch (error) {
    if (error instanceof InvalidStructureError) {
      return res.status(400).json({
        error: 'INVALID_STRUCTURE',
        message: error.message,
        statusCode: 400
      });
    }
    throw error;
  }
});

export default router;
