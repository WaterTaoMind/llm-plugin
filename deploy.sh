#!/usr/bin/env zsh

# LLM Plugin Deployment Script
# Builds and deploys the plugin to Obsidian

echo "🔨 Building LLM Plugin..."

# Source zsh configuration to ensure npm is available
source ~/.zshrc

# Navigate to plugin directory
cd /mnt/d/work/llm-plugin

# Build the plugin
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    
    # Copy files to Obsidian plugin directory
    PLUGIN_DIR="/mnt/d/work/Notes/md/.obsidian/plugins/unofficial-llm-integration"
    
    echo "📁 Copying files to Obsidian..."
    echo "📄 Copying main.js..."
    cp main.js "$PLUGIN_DIR/"
    echo "🎨 Copying styles.css..."
    cp styles.css "$PLUGIN_DIR/"
    echo "📋 Copying manifest.json..."
    cp manifest.json "$PLUGIN_DIR/"
    
    echo "✅ Plugin deployed successfully!"
    echo "📝 Please reload the plugin in Obsidian:"
    echo "   Settings → Community Plugins → Toggle 'Unofficial LLM Integration'"
    
else
    echo "❌ Build failed!"
    exit 1
fi
