# MCP Configuration Guide

This guide explains how to configure MCP (Model Context Protocol) servers for the LLM Plugin.

## Configuration File Location

The plugin loads MCP server configurations from a single location:

**`settings.json`** (Plugin directory) - **Only location**

### File Structure

```
Your Vault/
└── .obsidian/
    └── plugins/
        └── llm-plugin/
            ├── main.js              # Plugin code
            ├── manifest.json        # Plugin manifest
            ├── data.json            # Plugin settings (managed by Obsidian)
            └── settings.json        # MCP configuration (user-editable)
```

## Configuration Format

### Standard Format (Recommended)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"],
      "enabled": true,
      "autoReconnect": true,
      "description": "Access local files and directories",
      "env": {}
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git", "--repository", "/path/to/repo"],
      "enabled": false,
      "autoReconnect": true,
      "description": "Git repository operations",
      "env": {}
    },
    "web-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "enabled": false,
      "autoReconnect": true,
      "description": "Web search using Brave Search API",
      "env": {
        "BRAVE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Configuration Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `command` | string | Yes | Executable command (e.g., "npx", "python", "node") |
| `args` | string[] | Yes | Command arguments |
| `enabled` | boolean | No | Whether server is enabled (default: true) |
| `autoReconnect` | boolean | No | Auto-reconnect on failure (default: true) |
| `description` | string | No | Human-readable description |
| `env` | object | No | Environment variables |

## Popular MCP Servers

### Filesystem Server
```json
"filesystem": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"],
  "enabled": true,
  "description": "Access local files and directories"
}
```

### Git Server
```json
"git": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-git", "--repository", "/path/to/git/repo"],
  "enabled": true,
  "description": "Git repository operations"
}
```

### SQLite Server
```json
"sqlite": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "/path/to/database.db"],
  "enabled": true,
  "description": "SQLite database operations"
}
```

### Web Search Server
```json
"web-search": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-brave-search"],
  "enabled": true,
  "description": "Web search capabilities",
  "env": {
    "BRAVE_API_KEY": "your-brave-api-key"
  }
}
```

### GitHub Server
```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "enabled": true,
  "description": "GitHub repository operations",
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
  }
}
```

## Configuration Management

### Loading Behavior

1. **Single source**: Only loads from `settings.json` in plugin directory
2. **Simple fallback**: If no file exists, uses plugin settings UI
3. **Merge strategy**: File configurations are merged with existing plugin settings
4. **No conflicts**: No multiple file locations to manage

### Automatic Reloading

The plugin monitors configuration files for changes and automatically:
- Reloads server configurations
- Reconnects to servers (if auto-connect is enabled)
- Updates available tools

### Manual Management

You can also manage MCP servers through the plugin settings UI:
1. Open Obsidian Settings
2. Navigate to "LLM Plugin" 
3. Go to "MCP Servers" section
4. Add, edit, or remove servers manually

## Best Practices

### 1. Use Plugin Directory Location
The `settings.json` file is automatically placed in the plugin directory (`.obsidian/plugins/llm-plugin/`) alongside `data.json`. This keeps all plugin-related configuration in one place.

### 2. Easy Access
You can access the configuration file at:
- **Path**: `.obsidian/plugins/llm-plugin/settings.json`
- **Location**: Same directory as the plugin's `data.json` file

### 3. Environment Variables
Store sensitive information (API keys, tokens) in environment variables:
```json
"env": {
  "API_KEY": "your-secret-key"
}
```

### 4. Descriptive Names
Use clear, descriptive names for your servers:
```json
"project-files": {
  "description": "Access to project source files",
  // ...
}
```

### 5. Gradual Enablement
Start with `"enabled": false` for new servers and enable them after testing.

## Troubleshooting

### Configuration Not Loading
1. Check file location and name
2. Verify JSON syntax
3. Check console for error messages
4. Ensure file permissions allow reading

### Server Connection Issues
1. Verify command and arguments are correct
2. Check if required dependencies are installed
3. Test server manually outside of plugin
4. Review environment variables

### File Watching
Note: File watching in Obsidian is limited. You may need to:
- Restart the plugin after configuration changes
- Use the "Reload Configuration" command
- Manually reconnect servers

## Migration from Plugin Settings

If you have existing MCP servers configured in the plugin settings:

1. The plugin will automatically create a `settings.json` file in the plugin directory
2. Existing configurations will be preserved and merged
3. You can edit the `settings.json` file directly for advanced configuration
4. The plugin will automatically load configurations on startup

## Example Complete Configuration

```json
{
  "mcpServers": {
    "local-files": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/username/Documents"],
      "enabled": true,
      "autoReconnect": true,
      "description": "Access to Documents folder"
    },
    "project-git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git", "--repository", "/Users/username/Projects/myproject"],
      "enabled": true,
      "autoReconnect": true,
      "description": "Git operations for my project"
    },
    "web-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "enabled": false,
      "autoReconnect": true,
      "description": "Web search (requires API key)",
      "env": {
        "BRAVE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

This configuration provides file access, git operations, and web search capabilities to your LLM conversations.
