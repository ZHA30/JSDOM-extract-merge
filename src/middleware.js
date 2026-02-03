/**
 * Express Middleware
 * Authentication, payload limits, timeouts, and error handling
 */

import { validateExtractRequest, validateMergeRequest } from './validators.js';

/**
 * Simple logger utility
 */
export const log = (level, message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level}: ${message}`);
};

/**
 * Bearer Token Authentication Middleware
 * Only required for /api/merge endpoint
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = process.env.API_BEARER_TOKEN;

  if (!token) {
    // In development, allow requests without token
    if (process.env.NODE_ENV !== 'production') {
      log('WARN', 'No API_BEARER_TOKEN configured, skipping auth in non-production mode');
      return next();
    }
  }

  if (!authHeader) {
    return res.status(403).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authorization header required'
    });
  }

  const bearerToken = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;

  if (bearerToken !== token) {
    return res.status(403).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired token'
    });
  }

  next();
};

/**
 * Payload Size Limit Middleware
 * Validates Content-Length header against MAX_PAYLOAD_SIZE
 */
export const validatePayloadSize = (req, res, next) => {
  const contentLength = req.get('Content-Length');
  const maxPayloadSize = parseInt(process.env.MAX_PAYLOAD_SIZE || '10485760', 10); // 10MB default

  if (contentLength && parseInt(contentLength, 10) > maxPayloadSize) {
    return res.status(413).json({
      success: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: `Request exceeds maximum size of ${maxPayloadSize / (1024 * 1024)}MB`
    });
  }

  next();
};

/**
 * Request Timeout Middleware
 * Enforces REQUEST_TIMEOUT limit (default: 30s)
 */
export const requestTimeout = (req, res, next) => {
  const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT || '30000', 10);

  // Apply timeout to response
  res.setTimeout(timeoutMs, () => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'PROCESS_TIMEOUT',
        message: `Request processing exceeded timeout of ${timeoutMs}ms`
      });
    }
  });

  next();
};

/**
 * JSON Content Type Middleware
 * Ensures request has proper content-type
 */
export const validateContentType = (req, res, next) => {
  const contentType = req.get('Content-Type');

  if (!contentType || !contentType.includes('application/json')) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_CONTENT_TYPE',
      message: 'Content-Type must be application/json'
    });
  }

  next();
};

/**
 * Extraction Request Validation Middleware
 */
export const validateExtractPayload = (req, res, next) => {
  const validation = validateExtractRequest(req.body);

  if (!validation.success) {
    return res.status(422).json({
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'Request payload validation failed',
      details: validation.errors
    });
  }

  req.validatedData = validation.data;
  next();
};

/**
 * Merge Request Validation Middleware
 */
export const validateMergePayload = (req, res, next) => {
  const validation = validateMergeRequest(req.body);

  if (!validation.success) {
    return res.status(422).json({
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'Request payload validation failed',
      details: validation.errors
    });
  }

  req.validatedData = validation.data;
  next();
};

/**
 * Async Error Handler Wrapper
 * Wraps async route handlers to catch errors
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global Error Handling Middleware
 * Must be registered after all routes
 */
export const errorHandler = (err, req, res, next) => {
  log('ERROR', `${err.code || 'UNKNOWN_ERROR'}: ${err.message}`);

  // Handle known error codes
  if (err.code === 'INVALID_STRUCTURE') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_STRUCTURE',
      message: 'HTML format is severely malformed and cannot be parsed'
    });
  }

  if (err.code === 'MISSING_SEGMENTS') {
    return res.status(422).json({
      success: false,
      error: 'MISSING_SEGMENTS',
      message: 'Provided segment IDs not found in original HTML',
      details: err.details
    });
  }

  if (err.code === 'UNCLOSED_TAGS') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_STRUCTURE',
      message: err.message,
      details: err.details
    });
  }

  if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_JSON',
      message: 'Invalid JSON in request body'
    });
  }

  if (err.name === 'ZodError') {
    return res.status(422).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.errors
    });
  }

  // Default 500 error
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' 
      ? 'An internal server error occurred' 
      : err.message
  });
};

/**
 * Request Logging Middleware
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    log('INFO', `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  
  next();
};

/**
 * Health Check Middleware
 * Returns 503 if server is shutting down
 */
export const createHealthCheckMiddleware = (getShutdownState) => {
  return (req, res, next) => {
    if (getShutdownState()) {
      return res.status(503).json({
        success: false,
        status: 'SHUTTING_DOWN',
        message: 'Service is shutting down'
      });
    }
    next();
  };
};
