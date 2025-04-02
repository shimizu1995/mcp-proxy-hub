import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListPromptsResultSchema,
  GetPromptResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectedClient } from '../client.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';

/**
 * Registers get prompt handler on the server
 */
export function registerGetPromptHandler(server: Server): void {
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;
    const clientForPrompt = clientMaps.getClientForPrompt(name);

    if (!clientForPrompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    try {
      console.log('Forwarding prompt request:', name);

      // Match the exact structure from the example code
      const response = await clientForPrompt.client.request(
        {
          method: 'prompts/get' as const,
          params: {
            name,
            arguments: request.params.arguments || {},
            _meta: request.params._meta || {
              progressToken: undefined,
            },
          },
        },
        GetPromptResultSchema
      );

      console.log('Prompt result:', response);
      return response;
    } catch (error) {
      console.error(`Error getting prompt from ${clientForPrompt.name}:`, error);
      throw error;
    }
  });
}

/**
 * Registers list prompts handler on the server
 */
export function registerListPromptsHandler(
  server: Server,
  connectedClients: ConnectedClient[]
): void {
  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    const allPrompts: z.infer<typeof ListPromptsResultSchema>['prompts'] = [];
    clientMaps.clearPromptMap();

    for (const connectedClient of connectedClients) {
      try {
        const result = await connectedClient.client.request(
          {
            method: 'prompts/list' as const,
            params: {
              cursor: request.params?.cursor,
              _meta: request.params?._meta || {
                progressToken: undefined,
              },
            },
          },
          ListPromptsResultSchema
        );

        if (result.prompts) {
          const promptsWithSource = result.prompts.map((prompt) => {
            clientMaps.mapPromptToClient(prompt.name, connectedClient);
            return {
              ...prompt,
              description: `[${connectedClient.name}] ${prompt.description || ''}`,
            };
          });
          allPrompts.push(...promptsWithSource);
        }
      } catch (error) {
        const hasErrorCode = typeof error === 'object' && error !== null && 'code' in error;
        if (!hasErrorCode || error.code !== -32601) {
          // ignore -32601 Method not found error
          console.error(`Error fetching prompts from ${connectedClient.name}:`, error);
        }
      }
    }

    return {
      prompts: allPrompts,
      nextCursor: request.params?.cursor,
    };
  });
}
