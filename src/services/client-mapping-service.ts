import { ConnectedClient } from '../client.js';

export class ClientMappingService {
  private toolToClientMap = new Map<string, ConnectedClient>();
  private customToolToClientMap = new Map<string, ConnectedClient>();

  public clearToolMap(): void {
    this.toolToClientMap.clear();
  }

  public mapToolToClient(toolName: string, client: ConnectedClient): void {
    // Update existing mapping instead of throwing an error
    this.toolToClientMap.set(toolName, client);
  }

  public getClientForTool(toolName: string): ConnectedClient | undefined {
    return this.toolToClientMap.get(toolName);
  }

  public mapCustomToolToClient(customToolKey: string, client: ConnectedClient): void {
    this.customToolToClientMap.set(customToolKey, client);
  }

  public getClientForCustomTool(customToolKey: string): ConnectedClient | undefined {
    return this.customToolToClientMap.get(customToolKey);
  }

  public clearCustomToolMap(): void {
    this.customToolToClientMap.clear();
  }
}

// Export a singleton instance
export const clientMappingService = new ClientMappingService();
