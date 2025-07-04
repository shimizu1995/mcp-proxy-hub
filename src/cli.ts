#!/usr/bin/env node

import readline from 'readline';
import { loadConfig, Config } from './config.js';
import { handleToolCall, handleListToolsRequest } from './handlers/index.js';
import { CallToolRequest, ListToolsRequest } from '@modelcontextprotocol/sdk/types.js';
import { createDefaultLogger, LogLevel } from './utils/logger.js';
import 'dotenv/config';
import { createClients, getConnectedClient } from './client.js';

const logger = createDefaultLogger({
  dirPath: process.env.MCP_PROXY_LOG_DIRECTORY_PATH,
  level: process.env.MCP_PROXY_LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
});

async function handleListCommand(config: Config) {
  const request: ListToolsRequest = {
    method: 'tools/list',
  };
  console.log('Sending request:', JSON.stringify(request, null, 2));
  const connectedClients = getConnectedClient();
  const result = await handleListToolsRequest(request, connectedClients, config.mcpServers || {}, {
    mcpServers: config.mcpServers || {},
    tools: config.tools,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function handleCallCommand(rest: string[], config: Config) {
  const [toolName, ...argsStr] = rest;
  if (!toolName) {
    console.log('Please enter a tool name for "call" command.');
    return;
  }

  const args: Record<string, unknown> = {};
  for (const arg of argsStr) {
    const [key, value] = arg.split('=');
    if (key && value) {
      try {
        args[key] = JSON.parse(value);
      } catch {
        args[key] = value;
      }
    }
  }

  const request: CallToolRequest = {
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };
  console.log('Sending request:', JSON.stringify(request, null, 2));
  const result = await handleToolCall(request, config);
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const config = await loadConfig();
  await createClients(config.mcpServers);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('Enter command. Available commands: call <toolName> [args], list, exit');

  rl.on('line', async (line) => {
    if (line.trim().toLowerCase() === 'exit') {
      rl.close();
      return;
    }

    const [command, ...rest] = line.trim().split(/\s+/);

    try {
      switch (command.toLowerCase()) {
        case 'list': {
          await handleListCommand(config);
          break;
        }
        case 'call': {
          await handleCallCommand(rest, config);
          break;
        }
        default:
          console.log('Unknown command. Available commands: call <toolName> [args], list, exit');
      }
    } catch (error) {
      logger.error('Error:', error);
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Exiting CLI.');
    process.exit(0);
  });

  rl.prompt();
}

main().catch((error) => {
  logger.error('Error during CLI startup:', error);
  process.exit(1);
});
