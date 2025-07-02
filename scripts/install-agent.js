#!/usr/bin/env node

/**
 * Agent Installation Script
 * 
 * This script sets up the Python ReAct agent based on Pocketflow and Simon Wilson's LLM
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Agent files content
const AGENT_FILES = {
    'main.py': `"""
Main Entry Point for ReAct Agent

This module serves as the main entry point for the ReAct agent,
following PocketFlow patterns for clean project structure.
"""

import argparse
from flow import create_react_agent
from utils.model_config import load_model_config, print_model_info


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="ReAct Agent for Obsidian")
    parser.add_argument("request", nargs="*", help="User request")
    parser.add_argument("--model-profile", choices=["fast", "balanced", "powerful"],
                       default="balanced", help="Model profile to use")
    parser.add_argument("--model-config", help="Path to model configuration file")
    parser.add_argument("--max-steps", type=int, default=10, help="Maximum reasoning steps")
    return parser.parse_args()


def main():
    """Main function to run the ReAct agent."""
    args = parse_arguments()

    if not args.request:
        print("❌ No request provided")
        return

    user_request = " ".join(args.request)
    
    # Load model configuration
    model_config = load_model_config(
        config_path=args.model_config or "model_config.json",
        profile=args.model_profile
    )

    # Create and run agent
    agent = create_react_agent()
    shared = {
        "user_request": user_request,
        "config_path": "settings.json",
        "max_steps": args.max_steps,
        "current_step": 0,
        "action_history": [],
        "model_config": model_config
    }

    try:
        agent.run(shared)
    except Exception as e:
        print(f"💥 Agent error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
`,

    'requirements.txt': `pocketflow>=0.1.0
mcp>=1.0.0
`,

    'model_config.json': `{
  "model_profiles": {
    "fast": {
      "reasoning": "gpt-4o-mini",
      "summarization": "gpt-4o-mini",
      "default": "gpt-4o-mini"
    },
    "balanced": {
      "reasoning": "gpt-4o",
      "summarization": "gpt-4o-mini",
      "default": "gpt-4o-mini"
    },
    "powerful": {
      "reasoning": "gpt-4o",
      "summarization": "gpt-4o",
      "default": "gpt-4o"
    }
  },
  "model_config": {
    "reasoning": "gpt-4o",
    "summarization": "gpt-4o-mini",
    "default": "gpt-4o-mini"
  }
}`
};

function createAgentDirectory() {
    const pluginDir = path.join(process.cwd(), '.obsidian', 'plugins', 'unofficial-llm-integration');
    const agentDir = path.join(pluginDir, 'agent');

    // Create directories
    if (!fs.existsSync(pluginDir)) {
        fs.mkdirSync(pluginDir, { recursive: true });
    }
    if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
    }

    const utilsDir = path.join(agentDir, 'utils');
    if (!fs.existsSync(utilsDir)) {
        fs.mkdirSync(utilsDir, { recursive: true });
    }

    return agentDir;
}

function installAgentFiles(agentDir) {
    console.log('📁 Installing agent files...');

    // Install main files
    for (const [filename, content] of Object.entries(AGENT_FILES)) {
        const filePath = path.join(agentDir, filename);
        fs.writeFileSync(filePath, content);
        console.log(`✅ Created ${filename}`);
    }

    console.log('📋 Note: Python agent source files need to be copied manually from the documents');
}

function checkPythonDependencies() {
    console.log('🐍 Checking Python dependencies...');

    try {
        execSync('python3 --version', { stdio: 'pipe' });
        console.log('✅ Python 3 is available');
    } catch (error) {
        try {
            execSync('python --version', { stdio: 'pipe' });
            console.log('✅ Python is available');
        } catch (error2) {
            console.error('❌ Python is not available. Please install Python 3.');
            return false;
        }
    }

    try {
        execSync('llm --version', { stdio: 'pipe' });
        console.log('✅ Simon Wilson\\'s LLM CLI is available');
    } catch (error) {
        console.warn('⚠️ Simon Wilson\\'s LLM CLI not found. Install with: pip install llm');
    }

    return true;
}

function createSettingsTemplate(agentDir) {
    const settingsPath = path.join(agentDir, 'settings.json');
    
    if (!fs.existsSync(settingsPath)) {
        const settingsTemplate = {
            "mcpServers": {
                "youtube-transcript": {
                    "command": "python",
                    "args": ["-m", "mcp_youtube_transcript"],
                    "env": {}
                }
            }
        };

        fs.writeFileSync(settingsPath, JSON.stringify(settingsTemplate, null, 2));
        console.log('✅ Created settings.json template');
    }
}

function main() {
    console.log('🚀 Installing ReAct Agent System for Obsidian LLM Plugin');
    console.log('='.repeat(60));

    try {
        if (!checkPythonDependencies()) {
            process.exit(1);
        }

        const agentDir = createAgentDirectory();
        console.log(`📂 Agent directory: ${agentDir}`);

        installAgentFiles(agentDir);
        createSettingsTemplate(agentDir);

        console.log('\\n' + '='.repeat(60));
        console.log('🎉 Agent installation completed!');
        console.log('\\n📋 Next steps:');
        console.log('1. Copy Python files (flow.py, nodes.py, utils/) to agent directory');
        console.log('2. Install: pip install -r agent/requirements.txt');
        console.log('3. Configure: llm keys set openai');
        console.log('4. Enable agentic mode in plugin settings');

    } catch (error) {
        console.error('❌ Installation failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };