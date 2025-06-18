import { App } from 'obsidian';
import { ModelConfig, TemplateConfig } from '../core/types';

export interface ConfigurationData {
    models: ModelConfig[];
    templates: TemplateConfig[];
}

export class ConfigurationService {
    private app: App;
    private configData: ConfigurationData | null = null;

    constructor(app: App) {
        this.app = app;
    }

    async loadConfiguration(): Promise<ConfigurationData> {
        if (this.configData) {
            return this.configData;
        }

        try {
            // Try to load from plugin's data.json file
            const configFile = 'data.json';

            const configContent = await this.app.vault.adapter.read(configFile);
            this.configData = JSON.parse(configContent);
            
            return this.configData!;
        } catch (error) {
            console.warn('Could not load data.json, using default configuration:', error);
            
            // Fallback to default configuration
            this.configData = {
                models: [
                    { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', description: 'Most capable GPT-4 model' },
                    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', description: 'Faster, cost-effective GPT-4 model' },
                    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'Anthropic', description: 'Most intelligent Claude model' },
                    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'Anthropic', description: 'Fastest Claude model' },
                    { id: 'custom', label: 'Custom Model', provider: 'Custom', description: 'Enter your own model ID' }
                ],
                templates: [
                    { id: '', label: 'No Template', description: 'Use without any template' },
                    { id: 'summarize', label: 'Summarize', description: 'Summarize the content concisely' },
                    { id: 'explain', label: 'Explain', description: 'Explain the concept in detail' },
                    { id: 'analyze', label: 'Analyze', description: 'Provide detailed analysis' },
                    { id: 'custom', label: 'Custom Template', description: 'Enter your own template' }
                ]
            };

            return this.configData;
        }
    }

    getModels(): ModelConfig[] {
        return this.configData?.models || [];
    }

    getTemplates(): TemplateConfig[] {
        return this.configData?.templates || [];
    }

    async reloadConfiguration(): Promise<ConfigurationData> {
        this.configData = null;
        return await this.loadConfiguration();
    }
}
