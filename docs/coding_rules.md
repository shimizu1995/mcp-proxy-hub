# Coding Rules

## Directory structure

```tree
.
├── LICENSE
├── README.md
├── config.example.json
├── eslint.config.js
├── package-lock.json
├── package.json
├── src
│   ├── client.ts
│   ├── config.ts
│   ├── core
│   │   ├── index.ts
│   │   └── server.ts
│   ├── handlers
│   │   ├── index.ts
│   │   ├── prompt-handlers.spec.ts
│   │   ├── prompt-handlers.ts
│   │   ├── resource-handlers.spec.ts
│   │   ├── resource-handlers.ts
│   │   ├── tool-call-handler.spec.ts
│   │   ├── tool-call-handler.ts
│   │   ├── tool-handlers.spec.ts
│   │   ├── tool-handlers.ts
│   │   ├── tool-list-handler.spec.ts
│   │   └── tool-list-handler.ts
│   ├── index.ts
│   ├── mappers
│   │   ├── client-maps.spec.ts
│   │   ├── client-maps.ts
│   │   └── index.ts
│   ├── mcp-proxy.ts
│   ├── models
│   │   └── config.ts
│   ├── services
│   │   ├── custom-tool-service.spec.ts
│   │   ├── custom-tool-service.ts
│   │   ├── tool-service.spec.ts
│   │   └── tool-service.ts
│   ├── sse.ts
│   └── utils
│       ├── debug-utils.spec.ts
│       ├── debug-utils.ts
│       ├── index.ts
│       └── logger.ts
├── tsconfig.json
├── tsconfig.spec.json
└── vitest.config.ts
```
