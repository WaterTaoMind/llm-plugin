// Refactored main entry point - clean and focused
import { LLMPlugin } from './src/core/LLMPlugin';

// Export the plugin class as default
export default LLMPlugin;

// This file is now just 5 lines instead of 1,818!
// All functionality has been properly separated into focused modules:
//
// Core Logic:
// - src/core/LLMPlugin.ts - Main plugin orchestration
// - src/core/types.ts - Type definitions
//
// Services (Business Logic):
// - src/services/LLMService.ts - API communication
// - src/services/CommandService.ts - Command processing
// - src/services/ImageService.ts - Image handling
//
// UI Components:
// - src/ui/LLMView.ts - Main view orchestration
// - src/ui/components/ChatHistory.ts - Chat display
// - src/ui/components/InputArea.ts - Input handling
// - src/ui/SettingsTab.ts - Settings interface
//
// Utilities:
// - src/utils/markdown.ts - Markdown processing
// - src/utils/fileUtils.ts - File operations
// - src/constants/icons.ts - Icon definitions
