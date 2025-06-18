import { TemplateConfig } from '../../core/types';
import { ChevronDownIcon } from '../../constants/icons';

export class TemplateSelector {
    private container: HTMLElement;
    private dropdown: HTMLElement | null = null;
    private selectedTemplate: string = '';
    private templates: TemplateConfig[] = [];
    private customInput: HTMLInputElement | null = null;
    private isCustomMode: boolean = false;
    private onTemplateChange: (template: string) => void;

    constructor(container: HTMLElement, templates: TemplateConfig[], onTemplateChange: (template: string) => void) {
        this.container = container;
        this.templates = templates;
        this.onTemplateChange = onTemplateChange;
        this.createSelector();
    }

    private createSelector() {
        const selectorContainer = this.container.createDiv({ cls: 'llm-template-selector' });
        
        const button = selectorContainer.createEl('button', { cls: 'llm-selector-button' });
        button.innerHTML = `
            <span class="llm-selector-text">Select Template</span>
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

        this.templates.forEach(template => {
            const option = this.dropdown!.createDiv({ cls: 'llm-selector-option' });
            option.textContent = template.label;
            option.addEventListener('click', () => this.selectTemplate(template));
        });
    }

    private selectTemplate(template: TemplateConfig) {
        if (template.id === 'custom') {
            this.showCustomInput();
        } else {
            this.setSelectedTemplateInternal(template.id, template.label);
            this.hideCustomInput();
        }
        this.hideDropdown();
    }

    private showCustomInput() {
        this.isCustomMode = true;
        
        if (!this.customInput) {
            this.customInput = this.container.createEl('input', {
                type: 'text',
                cls: 'llm-custom-template-input',
                placeholder: 'Enter custom template'
            });

            this.customInput.addEventListener('input', () => {
                const value = this.customInput!.value.trim();
                this.selectedTemplate = value;
                this.onTemplateChange(value);
            });

            this.customInput.addEventListener('blur', () => {
                if (!this.customInput!.value.trim()) {
                    this.hideCustomInput();
                }
            });
        }

        this.customInput.style.display = 'block';
        this.customInput.focus();
        this.updateButtonText('Custom Template');
    }

    private hideCustomInput() {
        this.isCustomMode = false;
        if (this.customInput) {
            this.customInput.style.display = 'none';
        }
    }

    private setSelectedTemplateInternal(id: string, label: string) {
        this.selectedTemplate = id;
        this.updateButtonText(label);
        this.onTemplateChange(id);
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

    getSelectedTemplate(): string {
        return this.selectedTemplate;
    }

    setSelectedTemplate(templateId: string, label?: string) {
        const template = this.templates.find(t => t.id === templateId);
        if (template) {
            this.setSelectedTemplateInternal(template.id, template.label);
        } else if (label) {
            this.setSelectedTemplateInternal(templateId, label);
        }
    }

    updateTemplates(templates: TemplateConfig[]) {
        this.templates = templates;
        this.populateDropdown();
    }

    clearSelection() {
        this.selectedTemplate = '';
        this.updateButtonText('Select Template');
        this.hideCustomInput();
        this.onTemplateChange('');
    }
}
