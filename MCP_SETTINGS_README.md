# MCP Settings Configuration

## Quick Start

The LLM Plugin now supports loading MCP server configurations from a `settings.json` file located in the same directory as the plugin's `data.json` file.

## File Location

```
.obsidian/plugins/llm-plugin/
├── main.js
├── manifest.json  
├── data.json          # Plugin settings (managed by Obsidian)
└── settings.json      # MCP configuration (user-editable)
```

## Why This Approach?

✅ **Simple**: All plugin files in one location  
✅ **Familiar**: Obsidian users know where to find plugin files  
✅ **Consistent**: Same directory as `data.json`  
✅ **Portable**: Easy to backup and restore with plugin  
✅ **Standard**: Follows MCP configuration format used by other clients  

## Configuration Format

The `settings.json` file uses the standard MCP configuration format:

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
    }
  }
}
```

## How It Works

1. **Single Source**: Plugin loads configurations only from `settings.json` in plugin directory
2. **Simple Fallback**: If no `settings.json` exists, uses plugin settings UI
3. **Merge Strategy**: File configurations are merged with existing plugin settings
4. **No Conflicts**: Only one configuration file location to manage

## Benefits

### For Users
- **Easy to Edit**: Standard JSON format
- **Version Control**: Can be included in plugin backups
- **Sharing**: Easy to share configurations between installations
- **External Tools**: Can be edited with any text editor

### For Developers  
- **Standard Format**: Compatible with other MCP clients
- **Extensible**: Easy to add new configuration options
- **Maintainable**: Separate from plugin internal settings

## Migration

If you have existing MCP servers configured in the plugin:

1. **Automatic**: The plugin will create `settings.json` automatically
2. **Manual**: You can create the file manually using the format above
3. **Hybrid**: Both file and UI configurations work together

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

## Next Steps

1. Check if `settings.json` exists in your plugin directory
2. If not, the plugin will create a sample file automatically
3. Edit the file to configure your MCP servers
4. Restart the plugin or use "Reload Configuration" to apply changes

For detailed configuration options and troubleshooting, see the full [MCP Configuration Guide](docs/MCP_CONFIGURATION_GUIDE.md).
