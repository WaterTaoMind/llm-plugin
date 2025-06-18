import { Notice } from 'obsidian';
import { Command, ModelConfig, TemplateConfig } from '../../core/types';
import { SendIcon, ToolsIcon, AttachmentIcon, ConversationIcon, ChevronDownIcon } from '../../constants/icons';

export class UnifiedInputBox {
    public container: HTMLElement;
    private inputContainer: HTMLElement;
    private pillsContainer: HTMLElement;
    private textareaContainer: HTMLElement;
    private textarea: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
    
    // Pills and dropdowns
    private toolsPill: HTMLElement;
    private attachmentPill: HTMLElement;
    private cidPill: HTMLElement;
    private modelPill: HTMLElement;
    private templatePill: HTMLElement;
    
    // Dropdowns
    private commandDropdown: HTMLElement | null = null;
    private modelDropdown: HTMLElement | null = null;
    private templateDropdown: HTMLElement | null = null;
    private cidPopup: HTMLElement | null = null;
    
    // State
    private selectedModel: string = '';
    private selectedTemplate: string = '';
    private conversationId: string = '';
    private commands: Command[] = [];
    private models: ModelConfig[] = [];
    private templates: TemplateConfig[] = [];
    private attachedImages: string[] = [];
    
    // Event handlers
    public onSendMessage: () => void = () => {};
    public onGetConversationId: () => void = () => {};
    public onClearConversationId: () => void = () => {};

    constructor(container: HTMLElement) {
        this.container = container;
        this.createUnifiedInput();
    }

    private createUnifiedInput() {
        // Main input container with modern styling
        this.inputContainer = this.container.createDiv({ cls: 'llm-unified-input-box' });
        
        // Pills container inside the input box
        this.pillsContainer = this.inputContainer.createDiv({ cls: 'llm-input-pills' });
        
        // Create pills
        this.createPills();
        
        // Textarea container
        this.textareaContainer = this.inputContainer.createDiv({ cls: 'llm-textarea-container' });
        
        // Auto-expanding textarea
        this.textarea = this.textareaContainer.createEl('textarea', {
            cls: 'llm-unified-textarea',
            placeholder: 'Type your message here... Use Ctrl+Enter to send'
        });
        
        // Send button
        this.sendButton = this.inputContainer.createEl('button', { cls: 'llm-unified-send-button' });
        this.sendButton.innerHTML = SendIcon;
        
        // Setup event handlers
        this.setupEventHandlers();
    }

    private createPills() {
        // Tools pill
        this.toolsPill = this.pillsContainer.createEl('button', { cls: 'llm-input-pill' });
        this.toolsPill.innerHTML = `${ToolsIcon}<span>工具</span>`;
        this.toolsPill.addEventListener('click', () => this.toggleCommandDropdown());
        
        // Model pill
        this.modelPill = this.pillsContainer.createEl('button', { cls: 'llm-input-pill llm-model-pill' });
        this.modelPill.innerHTML = `<span>Model</span>${ChevronDownIcon}`;
        this.modelPill.addEventListener('click', () => this.toggleModelDropdown());
        
        // Template pill
        this.templatePill = this.pillsContainer.createEl('button', { cls: 'llm-input-pill llm-template-pill' });
        this.templatePill.innerHTML = `<span>Template</span>${ChevronDownIcon}`;
        this.templatePill.addEventListener('click', () => this.toggleTemplateDropdown());
        
        // Attachment pill
        this.attachmentPill = this.pillsContainer.createEl('button', { cls: 'llm-input-pill' });
        this.attachmentPill.innerHTML = `${AttachmentIcon}<span>附件</span>`;
        this.attachmentPill.addEventListener('click', () => this.toggleAttachmentPanel());
        
        // CID pill
        this.cidPill = this.pillsContainer.createEl('button', { cls: 'llm-input-pill' });
        this.cidPill.innerHTML = `${ConversationIcon}<span>CID</span>`;
        this.cidPill.addEventListener('click', () => this.toggleCIDPopup());
    }

    private setupEventHandlers() {
        // Auto-resize textarea
        this.textarea.addEventListener('input', () => {
            this.autoResizeTextarea();
            this.handleTextInput();
        });
        
        // Keyboard shortcuts
        this.textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.handleSendMessage();
            }
            
            // Handle @ commands
            if (e.key === 'Escape') {
                this.hideAllDropdowns();
            }
        });
        
        // Send button
        this.sendButton.addEventListener('click', () => this.handleSendMessage());
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.inputContainer.contains(e.target as Node)) {
                this.hideAllDropdowns();
            }
        });
        
        // Drag and drop for images
        this.textarea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.inputContainer.addClass('drag-over');
        });
        
        this.textarea.addEventListener('dragleave', () => {
            this.inputContainer.removeClass('drag-over');
        });
        
        this.textarea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.inputContainer.removeClass('drag-over');
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                this.handleDroppedFiles(e.dataTransfer.files);
            }
        });
    }

    private autoResizeTextarea() {
        this.textarea.style.height = 'auto';
        const newHeight = Math.min(Math.max(this.textarea.scrollHeight, 40), 200);
        this.textarea.style.height = newHeight + 'px';
    }

    private handleTextInput() {
        const cursorPosition = this.textarea.selectionStart;
        const textBeforeCursor = this.textarea.value.substring(0, cursorPosition);
        
        if (textBeforeCursor.endsWith('@')) {
            this.showCommandDropdown();
        } else {
            this.hideCommandDropdown();
        }
    }

    private toggleCommandDropdown() {
        if (this.commandDropdown && this.commandDropdown.style.display !== 'none') {
            this.hideCommandDropdown();
        } else {
            this.showCommandDropdown();
        }
    }

    private showCommandDropdown() {
        this.hideAllDropdowns();
        
        if (!this.commandDropdown) {
            this.commandDropdown = this.container.createDiv({ cls: 'llm-unified-dropdown' });
        }
        
        this.commandDropdown.empty();
        this.commandDropdown.style.display = 'block';
        
        this.commands.forEach(cmd => {
            const option = this.commandDropdown!.createDiv({ cls: 'llm-dropdown-option' });
            option.innerHTML = `
                <div class="llm-option-title">${cmd.name}</div>
                <div class="llm-option-desc">${cmd.description}</div>
            `;
            option.addEventListener('click', () => {
                this.insertCommand(cmd.name);
                this.hideCommandDropdown();
            });
        });
        
        this.positionDropdown(this.commandDropdown, this.toolsPill);
    }

    private hideCommandDropdown() {
        if (this.commandDropdown) {
            this.commandDropdown.style.display = 'none';
        }
    }

    private toggleModelDropdown() {
        if (this.modelDropdown && this.modelDropdown.style.display !== 'none') {
            this.hideModelDropdown();
        } else {
            this.showModelDropdown();
        }
    }

    private showModelDropdown() {
        this.hideAllDropdowns();
        
        if (!this.modelDropdown) {
            this.modelDropdown = this.container.createDiv({ cls: 'llm-unified-dropdown' });
        }
        
        this.modelDropdown.empty();
        this.modelDropdown.style.display = 'block';
        
        this.models.forEach(model => {
            const option = this.modelDropdown!.createDiv({ cls: 'llm-dropdown-option' });
            option.innerHTML = `
                <div class="llm-option-title">${model.label}</div>
                <div class="llm-option-desc">${model.description || model.provider || ''}</div>
            `;
            
            if (this.selectedModel === model.id) {
                option.addClass('selected');
            }
            
            option.addEventListener('click', () => {
                this.selectModel(model);
                this.hideModelDropdown();
            });
        });
        
        this.positionDropdown(this.modelDropdown, this.modelPill);
    }

    private hideModelDropdown() {
        if (this.modelDropdown) {
            this.modelDropdown.style.display = 'none';
        }
    }

    private selectModel(model: ModelConfig) {
        this.selectedModel = model.id;
        const span = this.modelPill.querySelector('span');
        if (span) {
            span.textContent = model.label;
        }
        this.modelPill.addClass('selected');
    }

    private toggleTemplateDropdown() {
        if (this.templateDropdown && this.templateDropdown.style.display !== 'none') {
            this.hideTemplateDropdown();
        } else {
            this.showTemplateDropdown();
        }
    }

    private showTemplateDropdown() {
        this.hideAllDropdowns();
        
        if (!this.templateDropdown) {
            this.templateDropdown = this.container.createDiv({ cls: 'llm-unified-dropdown' });
        }
        
        this.templateDropdown.empty();
        this.templateDropdown.style.display = 'block';
        
        this.templates.forEach(template => {
            const option = this.templateDropdown!.createDiv({ cls: 'llm-dropdown-option' });
            option.innerHTML = `
                <div class="llm-option-title">${template.label}</div>
                <div class="llm-option-desc">${template.description || ''}</div>
            `;
            
            if (this.selectedTemplate === template.id) {
                option.addClass('selected');
            }
            
            option.addEventListener('click', () => {
                this.selectTemplate(template);
                this.hideTemplateDropdown();
            });
        });
        
        this.positionDropdown(this.templateDropdown, this.templatePill);
    }

    private hideTemplateDropdown() {
        if (this.templateDropdown) {
            this.templateDropdown.style.display = 'none';
        }
    }

    private selectTemplate(template: TemplateConfig) {
        this.selectedTemplate = template.id;
        const span = this.templatePill.querySelector('span');
        if (span) {
            span.textContent = template.label;
        }
        
        if (template.id) {
            this.templatePill.addClass('selected');
        } else {
            this.templatePill.removeClass('selected');
        }
    }

    private toggleAttachmentPanel() {
        // TODO: Implement attachment panel
        new Notice('Attachment panel - TODO');
    }

    private toggleCIDPopup() {
        // TODO: Implement CID popup
        new Notice('CID popup - TODO');
    }

    private positionDropdown(dropdown: HTMLElement, anchor: HTMLElement) {
        const rect = anchor.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        
        dropdown.style.position = 'absolute';
        dropdown.style.top = (rect.bottom - containerRect.top + 5) + 'px';
        dropdown.style.left = (rect.left - containerRect.left) + 'px';
        dropdown.style.minWidth = rect.width + 'px';
    }

    private hideAllDropdowns() {
        this.hideCommandDropdown();
        this.hideModelDropdown();
        this.hideTemplateDropdown();
    }

    private insertCommand(command: string) {
        const cursorPosition = this.textarea.selectionStart;
        const textBeforeCursor = this.textarea.value.substring(0, cursorPosition - 1); // Remove @
        const textAfterCursor = this.textarea.value.substring(cursorPosition);
        
        this.textarea.value = textBeforeCursor + command + ' ' + textAfterCursor;
        this.textarea.focus();
        this.autoResizeTextarea();
    }

    private handleDroppedFiles(files: FileList) {
        // Dispatch event for parent to handle
        const event = new CustomEvent('llm-files-dropped', {
            detail: { files }
        });
        this.container.dispatchEvent(event);
    }

    private handleSendMessage() {
        const prompt = this.textarea.value.trim();
        if (!prompt) {
            new Notice('Please enter a message');
            return;
        }
        this.onSendMessage();
    }

    // Public methods
    setCommands(commands: Command[]) {
        this.commands = commands;
    }

    setModels(models: ModelConfig[]) {
        this.models = models;
        // Set default if none selected
        if (!this.selectedModel && models.length > 0) {
            this.selectModel(models[0]);
        }
    }

    setTemplates(templates: TemplateConfig[]) {
        this.templates = templates;
        // Set default to "No Template"
        const noTemplate = templates.find(t => t.id === '');
        if (noTemplate) {
            this.selectTemplate(noTemplate);
        }
    }

    getPromptValue(): string {
        return this.textarea.value;
    }

    setPromptValue(value: string) {
        this.textarea.value = value;
        this.autoResizeTextarea();
    }

    getModelValue(): string {
        return this.selectedModel;
    }

    getPatternValue(): string {
        return this.selectedTemplate;
    }

    getConversationId(): string {
        return this.conversationId;
    }

    setConversationId(id: string) {
        this.conversationId = id;
    }

    clearInputs() {
        this.textarea.value = '';
        this.autoResizeTextarea();
        // Reset template to "No Template"
        const noTemplate = this.templates.find(t => t.id === '');
        if (noTemplate) {
            this.selectTemplate(noTemplate);
        }
    }

    focus() {
        this.textarea.focus();
    }

    setLoading(loading: boolean) {
        this.sendButton.disabled = loading;
        this.textarea.disabled = loading;
        
        if (loading) {
            this.sendButton.innerHTML = 'Sending...';
            this.inputContainer.addClass('loading');
        } else {
            this.sendButton.innerHTML = SendIcon;
            this.inputContainer.removeClass('loading');
        }
    }

    getImages(): string[] {
        return this.attachedImages;
    }

    clearImages() {
        this.attachedImages = [];
    }

    addImage(imagePath: string) {
        this.attachedImages.push(imagePath);
    }

    clearConversationId() {
        this.conversationId = '';
    }

    setPatternValue(value: string) {
        this.selectedTemplate = value;
        const template = this.templates.find(t => t.id === value);
        if (template) {
            this.selectTemplate(template);
        }
    }

    setDefaultModel(model: string) {
        const modelConfig = this.models.find(m => m.id === model);
        if (modelConfig) {
            this.selectModel(modelConfig);
        }
    }
}
