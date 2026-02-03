/**
 * Input Validation Schemas using Zod
 */

import { z } from 'zod';

/**
 * Extract API Request Schema
 */
export const extractRequestSchema = z.object({
  html: z.string().min(1, 'HTML content is required').max(10485760, 'HTML exceeds maximum size of 10MB'),
  options: z.object({
    extractAttributes: z.array(z.string()).default([]),
    ignoredClasses: z.array(z.string()).default([]),
    preserveWhitespace: z.boolean().default(false)
  }).optional().default({})
});

/**
 * Translation Item Schema
 */
const translationItemSchema = z.object({
  id: z.string().min(1, 'Segment ID is required'),
  text: z.string()
});

/**
 * Merge API Request Schema
 */
export const mergeRequestSchema = z.object({
  html: z.string().min(1, 'HTML content is required').max(10485760, 'HTML exceeds maximum size of 10MB'),
  translations: z.array(translationItemSchema)
    .min(1, 'At least one translation is required')
    .max(1000, 'Maximum 1000 translations per request'),
  options: z.object({
    safetyCheck: z.boolean().default(true)
  }).optional().default({})
});

/**
 * Validate extract request payload
 */
export function validateExtractRequest(data) {
  const result = extractRequestSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return {
    success: false,
    errors: result.error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message
    }))
  };
}

/**
 * Validate merge request payload
 */
export function validateMergeRequest(data) {
  const result = mergeRequestSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return {
    success: false,
    errors: result.error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message
    }))
  };
}
