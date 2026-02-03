# Use Node.js 20 LTS Alpine for minimal image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application source
COPY server.mjs ./

# Create non-root node user (already exists in node:alpine)
# Switch to non-root user for security
USER node

# Expose the API port
EXPOSE 3000

# Set default environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Health check to verify the service is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "server.mjs"]
