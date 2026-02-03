import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { config } from 'dotenv';
import routes from './routes.js';
import { swaggerSpec } from './swagger.js';
import { timeoutMiddleware, errorHandler, morganMiddleware } from './middleware.js';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
let version = '1.0.0';
try {
  const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
  version = packageJson.version;
  process.env.npm_package_version = version;
} catch (error) {
  console.warn('Could not read package.json:', error.message);
}

// Create Express application
const app = express();

// Configuration
const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_PAYLOAD_SIZE = parseInt(process.env.MAX_PAYLOAD_SIZE || '10485760', 10); // 10MB
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '30000', 10); // 30s
const GRACEFUL_SHUTDOWN_TIMEOUT = parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT || '30000', 10); // 30s
const NODE_ENV = process.env.NODE_ENV || 'development';

// Global tracking for graceful shutdown
let server = null;
let isShuttingDown = false;

// Middleware
app.use(express.json({
  strict: true,
  limit: MAX_PAYLOAD_SIZE
}));
app.use(timeoutMiddleware(REQUEST_TIMEOUT));
app.use(morganMiddleware);

// CORS headers (optional - add if needed)
app.use((req, res, next) => {
  res.setHeader('X-API-Version', version);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Powered-By', 'Cheerio-transerver');
  next();
});

// API Routes
app.use('/', routes);

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: 'Cheerio-transerver API Docs',
  customCss: '.swagger-ui .topbar { display: none }'
}));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
    statusCode: 404
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown handler
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  isShuttingDown = true;

  // Stop accepting new connections
  if (server) {
    server.close((err) => {
      if (err) {
        console.error('Error closing server:', err);
        process.exit(1);
      }

      console.log('Server closed successfully');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      console.error(`Graceful shutdown timeout (${GRACEFUL_SHUTDOWN_TIMEOUT}ms). Forcing exit...`);
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT);
  } else {
    process.exit(0);
  }
}

// Start server
server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              Cheerio-transerver API v${version}                    ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Server:     http://0.0.0.0:${PORT}                      ║
║  API Docs:   http://localhost:${PORT}/api-docs            ║
║  Health:     http://localhost:${PORT}/healthz             ║
║                                                           ║
║  Environment: ${NODE_ENV}                                        ║
║  Timeout:     ${REQUEST_TIMEOUT}ms                                      ║
║  Max Payload: ${MAX_PAYLOAD_SIZE / 1024 / 1024}MB                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

export default app;
