#!/usr/bin/env node

import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import { createServer } from './mcp-proxy.js';
import { loadConfig } from './config.js';
import 'dotenv/config';

const app = express();

app.use(cors());

async function main() {
  const config = await loadConfig();
  const { server, cleanup } = await createServer();

  // Map to store transports by session ID for stateful mode
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Bearer token auth middleware
  const authToken = config.serverTransport?.auth?.token || process.env.MCP_PROXY_AUTH_TOKEN;
  if (authToken) {
    app.use((req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization || authorization !== `Bearer ${authToken}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    });
    console.log('Bearer token authentication enabled');
  }

  const mcpPath = config.serverTransport?.path || process.env.MCP_PROXY_PATH || '/mcp';

  function getSessionId(req: express.Request): string | undefined {
    const value = req.headers['mcp-session-id'];
    return typeof value === 'string' ? value : undefined;
  }

  // Handle POST requests for client-to-server communication
  app.post(mcpPath, async (req, res) => {
    const sessionId = getSessionId(req);

    // Check for existing session
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // New session - create transport and connect
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    await server.connect(transport);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res);
  });

  // Handle GET requests for server-to-client notifications via SSE
  app.get(mcpPath, async (req, res) => {
    const sessionId = getSessionId(req);
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination
  app.delete(mcpPath, async (req, res) => {
    const sessionId = getSessionId(req);
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.close();
    transports.delete(sessionId);
    res.status(200).json({ message: 'Session terminated' });
  });

  const PORT = config.serverTransport?.port || Number(process.env.PORT) || 3006;
  const HOST = config.serverTransport?.host || process.env.HOST || '0.0.0.0';

  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`Streamable HTTP server running at http://${HOST}:${PORT}${mcpPath}`);
  });

  async function exit() {
    console.log('Shutting down...');
    // Close all active transports
    for (const [, transport] of transports) {
      await transport.close();
    }
    transports.clear();
    await cleanup();
    await server.close();
    httpServer.close();
    process.exit(0);
  }

  process.on('SIGINT', exit);
  process.on('SIGTERM', exit);
}

main().catch((error) => {
  console.error('Error during server startup:', error);
  process.exit(1);
});
