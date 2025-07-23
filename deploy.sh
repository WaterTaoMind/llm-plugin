#!/usr/bin/env zsh

# LLM Plugin Deployment Script
# Builds and deploys the plugin to Obsidian

# --- Configuration ---
DEFAULT_PLUGIN_DIR="/mnt/d/work/Notes/md/.obsidian/plugins/unofficial-llm-integration"

# --- Script ---

# Get the directory where the script is located
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Navigate to the plugin's root directory
cd "$SCRIPT_DIR" || exit 1

echo "🔨 Building LLM Plugin in $(pwd)..."

# Build the plugin
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"

# Determine the target plugin directory
if [ -n "$1" ]; then
  # Expand the tilde to the user's home directory
  PLUGIN_DIR=$(eval echo "$1")
  echo "🚀 Deploying to custom directory provided: $PLUGIN_DIR"
else
  PLUGIN_DIR="$DEFAULT_PLUGIN_DIR"
  echo "🚀 Deploying to default directory: $PLUGIN_DIR"
fi

# Check if the target directory exists
if [ ! -d "$PLUGIN_DIR" ]; then
    echo "❌ Error: Target directory not found at '$PLUGIN_DIR'"
    echo "👉 Please make sure the directory exists or provide a valid path as an argument."
    echo "   Example: ./deploy.sh \"/path/to/your/vault/.obsidian/plugins/unofficial-llm-integration\""
    exit 1
fi


# Copy files to Obsidian plugin directory
echo "📁 Copying files to Obsidian..."
echo "📄 Copying main.js..."
cp main.js "$PLUGIN_DIR/"
echo "🎨 Copying styles.css..."
cp styles.css "$PLUGIN_DIR/"
echo "📋 Copying manifest.json..."
cp manifest.json "$PLUGIN_DIR/"

echo "✅ Plugin deployed successfully to '$PLUGIN_DIR'!"
echo "📝 Please reload the plugin in Obsidian:"
echo "   Settings → Community Plugins → Toggle 'Unofficial LLM Integration'"

