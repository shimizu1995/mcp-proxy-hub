#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import commandPrompt from 'inquirer-command-prompt';
import { Command } from 'commander';
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

inquirer.registerPrompt('command', commandPrompt);

async function handleListCommand(config: Config) {
  const request: ListToolsRequest = {
    method: 'tools/list',
  };
  const connectedClients = getConnectedClient();
  const result = await handleListToolsRequest(request, connectedClients, config.mcpServers || {}, {
    mcpServers: config.mcpServers || {},
    tools: config.tools,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function handleCallCommand(
  toolName: string,
  argsStr: string[],
  options: { outputFile?: string },
  config: Config
) {
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
  const result = await handleToolCall(request, config);
  let outputContent = '';
  if (result.content && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.type === 'text') {
        if (options.outputFile) {
          outputContent += item.text + '\n';
        } else {
          console.log(item.text);
        }
      } else {
        const outputDir = path.join(process.cwd(), 'output');
        await fs.mkdir(outputDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = 'json';
        const filePath = path.join(outputDir, `${toolName}-${timestamp}.${extension}`);
        await fs.writeFile(filePath, JSON.stringify(item, null, 2));
        console.log(`Content saved to ${filePath}`);
      }
    }
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (options.outputFile) {
    await fs.writeFile(options.outputFile, outputContent);
    console.log(`Content saved to ${options.outputFile}`);
  }
}

async function main() {
  const program = new Command();
  program.name('mcp-proxy-hub').description('A CLI for interacting with the MCP Proxy Hub');

  program
    .command('list')
    .description('List available tools')
    .action(async () => {
      const config = await loadConfig();
      await createClients(config.mcpServers);
      await handleListCommand(config);
      process.exit(0);
    });

  program
    .command('call')
    .description('Call a tool with specified arguments')
    .argument('<toolName>', 'The name of the tool to call')
    .argument('[args...]', 'Arguments for the tool in key=value format')
    .option('-o, --output-file <file>', 'Save output to a file')
    .action(async (toolName, args, options) => {
      const config = await loadConfig();
      await createClients(config.mcpServers);
      await handleListCommand(config);
      await handleCallCommand(toolName, args, options, config);
      process.exit(0);
    });

  if (process.argv.slice(2).length > 0) {
    program.parse(process.argv);
  } else {
    // Interactive mode
    const config = await loadConfig();
    await createClients(config.mcpServers);
    await handleListCommand(config);

    let isEnd = false;
    while (!isEnd) {
      try {
        const { command } = await inquirer.prompt({
          // @ts-expect-error registered command prompt type
          type: 'command',
          name: 'command',
          message: 'mcp-proxy-hub> ',
        });

        const parts = command.trim().split(/\s+/);
        const commandName = parts[0].toLowerCase();

        if (!commandName) {
          continue;
        }

        switch (commandName) {
          case 'list': {
            await handleListCommand(config);
            break;
          }
          case 'call': {
            const [, toolName, ...rest] = parts;
            if (!toolName) {
              console.log('Please enter a tool name for "call" command.');
              continue;
            }
            const args: string[] = [];
            let outputFile: string | undefined;
            for (let i = 0; i < rest.length; i++) {
              if (rest[i] === '-o' || rest[i] === '--output-file') {
                if (i + 1 < rest.length) {
                  outputFile = rest[i + 1];
                  i++;
                } else {
                  console.log('Error: Missing file path for --output-file');
                }
              } else {
                args.push(rest[i]);
              }
            }
            await handleCallCommand(toolName, args, { outputFile }, config);
            break;
          }
          case 'exit': {
            isEnd = true;
            break;
          }
          default:
            console.log(
              'Unknown command. Available commands: call <toolName> [args...], list, exit'
            );
        }
      } catch (error) {
        logger.error('Error:', error);
      }
    }
    process.exit(0);
  }
}

main().catch((error) => {
  logger.error('Error during CLI startup:', error);
  process.exit(1);
});
