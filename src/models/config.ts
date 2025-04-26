export interface EnvVarConfig {
  name: string;
  value: string;
  expand?: boolean;
  unexpand?: boolean;
}

export interface ServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;
  url?: string;
  exposedTools?: (string | { original: string; exposed: string })[];
  hiddenTools?: string[];
  envVars?: EnvVarConfig[];
}

export interface CustomToolConfig {
  description: string;
  subtools: Record<
    string,
    {
      tools: {
        name: string;
        description: string;
      }[];
    }
  >;
}

export interface Config {
  mcpServers: Record<string, ServerConfig>;
  tools?: Record<string, CustomToolConfig>;
}
