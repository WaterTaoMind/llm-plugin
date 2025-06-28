import { Notice, App } from 'obsidian';
import { Command, MCPServerConnection } from '../../core/types';
import { SendIcon, PlusIcon, GetCidIcon } from '../../constants/icons';
import { joinPath, normalizePath, hasImageExtension } from '../../utils/pathUtils';
import { MCPClientService } from '../../services/MCPClientService';

interface ConfigData {
    models: Array<{id: string, label: string}>;
    templates: Array<{id: string, label: string}>;
}

export class InputArea {
    public container: HTMLElement;
    private app: App;
    private pluginDir: string;
    private unifiedInputContainer: HTMLElement;
    private promptInput: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
    private modelSelector: HTMLSelectElement;

    // Pills
    private toolsPill: HTMLButtonElement;
    private attachmentsPill: HTMLButtonElement;
    private cidPill: HTMLButtonElement;
    private templatePill: HTMLButtonElement;
    private mcpStatusPill: HTMLButtonElement;

    // Popups and dropdowns
    private dropdown: HTMLElement | null = null;
    private cidPopup: HTMLElement | null = null;
    private attachmentsPopup: HTMLElement | null = null;
    private templatePopup: HTMLElement | null = null;
    private mcpStatusPopup: HTMLElement | null = null;

    // Data
    private commands: Command[] = [];
    private attachedImages: string[] = [];
    private configData: ConfigData | null = null;
    private conversationId: string = '';
    private selectedTemplate: string = '';

    // Legacy elements for compatibility
    private conversationIdInput: HTMLInputElement;
    private patternInput: HTMLInputElement;
    private imagePreviewContainer: HTMLElement;
    private imagePathInput: HTMLInputElement;
    private addImageButton: HTMLButtonElement;
    private imageInputContainer: HTMLElement;

    // Event handlers
    public onSendMessage: () => void = () => {};
    public onGetConversationId: () => void = () => {};
    public onClearConversationId: () => void = () => {};

    // MCP integration
    private mcpClientService?: MCPClientService;

    constructor(container: HTMLElement, app: App, pluginDir: string) {
        this.container = container;
        this.app = app;
        this.pluginDir = pluginDir;
        this.loadConfiguration().then(() => {
            this.createUnifiedInputInterface();
        });
    }

    public async reloadConfiguration() {
        console.log('🔄 Manually reloading configuration...');
        await this.loadConfiguration();
        this.updateDropdowns();
        console.log('🔄 Configuration reload complete');
    }

    public debugConfiguration() {
        console.log('🐛 Debug Configuration:');
        console.log('🐛 Plugin Dir:', this.pluginDir);
        console.log('🐛 Config Data:', this.configData);
        console.log('🐛 Model Selector:', this.modelSelector);
        console.log('🐛 Selected Template:', this.selectedTemplate);
    }

    private updateDropdowns() {
        // Update model dropdown
        if (this.modelSelector && this.configData?.models) {
            this.modelSelector.empty();
            this.configData.models.forEach(model => {
                this.modelSelector!.createEl('option', {
                    value: model.id,
                    text: model.label
                });
            });
        }
    }

    private async loadConfiguration() {
        try {
            // Primary: Try to load from data.json file first
            // Use Node.js fs module for direct file access (cross-platform)
            const configPath = joinPath(this.pluginDir, 'data.json');
            console.log(`🔍 Attempting to load config from: ${configPath}`);
            console.log(`🔍 Plugin directory: ${this.pluginDir}`);

            // Try to read the file directly using Node.js fs
            try {
                const fs = require('fs');
                const configContent = fs.readFileSync(configPath, 'utf8');
                console.log(`🔍 Raw config content length: ${configContent.length}`);

                const fileConfig = JSON.parse(configContent);
                console.log(`🔍 Parsed config:`, fileConfig);

                // Extract models and templates from file config
                if (fileConfig.models && fileConfig.templates) {
                    this.configData = {
                        models: fileConfig.models,
                        templates: fileConfig.templates
                    };
                    console.log('✅ Successfully loaded config from data.json:');
                    console.log('📋 Models:', this.configData.models);
                    console.log('📋 Templates:', this.configData.templates);
                    return; // Success - exit early
                } else {
                    console.warn('⚠️ data.json exists but missing models/templates structure');
                    console.warn('⚠️ Available keys:', Object.keys(fileConfig));
                }
            } catch (fileError) {
                console.warn('⚠️ Failed to read data.json file:', fileError.message);
                console.warn('⚠️ File path attempted:', configPath);
            }

            // Fallback: Use hardcoded configuration if file loading fails
            console.log('📋 Using fallback configuration');
            this.configData = {
                models: [
                    { id: 'g25fp', label: 'Gemini 2.5 Flash Pro' },
                    { id: 'gpt-4o', label: 'GPT-4 Omni' },
                    { id: 'gpt-4.1', label: 'GPT-4.1' },
                    { id: 'sv3', label: 'DeepSeek-V3-0324' },
                    { id: 'sr1', label: 'DeepSeek-R1-0528' }
                ],
                templates: [
                    { id: 'summary', label: '文档总结' },
                    { id: 'en2zh', label: '英译中' },
                    { id: 'svg_vis', label: 'SVG可视化' },
                    { id: 'ch_condense', label: '要点提炼' },
                    { id: 'MindMap', label: '思维导图' },
                    { id: 'VisArg', label: '结构可视化' },
                    { id: 'MathFlowchart', label: '数学流程图' },
                    { id: 'zh2en', label: '中译英' }
                ]
            };

        } catch (error) {
            console.error('❌ Configuration loading failed:', error);

            // Minimal fallback for critical errors
            this.configData = {
                models: [
                    { id: 'gpt-4o', label: 'GPT-4 Omni' },
                    { id: 'custom', label: 'Custom' }
                ],
                templates: [
                    { id: 'summary', label: '文档总结' }
                ]
            };
        }
    }

    private createUnifiedInputInterface() {
        // Create the main unified input container
        this.unifiedInputContainer = this.container.createDiv({ cls: 'llm-unified-input-container' });

        // Create pills row (top-left)
        this.createFunctionPills();

        // Create main input area (center)
        this.createMainTextArea();

        // Create controls row (bottom-right)
        this.createControlsRow();

        // Create hidden legacy elements for compatibility
        this.createLegacyElements();

        // Image preview section (integrated within unified container)
        this.imagePreviewContainer = this.unifiedInputContainer.createDiv({ cls: 'llm-image-previews' });

        // Setup event handlers
        this.setupEventHandlers();
    }

    private createFunctionPills() {
        const pillsContainer = this.unifiedInputContainer.createDiv({ cls: 'llm-function-pills-container' });

        // CID pill (first - conversation context)
        this.cidPill = pillsContainer.createEl('button', {
            cls: 'llm-function-pill',
            text: 'CID'
        });

        // Tools pill (second - actions/commands)
        this.toolsPill = pillsContainer.createEl('button', {
            cls: 'llm-function-pill',
            text: '工具'
        });

        // Attachments pill (third - supporting materials)
        this.attachmentsPill = pillsContainer.createEl('button', {
            cls: 'llm-function-pill',
            text: '附件'
        });

        // Template pill (fourth - processing/formatting)
        this.templatePill = pillsContainer.createEl('button', {
            cls: 'llm-function-pill',
            text: '模板'
        });

        // MCP Status pill (fifth - MCP server status)
        this.mcpStatusPill = pillsContainer.createEl('button', {
            cls: 'llm-function-pill mcp-status-pill',
            text: 'MCP: 0/0'
        });
        this.mcpStatusPill.style.display = 'none'; // Hidden by default

        // Add visual indicators
        this.updateCidPillState();
        this.updateTemplatePillState();
        this.updateMCPStatusPill();
    }

    private createMainTextArea() {
        const textAreaContainer = this.unifiedInputContainer.createDiv({ cls: 'llm-textarea-container' });

        this.promptInput = textAreaContainer.createEl('textarea', {
            placeholder: 'Type your message here... (Ctrl+Enter for submit)',
            cls: 'llm-unified-prompt-input'
        });

        // Auto-resize functionality
        this.promptInput.style.height = 'auto';
        this.promptInput.style.minHeight = '20px';
        this.promptInput.style.maxHeight = '120px';
    }

    private createControlsRow() {
        const controlsContainer = this.unifiedInputContainer.createDiv({ cls: 'llm-controls-container' });

        // Model selector
        this.modelSelector = controlsContainer.createEl('select', { cls: 'llm-model-selector' });
        this.populateModelSelector();

        // Send button
        this.sendButton = controlsContainer.createEl('button', { cls: 'llm-unified-send-button' });
        this.sendButton.innerHTML = SendIcon;
    }

    private populateModelSelector() {
        if (!this.configData) return;

        // Clear existing options
        this.modelSelector.innerHTML = '';

        // Add models from config
        this.configData.models.forEach(model => {
            const option = this.modelSelector.createEl('option');
            option.value = model.id;
            option.textContent = model.label;
        });

        // Add custom option
        const customOption = this.modelSelector.createEl('option');
        customOption.value = 'custom';
        customOption.textContent = 'Custom';

        // Set default
        this.modelSelector.value = this.configData.models[0]?.id || 'custom';
    }



    private setupEventHandlers() {
        // Prompt input handlers
        this.promptInput.addEventListener('input', (e) => this.handlePromptInput(e as InputEvent));
        this.promptInput.addEventListener('keydown', (e) => this.handlePromptKeydown(e));

        // Drag and drop for images
        this.promptInput.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.promptInput.classList.add('drag-over');
        });

        this.promptInput.addEventListener('dragleave', () => {
            this.promptInput.classList.remove('drag-over');
        });

        this.promptInput.addEventListener('drop', (e) => {
            e.preventDefault();
            this.promptInput.classList.remove('drag-over');

            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                this.handleDroppedFiles(e.dataTransfer.files);
            }
        });

        // Pill click handlers
        this.toolsPill.addEventListener('click', () => this.showToolsMenu());
        this.templatePill.addEventListener('click', () => this.showTemplateMenu());
        this.attachmentsPill.addEventListener('click', () => this.showAttachmentsMenu());
        this.cidPill.addEventListener('click', () => this.showCidMenu());

        // Send button
        this.sendButton.addEventListener('click', () => this.handleSendMessage());

        // Model selector change
        this.modelSelector.addEventListener('change', () => this.handleModelChange());
    }

    private showToolsMenu() {
        // Show existing command dropdown
        this.showCommandDropdown();
    }

    private showTemplateMenu() {
        if (this.templatePopup) {
            this.hideTemplateMenu();
            return;
        }

        this.templatePopup = document.createElement('div');
        this.templatePopup.className = 'llm-template-popup';

        // Add template options (excluding "No Template" and "Custom")
        if (this.configData?.templates) {
            this.configData.templates.forEach(template => {
                const templateBtn = this.templatePopup!.createEl('button', {
                    cls: 'llm-popup-option',
                    text: template.label
                });
                templateBtn.addEventListener('click', () => {
                    this.selectedTemplate = template.id;
                    this.updateTemplatePillState();
                    this.hideTemplateMenu();
                });
            });
        }

        // Position and show popup
        this.positionPopup(this.templatePopup, this.templatePill);
        document.body.appendChild(this.templatePopup);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick.bind(this));
        }, 0);
    }

    private showAttachmentsMenu() {
        if (this.attachmentsPopup) {
            this.hideAttachmentsMenu();
            return;
        }

        this.attachmentsPopup = document.createElement('div');
        this.attachmentsPopup.className = 'llm-attachments-popup';

        // File picker option
        const filePickerBtn = this.attachmentsPopup.createEl('button', {
            cls: 'llm-popup-option',
            text: 'Choose Files'
        });
        filePickerBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,text/*,.pdf,.doc,.docx';
            input.multiple = true;
            input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (files) {
                    this.handleDroppedFiles(files);
                }
            };
            input.click();
            this.hideAttachmentsMenu();
        });

        // Path input option
        const pathInputBtn = this.attachmentsPopup.createEl('button', {
            cls: 'llm-popup-option',
            text: 'Enter Path'
        });
        pathInputBtn.addEventListener('click', () => {
            const path = prompt('Enter file path:');
            if (path) {
                this.addImage(path);
            }
            this.hideAttachmentsMenu();
        });

        // Position and show popup
        this.positionPopup(this.attachmentsPopup, this.attachmentsPill);
        document.body.appendChild(this.attachmentsPopup);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick.bind(this));
        }, 0);
    }

    private showCidMenu() {
        if (this.cidPopup) {
            this.hideCidMenu();
            return;
        }

        this.cidPopup = document.createElement('div');
        this.cidPopup.className = 'llm-cid-popup';

        // Current CID input
        const cidLabel = this.cidPopup.createEl('div', {
            cls: 'llm-popup-label',
            text: 'Conversation ID:'
        });

        const cidInput = this.cidPopup.createEl('input', {
            type: 'text',
            placeholder: 'Enter conversation ID',
            cls: 'llm-popup-input'
        });
        cidInput.value = this.conversationId;
        cidInput.addEventListener('input', (e) => {
            this.conversationId = (e.target as HTMLInputElement).value;
            this.updateCidPillState();
        });

        // Action buttons
        const buttonsContainer = this.cidPopup.createDiv({ cls: 'llm-popup-buttons' });

        const getFromNoteBtn = buttonsContainer.createEl('button', {
            cls: 'llm-popup-button',
            text: 'Get from Note'
        });
        getFromNoteBtn.addEventListener('click', () => {
            this.onGetConversationId();
            this.hideCidMenu();
        });

        const clearBtn = buttonsContainer.createEl('button', {
            cls: 'llm-popup-button',
            text: 'Clear'
        });
        clearBtn.addEventListener('click', () => {
            this.conversationId = '';
            cidInput.value = '';
            this.updateCidPillState();
            this.onClearConversationId();
            this.hideCidMenu();
        });

        // Position and show popup
        this.positionPopup(this.cidPopup, this.cidPill);
        document.body.appendChild(this.cidPopup);

        // Focus input
        cidInput.focus();

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick.bind(this));
        }, 0);
    }

    private positionPopup(popup: HTMLElement, anchor: HTMLElement) {
        const rect = anchor.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.top = `${rect.bottom + 5}px`;
        popup.style.left = `${rect.left}px`;
        popup.style.zIndex = '1000';
    }

    private handleOutsideClick(e: MouseEvent) {
        const target = e.target as HTMLElement;

        if (this.attachmentsPopup && !this.attachmentsPopup.contains(target) && !this.attachmentsPill.contains(target)) {
            this.hideAttachmentsMenu();
        }

        if (this.templatePopup && !this.templatePopup.contains(target) && !this.templatePill.contains(target)) {
            this.hideTemplateMenu();
        }

        if (this.cidPopup && !this.cidPopup.contains(target) && !this.cidPill.contains(target)) {
            this.hideCidMenu();
        }
    }

    private hideAttachmentsMenu() {
        if (this.attachmentsPopup) {
            document.body.removeChild(this.attachmentsPopup);
            this.attachmentsPopup = null;
            document.removeEventListener('click', this.handleOutsideClick.bind(this));
        }
    }

    private hideCidMenu() {
        if (this.cidPopup) {
            document.body.removeChild(this.cidPopup);
            this.cidPopup = null;
            document.removeEventListener('click', this.handleOutsideClick.bind(this));
        }
    }

    private hideTemplateMenu() {
        if (this.templatePopup) {
            document.body.removeChild(this.templatePopup);
            this.templatePopup = null;
            document.removeEventListener('click', this.handleOutsideClick.bind(this));
        }
    }

    private updateCidPillState() {
        if (this.conversationId) {
            this.cidPill.classList.add('active');
            this.cidPill.textContent = `CID: ${this.conversationId.slice(0, 8)}...`;
        } else {
            this.cidPill.classList.remove('active');
            this.cidPill.textContent = 'CID';
        }
    }

    private updateTemplatePillState() {
        if (this.selectedTemplate) {
            this.templatePill.classList.add('active');
            // Find the template label
            const template = this.configData?.templates.find(t => t.id === this.selectedTemplate);
            const label = template?.label || this.selectedTemplate;
            this.templatePill.textContent = `模板: ${label.length > 8 ? label.slice(0, 8) + '...' : label}`;
        } else {
            this.templatePill.classList.remove('active');
            this.templatePill.textContent = '模板';
        }
    }

    private handleModelChange() {
        if (this.modelSelector.value === 'custom') {
            const customModel = prompt('Enter custom model ID:');
            if (customModel) {
                // Add custom option temporarily
                const option = this.modelSelector.createEl('option');
                option.value = customModel;
                option.textContent = customModel;
                this.modelSelector.value = customModel;
            } else {
                // Reset to first option if cancelled
                this.modelSelector.value = this.configData?.models[0]?.id || '';
            }
        }
    }



    private createLegacyElements() {
        // Create hidden elements for backward compatibility
        const hiddenContainer = this.container.createDiv({ cls: 'llm-legacy-hidden' });
        hiddenContainer.style.display = 'none';

        this.conversationIdInput = hiddenContainer.createEl('input', { type: 'text' });
        this.patternInput = hiddenContainer.createEl('input', { type: 'text' });
        this.imagePathInput = hiddenContainer.createEl('input', { type: 'text' });
        this.imageInputContainer = hiddenContainer.createDiv();
        this.addImageButton = hiddenContainer.createEl('button');
    }

    private addImageFromInput() {
        const path = this.imagePathInput.value.trim();
        if (path) {
            // Mark this input as having an image and create a new one if needed
            this.imagePathInput.classList.add('has-image');
            this.validateImagePath(this.imagePathInput);

            // Create a new input field for the next image
            this.addImageInput();

            this.updateAddImageButtonVisibility();
            this.renderImagePreviews();
            new Notice('Image path added');
        }
    }

    private addImageInput() {
        if (!this.imageInputContainer) return;

        // Check if we already have 5 inputs
        const allImageInputs = Array.from(this.imageInputContainer.children)
            .filter(el => el.tagName === 'INPUT') as HTMLInputElement[];

        if (allImageInputs.length >= 5) {
            new Notice('Maximum of 5 image inputs allowed');
            return;
        }

        const imageInput = this.imageInputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter document path',
            cls: 'llm-image-input'
        });

        // Add input validation
        imageInput.addEventListener('input', () => {
            this.updateAddImageButtonVisibility();
            this.validateImagePath(imageInput);
        });

        // Handle Enter key
        imageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const path = imageInput.value.trim();
                if (path) {
                    // Mark this input as having an image and create a new one if needed
                    imageInput.classList.add('has-image');
                    this.validateImagePath(imageInput);

                    // Create a new input field for the next image (if under limit)
                    this.addImageInput();

                    this.updateAddImageButtonVisibility();
                    this.renderImagePreviews();
                    new Notice('Image path added');
                }
            }
        });

        this.updateAddImageButtonVisibility();
    }

    private updateAddImageButtonVisibility() {
        const allImageInputs = Array.from(this.imageInputContainer?.children || [])
            .filter(el => el.tagName === 'INPUT') as HTMLInputElement[];
        const totalInputs = allImageInputs.length;

        if (this.addImageButton) {
            // Show button if we have less than 5 inputs total
            this.addImageButton.style.display = totalInputs < 5 ? 'block' : 'none';
        }
    }

    private handlePromptInput(e: InputEvent) {
        const target = e.target as HTMLTextAreaElement;
        const cursorPosition = target.selectionStart;
        const textBeforeCursor = target.value.substring(0, cursorPosition);

        // Auto-resize textarea
        this.autoResizeTextarea();

        // Handle @ command autocomplete
        if (textBeforeCursor.endsWith('@')) {
            this.showCommandDropdown();
        } else {
            this.hideCommandDropdown();
        }
    }

    private handlePromptKeydown(e: KeyboardEvent) {
        // Handle dropdown navigation first
        if (this.dropdown && this.dropdown.style.display !== 'none') {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                // Handle selection navigation
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selected = this.dropdown.querySelector('.selected');
                if (selected) {
                    this.insertCommand(selected.textContent || '');
                }
                return;
            } else if (e.key === 'Escape') {
                this.hideCommandDropdown();
                return;
            }
        }

        // Handle Ctrl+Enter for submit
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            this.handleSendMessage();
        } else if (e.key === 'ArrowUp' && this.promptInput.value === '') {
            // History navigation when input is empty
            e.preventDefault();
            // TODO: Implement history navigation
        } else if (e.key === 'Escape') {
            // Clear input on Escape
            this.promptInput.value = '';
            this.autoResizeTextarea();
        }
    }

    private autoResizeTextarea() {
        const textarea = this.promptInput;
        textarea.style.height = 'auto';
        const newHeight = Math.min(Math.max(textarea.scrollHeight, 20), 120);
        textarea.style.height = newHeight + 'px';
    }

    private showCommandDropdown() {
        if (!this.dropdown) {
            this.dropdown = document.createElement('div');
            this.dropdown.className = 'llm-command-dropdown';
            this.promptInput.parentElement?.appendChild(this.dropdown);
        }

        this.dropdown.style.display = 'block';
        this.dropdown.style.top = `${this.promptInput.offsetTop - this.dropdown.offsetHeight}px`;
        this.dropdown.style.left = `${this.promptInput.offsetLeft}px`;

        this.dropdown.innerHTML = '';
        this.commands.forEach(cmd => {
            const option = document.createElement('div');
            option.className = 'llm-command-option';
            option.textContent = `${cmd.name} - ${cmd.description}`;
            option.onclick = () => this.insertCommand(cmd.name);
            this.dropdown!.appendChild(option);
        });
    }

    private hideCommandDropdown() {
        if (this.dropdown) {
            this.dropdown.style.display = 'none';
        }
    }

    private insertCommand(command: string) {
        const cursorPosition = this.promptInput.selectionStart;
        const textBeforeCursor = this.promptInput.value.substring(0, cursorPosition - 1); // Remove @
        const textAfterCursor = this.promptInput.value.substring(cursorPosition);

        this.promptInput.value = textBeforeCursor + command + ' ' + textAfterCursor;
        this.hideCommandDropdown();
        this.promptInput.focus();
    }

    private handleDroppedFiles(files: FileList) {
        // Dispatch event for parent to handle
        const event = new CustomEvent('llm-files-dropped', {
            detail: { files }
        });
        this.container.dispatchEvent(event);
    }

    public addImage(imagePath: string) {
        this.attachedImages.push(imagePath);
        this.renderImagePreviews();
    }

    public getImages(): string[] {
        // Get all images from both sources - manually entered paths and drag-dropped images
        const manualImagePaths = Array.from(this.imageInputContainer?.children || [])
            .filter(el => el.tagName === 'INPUT')
            .map(input => (input as HTMLInputElement).value)
            .filter(path => path.trim() !== '');

        // Combine with drag-dropped images
        return [...this.attachedImages, ...manualImagePaths];
    }

    public clearImages() {
        this.attachedImages = [];

        // Clear all image input fields
        if (this.imageInputContainer) {
            const allImageInputs = Array.from(this.imageInputContainer.children)
                .filter(el => el.tagName === 'INPUT') as HTMLInputElement[];
            allImageInputs.forEach(input => {
                input.value = '';
                input.classList.remove('has-image', 'data-url-image', 'path-image', 'invalid-image');
            });
        }

        this.renderImagePreviews();
        this.updateAddImageButtonVisibility();
    }

    private renderImagePreviews() {
        this.imagePreviewContainer.empty();

        // Render drag-dropped images
        this.attachedImages.forEach((imagePath, index) => {
            const wrapper = this.imagePreviewContainer.createDiv({ cls: 'llm-image-preview-wrapper' });

            // Create thumbnail
            const img = wrapper.createEl('img', { cls: 'llm-image-thumbnail' });
            if (imagePath.startsWith('data:')) {
                img.src = imagePath;
            } else {
                // For file paths, use a placeholder icon
                img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
            }

            // Add path label
            const label = wrapper.createDiv({ cls: 'llm-image-label' });
            label.textContent = imagePath.length > 30 ? '...' + imagePath.slice(-30) : imagePath;

            // Create delete button
            const deleteBtn = wrapper.createEl('button', { cls: 'llm-image-delete-btn' });
            deleteBtn.innerHTML = '×';
            deleteBtn.onclick = () => {
                this.attachedImages.splice(index, 1);
                this.renderImagePreviews();
                this.updateAddImageButtonVisibility();
            };
        });

        // Render manually entered image paths from input fields
        const allImageInputs = Array.from(this.imageInputContainer?.children || [])
            .filter(el => el.tagName === 'INPUT') as HTMLInputElement[];
        const filledInputs = allImageInputs.filter(input => input.value.trim() !== '');

        filledInputs.forEach((input, index) => {
            const imagePath = input.value.trim();
            const wrapper = this.imagePreviewContainer.createDiv({ cls: 'llm-image-preview-wrapper manual-path' });

            // Create icon for manual paths
            const icon = wrapper.createEl('div', { cls: 'llm-manual-path-icon' });
            icon.innerHTML = '📄'; // Document icon

            // Add path label
            const label = wrapper.createDiv({ cls: 'llm-image-label' });
            label.textContent = imagePath.length > 30 ? '...' + imagePath.slice(-30) : imagePath;

            // Create delete button
            const deleteBtn = wrapper.createEl('button', { cls: 'llm-image-delete-btn' });
            deleteBtn.innerHTML = '×';
            deleteBtn.onclick = () => {
                // Clear the input field and remove styling
                input.value = '';
                input.classList.remove('has-image', 'data-url-image', 'path-image', 'invalid-image');
                this.renderImagePreviews();
                this.updateAddImageButtonVisibility();
            };
        });

        // Show/hide the container based on whether there are images
        const totalImages = this.attachedImages.length + filledInputs.length;
        if (totalImages > 0) {
            this.imagePreviewContainer.style.display = 'flex';
        } else {
            this.imagePreviewContainer.style.display = 'none';
        }
    }

    private handleSendMessage() {
        const prompt = this.promptInput.value.trim();
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

    clearInputs() {
        this.promptInput.value = '';
        this.patternInput.value = '';
        this.clearImages();
    }

    private validateImagePath(input: HTMLInputElement) {
        const path = input.value.trim();

        // Remove all validation classes first
        input.classList.remove('data-url-image', 'path-image', 'invalid-image');

        if (!path) {
            return;
        }

        // Check if it's a data URL (base64 image)
        if (path.startsWith('data:image/')) {
            input.classList.add('data-url-image');
            return;
        }

        // Check if it's a valid file path using cross-platform utility
        if (hasImageExtension(path)) {
            input.classList.add('path-image');
        } else {
            input.classList.add('invalid-image');
        }
    }

    getPromptValue(): string {
        return this.promptInput.value;
    }

    setPromptValue(value: string) {
        this.promptInput.value = value;
    }

    focus() {
        this.promptInput.focus();
    }

    setLoading(loading: boolean) {
        this.sendButton.disabled = loading;
        this.promptInput.disabled = loading;

        if (loading) {
            this.sendButton.innerHTML = 'Sending...';
        } else {
            this.sendButton.innerHTML = SendIcon;
        }
    }

    setDefaultModel(model: string) {
        if (this.modelSelector && !this.modelSelector.value) {
            this.modelSelector.value = model;
        }
    }

    getModelValue(): string {
        return this.modelSelector?.value || '';
    }

    getPatternValue(): string {
        return this.selectedTemplate;
    }

    setPatternValue(value: string) {
        // Clear the template selection (used after sending message)
        this.selectedTemplate = '';
        this.updateTemplatePillState();
    }

    getConversationId(): string {
        return this.conversationId;
    }

    setConversationId(id: string) {
        this.conversationId = id;
        this.updateCidPillState();
        if (this.conversationIdInput) {
            this.conversationIdInput.value = id;
        }
    }

    clearConversationId() {
        this.conversationId = '';
        this.updateCidPillState();
        if (this.conversationIdInput) {
            this.conversationIdInput.value = '';
        }
    }

    /**
     * Set MCP client service for status monitoring
     */
    setMCPClientService(mcpClientService: MCPClientService): void {
        this.mcpClientService = mcpClientService;
        this.updateMCPStatusPill();
    }

    /**
     * Update MCP status pill
     */
    private updateMCPStatusPill(): void {
        if (!this.mcpStatusPill) return;

        if (!this.mcpClientService) {
            this.mcpStatusPill.style.display = 'none';
            return;
        }

        const stats = this.mcpClientService.getStats();
        const isConnected = stats.connectedServers > 0;

        this.mcpStatusPill.style.display = 'flex';
        this.mcpStatusPill.textContent = `MCP: ${stats.connectedServers}/${stats.totalServers}`;

        if (isConnected) {
            this.mcpStatusPill.classList.remove('mcp-disconnected');
            this.mcpStatusPill.classList.add('mcp-connected');
            this.mcpStatusPill.title = `${stats.connectedServers} MCP servers connected, ${stats.totalTools} tools available`;
        } else {
            this.mcpStatusPill.classList.remove('mcp-connected');
            this.mcpStatusPill.classList.add('mcp-disconnected');
            this.mcpStatusPill.title = 'No MCP servers connected';
        }
    }
}
