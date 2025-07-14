import { Node } from "pocketflow";
import { GoogleGenAI, SafetyFilterLevel } from "@google/genai";
import { 
    AgentSharedState, 
    GeneratedImage, 
    ImageGenerationConfig,
    AgentProgressEvent,
    LLMProvider 
} from '../types';

/**
 * Interface for unified image processing request data
 * Supports both generation (text → image) and editing (text + image → image)
 */
interface ImageRequest {
    type: 'generation' | 'editing';
    prompt: string;
    config: ImageGenerationConfig;
    sourceImage?: {
        path: string;
        data: string;          // Base64 encoded image data
        mimeType: string;      // 'image/jpeg', 'image/png', etc.
    };
    editInstructions?: string; // Specific editing instructions
}

/**
 * Legacy interface for backward compatibility
 */
interface ImageGenerationRequest extends ImageRequest {
    // Maintains compatibility with existing code
}

/**
 * Unified PocketFlow Node for Gemini image generation and editing using official Google GenAI SDK
 * Supports both text-to-image generation and text+image-to-image editing
 * Uses the official SDK for better compatibility and reliability
 */
export class GeminiImageNode extends Node<AgentSharedState> {
    private geminiClient: GoogleGenAI;

    constructor(
        private apiKey: string,
        private llmProvider: LLMProvider,
        maxRetries: number = 3,
        waitTime: number = 2
    ) {
        super(maxRetries, waitTime);
        this.geminiClient = new GoogleGenAI({ apiKey: this.apiKey });
    }

    /**
     * Preparation phase: Determine request type and prepare image request
     * Supports both generation (text → image) and editing (text + image → image)
     */
    async prep(shared: AgentSharedState): Promise<ImageRequest> {
        console.log('🎨 GeminiImageNode: Preparing unified image request');
        
        // Determine if this is generation or editing
        const requestType = this.detectRequestType(shared);
        console.log(`📋 Detected request type: ${requestType}`);
        
        if (requestType === 'editing') {
            return await this.prepareEditingRequest(shared);
        } else {
            return await this.prepareGenerationRequest(shared);
        }
    }

    /**
     * Prepare image generation request (existing logic)
     */
    private async prepareGenerationRequest(shared: AgentSharedState): Promise<ImageRequest> {
        console.log('🖼️ Preparing image generation request');
        
        // Extract image prompt from user request or current context
        const basePrompt = this.extractImagePrompt(shared);
        
        // Enhance prompt using LLM provider for high-quality results
        const enhancedPrompt = await this.enhancePromptQuality(basePrompt, shared);
        
        // Get configuration with sensible defaults optimized for quality
        const config: ImageGenerationConfig = {
            aspectRatio: shared.imageConfig?.aspectRatio || '16:9',
            numberOfImages: shared.imageConfig?.numberOfImages || 1,
            safetyFilterLevel: shared.imageConfig?.safetyFilterLevel || 'BLOCK_MEDIUM_AND_ABOVE'
        };

        // Emit progress event
        this.emitProgress(shared, 'action_start', {
            action: 'generate_image',
            tool: 'process_image',
            server: 'gemini-sdk',
            justification: 'Generating visual content using Gemini image generation API',
            prompt: this.truncateText(enhancedPrompt, 100),
            config: config
        });

        return {
            type: 'generation',
            prompt: enhancedPrompt,
            config
        };
    }

    /**
     * Prepare image editing request (new functionality)
     */
    private async prepareEditingRequest(shared: AgentSharedState): Promise<ImageRequest> {
        console.log('✏️ Preparing image editing request');
        
        const userRequest = shared.userRequest || '';
        
        // Resolve source image
        const sourceImage = await this.resolveSourceImage(userRequest, shared);
        if (!sourceImage) {
            throw new Error('No source image found for editing request');
        }
        
        // Extract editing instructions
        const editInstructions = this.extractEditInstructions(userRequest);
        
        // Enhance editing prompt
        const enhancedPrompt = await this.enhanceEditingPrompt(editInstructions, shared);
        
        // Use same config as generation
        const config: ImageGenerationConfig = {
            aspectRatio: shared.imageConfig?.aspectRatio || '16:9',
            numberOfImages: shared.imageConfig?.numberOfImages || 1,
            safetyFilterLevel: shared.imageConfig?.safetyFilterLevel || 'BLOCK_MEDIUM_AND_ABOVE'
        };

        // Emit progress event
        this.emitProgress(shared, 'action_start', {
            action: 'edit_image',
            tool: 'process_image',
            server: 'gemini-sdk',
            justification: 'Editing image using Gemini image editing API',
            prompt: this.truncateText(enhancedPrompt, 100),
            sourceImage: sourceImage.path,
            config: config
        });

        return {
            type: 'editing',
            prompt: enhancedPrompt,
            config,
            sourceImage,
            editInstructions
        };
    }

    /**
     * Execution phase: Call Gemini API for image processing using official SDK
     * Supports both generation and editing based on request type
     */
    async exec(request: ImageRequest): Promise<GeneratedImage[]> {
        console.log(`🔧 GeminiImageNode: Executing ${request.type} (Official SDK)`);
        console.log(`📝 Prompt: ${this.truncateText(request.prompt, 200)}`);
        console.log(`⚙️ Config:`, request.config);

        if (!this.apiKey) {
            throw new Error('Gemini API key is required for image processing');
        }

        try {
            if (request.type === 'editing') {
                return await this.executeEditing(request);
            } else {
                return await this.executeGeneration(request);
            }
        } catch (error) {
            console.error(`❌ Image ${request.type} failed:`, error);
            throw new Error(`Gemini image ${request.type} failed: ${error.message}`);
        }
    }

    /**
     * Execute image generation (text → image)
     */
    private async executeGeneration(request: ImageRequest): Promise<GeneratedImage[]> {
        console.log('🖼️ Executing image generation');
        
        // Use the official Google GenAI SDK as per documentation
        const response = await this.geminiClient.models.generateContent({
            model: 'gemini-2.0-flash-preview-image-generation',
            contents: [{ parts: [{ text: request.prompt }] }],
            config: {
                responseModalities: ['TEXT', 'IMAGE']
            }
        });
        
        return this.processResponse(response, request, 'generation');
    }

    /**
     * Execute image editing (text + image → image)
     */
    private async executeEditing(request: ImageRequest): Promise<GeneratedImage[]> {
        console.log('✏️ Executing image editing');
        
        if (!request.sourceImage) {
            throw new Error('Source image required for editing');
        }
        
        // Use the official Google GenAI SDK with text + image input
        const response = await this.geminiClient.models.generateContent({
            model: 'gemini-2.0-flash-preview-image-generation',
            contents: [{
                parts: [
                    { text: request.prompt },
                    {
                        inlineData: {
                            mimeType: request.sourceImage.mimeType,
                            data: request.sourceImage.data
                        }
                    }
                ]
            }],
            config: {
                responseModalities: ['TEXT', 'IMAGE']
            }
        });
        
        return this.processResponse(response, request, 'editing');
    }

    /**
     * Process API response and extract images
     */
    private processResponse(response: any, request: ImageRequest, type: 'generation' | 'editing'): GeneratedImage[] {
        const processedImages: GeneratedImage[] = [];
        
        if (response.candidates) {
            for (const [candidateIndex, candidate] of response.candidates.entries()) {
                if (candidate.content?.parts) {
                    for (const [partIndex, part] of candidate.content.parts.entries()) {
                        if (part.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) {
                            const processedImage: GeneratedImage = {
                                id: `gemini-${type}-${Date.now()}-${candidateIndex}-${partIndex}`,
                                prompt: request.prompt,
                                imageBytes: part.inlineData.data,
                                format: part.inlineData.mimeType,
                                aspectRatio: request.config.aspectRatio || '1:1',
                                safetyFiltered: candidate.finishReason === 'SAFETY',
                                safetyReason: candidate.finishReason === 'SAFETY' ? 'Content filtered by safety settings' : undefined,
                                generatedAt: Date.now()
                            };
                            processedImages.push(processedImage);
                        }
                    }
                }
            }
        }

        console.log(`✅ Processed ${processedImages.length} images via ${type}`);
        return processedImages;
    }

    /**
     * Post-processing phase: Update shared state and determine next action
     */
    async post(
        shared: AgentSharedState,
        request: ImageRequest,
        images: GeneratedImage[]
    ): Promise<string | undefined> {
        console.log(`📋 GeminiImageNode: Post-processing ${request.type} results`);

        // Update shared state with generated images
        if (!shared.generatedImages) {
            shared.generatedImages = [];
        }
        shared.generatedImages.push(...images);

        // NEW: Save images to local files and store file paths
        const savedImagePaths: string[] = [];
        const saveErrors: string[] = [];
        
        for (const image of images) {
            try {
                const imagePath = await this.saveImageToFile(image, shared);
                savedImagePaths.push(imagePath);
                
                // Add relative path to image metadata for Markdown references
                const relativePath = this.convertToRelativePath(imagePath, shared);
                image.localFilePath = relativePath;
                console.log(`✅ Successfully saved image ${image.id} to: ${imagePath} (relative: ${relativePath})`);
            } catch (error) {
                const errorMsg = `Failed to save image ${image.id}: ${error.message}`;
                console.error(`❌ ${errorMsg}`);
                saveErrors.push(errorMsg);
                // Continue processing other images even if one fails
            }
        }
        
        // Log save summary
        console.log(`📊 Image save summary: ${savedImagePaths.length}/${images.length} images saved successfully`);
        if (saveErrors.length > 0) {
            console.warn(`⚠️ Save errors encountered:`, saveErrors);
        }
        
        // Store paths in shared state for reasoning node access
        // Convert absolute paths to relative paths for Markdown references
        const relativePaths = savedImagePaths.map(path => this.convertToRelativePath(path, shared));
        
        if (savedImagePaths.length > 0) {
            if (!shared.generatedImagePaths) {
                shared.generatedImagePaths = [];
            }
            shared.generatedImagePaths.push(...relativePaths);
        }

        // Add to action history for agent reference
        const actionResult = {
            step: shared.currentStep || 0,
            stepType: 'action' as const,
            server: 'gemini-sdk',
            tool: request.type === 'editing' ? 'edit_images' : 'generate_images',
            parameters: {
                prompt: request.prompt,
                aspectRatio: request.config.aspectRatio,
                numberOfImages: request.config.numberOfImages,
                // NEW: Include relative image file paths in action result for Markdown
                imagePaths: relativePaths
            },
            result: this.formatImageResults(images, relativePaths),
            justification: 'Generated visual content using Gemini official SDK',
            success: images.length > 0,
            historyId: `gemini-img-sdk-${Date.now()}`
        };

        if (!shared.actionHistory) {
            shared.actionHistory = [];
        }
        shared.actionHistory.push(actionResult);

        // Emit completion progress
        this.emitProgress(shared, 'action_complete', {
            action: 'generate_image',
            tool: 'generate_images',
            server: 'gemini-sdk',
            success: images.length > 0,
            result: this.formatImageResults(images),
            imageCount: images.length,
            safetyFiltered: images.filter(img => img.safetyFiltered).length
        });

        // Determine next action based on results
        if (images.length === 0) {
            console.log('⚠️ No images generated - this may indicate safety filtering');
            return undefined; // End workflow if no images generated
        }

        console.log(`🎉 Successfully generated ${images.length} image(s) via REST API`);
        return 'default'; // Continue to next step in workflow
    }

    /**
     * Fallback method when generation fails after all retries
     */
    async execFallback(
        request: ImageGenerationRequest, 
        error: Error
    ): Promise<GeneratedImage[]> {
        console.log('🔄 Using image generation fallback (REST API)...');
        
        // Try with a simpler, more generic prompt
        const simplePrompt = this.simplifyPrompt(request.prompt);
        console.log(`📝 Fallback prompt: ${simplePrompt}`);

        try {
            const response = await this.geminiClient.models.generateContent({
                model: 'gemini-2.0-flash-preview-image-generation',
                contents: [{ parts: [{ text: simplePrompt }] }],
                config: {
                    responseModalities: ['TEXT', 'IMAGE']
                }
            });

            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) {
                        return [{
                            id: `gemini-img-sdk-fallback-${Date.now()}`,
                            prompt: simplePrompt,
                            imageBytes: part.inlineData.data,
                            format: part.inlineData.mimeType,
                            aspectRatio: '1:1',
                            safetyFiltered: false,
                            generatedAt: Date.now()
                        }];
                    }
                }
            }
        } catch (fallbackError) {
            console.error('❌ Fallback generation also failed:', fallbackError);
        }

        // Return empty array if fallback fails
        return [];
    }

    /**
     * Extract image generation prompt from user request and context
     */
    private extractImagePrompt(shared: AgentSharedState): string {
        console.log('🔍 DEBUG: extractImagePrompt called');
        console.log('🔍 DEBUG: shared.currentImagePrompt:', shared.currentImagePrompt);
        
        // Check if there's a specific image prompt set
        if (shared.currentImagePrompt) {
            console.log('🔍 DEBUG: Using shared.currentImagePrompt');
            return shared.currentImagePrompt;
        }

        // Extract from user request
        const userRequest = shared.userRequest || '';
        console.log('🔍 DEBUG: Using userRequest:', userRequest);
        
        // Look for explicit image generation requests
        const imageKeywords = [
            'generate image', 'create image', 'draw', 'illustrate', 
            'diagram', 'chart', 'visualization', 'picture', 'graphic'
        ];
        
        let extractedPrompt = userRequest;
        
        if (imageKeywords.some(keyword => userRequest.toLowerCase().includes(keyword))) {
            // Remove the trigger words and return the descriptive part
            extractedPrompt = userRequest
                .replace(/(?:generate|create|draw|make|show me)?\s*(?:an?|the)?\s*(?:image|picture|diagram|chart|visualization|graphic)\s*(?:of|showing|that shows|about)?\s*/gi, '')
                .trim() || userRequest;
        }

        console.log('🔍 DEBUG: Extracted prompt:', extractedPrompt);
        return extractedPrompt;
    }

    /**
     * Enhance prompt using LLM-based creative enhancement for high-quality image generation
     */
    private async enhancePromptQuality(basePrompt: string, shared: AgentSharedState): Promise<string> {
        console.log('🎨 DEBUG: enhancePromptQuality called with:', basePrompt);
        console.log('🎨 DEBUG: Using LLM-based prompt enhancement for high-quality results');
        
        try {
            const enhancementPrompt = `You are an expert at writing image generation prompts for AI image models like Gemini, Midjourney, and DALL-E. Your task is to enhance the given prompt to produce the highest quality, most visually stunning images possible.

Transform this basic prompt into a detailed, high-quality image generation prompt:
"${basePrompt}"

Guidelines for enhancement:
- Add specific visual quality keywords: photorealistic, high resolution, 8k, sharp focus, cinematic lighting
- Include artistic style directions: award-winning photography, masterpiece quality, dramatic composition  
- Add atmospheric and lighting details: vibrant colors, stunning natural beauty, rich detail
- Specify technical aspects: professional rendering, gallery-worthy quality
- Keep the core subject and intent unchanged
- Make it vivid and descriptive but concise
- Focus on visual excellence and artistic quality

Respond with ONLY the enhanced prompt, no explanations or quotes.`;

            const enhancedPrompt = await this.llmProvider.callLLM(enhancementPrompt);
            
            console.log(`🎨 LLM Enhanced: "${basePrompt}" → "${enhancedPrompt}"`);
            return enhancedPrompt;
            
        } catch (error) {
            console.error('❌ LLM enhancement failed, using fallback:', error);
            // Fallback to rule-based enhancement if LLM fails
            return this.creativeQualityEnhancement(basePrompt);
        }
    }

    /**
     * Creative rule-based enhancement covering multiple visual styles
     */
    private creativeQualityEnhancement(basePrompt: string): string {
        // Detect content type and apply appropriate creative enhancement
        const prompt = basePrompt.toLowerCase();
        
        // Technical/Diagram content
        if (/(?:diagram|chart|graph|flowchart|technical|schematic|blueprint)/i.test(prompt)) {
            const enhanced = `Clean, professional ${basePrompt}, technical illustration style, precise lines, clear labeling, informative design, high contrast, vector art quality`;
            console.log(`🎨 Technical Enhanced: "${basePrompt}" → "${enhanced}"`);
            return enhanced;
        }
        
        // Fantasy/Concept Art
        if (/(?:fantasy|magical|dragon|wizard|castle|mystical|ethereal|mythical)/i.test(prompt)) {
            const enhanced = `Epic, highly detailed ${basePrompt}, fantasy concept art, dramatic lighting, rich atmospheric effects, masterpiece quality, digital painting style, trending on ArtStation`;
            console.log(`🎨 Fantasy Enhanced: "${basePrompt}" → "${enhanced}"`);
            return enhanced;
        }
        
        // Nature/Landscape (more general than photography)
        if (/(?:sunset|sunrise|landscape|mountain|forest|ocean|nature|scenery|sky)/i.test(prompt)) {
            const enhanced = `Stunning, photorealistic ${basePrompt}, dramatic lighting and composition, rich vibrant colors, sharp focus, high resolution, cinematic quality, award-winning photography, masterpiece quality, 8k detail`;
            console.log(`🎨 Nature Enhanced: "${basePrompt}" → "${enhanced}"`);
            return enhanced;
        }
        
        // Abstract/Artistic
        if (/(?:abstract|artistic|creative|modern|contemporary|design|pattern)/i.test(prompt)) {
            const enhanced = `Striking, creative ${basePrompt}, modern artistic style, bold composition, sophisticated color palette, gallery-worthy quality, innovative visual design`;
            console.log(`🎨 Abstract Enhanced: "${basePrompt}" → "${enhanced}"`);
            return enhanced;
        }
        
        // Character/Portrait
        if (/(?:person|character|portrait|face|people|human|figure)/i.test(prompt)) {
            const enhanced = `Compelling ${basePrompt}, expressive character design, detailed features, dramatic lighting, emotional depth, professional illustration quality`;
            console.log(`🎨 Character Enhanced: "${basePrompt}" → "${enhanced}"`);
            return enhanced;
        }
        
        // Architecture/Urban
        if (/(?:building|architecture|city|urban|street|interior|room|house)/i.test(prompt)) {
            const enhanced = `Impressive ${basePrompt}, architectural visualization, sophisticated design, excellent composition, professional rendering quality, detailed environment`;
            console.log(`🎨 Architecture Enhanced: "${basePrompt}" → "${enhanced}"`);
            return enhanced;
        }
        
        // General creative enhancement for any other content
        const enhanced = `High-quality, photorealistic ${basePrompt}, professional composition, rich detail, sharp focus, vibrant colors, cinematic lighting, award-winning quality, masterpiece detail, 8k resolution`;
        console.log(`🎨 General Enhanced: "${basePrompt}" → "${enhanced}"`);
        return enhanced;
    }

    /**
     * Save generated image to local file system
     */
    private async saveImageToFile(image: GeneratedImage, shared: AgentSharedState): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const imageType = image.id.includes('editing') ? 'edited' : 'generated';
        const filename = `${imageType}-image-${timestamp}-${image.id.split('-').pop()}.jpg`;
        
        // Get target directory (MCP or plugin fallback)
        const imageDir = await this.getImageSaveDirectory(shared);
        const imagePath = `${imageDir}/${filename}`;
        
        // Skip MCP entirely for binary image files to prevent corruption
        // MCP filesystem servers are designed for text content and may corrupt binary data
        console.log(`📁 Saving binary image file directly with Node.js: ${imagePath}`);
        
        try {
            // Save directly to the target directory using Node.js
            const savedPath = await this.saveToTargetDirectory(image, imagePath, shared);
            console.log(`💾 Saved image via Node.js to: ${savedPath}`);
            return savedPath;
        } catch (fallbackError) {
            console.error(`❌ All image save strategies failed for ${filename}:`, fallbackError);
            throw new Error(`Failed to save image ${image.id}: MCP failed, Node.js failed - ${fallbackError.message}`);
        }
    }

    /**
     * Get image save directory based on configuration
     */
    private async getImageSaveDirectory(shared: AgentSharedState): Promise<string> {
        try {
            // First try: MCP filesystem working directory from settings.json
            const mcpWorkingDir = shared.mcpConfig?.workingDirectory;
            if (mcpWorkingDir) {
                return `${mcpWorkingDir}/images`;
            }
        } catch (error) {
            console.warn('Failed to get MCP working directory from config:', error);
        }
        
        // Fallback: Obsidian plugin working directory
        const pluginDir = shared.pluginWorkingDir || process.cwd();
        return `${pluginDir}/images`;
    }

    /**
     * Validate MCP filesystem connection
     */
    private async validateMCPFilesystem(shared: AgentSharedState): Promise<boolean> {
        try {
            // Test MCP filesystem connection
            if (!shared.mcpClient) {
                console.warn('MCP client not available');
                return false;
            }
            
            // Try to list allowed directories to verify connection
            const allowedDirs = await shared.mcpClient.callTool('filesystem', 'list_allowed_directories', {});
            return allowedDirs && !allowedDirs.isError;
        } catch (error) {
            console.warn('MCP filesystem validation failed:', error);
            return false;
        }
    }

    /**
     * Save image directly to target directory using Node.js fs
     */
    private async saveToTargetDirectory(image: GeneratedImage, fullPath: string, shared: AgentSharedState): Promise<string> {
        // Import Node.js filesystem modules
        const fs = require('fs').promises;
        const path = require('path');
        
        // Extract directory from full path
        const imageDir = path.dirname(fullPath);
        
        // Create directory if needed (recursive creation)
        await fs.mkdir(imageDir, { recursive: true });
        console.log(`📂 Created directory: ${imageDir}`);
        
        // Convert base64 to buffer and save
        const imageBuffer = Buffer.from(image.imageBytes, 'base64');
        await fs.writeFile(fullPath, imageBuffer);
        
        // Verify file was created and has correct size
        const stats = await fs.stat(fullPath);
        console.log(`📊 Image file created: ${fullPath} (${stats.size} bytes)`);
        
        return fullPath;
    }

    /**
     * Fallback: Save to plugin directory using Node.js fs
     */
    private async saveToPluginDirectory(image: GeneratedImage, filename: string, shared: AgentSharedState): Promise<string> {
        // Import Node.js filesystem modules
        const fs = require('fs').promises;
        const path = require('path');
        
        const pluginDir = shared.pluginWorkingDir || process.cwd();
        const imageDir = path.join(pluginDir, 'images');
        const imagePath = path.join(imageDir, filename);
        
        // Create directory if needed
        await fs.mkdir(imageDir, { recursive: true });
        
        // Convert base64 to buffer and save
        const imageBuffer = Buffer.from(image.imageBytes, 'base64');
        await fs.writeFile(imagePath, imageBuffer);
        
        return imagePath;
    }

    /**
     * Simplify prompt for fallback generation
     */
    private simplifyPrompt(originalPrompt: string): string {
        // Remove complex descriptors and keep core subject
        return originalPrompt
            .replace(/\b(very|extremely|highly|incredibly|amazingly)\s+/gi, '')
            .replace(/\b(detailed|intricate|complex|sophisticated)\s+/gi, '')
            .split(/[.,!?]/)[0] // Take first sentence/clause
            .trim()
            .substring(0, 100); // Limit length
    }

    /**
     * Format image generation results for action history
     */
    private formatImageResults(images: GeneratedImage[], savedPaths?: string[]): string {
        const successCount = images.filter(img => !img.safetyFiltered).length;
        const filteredCount = images.filter(img => img.safetyFiltered).length;
        
        let result = `Generated ${images.length} image(s)`;
        
        if (filteredCount > 0) {
            result += ` (${filteredCount} filtered by safety)`;
        }
        
        if (images.length > 0) {
            result += `. Image IDs: ${images.map(img => img.id).join(', ')}`;
        }
        
        // NEW: Include file paths information
        if (savedPaths && savedPaths.length > 0) {
            result += `. Saved to files: ${savedPaths.join(', ')}`;
        }
        
        return result;
    }

    /**
     * Emit progress event to callback if available
     */
    private emitProgress(
        shared: AgentSharedState, 
        type: AgentProgressEvent['type'], 
        data: any
    ): void {
        if (shared.progressCallback) {
            shared.progressCallback({
                type,
                step: shared.currentStep || 0,
                data,
                timestamp: Date.now()
            });
        }
    }


    /**
     * Convert absolute path to relative path for Markdown references
     */
    private convertToRelativePath(absolutePath: string, shared: AgentSharedState): string {
        try {
            const path = require('path');
            
            // Extract just the filename from the absolute path
            const filename = path.basename(absolutePath);
            
            // For Obsidian, use simple relative path from vault root
            // Images are typically stored in an 'images' folder
            return `images/${filename}`;
            
        } catch (error) {
            console.warn('Failed to convert to relative path:', error);
            // Fallback: return just the filename
            return absolutePath.split('/').pop() || absolutePath;
        }
    }

    /**
     * Detect whether request is for generation or editing
     */
    private detectRequestType(shared: AgentSharedState): 'generation' | 'editing' {
        const userRequest = shared.userRequest?.toLowerCase() || '';
        
        // Check for explicit image paths first (user provided)
        const hasImagePath = this.extractImagePath(userRequest);
        
        // Check for edit keywords
        const editKeywords = ['edit', 'modify', 'change', 'improve', 'enhance', 'style', 'transform', 'update', 'alter'];
        const hasEditIntent = editKeywords.some(keyword => userRequest.includes(keyword));
        
        // If has image path OR (edit keywords AND previous images exist)
        if (hasImagePath || (hasEditIntent && this.hasAvailableImages(shared))) {
            return 'editing';
        }
        
        return 'generation';
    }

    /**
     * Extract image path from user request
     */
    private extractImagePath(userRequest: string): string | null {
        // Extract various path formats:
        // "edit /path/to/image.jpg to make it..."
        // "modify image at ./images/photo.png"
        // "change images/sunset.jpg color"
        
        const pathPatterns = [
            /(?:edit|modify|change|improve|enhance)\s+(?:image\s+at\s+|)([^\s]+\.(?:jpg|jpeg|png|webp))/i,
            /([^\s]+\.(?:jpg|jpeg|png|webp))/i  // Any image file mentioned
        ];
        
        for (const pattern of pathPatterns) {
            const match = userRequest.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        return null;
    }

    /**
     * Check if there are available images to edit
     */
    private hasAvailableImages(shared: AgentSharedState): boolean {
        return !!(shared.generatedImages && shared.generatedImages.length > 0) ||
               !!(shared.generatedImagePaths && shared.generatedImagePaths.length > 0);
    }

    /**
     * Resolve source image for editing
     */
    private async resolveSourceImage(userRequest: string, shared: AgentSharedState): Promise<{ path: string; data: string; mimeType: string } | null> {
        
        // Priority 1: User-provided path
        const explicitPath = this.extractImagePath(userRequest);
        if (explicitPath) {
            return await this.loadImageFromPath(explicitPath, shared);
        }
        
        // Priority 2: Reference to previous images
        if (/last|previous|recent/.test(userRequest)) {
            return this.getLastGeneratedImage(shared);
        }
        
        // Priority 3: Filename reference
        const fileMatch = userRequest.match(/[\w-]+\.(?:jpg|jpeg|png|webp)/i);
        if (fileMatch) {
            return await this.findImageByFilename(fileMatch[0], shared);
        }
        
        return null;
    }

    /**
     * Load image from file path
     */
    private async loadImageFromPath(imagePath: string, shared: AgentSharedState): Promise<{ path: string; data: string; mimeType: string }> {
        const fs = require('fs').promises;
        const path = require('path');
        
        let resolvedPath: string;
        
        if (path.isAbsolute(imagePath)) {
            // Absolute path - use directly
            resolvedPath = imagePath;
        } else {
            // Relative path - resolve against working directories
            const possiblePaths = [
                path.resolve(shared.mcpConfig?.workingDirectory || '', imagePath),
                path.resolve(shared.pluginWorkingDir || '', imagePath),
                path.resolve(process.cwd(), imagePath)
            ];
            
            resolvedPath = await this.findExistingPath(possiblePaths);
        }
        
        // Load and encode image
        const imageBuffer = await fs.readFile(resolvedPath);
        const base64Data = imageBuffer.toString('base64');
        const mimeType = this.detectMimeType(resolvedPath);
        
        console.log(`📁 Loaded source image: ${resolvedPath} (${imageBuffer.length} bytes)`);
        
        return {
            path: resolvedPath,
            data: base64Data,
            mimeType
        };
    }

    /**
     * Find first existing path from list
     */
    private async findExistingPath(paths: string[]): Promise<string> {
        const fs = require('fs').promises;
        
        for (const path of paths) {
            try {
                await fs.access(path);
                return path;
            } catch {
                // Continue to next path
            }
        }
        
        throw new Error(`Image file not found in any of these locations: ${paths.join(', ')}`);
    }

    /**
     * Detect MIME type from file extension
     */
    private detectMimeType(filePath: string): string {
        const ext = filePath.toLowerCase().split('.').pop();
        switch (ext) {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'webp':
                return 'image/webp';
            default:
                return 'image/jpeg'; // Default fallback
        }
    }

    /**
     * Get last generated image for editing
     */
    private getLastGeneratedImage(shared: AgentSharedState): { path: string; data: string; mimeType: string } | null {
        if (!shared.generatedImages || shared.generatedImages.length === 0) {
            return null;
        }
        
        const lastImage = shared.generatedImages[shared.generatedImages.length - 1];
        return {
            path: lastImage.localFilePath || 'generated-image',
            data: lastImage.imageBytes,
            mimeType: lastImage.format
        };
    }

    /**
     * Find image by filename
     */
    private async findImageByFilename(filename: string, shared: AgentSharedState): Promise<{ path: string; data: string; mimeType: string } | null> {
        // Search in generated images first
        if (shared.generatedImages) {
            for (const image of shared.generatedImages) {
                if (image.localFilePath?.includes(filename)) {
                    return {
                        path: image.localFilePath,
                        data: image.imageBytes,
                        mimeType: image.format
                    };
                }
            }
        }
        
        // Search in file system
        try {
            const searchPaths = [
                shared.mcpConfig?.workingDirectory + '/images',
                shared.pluginWorkingDir + '/images',
                process.cwd() + '/images'
            ].filter(Boolean);
            
            for (const searchPath of searchPaths) {
                const fullPath = `${searchPath}/${filename}`;
                try {
                    return await this.loadImageFromPath(fullPath, shared);
                } catch {
                    // Continue to next path
                }
            }
        } catch (error) {
            console.warn(`Failed to find image by filename ${filename}:`, error);
        }
        
        return null;
    }

    /**
     * Extract editing instructions from user request
     */
    private extractEditInstructions(userRequest: string): string {
        // Remove image path references and extract the editing instruction
        const cleanRequest = userRequest
            .replace(/([^\s]+\.(?:jpg|jpeg|png|webp))/gi, '')  // Remove file references
            .replace(/\b(edit|modify|change|improve|enhance|the|last|previous|image|at)\b/gi, '')  // Remove command words
            .trim();
        
        return cleanRequest || 'Improve the image quality and enhance details';
    }

    /**
     * Enhance editing prompt using LLM
     */
    private async enhanceEditingPrompt(editInstructions: string, shared: AgentSharedState): Promise<string> {
        try {
            const enhancementPrompt = `You are an expert at writing image editing prompts for AI image editing models like Gemini. 

Transform this basic editing instruction into a detailed, high-quality image editing prompt:
"${editInstructions}"

Guidelines for enhancement:
- Be specific about what changes to make to the existing image
- Include quality improvement keywords: enhanced details, improved clarity, refined composition
- Specify visual improvements: better lighting, enhanced colors, sharper focus
- Keep the core editing intent unchanged
- Make it clear and actionable for image editing
- Focus on modifications to the existing image, not creating something entirely new

Respond with ONLY the enhanced editing prompt, no explanations or quotes.`;

            const enhancedPrompt = await this.llmProvider.callLLM(enhancementPrompt);
            
            console.log(`🎨 LLM Enhanced Editing: "${editInstructions}" → "${enhancedPrompt}"`);
            return enhancedPrompt;
            
        } catch (error) {
            console.error('❌ LLM editing enhancement failed, using original:', error);
            return editInstructions;
        }
    }

    /**
     * Truncate text for progress display
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}