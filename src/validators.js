import { z } from 'zod';

/**
 * Extraction options schema
 */
const extractOptionsSchema = z.object({
  extractAttributes: z.array(z.enum(['alt', 'placeholder', 'title'])).optional().default([]),
  ignoredClasses: z.array(z.string()).optional().default([]),
  preserveWhitespace: z.boolean().optional().default(false)
});

/**
 * Extract request schema
 */
export const extractRequestSchema = z.object({
  html: z.string().min(1, 'HTML content is required').max(10485760, 'HTML content exceeds maximum size of 10MB'),
  options: extractOptionsSchema.optional().default({})
});

/**
 * Translation item schema
 */
const translationItemSchema = z.object({
  id: z.string().min(1, 'Translation ID is required'),
  text: z.string().min(1, 'Translation text is required')
});

/**
 * Merge options schema
 */
const mergeOptionsSchema = z.object({
  safetyCheck: z.boolean().optional().default(true),
  strictMode: z.boolean().optional().default(false)
});

/**
 * Merge request schema
 */
export const mergeRequestSchema = z.object({
  html: z.string().min(1, 'HTML content is required').max(10485760, 'HTML content exceeds maximum size of 10MB'),
  translations: z.array(translationItemSchema).min(1, 'At least one translation is required'),
  options: mergeOptionsSchema.optional().default({})
});

/**
 * Error response schema
 */
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number().int().positive()
});

/**
 * Validate request using Zod schema
 * @param {object} schema - Zod schema
 * @returns {express.RequestHandler} Middleware function
 */
export function validateRequest(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }));

        return res.status(422).json({
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          statusCode: 422,
          details: errors
        });
      }
      throw error;
    }
  };
}
