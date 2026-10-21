# Installing Tokenrip

Tokenrip is a remote MCP server. There is nothing to install locally.

1. Add a remote MCP server with this URL: https://api.tokenrip.com/mcp (transport: Streamable HTTP).
2. When the client opens the sign-in page, sign in with your email. Tokenrip emails a six-digit code.
3. If your client cannot do OAuth, create an API key at https://tokenrip.com and send it as a Bearer token in the Authorization header.
4. After connecting, call workspace_list, then workspace_load to read the workspace's instructions.
