# MCP Proxy Hub

An MCP proxy server that aggregates and serves multiple MCP resource servers through a single interface. This server acts as a central hub that can:

- Connect to and manage multiple MCP resource servers
- Expose their combined capabilities through a unified interface
- Handle routing of requests to appropriate backend servers
- Aggregate responses from multiple sources

## Features

### Resource Management

- Discover and connect to multiple MCP resource servers
- Aggregate resources from all connected servers
- Maintain consistent URI schemes across servers
- Handle resource routing and resolution

### Tool Aggregation

- Expose tools from all connected servers with server name prefixes
- Apply tool filtering based on configuration (exposedTools/hiddenTools)
- Support tool name remapping via configuration
- Route tool calls to appropriate backend servers

### Custom Tool Support

- Define compound tools that combine functionality from multiple servers
- Execute subtools using server and tool name specifications
- Provide detailed documentation through tool descriptions
- Specify execution with a standardized format:

  ```json
  {
    "server": "server_name",
    "tool": "tool_name",
    "args": {
      // Tool-specific arguments
    }
  }
  ```

### Environment Variable Support

- Automatically expand environment variables in tool arguments
- Automatically replace sensitive values with variable references in responses
- Configure which variables should be expanded/unexpanded via configuration
- Each variable can be independently configured for expansion and unexpansion
- Secure handling of sensitive information like API keys

### Prompt Handling

- Aggregate prompts from all connected servers
- Route prompt requests to appropriate backends
- Handle multi-server prompt responses

## Configuration

The server requires a JSON configuration file that specifies the MCP servers to connect to. Copy the example config([config.example.json](./config.example.json)) and modify it for your needs:

```bash
cp config.example.json config.json
```

### Configuration Options

#### MCP Server Configuration

- **Stdio-type Server**:

  - `command`: Command to execute (required)
  - `args`: Command line arguments (optional)
  - `env`: Environment variables (optional)
  - `exposedTools`: Array of tools to expose (optional)
  - `hiddenTools`: Array of tools to hide (optional)
  - `envVars`: Environment variable configuration for tool arguments and responses (optional)

- **SSE-type Server**:
  - `type`: "sse" (required)
  - `url`: URL of the SSE server (required)
  - `exposedTools`: Array of tools to expose (optional)
  - `hiddenTools`: Array of tools to hide (optional)
  - `envVars`: Environment variable configuration for tool arguments and responses (optional)

#### Tool Filtering Configuration

- **exposedTools**:

  - Only exposes specified tools
  - Array containing strings (original tool names) or {original, exposed} objects (for renaming)

- **hiddenTools**:
  - Hides specified tools
  - Array of tool name strings to hide

#### Environment Variables Configuration

- **envVars**:
  - Array of environment variable configurations
  - Each configuration has the following properties:
    - `name`: Name of the environment variable
    - `value`: Value of the environment variable
    - `expand`: Whether to expand this variable in tool arguments (optional, defaults to false)
    - `unexpand`: Whether to unexpand this variable in tool responses (optional, defaults to false)
  - Example:

    ```json
    "envVars": [
      { "name": "API_KEY", "value": "my-api-key", "expand": true, "unexpand": true },
      { "name": "USER_ID", "value": "user123", "expand": true, "unexpand": false }
    ]
    ```

#### Custom Tool Configuration

- **tools**:
  - Object with custom tool names as keys
  - Each tool has `description` and `subtools`
  - `subtools` is keyed by server name and contains each server's tool list

## Environment Variables

- `MCP_PROXY_CONFIG_PATH`: Path to the configuration file
- `MCP_PROXY_LOG_DIRECTORY_PATH`: Path to the log directory
- `MCP_PROXY_LOG_LEVEL`: Log level ("debug" or "info")
- `KEEP_SERVER_OPEN`: Whether to keep the server open after client disconnection in SSE mode (set to "1" to enable)
- `PORT`: Port for the SSE server (default: 3006)

## Development

Install dependencies:

```bash
npm install
```

Build the server:

```bash
npm run build
```

For development with auto-rebuild:

```bash
npm run watch
```

For development with continuous run:

```bash
# Stdio
npm run dev
# SSE
npm run dev:sse
```

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-proxy-hub": {
      "command": "/path/to/mcp-proxy-hub/build/index.js",
      "env": {
        "MCP_PROXY_CONFIG_PATH": "/absolute/path/to/your/config.json",
        "KEEP_SERVER_OPEN": "1"
      }
    }
  }
}
```

`KEEP_SERVER_OPEN` will keep the SSE running even if a client disconnects. This is useful when multiple clients connect to the MCP proxy.

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
