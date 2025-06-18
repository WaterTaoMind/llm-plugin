import { ModelConfig } from '../../core/types';
import { ChevronDownIcon } from '../../constants/icons';

export class ModelSelector {
    private container: HTMLElement;
    private dropdown: HTMLElement | null = null;
    private selectedModel: string = '';
    private models: ModelConfig[] = [];
    private customInput: HTMLInputElement | null = null;
    private isCustomMode: boolean = false;
    private onModelChange: (model: string) => void;

    constructor(container: HTMLElement, models: ModelConfig[], onModelChange: (model: string) => void) {
        this.container = container;
        this.models = models;
        this.onModelChange = onModelChange;
        this.createSelector();
    }

    private createSelector() {
        const selectorContainer = this.container.createDiv({ cls: 'llm-model-selector' });
        
        const button = selectorContainer.createEl('button', { cls: 'llm-selector-button' });
        button.innerHTML = `
            <span class="llm-selector-text">Select Model</span>
            <span class="llm-selector-icon">${ChevronDownIcon}</span>
        `;

        button.addEventListener('click', () => this.toggleDropdown());

        // Create dropdown
        this.dropdown = selectorContainer.createDiv({ cls: 'llm-selector-dropdown' });
        this.dropdown.style.display = 'none';

        this.populateDropdown();

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!selectorContainer.contains(e.target as Node)) {
                this.hideDropdown();
            }
        });
    }

    private populateDropdown() {
        if (!this.dropdown) return;

        this.dropdown.empty();

        this.models.forEach(model => {
            const option = this.dropdown!.createDiv({ cls: 'llm-selector-option' });
            option.textContent = model.label;
            option.addEventListener('click', () => this.selectModel(model));
        });
    }

    private selectModel(model: ModelConfig) {
        if (model.id === 'custom') {
            this.showCustomInput();
        } else {
            this.setSelectedModel(model.id, model.label);
            this.hideCustomInput();
        }
        this.hideDropdown();
    }

    private showCustomInput() {
        this.isCustomMode = true;
        
        if (!this.customInput) {
            this.customInput = this.container.createEl('input', {
                type: 'text',
                cls: 'llm-custom-model-input',
                placeholder: 'Enter custom model ID'
            });

            this.customInput.addEventListener('input', () => {
                const value = this.customInput!.value.trim();
                this.selectedModel = value;
                this.onModelChange(value);
            });

            this.customInput.addEventListener('blur', () => {
                if (!this.customInput!.value.trim()) {
                    this.hideCustomInput();
                }
            });
        }

        this.customInput.style.display = 'block';
        this.customInput.focus();
        this.updateButtonText('Custom Model');
    }

    private hideCustomInput() {
        this.isCustomMode = false;
        if (this.customInput) {
            this.customInput.style.display = 'none';
        }
    }

    private setSelectedModel(id: string, label: string) {
        this.selectedModel = id;
        this.updateButtonText(label);
        this.onModelChange(id);
    }

    private updateButtonText(text: string) {
        const textEl = this.container.querySelector('.llm-selector-text');
        if (textEl) {
            textEl.textContent = text;
        }
    }

    private toggleDropdown() {
        if (!this.dropdown) return;

        const isVisible = this.dropdown.style.display !== 'none';
        if (isVisible) {
            this.hideDropdown();
        } else {
            this.showDropdown();
        }
    }

    private showDropdown() {
        if (!this.dropdown) return;
        this.dropdown.style.display = 'block';
    }

    private hideDropdown() {
        if (!this.dropdown) return;
        this.dropdown.style.display = 'none';
    }

    getSelectedModel(): string {
        return this.selectedModel;
    }

    setDefaultModel(modelId: string) {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
            this.setSelectedModel(model.id, model.label);
        }
    }

    updateModels(models: ModelConfig[]) {
        this.models = models;
        this.populateDropdown();
    }
}
