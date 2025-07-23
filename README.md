# LLM Integration Plugin for Obsidian

> **🚀 Modern & Modular**: A powerful LLM integration plugin built with clean, modular architecture for seamless AI-powered note-taking and content processing.

Transform your Obsidian workflow with intelligent AI assistance directly integrated into your vault. This plugin provides a sophisticated chat interface, content processing capabilities, and seamless integration with multiple LLM providers.

## ✨ Overview

The LLM Integration Plugin transforms Obsidian into an AI-powered knowledge workspace. Built with modern TypeScript and a modular architecture, it provides seamless integration with Large Language Models through a clean, intuitive interface.

### 🏗️ **Architecture Highlights**

- **🎯 Modular Design**: Clean separation of concerns across 15+ focused modules
- **⚡ Performance**: Lightweight core with efficient service-based architecture
- **🔧 Extensible**: Easy to customize and extend with new features
- **🛡️ Type-Safe**: Full TypeScript coverage for robust development

## 🚀 Key Features

### � **Interactive AI Chat**
- **Dedicated Chat Interface**: Full-featured chat view with conversation history
- **Multi-Modal Input**: Support for text, images, and document processing
- **Real-Time Responses**: Stream responses directly in your Obsidian workspace
- **Context Awareness**: Leverage your vault content for informed AI responses

### � **Content Processing**
- **Smart Note Processing**: Analyze and enhance your notes with AI insights
- **Clipboard Integration**: Process copied content instantly with AI
- **YouTube Transcription**: Extract and process YouTube video content
- **Audio File Support**: Transcribe and analyze audio files
- **Web Content Extraction**: Pull and process content from any URL

### 🔌 **Flexible Integrations**
- **Multiple LLM Providers**: Connect to various AI services via API
- **Tavily Search**: Intelligent web search with AI-powered results
- **Custom Patterns**: Create and manage reusable AI processing templates
- **Image Analysis**: Upload and analyze images with AI vision models

### 🔗 **Model Context Protocol (MCP) Integration**
- **Intelligent Tool Selection**: AI automatically chooses and executes appropriate tools based on your requests
- **Multi-Server Support**: Connect to multiple MCP servers simultaneously
- **Real-Time Status**: Monitor server connections and available tools
- **Resource Access**: Seamlessly access files, databases, and external services
- **Auto-Reconnection**: Robust connection management with exponential backoff
- **Manual Override**: Use @-commands for direct tool execution when needed

### ⚙️ **Advanced Capabilities**
- **Custom Model Selection**: Choose from different AI models for specific tasks
- **Batch Processing**: Handle multiple files or content pieces efficiently
- **Auto-Detection**: Automatically identify and process different content types
- **Debug Mode**: Comprehensive logging for troubleshooting and optimization

## 📋 Requirements

- **Obsidian**: Version 1.6.5 or higher
- **LLM API Access**: API key for your preferred LLM provider
- **Optional**: Tavily API key for web search functionality

## 📦 Installation

### Method 1: Community Plugins (Recommended)
1. Open Obsidian Settings → Community Plugins
2. Browse and search for "LLM Integration"
3. Install and enable the plugin

### Method 2: Manual Installation
1. Download the latest release from the [GitHub repository](https://github.com/WaterTaoMind/llm-plugin)
2. Extract files to `.obsidian/plugins/unofficial-llm-integration/` in your vault
3. Restart Obsidian and enable the plugin in settings

### Method 3: BRAT (Beta Testing)
1. Install the BRAT plugin from Community Plugins
2. Add repository URL: `https://github.com/WaterTaoMind/llm-plugin`
3. Install and enable the plugin

## ⚙️ Quick Setup

### 1. **Configure API Access**
Navigate to Settings → LLM Integration to configure your API connections:

- **LLM API URL**: Your LLM service endpoint
- **LLM API Key**: Authentication key for your LLM provider
- **Tavily API Key**: (Optional) For web search functionality

### 2. **Set Content Preferences**
- **Output Folder**: Where AI-processed content gets saved
- **Custom Patterns Folder**: Location for your reusable AI templates
- **Default Model**: Your preferred AI model (e.g., gpt-4, claude-3)

### 3. **Enable Features**
- **YouTube Auto-detect**: Automatically process YouTube links
- **Audio File Processing**: Enable audio transcription
- **Debug Mode**: Turn on for detailed logging

### 4. **Start Using**
- Click the chat icon in the ribbon to open the AI interface
- Or use the command palette: "Open LLM Chat"

## 🎯 Usage Guide

### **Core Workflows**

#### 💬 **AI Chat Interface**
1. **Open Chat**: Click the chat icon in the ribbon or use Command Palette
2. **Start Conversation**: Type your questions or requests
3. **Upload Content**: Drag and drop images or documents for analysis
4. **Review Responses**: Get formatted AI responses with syntax highlighting

#### 📝 **Content Processing**
- **Process Current Note**: Analyze and enhance your active note
- **Clipboard Processing**: Send copied content directly to AI
- **Web Search**: Use Tavily integration for intelligent web research
- **Batch Operations**: Process multiple files or content pieces

#### 🎨 **Custom Patterns**
- **Create Templates**: Build reusable AI processing patterns
- **Manage Library**: Organize patterns in your designated folder
- **Auto-Sync**: Patterns update automatically when files change
- **Share Patterns**: Export and share with the community

#### 🔧 **Advanced Features**
- **Multi-Modal Input**: Text, images, audio, and documents
- **Model Selection**: Switch between different AI models
- **YouTube Integration**: Automatic video transcription and analysis
- **Web Content**: Extract and process content from any URL

## 🏗️ Technical Architecture

### **Modern Modular Design**

The plugin is built with a clean, maintainable architecture that separates concerns:

```
src/
├── core/                    # Plugin foundation
│   ├── LLMPlugin.ts        # Main orchestration
│   └── types.ts            # Type definitions
├── services/               # Business logic
│   ├── LLMService.ts       # API communication
│   ├── CommandService.ts   # Command processing
│   └── ImageService.ts     # Media handling
├── ui/                     # User interface
│   ├── LLMView.ts         # Chat interface
│   ├── SettingsTab.ts     # Configuration
│   └── components/        # Reusable components
└── utils/                 # Helper functions
    └── markdown.ts        # Content processing
```

### **Architecture Benefits**
- **🎯 Focused Modules**: Each component has a single, clear responsibility
- **🔧 Easy Maintenance**: Modular design makes updates and fixes simple
- **⚡ Performance**: Lightweight core with efficient service architecture
- **🛡️ Type Safety**: Full TypeScript coverage prevents runtime errors
- **🧪 Testable**: Services can be unit tested independently

## 🔗 Model Context Protocol (MCP) Integration

The plugin includes comprehensive support for the Model Context Protocol, enabling seamless integration with external tools and services.

### **What is MCP?**

Model Context Protocol (MCP) is an open standard that allows AI assistants to securely connect to external data sources and tools. With MCP, your AI can:
- Access local files and databases
- Execute system commands
- Connect to APIs and web services
- Interact with development tools
- And much more!

### **How It Works**

1. **Automatic Tool Selection**: When you make a request, the AI automatically analyzes available MCP tools and selects the most appropriate ones
2. **Seamless Execution**: Tools are executed transparently in the background
3. **Intelligent Results**: Tool outputs are incorporated into the AI's response naturally

### **Example Interactions**

```
You: "Create a GitHub issue for the login bug we discussed"
AI: [Automatically uses GitHub MCP server to create issue]
Response: "I've created GitHub issue #123 'Fix login bug' in your repository."

You: "What's in my project's README file?"
AI: [Automatically uses filesystem MCP server to read file]
Response: "Here's the content of your README.md file: [file contents]"

You: "Search for recent papers on machine learning"
AI: [Automatically uses web search MCP server]
Response: "I found several recent papers: [search results with summaries]"
```

### **Setting Up MCP Servers**

1. **Open Plugin Settings**: Go to Settings → Community Plugins → LLM Plugin
2. **Enable MCP**: Toggle "Enable MCP" in the MCP Settings section
3. **Add Servers**: Click "Add MCP Server" and configure:
   - **Name**: Descriptive name for the server
   - **Command**: Executable command (e.g., `npx`, `python`, `node`)
   - **Arguments**: Command arguments and server path
   - **Environment**: API keys and other environment variables

### **Popular MCP Servers**

| Server | Description | Setup Command |
|--------|-------------|---------------|
| **Filesystem** | Access local files and directories | `npm install -g @modelcontextprotocol/server-filesystem` |
| **Git** | Git repository operations | `npm install -g @modelcontextprotocol/server-git` |
| **GitHub** | GitHub API integration | `npm install -g @modelcontextprotocol/server-github` |
| **SQLite** | SQLite database access | `npm install -g @modelcontextprotocol/server-sqlite` |
| **Web Search** | Brave search integration | `npm install -g @modelcontextprotocol/server-brave-search` |
| **Puppeteer** | Web scraping and automation | `npm install -g @modelcontextprotocol/server-puppeteer` |

### **Configuration Examples**

See `mcp-server-examples.json` for detailed configuration examples and `test-mcp-integration.md` for testing instructions.

### **Manual Tool Commands**

While the AI automatically selects tools, you can also invoke them manually:

- `@toolname arguments` - Execute a specific tool
- `@server:toolname arguments` - Execute tool from specific server
- `@resource uri` - Access a specific resource

### **Monitoring and Management**

- **Status Indicator**: The MCP status pill shows connection status (e.g., "MCP: 2/3")
- **Real-Time Updates**: Server status updates automatically in settings
- **Reconnection**: Failed connections automatically retry with exponential backoff
- **Manual Reconnect**: Use the "Reconnect" button in settings for immediate retry

## � Troubleshooting

### **Debug Mode**
Enable debug mode in plugin settings for detailed logging:
- API request/response details
- Service interaction traces
- Error diagnostics
- Performance metrics

### **Common Solutions**
- **Connection Issues**: Verify API URLs and keys are correct
- **Performance**: Check console for service bottlenecks
- **File Processing**: Ensure proper folder permissions
- **Pattern Sync**: Validate markdown file formats

### **MCP Troubleshooting**
- **Server Won't Connect**:
  - Check command path and arguments are correct
  - Verify server dependencies are installed
  - Ensure executable permissions are set
  - Check console logs for detailed error messages
- **Tools Not Working**:
  - Verify server is connected (check status pill)
  - Try manual reconnection in settings
  - Check tool arguments format
  - Ensure required API keys are configured
- **Automatic Tool Selection Issues**:
  - Verify LLM backend supports function calling
  - Check that tools are properly discovered
  - Try using manual @-commands as fallback
- **Performance Issues**:
  - Adjust tool timeout settings
  - Check for server resource constraints
  - Monitor connection health in settings

## 🤝 Contributing

We welcome contributions! The modular architecture makes development straightforward:

### **How to Contribute**
1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Test** thoroughly
5. **Submit** a pull request

### **Development Areas**
- **New Services**: Add focused service modules
- **UI Components**: Build reusable interface elements
- **Utilities**: Enhance content processing capabilities
- **Documentation**: Improve guides and examples

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## � Links

- **Repository**: [GitHub](https://github.com/WaterTaoMind/llm-plugin)
- **Issues**: [Report Bugs](https://github.com/WaterTaoMind/llm-plugin/issues)
- **Discussions**: [Community Forum](https://github.com/WaterTaoMind/llm-plugin/discussions)

---

*Built with ❤️ for the Obsidian community*
