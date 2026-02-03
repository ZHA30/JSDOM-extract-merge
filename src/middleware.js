import morgan from 'morgan';

/**
 * Request error types
 */
export class ProcessTimeoutError extends Error {
  constructor(message = 'Processing timeout') {
    super(message);
    this.name = 'ProcessTimeoutError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class InvalidStructureError extends Error {
  constructor(message = 'Invalid HTML structure') {
    super(message);
    this.name = 'InvalidStructureError';
  }
}

/**
 * Authentication middleware for admin-level endpoints
 * Validates Bearer token from Authorization header
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const expectedToken = process.env.API_BEARER_TOKEN;

  if (!token) {
    throw new UnauthorizedError('Token is required');
  }

  if (token !== expectedToken) {
    throw new UnauthorizedError('Invalid token');
  }

  next();
}

/**
 * Timeout middleware
 * Aborts requests that take too long to process
 */
export function timeoutMiddleware(timeoutMs = 30000) {
  return (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        next(new ProcessTimeoutError(`Request timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    clearTimeoutOnEnd(res, timeout);
    next();
  };
}

/**
 * Clear timeout when response finishes
 */
function clearTimeoutOnEnd(res, timeout) {
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
}

/**
 * Error handler middleware
 * Converts application errors to appropriate HTTP responses
 */
export function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] Error:`, err);

  // Handle known error types
  if (err instanceof ProcessTimeoutError) {
    return res.status(500).json({
      error: 'PROCESS_TIMEOUT',
      message: err.message,
      statusCode: 500
    });
  }

  if (err instanceof UnauthorizedError) {
    return res.status(403).json({
      error: 'UNAUTHORIZED',
      message: err.message,
      statusCode: 403
    });
  }

  if (err instanceof InvalidStructureError) {
    return res.status(400).json({
      error: 'INVALID_STRUCTURE',
      message: err.message,
      statusCode: 400
    });
  }

  // Handle Zod validation errors (already handled in validators.js, but safety fallback)
  if (err.name === 'ZodError') {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      statusCode: 422
    });
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'INVALID_JSON',
      message: 'Invalid JSON format',
      statusCode: 400
    });
  }

  // Handle request entity too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload exceeds maximum size limit (10MB)',
      statusCode: 413
    });
  }

  // Default: internal server error
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An internal error occurred',
    statusCode: 500
  });
}

/**
 * Request logger middleware
 */
export function requestLogger(req, res, next) {
  const start = Date.now();

  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });

  next();
}

/**
 * Morgan middleware for HTTP request logging
 */
export const morganMiddleware = morgan('combined', {
  stream: {
    write: (message) => console.log(message.trim())
  }
});

/**
 * Health check middleware
 * Blocks requests during graceful shutdown
 */
export function createHealthMiddleware(isShuttingDown) {
  return (req, res, next) => {
    res.json({
      status: isShuttingDown ? 'shutting_down' : 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    });
  };
}
