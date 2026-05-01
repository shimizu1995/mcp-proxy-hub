# Development Instructions

When modifying or adding programs, please use the dev tool for development.

When a user provides a link to a GitHub issue like the one below, use the get_issue tool provided by github server to retrieve the issue's content and implement the requested feature or fix as described.
<https://github.com/{organization}/{repository}/issues/{issue_number}>

When writing code, please pay attention to the following points:

- Avoid excessive nesting
- Make code testable through appropriate file separation and function extraction
- Always add unit tests for non-UI code

For searching within the codebase, use the git grep command while in the project directory.

After completing your modifications, run `npm run test:unit` and `npm run test:type` to confirm there are no issues.

**IMPORTANT**: Don't delete existing test cases when modifying the code to pass the tests.

After these commands execute successfully, run `npm run format && npm run lint` to ensure the code is properly formatted and adheres to the linting rules.

## OAuth for upstream `streamable-http` / `http` servers

The `streamable-http` transport (and its `http` alias) supports OAuth automatically. When an upstream MCP server replies with `401 Unauthorized` and advertises OAuth metadata (RFC 9728), the proxy will:

- Perform RFC 7591 dynamic client registration.
- Spin up a one-shot listener on `http://127.0.0.1:<random-port>/callback`.
- Open the user's default browser to the authorization URL (PKCE).
- Persist the resulting client info and tokens under `~/.mcp-proxy-hub/oauth/<sha16(serverUrl)>/`.
- Refresh tokens silently afterwards.

No OAuth fields are required in `config.json` — just declare the server:

```json
{
  "iris": {
    "type": "http",
    "url": "https://iris.labo.makick.jp/mcp"
  }
}
```

To clear cached credentials (e.g. after revoking access or changing scopes):

```bash
mcp-proxy-hub-cli auth clear              # clear all servers
mcp-proxy-hub-cli auth clear iris         # clear a single server
```

Set `MCP_PROXY_OAUTH_DIR` to override the cache location, or `MCP_PROXY_NO_BROWSER=1` to suppress automatic browser launch (the URL is logged instead).
