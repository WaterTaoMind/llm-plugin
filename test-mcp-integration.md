# MCP Integration Test Guide

This document provides a step-by-step guide to test the MCP (Model Context Protocol) client functionality in the LLM plugin.

## Prerequisites

1. **Install the plugin** with the MCP integration
2. **Have an MCP server available** for testing

## Test MCP Servers

### 1. Simple Echo Server (for basic testing)

Create a simple MCP server that echoes input:

```bash
# Install MCP SDK globally
npm install -g @modelcontextprotocol/sdk

# Create a simple echo server script
cat > echo-server.js << 'EOF'
#!/usr/bin/env node
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const server = new Server({
  name: "echo-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Add echo tool
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [{
      name: "echo",
      description: "Echo back the input text",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text to echo back"
          }
        },
        required: ["text"]
      }
    }]
  };
});

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "echo") {
    return {
      content: [{
        type: "text",
        text: `Echo: ${args.text}`
      }]
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
EOF

chmod +x echo-server.js
```

### 2. File System Server (for resource testing)

```bash
# Create a filesystem server script
cat > fs-server.js << 'EOF'
#!/usr/bin/env node
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const fs = require('fs');
const path = require('path');

const server = new Server({
  name: "filesystem-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {},
    resources: {}
  }
});

// Add read file tool
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [{
      name: "read_file",
      description: "Read contents of a file",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to read"
          }
        },
        required: ["path"]
      }
    }]
  };
});

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "read_file") {
    try {
      const content = fs.readFileSync(args.path, 'utf8');
      return {
        content: [{
          type: "text",
          text: content
        }]
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

// Add resources
server.setRequestHandler('resources/list', async () => {
  return {
    resources: [{
      uri: "file://test.txt",
      name: "Test File",
      description: "A test text file"
    }]
  };
});

server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;
  
  if (uri === "file://test.txt") {
    return {
      contents: [{
        type: "text",
        text: "This is test content from the filesystem server."
      }]
    };
  }
  
  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
EOF

chmod +x fs-server.js
```

## Testing Steps

### 1. Configure MCP Servers in Plugin Settings

1. Open Obsidian
2. Go to Settings → Community Plugins → LLM Plugin
3. Scroll to "Model Context Protocol (MCP) Settings"
4. Enable MCP
5. Add a new server:
   - **Name**: Echo Server
   - **Command**: node
   - **Arguments**: /path/to/echo-server.js
   - **Enabled**: ✓
   - **Auto Reconnect**: ✓

### 2. Test Server Connection

1. Check the MCP status pill in the input area
2. It should show "MCP: 1/1" if connected
3. In settings, the server should show "(Connected) - 1 tools"

### 3. Test Automatic Tool Calling

1. Open the LLM plugin chat
2. Type a natural language request: "Please echo the text 'Hello MCP!'"
3. The LLM should automatically:
   - Recognize the need to use the echo tool
   - Call the echo tool with the text
   - Return the echoed result

### 4. Test Manual Tool Commands

1. Type: `@echo Hello from manual command!`
2. Should execute the echo tool directly
3. Check console for tool execution logs

### 5. Test Resource Access

1. Add the filesystem server to settings
2. Type: `@resource file://test.txt`
3. Should load and display the resource content

### 6. Test Error Handling

1. Stop one of the MCP servers
2. Check that the status updates to show disconnection
3. Verify reconnection attempts if auto-reconnect is enabled
4. Try using a tool from the disconnected server

### 7. Test Settings UI

1. Try disabling/enabling servers
2. Use the "Reconnect" button
3. Remove and add servers
4. Check that status updates in real-time

## Expected Results

✅ **Connection Status**: MCP status pill shows correct server count
✅ **Tool Discovery**: Tools appear in server status
✅ **Automatic Execution**: LLM automatically calls appropriate tools
✅ **Manual Commands**: @-commands work for direct tool execution
✅ **Resource Access**: @resource commands load content
✅ **Error Handling**: Graceful handling of connection failures
✅ **Reconnection**: Automatic reconnection with exponential backoff
✅ **UI Updates**: Real-time status updates in settings

## Troubleshooting

### Common Issues

1. **Server won't connect**
   - Check command path and arguments
   - Verify server script is executable
   - Check console for error messages

2. **Tools not appearing**
   - Verify server implements tools/list correctly
   - Check server logs for errors

3. **Automatic tool calling not working**
   - Ensure LLM backend supports function calling
   - Check that tools are properly formatted for LLM

4. **Manual commands not working**
   - Verify @-command syntax
   - Check for tool name conflicts

## Debug Information

Enable debug mode in plugin settings to see detailed logs:
- MCP connection attempts
- Tool discovery process
- Tool execution details
- Error messages and stack traces
