import express from 'express';
import { extractTextSegments, mergeTranslations, checkUnclosedTags } from './parser.js';
import { extractRequestSchema, mergeRequestSchema, validateRequest } from './validators.js';
import { authMiddleware, InvalidStructureError } from './middleware.js';

const router = express.Router();

/**
 * GET /healthz - Health check endpoint
 * Returns service health status for Docker/Kubernetes health probes
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
 * POST /extract - Extract text segments from HTML
 * Requires Bearer token authentication
 */
router.post('/extract', authMiddleware, validateRequest(extractRequestSchema), (req, res) => {
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
 * POST /merge - Merge translated text back into HTML
 * Requires Bearer token authentication
 */
router.post('/merge', authMiddleware, validateRequest(mergeRequestSchema), (req, res) => {
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

    const mergedCount = translations.filter(t => {
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
