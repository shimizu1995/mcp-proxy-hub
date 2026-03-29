#!/usr/bin/env node

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
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

  let transport: SSEServerTransport;

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

  app.get('/sse', async (req, res) => {
    console.log('Received connection');
    transport = new SSEServerTransport('/message', res);
    await server.connect(transport);

    server.onerror = (err) => {
      console.error(`Server onerror: ${err.stack}`);
    };

    server.onclose = async () => {
      console.log('Server onclose');
      if (process.env.KEEP_SERVER_OPEN !== '1') {
        await cleanup();
        await server.close();
        process.exit(0);
      }
    };
  });

  app.post('/message', async (req, res) => {
    console.log('Received message');
    await transport.handlePostMessage(req, res);
  });

  const PORT = config.serverTransport?.port || Number(process.env.PORT) || 3006;
  const HOST = config.serverTransport?.host || process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log(`SSE server running at http://${HOST}:${PORT}/sse`);
  });
}

main().catch((error) => {
  console.error('Error during server startup:', error);
  process.exit(1);
});
