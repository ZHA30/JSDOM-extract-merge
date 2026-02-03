import swaggerJsdoc from 'swagger-jsdoc';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cheerio-transerver API',
      version: '1.0.0',
      description: `A stateless, high-performance HTML parsing middleware service for translation workflows.

## Features

- **Text Extraction**: Extract translatable text segments from HTML while preserving inline formatting
- **Translation Merging**: Merge translated text back into HTML maintaining original structure
- **Smart Filtering**: Automatically excludes script, style, and code blocks
- **Inline Tags Preservation**: Preserves <a>, <strong>, <em>, etc. within extracted text
- **Security**: Bearer token authentication for merge operations

## Quick Start

1. **Extract text**:
   \`POST /api/extract\` with HTML content
2. **Translate** the extracted segments using your translation service
3. **Merge back**: \`POST /api/merge\` with translations (requires authentication)

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| INVALID_STRUCTURE | 400 | HTML format is malformed |
| PAYLOAD_TOO_LARGE | 413 | Request exceeds 10MB limit |
| UNAUTHORIZED | 403 | Missing or invalid bearer token |
| VALIDATION_ERROR | 422 | Invalid request format |
| PROCESS_TIMEOUT | 500 | Processing exceeded 30s timeout |`,
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:8080',
        description: 'Development server'
      },
      {
        url: 'http://localhost:8080',
        description: 'Production server (Docker)'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Bearer token authentication for /api/merge endpoint'
        }
      },
      schemas: {
        ExtractRequest: {
          type: 'object',
          required: ['html'],
          properties: {
            html: {
              type: 'string',
              description: 'HTML content to parse',
              example: '<p>Hello <strong>world</strong></p>'
            },
            options: {
              type: 'object',
              properties: {
                extractAttributes: {
                  type: 'array',
                  items: { type: 'string', enum: ['alt', 'placeholder', 'title'] },
                  description: 'Attributes to extract from elements'
                },
                ignoredClasses: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'CSS classes to skip during extraction',
                  example: ['notranslate', 'code-snippet']
                },
                preserveWhitespace: {
                  type: 'boolean',
                  description: 'Preserve whitespace in extracted text',
                  default: false
                }
              }
            }
          }
        },
        ExtractResponse: {
          type: 'object',
          properties: {
            segments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Unique segment ID for merge operation',
                    example: 'aHRtbC5ib2R5WzBdLnBbMF0='
                  },
                  text: {
                    type: 'string',
                    description: 'Extracted HTML text including inline tags',
                    example: 'Hello <strong>world</strong>'
                  },
                  path: {
                    type: 'string',
                    description: 'CSS path to the element',
                    example: 'html.body.p[0]'
                  },
                  tag: {
                    type: 'string',
                    description: 'Tag name of the element',
                    example: 'p'
                  },
                  attributes: {
                    type: 'object',
                    description: 'Extracted attributes'
                  }
                }
              }
            },
            count: {
              type: 'integer',
              description: 'Number of segments extracted'
            }
          }
        },
        MergeRequest: {
          type: 'object',
          required: ['html', 'translations'],
          properties: {
            html: {
              type: 'string',
              description: 'Original HTML content',
              example: '<p>Hello</p>'
            },
            translations: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'text'],
                properties: {
                  id: {
                    type: 'string',
                    description: 'Segment ID from extract response',
                    example: 'aHRtbC5ib2R5WzBdLnBbMF0='
                  },
                  text: {
                    type: 'string',
                    description: 'Translated HTML text (may contain inline tags)',
                    example: '你好'
                  }
                }
              }
            },
            options: {
              type: 'object',
              properties: {
                safetyCheck: {
                  type: 'boolean',
                  description: 'Validate unclosed tags in translations',
                  default: true
                },
                strictMode: {
                  type: 'boolean',
                  description: 'Throw error if any segment ID is not found',
                  default: false
                }
              }
            }
          }
        },
        MergeResponse: {
          type: 'object',
          properties: {
            html: {
              type: 'string',
              description: 'Merged HTML with translations'
            },
            mergedCount: {
              type: 'integer',
              description: 'Number of segments merged'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              example: 'UNAUTHORIZED'
            },
            message: {
              type: 'string',
              example: 'Missing or invalid Authorization header'
            },
            statusCode: {
              type: 'integer',
              example: 403
            }
          }
        }
      }
    }
  },
  apis: [join(__dirname, './routes.js')]
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
