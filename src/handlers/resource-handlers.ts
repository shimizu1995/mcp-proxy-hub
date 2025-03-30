import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResultSchema,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectedClient } from '../client.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';

/**
 * Registers list resources handler on the server
 */
export function registerListResourcesHandler(
  server: Server,
  connectedClients: ConnectedClient[]
): void {
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const allResources: z.infer<typeof ListResourcesResultSchema>['resources'] = [];
    clientMaps.clearResourceMap();

    for (const connectedClient of connectedClients) {
      try {
        const result = await connectedClient.client.request(
          {
            method: 'resources/list',
            params: {
              cursor: request.params?.cursor,
              _meta: request.params?._meta,
            },
          },
          ListResourcesResultSchema
        );

        if (result.resources) {
          const resourcesWithSource = result.resources.map((resource) => {
            clientMaps.mapResourceToClient(resource.uri, connectedClient);
            return {
              ...resource,
              name: `[${connectedClient.name}] ${resource.name || ''}`,
            };
          });
          allResources.push(...resourcesWithSource);
        }
      } catch (error) {
        console.error(`Error fetching resources from ${connectedClient.name}:`, error);
      }
    }

    return {
      resources: allResources,
      nextCursor: undefined,
    };
  });
}

/**
 * Registers read resource handler on the server
 */
export function registerReadResourceHandler(server: Server): void {
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const clientForResource = clientMaps.getClientForResource(uri);

    if (!clientForResource) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    try {
      return await clientForResource.client.request(
        {
          method: 'resources/read',
          params: {
            uri,
            _meta: request.params._meta,
          },
        },
        ReadResourceResultSchema
      );
    } catch (error) {
      console.error(`Error reading resource from ${clientForResource.name}:`, error);
      throw error;
    }
  });
}

/**
 * Registers list resource templates handler on the server
 */
export function registerListResourceTemplatesHandler(
  server: Server,
  connectedClients: ConnectedClient[]
): void {
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) => {
    const allTemplates: ResourceTemplate[] = [];

    for (const connectedClient of connectedClients) {
      try {
        const result = await connectedClient.client.request(
          {
            method: 'resources/templates/list' as const,
            params: {
              cursor: request.params?.cursor,
              _meta: request.params?._meta || {
                progressToken: undefined,
              },
            },
          },
          ListResourceTemplatesResultSchema
        );

        if (result.resourceTemplates) {
          const templatesWithSource = result.resourceTemplates.map((template) => ({
            ...template,
            name: `[${connectedClient.name}] ${template.name || ''}`,
            description: template.description
              ? `[${connectedClient.name}] ${template.description}`
              : undefined,
          }));
          allTemplates.push(...templatesWithSource);
        }
      } catch (error) {
        console.error(`Error fetching resource templates from ${connectedClient.name}:`, error);
      }
    }

    return {
      resourceTemplates: allTemplates,
      nextCursor: request.params?.cursor,
    };
  });
}
