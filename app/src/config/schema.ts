// Auto-generated JSON Schema for Hatago configuration
// Generated from Zod schema in src/config/types.ts

export const CONFIG_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://github.com/himorishige/hatago-hub/schemas/config.schema.json',
  title: 'Hatago MCP Hub Configuration',
  description:
    'Configuration schema for Hatago MCP Hub - A lightweight MCP server management tool',
  $ref: '#/definitions/HatagoConfig',
  definitions: {
    HatagoConfig: {
      type: 'object',
      properties: {
        version: {
          type: 'number',
          default: 1,
        },
        logLevel: {
          type: 'string',
          enum: ['error', 'warn', 'info', 'debug'],
          default: 'info',
        },
        http: {
          type: 'object',
          properties: {
            port: {
              type: 'number',
              default: 3000,
            },
            host: {
              type: 'string',
              default: 'localhost',
            },
          },
          additionalProperties: false,
        },
        toolNaming: {
          type: 'object',
          properties: {
            strategy: {
              type: 'string',
              enum: ['namespace', 'alias', 'error'],
              default: 'namespace',
            },
            separator: {
              type: 'string',
              default: '_',
            },
            format: {
              type: 'string',
              default: '{serverId}_{toolName}',
            },
            aliases: {
              type: 'object',
              additionalProperties: {
                type: 'string',
              },
            },
          },
          additionalProperties: false,
          default: {},
        },
        session: {
          type: 'object',
          properties: {
            ttlSeconds: {
              type: 'number',
              default: 3600,
            },
            persist: {
              type: 'boolean',
              default: false,
            },
            store: {
              type: 'string',
              enum: ['memory', 'file', 'redis'],
              default: 'memory',
            },
          },
          additionalProperties: false,
          default: {},
        },
        sessionSharing: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              default: false,
            },
            maxClientsPerSession: {
              type: 'number',
              default: 5,
            },
            conflictResolution: {
              type: 'string',
              enum: ['first-wins', 'last-wins', 'manual'],
              default: 'first-wins',
            },
            syncIntervalMs: {
              type: 'number',
              default: 1000,
            },
            tokenTtlSeconds: {
              type: 'number',
              default: 86400,
            },
          },
          additionalProperties: false,
          default: {},
        },
        timeouts: {
          type: 'object',
          properties: {
            spawnMs: {
              type: 'number',
              default: 8000,
            },
            healthcheckMs: {
              type: 'number',
              default: 2000,
            },
            toolCallMs: {
              type: 'number',
              default: 20000,
            },
          },
          additionalProperties: false,
          default: {},
        },
        concurrency: {
          type: 'object',
          properties: {
            global: {
              type: 'number',
              default: 8,
            },
            perServer: {
              type: 'object',
              additionalProperties: {
                type: 'number',
              },
            },
          },
          additionalProperties: false,
          default: {},
        },
        security: {
          type: 'object',
          properties: {
            redactKeys: {
              type: 'array',
              items: {
                type: 'string',
              },
              default: ['password', 'apiKey', 'token', 'secret'],
            },
            allowNet: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
          additionalProperties: false,
          default: {},
        },
        policy: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              default: false,
            },
            dryRun: {
              type: 'boolean',
              default: true,
            },
            defaultEffect: {
              type: 'string',
              enum: ['allow', 'deny'],
              default: 'deny',
            },
            rules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                  },
                  name: {
                    type: 'string',
                  },
                  effect: {
                    type: 'string',
                    enum: ['allow', 'deny'],
                  },
                  principal: {
                    type: 'string',
                  },
                  tool: {
                    type: 'string',
                  },
                  conditions: {
                    type: 'object',
                    additionalProperties: {},
                  },
                },
                required: ['id', 'name', 'effect', 'tool'],
                additionalProperties: false,
              },
              default: [],
            },
            auditLog: {
              type: 'boolean',
              default: true,
            },
          },
          additionalProperties: false,
          default: {},
        },
        registry: {
          type: 'object',
          properties: {
            persist: {
              type: 'object',
              properties: {
                enabled: {
                  type: 'boolean',
                  default: false,
                },
                type: {
                  type: 'string',
                  enum: ['memory', 'file'],
                  default: 'memory',
                },
                saveIntervalMs: {
                  type: 'number',
                  default: 5000,
                },
                retainDays: {
                  type: 'number',
                  default: 7,
                },
              },
              additionalProperties: false,
            },
            healthCheckIntervalMs: {
              type: 'number',
              default: 30000,
            },
            maxRestarts: {
              type: 'number',
              default: 3,
            },
            restartDelayMs: {
              type: 'number',
              default: 5000,
            },
          },
          additionalProperties: false,
          default: {},
        },
        generation: {
          type: 'object',
          properties: {
            autoReload: {
              type: 'boolean',
              default: true,
            },
            watchPaths: {
              type: 'array',
              items: {
                type: 'string',
              },
              default: ['.hatago/config.jsonc'],
            },
            gracePeriodMs: {
              type: 'number',
              default: 30000,
            },
            maxGenerations: {
              type: 'number',
              default: 3,
            },
          },
          additionalProperties: false,
          default: {},
        },
        rollover: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              default: false,
            },
            healthCheckIntervalMs: {
              type: 'number',
              default: 5000,
            },
            drainTimeoutMs: {
              type: 'number',
              default: 60000,
            },
            errorRateThreshold: {
              type: 'number',
              default: 0.1,
            },
            warmupTimeMs: {
              type: 'number',
              default: 10000,
            },
          },
          additionalProperties: false,
          default: {},
        },
        replication: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              default: false,
            },
            store: {
              type: 'string',
              enum: ['memory', 'file', 'redis'],
              default: 'memory',
            },
            syncIntervalMs: {
              type: 'number',
              default: 1000,
            },
            primaryNode: {
              type: 'string',
            },
            nodes: {
              type: 'array',
              items: {
                type: 'string',
              },
              default: [],
            },
          },
          additionalProperties: false,
          default: {},
        },
        servers: {
          type: 'array',
          items: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                  },
                  type: {
                    type: 'string',
                    const: 'local',
                  },
                  start: {
                    type: 'string',
                    enum: ['eager', 'lazy'],
                    default: 'lazy',
                  },
                  tools: {
                    type: 'object',
                    properties: {
                      include: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                        default: ['*'],
                      },
                      exclude: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                      },
                      prefix: {
                        type: 'string',
                      },
                      aliases: {
                        type: 'object',
                        additionalProperties: {
                          type: 'string',
                        },
                      },
                    },
                    additionalProperties: false,
                  },
                  env: {
                    type: 'object',
                    additionalProperties: {
                      type: 'string',
                    },
                  },
                  command: {
                    type: 'string',
                  },
                  args: {
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                  },
                  cwd: {
                    type: 'string',
                  },
                  transport: {
                    type: 'string',
                    const: 'stdio',
                    default: 'stdio',
                  },
                },
                required: ['id', 'type', 'command'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                  },
                  type: {
                    type: 'string',
                    const: 'remote',
                  },
                  start: {
                    type: 'string',
                    enum: ['eager', 'lazy'],
                    default: 'lazy',
                  },
                  tools: {
                    type: 'object',
                    properties: {
                      include: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                        default: ['*'],
                      },
                      exclude: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                      },
                      prefix: {
                        type: 'string',
                      },
                      aliases: {
                        type: 'object',
                        additionalProperties: {
                          type: 'string',
                        },
                      },
                    },
                    additionalProperties: false,
                  },
                  env: {
                    type: 'object',
                    additionalProperties: {
                      type: 'string',
                    },
                  },
                  url: {
                    type: 'string',
                  },
                  transport: {
                    type: 'string',
                    enum: ['http', 'websocket'],
                    default: 'http',
                  },
                  auth: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['bearer', 'basic'],
                      },
                      token: {
                        type: 'string',
                      },
                    },
                    additionalProperties: false,
                  },
                  healthCheck: {
                    type: 'object',
                    properties: {
                      enabled: {
                        type: 'boolean',
                        default: false,
                        description: 'Enable health checks for this server',
                        markdownDescription:
                          'Enable health checks for this server',
                      },
                      intervalMs: {
                        type: 'number',
                        minimum: 0,
                        default: 0,
                        description:
                          'Health check interval in milliseconds. 0 = disabled. Recommended: 1000-2000ms for local, 5000-10000ms for remote',
                        markdownDescription:
                          'Health check interval in milliseconds. 0 = disabled. Recommended: 1000-2000ms for local, 5000-10000ms for remote',
                      },
                      timeoutMs: {
                        type: 'number',
                        minimum: 1000,
                        default: 5000,
                        description:
                          'Health check timeout in milliseconds. Should be less than intervalMs. Can be overridden by HATAGO_HEALTH_TIMEOUT_MS env var',
                        markdownDescription:
                          'Health check timeout in milliseconds. Should be less than intervalMs. Can be overridden by HATAGO_HEALTH_TIMEOUT_MS env var',
                      },
                      method: {
                        type: 'string',
                        enum: ['ping', 'tools/list'],
                        default: 'ping',
                        description:
                          'Method to use for health checks. "ping" is lighter, "tools/list" verifies tool availability',
                        markdownDescription:
                          'Method to use for health checks. "ping" is lighter, "tools/list" verifies tool availability',
                      },
                    },
                    additionalProperties: false,
                    description:
                      'Health check configuration for remote servers',
                    markdownDescription:
                      'Health check configuration for remote servers',
                  },
                },
                required: ['id', 'type', 'url'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                  },
                  type: {
                    type: 'string',
                    const: 'npx',
                  },
                  start: {
                    type: 'string',
                    enum: ['eager', 'lazy'],
                    default: 'lazy',
                  },
                  tools: {
                    type: 'object',
                    properties: {
                      include: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                        default: ['*'],
                      },
                      exclude: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                      },
                      prefix: {
                        type: 'string',
                      },
                      aliases: {
                        type: 'object',
                        additionalProperties: {
                          type: 'string',
                        },
                      },
                    },
                    additionalProperties: false,
                  },
                  env: {
                    type: 'object',
                    additionalProperties: {
                      type: 'string',
                    },
                  },
                  package: {
                    type: 'string',
                  },
                  version: {
                    type: 'string',
                  },
                  args: {
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                  },
                  transport: {
                    type: 'string',
                    const: 'stdio',
                    default: 'stdio',
                  },
                  autoRestart: {
                    type: 'boolean',
                  },
                  restartDelayMs: {
                    type: 'number',
                  },
                  maxRestarts: {
                    type: 'number',
                  },
                  timeout: {
                    type: 'number',
                  },
                  shutdownTimeoutMs: {
                    type: 'number',
                  },
                  initTimeoutMs: {
                    type: 'number',
                  },
                  workDir: {
                    type: 'string',
                  },
                },
                required: ['id', 'type', 'package'],
                additionalProperties: false,
              },
            ],
          },
          default: [],
        },
      },
      additionalProperties: false,
    },
  },
} as const;
