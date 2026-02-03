/**
 * Main Entry Point
 * Initializes and starts the Express server with graceful shutdown support
 */

import express from 'express';
import http from 'http';
import { setupRoutes } from './routes.js';
import {
  authenticateToken,
  validatePayloadSize,
  requestTimeout,
  validateContentType,
  validateExtractPayload,
  validateMergePayload,
  errorHandler,
  requestLogger,
  createHealthCheckMiddleware
} from './middleware.js';

// Configuration
const PORT = process.env.PORT || 8080;
const GRACEFUL_SHUTDOWN_TIMEOUT = parseInt(
  process.env.GRACEFUL_SHUTDOWN_TIMEOUT || '30000',
  10
);

// Application state
let isShuttingDown = false;

// Create Express app
const app = express();

// Trust proxy for correct X-Forwarded-* headers
app.set('trust proxy', true);

// Request logger middleware (applied to all requests)
app.use(requestLogger);

// JSON body parser with limits
app.use(express.json({ limit: '10mb' }));

// Apply general middleware to all routes
app.use(validatePayloadSize);
app.use(requestTimeout);
app.use(validateContentType);

// Create health check middleware with shutdown state
export const getShutdownState = () => isShuttingDown;
const healthCheckMiddleware = createHealthCheckMiddleware(getShutdownState);

// Apply health check middleware to /healthz endpoint
app.get('/healthz', healthCheckMiddleware);

// Apply authentication only to /api/merge endpoint
app.post('/api/merge', authenticateToken);

// Apply validation to API endpoints
app.post('/api/extract', validateExtractPayload);
app.post('/api/merge', validateMergePayload);

// Setup routes
setupRoutes(app);

// Global error handler (must be last)
app.use(errorHandler);

// Create HTTP server
const server = http.createServer(app);

/**
 * Handle graceful shutdown
 */
const setupGracefulShutdown = () => {
  const logShutdown = (level, message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level}: ${message}`);
  };

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      logShutdown('WARN', 'Shutdown already in progress, ignoring signal');
      return;
    }

    isShuttingDown = true;
    logShutdown('INFO', `${signal} signal received: starting graceful shutdown`);

    // Set shutdown timeout
    const shutdownTimeout = setTimeout(() => {
      logShutdown('ERROR', `Graceful shutdown timeout exceeded (${GRACEFUL_SHUTDOWN_TIMEOUT}ms), forcing exit`);
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT);

    try {
      // Stop accepting new connections
      server.close((err) => {
        if (err) {
          logShutdown('ERROR', `Error closing HTTP server: ${err.message}`);
        } else {
          logShutdown('INFO', 'HTTP server closed successfully');
        }
        clearTimeout(shutdownTimeout);
        process.exit(0);
      });

      // Force idle connections to close after a shorter timeout
      setTimeout(() => {
        logShutdown('WARN', 'Forcing connection close after timeout');
        server.closeAllConnections();
      }, Math.min(5000, GRACEFUL_SHUTDOWN_TIMEOUT));

    } catch (error) {
      logShutdown('ERROR', `Shutdown error: ${error.message}`);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ERROR: Uncaught Exception: ${error.message}`);
    console.error(error);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ERROR: Unhandled Rejection at: ${promise}`);
    console.log('Reason:', reason);
    process.exit(1);
  });
};

/**
 * Start the server
 */
const startServer = () => {
  server.listen(PORT, () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] INFO: Cheerio HTML Parser API started`);
    console.log(`[${timestamp}] INFO: Server listening on port ${PORT}`);
    console.log(`[${timestamp}] INFO: Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[${timestamp}] INFO: Endpoints:`);
    console.log(`   - GET  http://localhost:${PORT}/healthz`);
    console.log(`   - GET  http://localhost:${PORT}/`);
    console.log(`   - POST http://localhost:${PORT}/api/extract`);
    console.log(`   - POST http://localhost:${PORT}/api/merge (requires Bearer token)`);
    console.log('');
    
    // Warn if running without API token in production
    if (process.env.NODE_ENV === 'production' && !process.env.API_BEARER_TOKEN) {
      console.warn('[WARN] WARNING: Running in production without API_BEARER_TOKEN!');
      console.warn('[WARN] /api/merge endpoint will be accessible without authentication!');
    } else if (!process.env.API_BEARER_TOKEN) {
      console.log('[INFO] No API_BEARER_TOKEN configured. /api/merge will accept requests without authentication in non-production mode.');
    }
  });

  // Handle server errors
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] ERROR: Port ${PORT} is already in use`);
      console.error(`[${timestamp}] ERROR: Please ensure no other service is using port ${PORT}`);
      process.exit(1);
    } else {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] ERROR: Server error: ${error.message}`);
      process.exit(1);
    }
  });
};

// Initialize and start
setupGracefulShutdown();
startServer();

export default app;
