# MCP Setup Guide

This guide walks you through setting up Model Context Protocol (MCP) servers with the LLM Plugin for Obsidian.

## Quick Start

### 1. Enable MCP in Plugin Settings

1. Open Obsidian Settings
2. Navigate to Community Plugins → LLM Plugin
3. Scroll to "Model Context Protocol (MCP) Settings"
4. Toggle "Enable MCP" to ON
5. Ensure "Auto Connect" is enabled

### 2. Install Your First MCP Server

Let's start with the filesystem server for accessing local files:

```bash
# Install the filesystem MCP server
npm install -g @modelcontextprotocol/server-filesystem
```

### 3. Configure the Server

In the plugin settings:

1. Click "Add MCP Server"
2. Fill in the configuration:
   - **Name**: `Local Files`
   - **Command**: `npx`
   - **Arguments**: `@modelcontextprotocol/server-filesystem /path/to/your/documents`
   - **Enabled**: ✓
   - **Auto Reconnect**: ✓

Replace `/path/to/your/documents` with the actual path you want to give the AI access to.

### 4. Test the Connection

1. Save the settings
2. Check the MCP status pill in the chat input area
3. It should show "MCP: 1/1" indicating one connected server
4. In settings, you should see "Local Files (Connected) - X tools"

### 5. Try It Out!

Open the LLM chat and try:
- "What files are in my documents folder?"
- "Read the contents of my README.md file"
- "Create a new file called notes.txt with some sample content"

The AI will automatically use the filesystem tools to fulfill your requests!

## Popular MCP Servers

### Filesystem Server
**Purpose**: Access local files and directories
```bash
npm install -g @modelcontextprotocol/server-filesystem
```
**Configuration**:
- Command: `npx`
- Arguments: `@modelcontextprotocol/server-filesystem /allowed/path`

**Example Usage**:
- "Read my project's README file"
- "List all Python files in the src directory"
- "Create a new markdown file with meeting notes"

### Git Server
**Purpose**: Git repository operations
```bash
npm install -g @modelcontextprotocol/server-git
```
**Configuration**:
- Command: `npx`
- Arguments: `@modelcontextprotocol/server-git --repository /path/to/repo`

**Example Usage**:
- "Show me the git log for the last 10 commits"
- "What changed in the last commit?"
- "Show me who last modified this file"

### GitHub Server
**Purpose**: GitHub API integration
```bash
npm install -g @modelcontextprotocol/server-github
```
**Configuration**:
- Command: `npx`
- Arguments: `@modelcontextprotocol/server-github`
- Environment: `GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here`

**Example Usage**:
- "Create a GitHub issue for the bug we just discussed"
- "List all open issues in my repository"
- "Create a pull request for the feature branch"

### SQLite Server
**Purpose**: SQLite database operations
```bash
npm install -g @modelcontextprotocol/server-sqlite
```
**Configuration**:
- Command: `npx`
- Arguments: `@modelcontextprotocol/server-sqlite --db-path /path/to/database.db`

**Example Usage**:
- "Show me all tables in the database"
- "Query users where age > 25"
- "Insert a new record into the products table"

### Web Search Server
**Purpose**: Brave search integration
```bash
npm install -g @modelcontextprotocol/server-brave-search
```
**Configuration**:
- Command: `npx`
- Arguments: `@modelcontextprotocol/server-brave-search`
- Environment: `BRAVE_API_KEY=your_api_key`

**Example Usage**:
- "Search for recent news about AI developments"
- "Find documentation for the React useEffect hook"
- "Look up the weather forecast for tomorrow"

## Advanced Configuration

### Environment Variables

Many MCP servers require API keys or configuration through environment variables:

1. In the server configuration, click the "Environment" section
2. Add key-value pairs:
   ```
   GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
   BRAVE_API_KEY=BSA_xxxxxxxxxxxx
   DATABASE_URL=postgresql://user:pass@localhost/db
   ```

### Security Considerations

- **File Access**: Only grant filesystem access to directories you trust the AI to modify
- **API Keys**: Use tokens with minimal required permissions
- **Database Access**: Consider read-only access for sensitive databases
- **Network Access**: Be cautious with servers that make external API calls

### Multiple Server Instances

You can run multiple instances of the same server type:

1. **Development vs Production**: Separate filesystem servers for different project directories
2. **Multiple Databases**: Different SQLite servers for different databases
3. **Different Repositories**: Separate Git servers for different projects

### Custom Servers

You can create your own MCP servers:

1. Follow the [MCP SDK documentation](https://modelcontextprotocol.io/docs)
2. Implement the required endpoints (tools/list, tools/call, etc.)
3. Add your custom server to the plugin configuration

## Troubleshooting

### Server Won't Start

**Check Command Path**:
```bash
# Test if the command works manually
npx @modelcontextprotocol/server-filesystem --help
```

**Verify Installation**:
```bash
# Check if package is installed
npm list -g @modelcontextprotocol/server-filesystem
```

**Check Permissions**:
- Ensure the command is executable
- Verify directory permissions for filesystem servers
- Check API key validity for external services

### Connection Issues

1. **Check Console Logs**: Enable debug mode in plugin settings
2. **Manual Reconnect**: Use the "Reconnect" button in settings
3. **Restart Plugin**: Disable and re-enable the plugin
4. **Check Dependencies**: Ensure all required packages are installed

### Tool Execution Failures

1. **Verify Arguments**: Check that tool arguments match the expected schema
2. **Check Permissions**: Ensure the server has necessary permissions
3. **Timeout Issues**: Increase the tool timeout in settings
4. **Server Logs**: Check if the MCP server is logging errors

### Performance Optimization

1. **Limit Scope**: Only give servers access to necessary directories/resources
2. **Adjust Timeouts**: Set appropriate timeouts for your use case
3. **Monitor Connections**: Regularly check server health in settings
4. **Resource Management**: Be mindful of servers that consume significant resources

## Best Practices

1. **Start Small**: Begin with one or two servers and add more as needed
2. **Test Independently**: Verify servers work outside the plugin first
3. **Use Descriptive Names**: Name servers clearly (e.g., "Project Files", "Main Database")
4. **Regular Maintenance**: Keep MCP servers updated to latest versions
5. **Monitor Usage**: Check which tools are being used most frequently
6. **Backup Configurations**: Save your server configurations for easy restoration

## Getting Help

- **Plugin Issues**: Check the plugin's GitHub repository
- **MCP Server Issues**: Refer to individual server documentation
- **General MCP Questions**: Visit the [Model Context Protocol website](https://modelcontextprotocol.io)
- **Community Support**: Join relevant Discord servers or forums
