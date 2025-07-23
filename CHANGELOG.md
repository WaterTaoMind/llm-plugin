# Changelog

All notable changes to the LLM Integration Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - MCP Integration 🔗

#### Core MCP Functionality
- **Model Context Protocol (MCP) Client**: Full implementation of MCP client functionality
- **Automatic Tool Selection**: AI automatically chooses and executes appropriate MCP tools based on user requests
- **Multi-Server Support**: Connect to multiple MCP servers simultaneously with independent management
- **Real-Time Status Monitoring**: Live connection status display in UI with server health indicators
- **Intelligent Tool Discovery**: Automatic discovery and registration of tools from connected servers

#### MCP Services Architecture
- **MCPClientService**: Main orchestration service for MCP functionality
- **MCPServerManager**: Individual server connection management with health monitoring
- **MCPToolRegistry**: Tool discovery, conflict resolution, and schema management
- **Resource Access**: Support for MCP resources with @resource:uri syntax

#### Enhanced LLM Integration
- **Function Calling**: Extended LLMService to support tool calling with MCP tools
- **Tool Result Processing**: Seamless integration of tool results into LLM responses
- **Context Enhancement**: Automatic inclusion of tool outputs in conversation context

#### User Interface Enhancements
- **MCP Settings Panel**: Comprehensive server management interface in plugin settings
- **Connection Status Indicators**: Real-time status pills showing server connectivity
- **Server Management Controls**: Add, remove, enable/disable, and reconnect servers
- **Tool Execution Feedback**: Optional notifications for tool execution status

#### Advanced Features
- **Error Handling & Reconnection**: Robust error handling with exponential backoff reconnection
- **Manual Tool Commands**: Support for @-command syntax for direct tool execution
- **Tool Conflict Resolution**: Intelligent handling of duplicate tool names across servers
- **Resource Integration**: Access MCP resources in prompts with @resource syntax
- **Cross-Platform Compatibility**: Full support for Windows, macOS, and Linux

#### Developer Experience
- **Comprehensive Documentation**: Setup guides, examples, and troubleshooting documentation
- **Configuration Examples**: Pre-configured examples for popular MCP servers
- **Testing Framework**: Integration tests and validation tools
- **Debug Support**: Enhanced logging and debugging capabilities for MCP operations

### Technical Improvements
- **TypeScript SDK Integration**: Added @modelcontextprotocol/sdk dependency
- **Enhanced Build Configuration**: Updated esbuild config for Node.js module support
- **Type Safety**: Extended type definitions for MCP-specific interfaces
- **Service Layer Extension**: Enhanced existing services to support MCP integration

### Documentation
- **MCP Setup Guide**: Comprehensive guide for configuring MCP servers
- **Integration Examples**: Real-world examples and use cases
- **Troubleshooting Guide**: Common issues and solutions
- **API Documentation**: Technical documentation for developers

### Configuration
- **MCP Settings**: New settings section for MCP configuration
- **Server Management**: UI for adding, configuring, and managing MCP servers
- **Environment Variables**: Support for API keys and server-specific configuration
- **Auto-Connect**: Optional automatic connection to servers on startup

## [Previous Versions]

### [1.0.0] - Initial Release

#### Added
- **Core LLM Integration**: Basic LLM API connectivity and chat interface
- **Multi-Modal Support**: Text, image, and document processing capabilities
- **Command System**: @-command syntax for special functions (@web, @youtube, @note, etc.)
- **Content Processing**: YouTube transcription, web scraping, and clipboard integration
- **Custom Templates**: Reusable processing patterns and templates
- **Settings Management**: Comprehensive configuration interface
- **Cross-Platform Support**: Windows, macOS, and Linux compatibility

#### Features
- Interactive chat interface with conversation history
- Image upload and analysis capabilities
- YouTube video transcription and analysis
- Web content extraction and processing
- Clipboard integration for quick content processing
- Custom model selection and configuration
- Debug mode for troubleshooting
- Tavily search integration

#### Architecture
- Modular TypeScript architecture
- Service-based design pattern
- Clean separation of concerns
- Type-safe development
- Extensible plugin system

---

## Migration Guide

### Upgrading to MCP Integration

The MCP integration is fully backward compatible. Existing functionality remains unchanged, and MCP features are additive.

#### New Users
1. Install the plugin as usual
2. Enable MCP in settings
3. Add your first MCP server (recommended: filesystem server)
4. Start using natural language requests that leverage MCP tools

#### Existing Users
1. Update to the latest version
2. MCP will be disabled by default - enable it in settings when ready
3. All existing @-commands and functionality continue to work
4. MCP tools complement existing features without conflicts

#### Configuration
- MCP settings are separate from existing LLM settings
- No changes required to existing API configurations
- MCP servers are managed independently

For detailed setup instructions, see [docs/MCP_SETUP_GUIDE.md](docs/MCP_SETUP_GUIDE.md).
