#!/usr/bin/env node

/**
 * Agent Installation Script
 * 
 * This script sets up the ReAct agent system for the Obsidian plugin,
 * including downloading dependencies and setting up the agent files.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class AgentInstaller {
    constructor() {
        this.pluginDir = process.cwd();
        this.agentDir = path.join(this.pluginDir, 'agent');
    }

    async install() {
        console.log('🚀 Installing ReAct Agent System...');
        
        try {
            // Create agent directory
            this.createAgentDirectory();
            
            // Install Python dependencies
            await this.installPythonDependencies();
            
            // Copy agent files
            this.copyAgentFiles();
            
            // Create configuration files
            this.createConfigFiles();
            
            console.log('✅ Agent system installed successfully!');
            console.log(`📁 Agent location: ${this.agentDir}`);
            console.log('🎯 You can now use agentic mode in the plugin settings');
            
        } catch (error) {
            console.error('❌ Installation failed:', error.message);
            process.exit(1);
        }
    }

    createAgentDirectory() {
        console.log('📁 Creating agent directory...');
        
        if (!fs.existsSync(this.agentDir)) {
            fs.mkdirSync(this.agentDir, { recursive: true });
        }
        
        // Create subdirectories
        const subdirs = ['utils', 'docs'];
        subdirs.forEach(dir => {
            const dirPath = path.join(this.agentDir, dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        });
    }

    async installPythonDependencies() {
        console.log('🐍 Installing Python dependencies...');
        
        // Check if Python is available
        try {
            execSync('python3 --version', { stdio: 'pipe' });
        } catch {
            try {
                execSync('python --version', { stdio: 'pipe' });
            } catch {
                throw new Error('Python is not installed or not in PATH');
            }
        }

        // Create requirements.txt
        const requirements = `
pocketflow>=0.1.0
mcp>=1.0.0
asyncio
pathlib
json
`.trim();

        const requirementsPath = path.join(this.agentDir, 'requirements.txt');
        fs.writeFileSync(requirementsPath, requirements);

        // Install dependencies
        try {
            const pythonCmd = this.getPythonCommand();
            execSync(`${pythonCmd} -m pip install -r requirements.txt`, {
                cwd: this.agentDir,
                stdio: 'inherit'
            });
        } catch (error) {
            console.warn('⚠️ Failed to install Python dependencies automatically');
            console.log('📝 Please install manually:');
            console.log(`   cd ${this.agentDir}`);
            console.log('   pip install -r requirements.txt');
        }
    }

    copyAgentFiles() {
        console.log('📄 Creating agent files...');
        
        // Create main.py
        const mainPy = `#!/usr/bin/env python3
"""
Main Entry Point for ReAct Agent (Obsidian Plugin Version)

This is a simplified version of the ReAct agent optimized for
integration with the Obsidian LLM plugin.
"""

import argparse
import sys
import os
from pathlib import Path

# Add current directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from flow import create_react_agent
from utils.model_config import load_model_config, print_model_info


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="ReAct Agent for Obsidian")
    parser.add_argument("request", nargs="*", help="User request")
    parser.add_argument("--model-profile", choices=["fast", "balanced", "powerful", "mixed"],
                       default="balanced", help="Model profile to use")
    parser.add_argument("--max-steps", type=int, default=10, help="Maximum reasoning steps")
    return parser.parse_args()


def main():
    """Main function to run the ReAct agent."""
    args = parse_arguments()

    if not args.request:
        print("Error: No request provided", file=sys.stderr)
        sys.exit(1)

    user_request = " ".join(args.request)
    
    print("🚀 ReAct Agent for Obsidian - Reasoning + Acting")
    print("=" * 60)
    print(f"📝 User Request: {user_request}")

    # Load model configuration
    model_config = load_model_config(
        config_path="model_config.json",
        profile=args.model_profile
    )
    print_model_info(model_config)

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
    except KeyboardInterrupt:
        print("\\n⏹️  Agent interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\\n💥 Agent error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
`;

        fs.writeFileSync(path.join(this.agentDir, 'main.py'), mainPy);
        
        // Create a simplified flow.py
        const flowPy = `"""
Simplified Flow Definition for Obsidian Plugin Integration
"""

from pocketflow import Flow, Node


class SimpleReActNode(Node):
    """Simplified ReAct node for Obsidian integration."""
    
    def exec(self, shared):
        user_request = shared.get("user_request", "")
        
        # For now, return a simple response
        # This would be replaced with actual ReAct logic
        result = f"ReAct Agent processed: {user_request}"
        
        print("=" * 60)
        print("🎉 REACT AGENT FINAL RESULT")
        print("=" * 60)
        print(result)
        print("=" * 60)
        
        return result


def create_react_agent():
    """Create a simplified ReAct agent for Obsidian."""
    node = SimpleReActNode()
    return Flow(start=node)
`;

        fs.writeFileSync(path.join(this.agentDir, 'flow.py'), flowPy);
    }

    createConfigFiles() {
        console.log('⚙️ Creating configuration files...');
        
        // Create model_config.json
        const modelConfig = {
            "model_config": {
                "reasoning": "gpt-4o-mini",
                "summarization": "gpt-4o-mini", 
                "default": "gpt-4o-mini"
            },
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
            }
        };

        fs.writeFileSync(
            path.join(this.agentDir, 'model_config.json'),
            JSON.stringify(modelConfig, null, 2)
        );

        // Create utils/__init__.py
        fs.writeFileSync(path.join(this.agentDir, 'utils', '__init__.py'), '');
        
        // Create simplified model_config.py
        const modelConfigPy = `"""
Simplified Model Configuration for Obsidian Plugin
"""

import json
from pathlib import Path


def load_model_config(config_path="model_config.json", profile=None):
    """Load model configuration."""
    try:
        with open(config_path, 'r') as f:
            config_data = json.load(f)
        
        if profile and profile in config_data.get("model_profiles", {}):
            return config_data["model_profiles"][profile]
        else:
            return config_data.get("model_config", {
                "reasoning": "gpt-4o-mini",
                "summarization": "gpt-4o-mini",
                "default": "gpt-4o-mini"
            })
    except Exception:
        return {
            "reasoning": "gpt-4o-mini",
            "summarization": "gpt-4o-mini", 
            "default": "gpt-4o-mini"
        }


def print_model_info(model_config):
    """Print model configuration info."""
    print("🧠 Model Configuration:")
    print(f"   Reasoning: {model_config.get('reasoning', 'unknown')}")
    print(f"   Summarization: {model_config.get('summarization', 'unknown')}")
    print(f"   Default: {model_config.get('default', 'unknown')}")
`;

        fs.writeFileSync(
            path.join(this.agentDir, 'utils', 'model_config.py'),
            modelConfigPy
        );
    }

    getPythonCommand() {
        try {
            execSync('python3 --version', { stdio: 'pipe' });
            return 'python3';
        } catch {
            return 'python';
        }
    }
}

// Run installer if called directly
if (require.main === module) {
    const installer = new AgentInstaller();
    installer.install().catch(console.error);
}

module.exports = AgentInstaller;
