# MCP Coordinator Specification

## Overview

MCP Coordinator is a proxy server that aggregates multiple MCP (Model Context Protocol) resource servers and serves them through a single interface. This server acts as a central hub that can:

- Connect to and manage multiple MCP resource servers
- Expose their combined capabilities through a unified interface
- Handle routing of requests to appropriate backend servers
- Aggregate responses from multiple sources

## Architecture

### Key Components

1. **Proxy Server** (`mcp-proxy.ts`):

   - Functions as the main coordinator, routing client requests to appropriate backend servers
   - Creates MCP server instances and registers various handlers

2. **Client Management** (`client.ts`):

   - Establishes and manages connections to multiple MCP servers based on configuration
   - Supports both Stdio and SSE transport methods

3. **Resource/Tool/Prompt Handlers** (`handlers/`):

   - Handlers for various MCP requests (resources, tools, prompts)
   - Responsible for routing requests to appropriate backend servers

4. **Mapping Functions** (`mappers/`):

   - Manages associations between tools, resources, prompts and their providing clients

5. **Custom Tools Functionality** (`custom-tools.ts`):
   - Creates custom tools that combine tools from multiple servers

### Communication Methods

- **Standard Input/Output (stdio)**:

  - Used for communication with MCP servers launched via command line
  - Uses `StdioClientTransport` and `StdioServerTransport` classes

- **Server-Sent Events (SSE)**:
  - Used for communication with servers using HTTP connections
  - Uses `SSEClientTransport` and `SSEServerTransport` classes
  - Supports multiple client connections

## Project Structure

```
.
├── README.md
├── config.example.json
├── doc
│   └── spec.md
├── eslint.config.js
├── package.json
├── src
│   ├── client.ts
│   ├── config.ts
│   ├── core
│   │   └── server.ts
│   ├── handlers
│   │   ├── tool-handlers.ts
│   │   └── tool-handlers.spec.ts
│   ├── index.ts
│   ├── mappers
│   │   └── client-maps.ts
│   ├── mcp-proxy.ts
│   ├── sse.ts
│   └── utils
│       └── logger.ts
├── tsconfig.json
└── vitest.config.ts
```

## Detailed Functionality

### Resource Management

- **Resource Discovery and Aggregation**:

  - Retrieves resources from all connected servers and provides an integrated list
  - Adds server name prefix to resource names (e.g., `[ServerName] ResourceName`)
  - Maintains URI scheme consistency

- **Resource Routing**:

  - Manages mapping of resource URIs to their providing servers
  - Forwards resource read requests to the appropriate server

- **Resource Templates**:
  - Aggregates and provides resource templates from all servers

### Tool Aggregation

- **Tool Discovery and Exposure**:

  - Retrieves tools from all connected servers and provides an integrated list
  - Adds server information to tool names
  - Supports filtering of exposed/hidden tools based on configuration

- **Tool Name Remapping**:

  - Supports changing tool names via configuration (e.g., `tool2` → `renamed_tool2`)
  - Manages mapping between original tool names and exposed names

- **Tool Call Processing**:
  - Routes tool calls to the appropriate server
  - Executes special processing for custom tools

### Custom Tool Functionality

- **Configuration-Based Tool Definition**:

  - Allows defining custom compound tools in `config.json`
  - Integrates tools from multiple servers into a single custom tool

- **Subtool Management**:
  - Specifies subtools using server name and tool name combinations
  - Executes using the format `{ "server": "server_name", "tool": "tool_name", "args": {...} }`

### Prompt Processing

- **Prompt Aggregation**:

  - Retrieves prompts from all connected servers and provides an integrated list
  - Adds server information to prompt descriptions

- **Prompt Routing**:
  - Manages mapping of prompt names to their providing servers
  - Forwards prompt calls to the appropriate server

## Configuration

### Configuration File Structure

```json
{
  "mcpServers": {
    "ServerName1": {
      "command": "/path/to/server1/build/index.js",
      "exposedTools": ["tool1", { "original": "tool2", "exposed": "renamed_tool2" }]
    },
    "ServerName2": {
      "command": "npx",
      "args": ["@example/mcp-server", "--option", "value"],
      "hiddenTools": ["tool3"]
    },
    "ServerName3": {
      "type": "sse",
      "url": "http://example.com/mcp"
    }
  },
  "tools": {
    "CustomToolName": {
      "description": "Description of the custom tool",
      "subtools": {
        "ServerName1": {
          "tools": [
            {
              "name": "toolA",
              "description": "Description of tool A"
            }
          ]
        },
        "ServerName2": {
          "tools": [
            {
              "name": "toolB",
              "description": "Description of tool B"
            }
          ]
        }
      }
    }
  }
}
```

### Configuration Options

#### MCP Server Configuration

- **Stdio-type Server**:

  - `command`: Command to execute (required)
  - `args`: Command line arguments (optional)
  - `env`: Environment variables (optional)
  - `exposedTools`: Array of tools to expose (optional)
  - `hiddenTools`: Array of tools to hide (optional)

- **SSE-type Server**:
  - `type`: "sse" (required)
  - `url`: URL of the SSE server (required)
  - `exposedTools`: Array of tools to expose (optional)
  - `hiddenTools`: Array of tools to hide (optional)

#### Tool Filtering Configuration

- **exposedTools**:

  - Only exposes specified tools
  - Array containing strings (original tool names) or {original, exposed} objects (for renaming)

- **hiddenTools**:
  - Hides specified tools
  - Array of tool name strings to hide

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

## Operation

### Claude Desktop Integration

Add the following to the configuration file (MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mcp-coordinator": {
      "command": "/path/to/mcp-coordinator/build/index.js",
      "env": {
        "MCP_PROXY_CONFIG_PATH": "/absolute/path/to/your/config.json",
        "KEEP_SERVER_OPEN": "1"
      }
    }
  }
}
```

### Debugging

Since MCP servers communicate via standard input/output, debugging can be challenging. It is recommended to use the MCP Inspector:

```bash
npm run inspector
```

This provides a URL to access debugging tools in your browser.

## Installation and Execution

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

### Development Mode

```bash
# Auto-rebuild mode
npm run watch

# Continuous execution mode (Stdio)
npm run dev

# Continuous execution mode (SSE)
npm run dev:sse
```

### Production Execution

```bash
MCP_PROXY_CONFIG_PATH=./config.json mcp-proxy-server
```
