---
name: docker-npm-api-kill
description: Kill-terminate handling patterns for containerized NPM API services. Graceful shutdown implementation patterns and cleanup strategies.
---

# Docker-NPM-API Kill Pattern

Implement graceful shutdown and cleanup for containerized NPM API services. Ensures zero request loss during deployment updates or container restarts.

## When to Use This Skill

Use this skill when you need to:

- Implement graceful shutdown in Node.js servers
- Handle container lifecycle events (SIGTERM/SIGINT)
- Clean up resources before process exit
- Ensure in-flight requests complete before termination
- Implement health check recovery after restart

## Implementation Pattern

### Basic Graceful Shutdown

```javascript
import http from 'http';

const server = http.createServer((req, res) => {
  // ... request handling
});

// Start server
server.listen(3000);

// 1. Handle SIGTERM (Docker stop, Kubernetes termination)
process.on('SIGTERM', () => {
  log('INFO', 'SIGTERM signal received: closing HTTP server');
  
  server.close(() => {
    log('INFO', 'HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    log('ERROR', 'Forced exit after timeout');
    process.exit(1);
  }, 10000);
});

// 2. Handle SIGINT (Ctrl+C in terminal)
process.on('SIGINT', () => {
  log('INFO', 'SIGINT signal received: closing HTTP server');
  
  server.close(() => {
    log('INFO', 'HTTP server closed');
    process.exit(0);
  });
});
```

## Shutdown Sequences

### Scenario 1: Docker Stop

```
User runs: docker stop container-name
  ↓
Docker sends SIGTERM to main process
  ↓
Process receives SIGTERM
  ↓
Server stops accepting new connections (server.close())
  ↓
In-flight requests complete (up to 10s grace period)
  ↓
Process exits gracefully (exit code 0)
```

### Scenario 2: Kubernetes Pod Delete

```
Kubernetes sends SIGTERM
  ↓
Application receives signal
  ↓
Graceful shutdown triggers
  ↓
Pod enters Terminating state
  ↓
Traffic stops routing to this pod
  ↓
Process exits
  ↓
Kubernetes removes pod
```

### Scenario 3: Unhandled Exception

```javascript
process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  
  // Give cleanup a chance
  server.close(() => {
    process.exit(1);  // Non-zero exit for failure
  });
});

process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', 'Unhandled promise rejection', { reason });
  
  server.close(() => {
    process.exit(1);
  });
});
```

## Resource Cleanup Patterns

### Pattern 1: Explicit DOM Cleanup

```javascript
import { JSDOM } from 'jsdom';

function processHtml(html) {
  // Create DOM
  const dom = new JSDOM(html, { url: 'http://localhost' });
  const doc = dom.window.document;
  
  // Process...
  const result = parser.parse(doc);
  
  // IMMEDIATELY close to free memory
  dom.window.close();  // CRITICAL for memory management
  
  return result;
}

// Handle cleanup on exit
process.on('exit', () => {
  // Any global resources closed here
  log('INFO', 'Process exiting', { timestamp: Date.now() });
});
```

### Pattern 2: Connection Cleanup

```javascript
const activeConnections = new Set();

server.on('connection', (socket) => {
  activeConnections.add(socket);
  
  socket.on('close', () => {
    activeConnections.delete(socket);
  });
});

// During shutdown
server.on('close', () => {
  log('INFO', 'Server closed', {
    activeConnections: activeConnections.size
  });
  
  // Wait for connections to drain (or timeout)
  setTimeout(() => {
    if (activeConnections.size > 0) {
      log('WARN', 'Forcing close with active connections', {
        count: activeConnections.size
      });
    }
    process.exit(0);
  }, 5000);
});
```

### Pattern 3: Buffer Cleanup

```javascript
let requestBuffer = Buffer.alloc(0);

req.on('data', (chunk) => {
  // Enforce size limit
  if (requestBuffer.length + chunk.length > MAX_SIZE) {
    req.destroy(new Error('Size limit exceeded'));
    // Cleanup existing buffer
    requestBuffer = Buffer.alloc(0);
    return;
  }
  
  requestBuffer = Buffer.concat([requestBuffer, chunk]);
});

// Cleanup on error or finish
req.on('close', () => {
  requestBuffer = Buffer.alloc(0);  // Free memory
});
```

## Shutdown Timeout Strategies

### Timeout Configuration

```javascript
const SHUTDOWN_TIMEOUT_MS = 10000;  // 10 seconds

process.on('SIGTERM', () => {
  const timeout = setTimeout(() => {
    // Force kill after timeout
    log('WARN', 'Shutdown timeout, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  
  server.close(() => {
    clearTimeout(timeout);  // Cancel force kill
    log('INFO', 'Graceful shutdown complete');
    process.exit(0);
  });
});
```

### Container Orchestration Alignment

| Platform | Default Grace Period | Recommended Timeout |
|-----------|---------------------|-------------------|
| Docker | 10 seconds | 10-30 seconds |
| Kubernetes | 30 seconds | Match terminationGracePeriodSeconds |
| AWS ECS | 120 seconds | Match ECS wait timeout |
| Nomad | 5 seconds (configurable) | 5-10 seconds |

```yaml
# Kubernetes example
apiVersion: apps/v1
kind: Deployment
spec:
  terminationGracePeriodSeconds: 30  # Match app timeout
  containers:
  - name: api
    # ...
```

## Health Check Pattern during Shutdown

```javascript
// Health check should reflect shutdown state
let isShuttingDown = false;

process.on('SIGTERM', () => {
  isShuttingDown = true;
  server.close();
});

// In health check handler
if (req.url === '/healthz') {
  if (isShuttingDown) {
    // Signal orchestration to stop traffic
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Service Unavailable - Shutting Down');
  } else {
    res.writeHead(200);
    res.end('OK');
  }
  return;
}
```

## Exit Code Meanings

```javascript
// Success codes
process.exit(0);  // Normal exit, successful shutdown

// Error codes
process.exit(1);  // General error
process.exit(2);  // Misconfiguration
process.exit(3);  // Dependency failure
```

### Docker Exit Code Handling

```bash
# In Dockerfile, handle non-zero exits
HEALTHCHECK --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r)=>{
    process.exit(r.statusCode === 200 ? 0 : 1);
  })"

# In docker-compose.yml
services:
  api:
    restart: on-failure:3  # Retry 3 times before giving up
    stop_grace_period: 10s
```

## Multi-Process Pattern (if needed)

```javascript
// Primary process
if (cluster.isPrimary) {
  // Fork workers
  const workerCount = process.env.WORKERS || cpus().length;
  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }
  
  // Broadcast shutdown to all workers
  process.on('SIGTERM', () => {
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
  });
} else {
  // Worker process
  const server = http.createServer(...);
  
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
}
```

## Testing Shutdown Behavior

### 1. Manual Graceful Shutdown

```bash
# Start container
docker run -d --name test-app -p 3000:3000 -e API_TOKEN=test my-api

# Send request (keep connection alive)
curl -H "Connection: keep-alive" http://localhost:3000/api &

# Graceful stop (SIGTERM)
docker stop test-app

# Check logs: should see "SIGTERM received" and "HTTP server closed"
docker logs test-app | grep -E "(SIGTERM|HTTP server closed)"
```

### 2. Force Kill (SIGKILL)

```bash
# Force kill (no graceful shutdown)
docker kill test-app

# Process should log "Forced exit after timeout"
# This tests timeout handling
```

### 3. Unhandled Error Recovery

```javascript
// Simulate uncaught error
process.emit('uncaughtException', new Error('Test error'));

// Should see in logs:
// - ERROR: Uncaught exception
// - HTTP server closed
// - Process exits with code 1
```

## Integration with Health Checks

### Container Health During Shutdown

```dockerfile
# Health check should fail during shutdown
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r)=>{
    if (r.statusCode === 200) process.exit(0);
    if (r.statusCode === 503) process.exit(1);  // Shutting down
    process.exit(1);
  })"
```

### Readiness vs Liveness

| Check Type | Purpose | Behavior during shutdown |
|------------|---------|----------------------|
| Liveness | Container alive? | Fast-fail, triggers restart |
| Readiness | Accepting traffic? | Return 503 during shutdown |

```javascript
// Implement both
app.get('/healthz', (req, res) => {
  // Liveness: always respond (allow orchestrator to detect crashes)
  res.status(isShuttingDown ? 503 : 200);
  res.end(isShuttingDown ? 'Shutting Down' : 'OK');
});

app.get('/ready', (req, res) => {
  // Readiness: return only when accepting traffic
  if (isShuttingDown) {
    res.status(503).end('Not Ready');
    return;
  }
  if (server.listening) {
    res.status(200).end('Ready');
  } else {
    res.status(503).end('Not Ready');
  }
});
```

## Monitoring Shutdown

### Key Metrics to Track

```javascript
// During shutdown logging
log('INFO', 'Shutdown initiated', {
  timestamp: Date.now(),
  activeConnections: getActiveConnectionCount(),
  inFlightRequests: getInFlightRequestCount(),
  shutdownReason: 'SIGTERM'
});

// After cleanup
log('INFO', 'Cleanup complete', {
  resourcesFreed: [
    'databaseConnections',
    'fileHandles',
    'domInstances'
  ],
  exitCode: 0
});
```

### Observability Integration

```yaml
# Prometheus example
apiVersion: v1
kind: ServiceMonitor
metadata:
  name: api-monitor
spec:
  endpoints:
  - port: 3000
    path: /metrics
    interval: 30s
  monitorConfig:
    rules:
      - alert: ShutdownTimeTooLong
        expr: time() - process_start_time_seconds > 60
        for: 20s
```

## Common Shuting Down Anti-Patterns

### ❌ Anti-Pattern 1: No Signal Handling

```javascript
// WRONG: Process immediately kills on signals
// Missing signal handlers means abrupt termination
// In-flight requests fail without response
```

### ❌ Anti-Pattern 2: Ignoring Close Callback

```javascript
// WRONG: Fire-and-forget exit
process.on('SIGTERM', () => {
  server.close();  // Missing callback!
  process.exit(0);  // May exit before server closes
});

// CORRECT: Wait for close completion
process.on('SIGTERM', () => {
  server.close(() => {  // Wait for cleanup
    process.exit(0);
  });
});
```

### ❌ Anti-Pattern 3: Blocking on Shutdown

```javascript
// WRONG: Long-running cleanup blocks
process.on('SIGTERM', () => {
  longRunningSaveToDisk();  // Blocks shutdown!
});

// CORRECT: Async cleanup with timeout
process.on('SIGTERM', () => {
  const cleanupTimer = setTimeout(() => process.exit(1), 10000);
  longRunningSaveToDisk().then(() => {
    clearTimeout(cleanupTimer);
    process.exit(0);
  });
});
```

## Skill Activation

This skill is automatically available when you request help with:
- Implementing graceful shutdown in containers
- Handling process signals (SIGTERM, SIGINT)
- Cleaning up resources before exit
- Designing health checks for shutdown scenarios
- Troubleshooting container restart issues

No manual activation required - Copilot loads this skill when relevant to your task.
