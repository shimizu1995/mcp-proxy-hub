import { ConnectedClient } from '../client.js';

/**
 * Maps to track which client owns which resource
 */
export class ClientMaps {
  private toolToClientMap = new Map<string, ConnectedClient>();
  private resourceToClientMap = new Map<string, ConnectedClient>();
  private promptToClientMap = new Map<string, ConnectedClient>();
  private customToolToClientMap = new Map<string, ConnectedClient>();
  private connectedClients = new Set<ConnectedClient>();

  /**
   * Gets the client associated with a specific tool
   */
  getClientForTool(toolName: string): ConnectedClient | undefined {
    return this.toolToClientMap.get(toolName);
  }

  /**
   * Gets the client associated with a specific resource
   */
  getClientForResource(uri: string): ConnectedClient | undefined {
    return this.resourceToClientMap.get(uri);
  }

  /**
   * Gets the client associated with a specific prompt
   */
  getClientForPrompt(name: string): ConnectedClient | undefined {
    return this.promptToClientMap.get(name);
  }

  /**
   * Gets the client associated with a specific custom tool
   */
  getClientForCustomTool(customToolKey: string): ConnectedClient | undefined {
    return this.customToolToClientMap.get(customToolKey);
  }

  /**
   * Maps a tool to a client
   * @param toolName The exposed tool name
   * @param client The client that handles this tool
   */
  mapToolToClient(toolName: string, client: ConnectedClient): void {
    // Update existing mapping instead of throwing an error
    this.toolToClientMap.set(toolName, client);
  }

  /**
   * Maps a custom tool to a client
   * @param customToolKey The key for the custom tool
   * @param client The client that handles this custom tool
   */
  mapCustomToolToClient(customToolKey: string, client: ConnectedClient): void {
    this.customToolToClientMap.set(customToolKey, client);
  }

  /**
   * Maps a resource to a client
   */
  mapResourceToClient(resourceUri: string, client: ConnectedClient): void {
    this.resourceToClientMap.set(resourceUri, client);
  }

  /**
   * Maps a prompt to a client
   */
  mapPromptToClient(promptName: string, client: ConnectedClient): void {
    this.promptToClientMap.set(promptName, client);
  }

  /**
   * Clears the tool to client map
   */
  clearToolMap(): void {
    this.toolToClientMap.clear();
  }

  /**
   * Clears the custom tool to client map
   */
  clearCustomToolMap(): void {
    this.customToolToClientMap.clear();
  }

  /**
   * Clears the resource to client map
   */
  clearResourceMap(): void {
    this.resourceToClientMap.clear();
  }

  /**
   * Clears the prompt to client map
   */
  clearPromptMap(): void {
    this.promptToClientMap.clear();
  }

  /**
   * Adds a connected client to the set
   */
  addConnectedClient(client: ConnectedClient): void {
    this.connectedClients.add(client);
  }

  /**
   * Gets all connected clients
   */
  getAllClients(): Set<ConnectedClient> {
    return this.connectedClients;
  }

  /**
   * Gets a client by server name
   */
  getClientByName(serverName: string): ConnectedClient | undefined {
    return Array.from(this.connectedClients).find((client) => client.name === serverName);
  }

  /**
   * Updates a connected client
   */
  updateConnectedClient(serverName: string, newClient: ConnectedClient): void {
    // Remove old client
    const oldClient = this.getClientByName(serverName);
    if (oldClient) {
      this.connectedClients.delete(oldClient);
    }

    // Add new client
    this.connectedClients.add(newClient);

    // Update all maps with the new client
    // For tool map
    this.toolToClientMap.forEach((client, toolName) => {
      if (client.name === serverName) {
        this.toolToClientMap.set(toolName, newClient);
      }
    });

    // For custom tool map
    this.customToolToClientMap.forEach((client, customToolKey) => {
      if (client.name === serverName) {
        this.customToolToClientMap.set(customToolKey, newClient);
      }
    });

    // For resource map
    this.resourceToClientMap.forEach((client, resourceUri) => {
      if (client.name === serverName) {
        this.resourceToClientMap.set(resourceUri, newClient);
      }
    });

    // For prompt map
    this.promptToClientMap.forEach((client, promptName) => {
      if (client.name === serverName) {
        this.promptToClientMap.set(promptName, newClient);
      }
    });
  }
}

// Singleton instance for use across the application
export const clientMaps = new ClientMaps();
