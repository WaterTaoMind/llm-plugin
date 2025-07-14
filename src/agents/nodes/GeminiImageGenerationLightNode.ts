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
 * Interface for image generation request data
 */
interface ImageGenerationRequest {
    prompt: string;
    config: ImageGenerationConfig;
}

/**
 * PocketFlow Node for Gemini image generation using official Google GenAI SDK
 * Uses the official SDK for better compatibility and reliability
 */
export class GeminiImageGenerationLightNode extends Node<AgentSharedState> {
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
     * Preparation phase: Extract image generation parameters from shared state
     * Uses LLM-based prompt enhancement for high-quality results
     */
    async prep(shared: AgentSharedState): Promise<ImageGenerationRequest> {
        console.log('🎨 GeminiImageGenerationLightNode: Preparing image generation request');
        
        // Extract image prompt from user request or current context
        const basePrompt = this.extractImagePrompt(shared);
        
        // Enhance prompt using LLM provider for high-quality results
        const enhancedPrompt = await this.enhancePromptQuality(basePrompt, shared);
        
        // Get configuration with sensible defaults optimized for quality
        const config: ImageGenerationConfig = {
            aspectRatio: shared.imageConfig?.aspectRatio || '16:9', // Better for landscapes
            numberOfImages: shared.imageConfig?.numberOfImages || 1,
            safetyFilterLevel: shared.imageConfig?.safetyFilterLevel || 'BLOCK_MEDIUM_AND_ABOVE'
        };

        // Emit progress event
        this.emitProgress(shared, 'action_start', {
            action: 'generate_image',
            tool: 'generate_images',
            server: 'gemini-sdk',
            justification: 'Generating visual content using Gemini image generation API',
            prompt: this.truncateText(enhancedPrompt, 100),
            config: config
        });

        return { prompt: enhancedPrompt, config };
    }

    /**
     * Execution phase: Call Gemini API to generate images using official SDK
     */
    async exec(request: ImageGenerationRequest): Promise<GeneratedImage[]> {
        console.log('🔧 GeminiImageGenerationLightNode: Executing image generation (Official SDK)');
        console.log(`📝 Prompt: ${this.truncateText(request.prompt, 200)}`);
        console.log(`⚙️ Config:`, request.config);

        if (!this.apiKey) {
            throw new Error('Gemini API key is required for image generation');
        }

        try {
            // Use the official Google GenAI SDK as per documentation
            const response = await this.geminiClient.models.generateContent({
                model: 'gemini-2.0-flash-preview-image-generation',
                contents: [{ parts: [{ text: request.prompt }] }],
                config: {
                    responseModalities: ['TEXT', 'IMAGE']
                }
            });
            const generatedImages: GeneratedImage[] = [];
            
            if (response.candidates) {
                for (const [candidateIndex, candidate] of response.candidates.entries()) {
                    if (candidate.content?.parts) {
                        for (const [partIndex, part] of candidate.content.parts.entries()) {
                            if (part.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) {
                                const generatedImage: GeneratedImage = {
                                    id: `gemini-img-sdk-${Date.now()}-${candidateIndex}-${partIndex}`,
                                    prompt: request.prompt,
                                    imageBytes: part.inlineData.data,
                                    format: part.inlineData.mimeType,
                                    aspectRatio: request.config.aspectRatio || '1:1',
                                    safetyFiltered: candidate.finishReason === 'SAFETY',
                                    safetyReason: candidate.finishReason === 'SAFETY' ? 'Content filtered by safety settings' : undefined,
                                    generatedAt: Date.now()
                                };
                                generatedImages.push(generatedImage);
                            }
                        }
                    }
                }
            }

            console.log(`✅ Generated ${generatedImages.length} images using official SDK`);
            return generatedImages;

        } catch (error) {
            console.error('❌ Image generation failed:', error);
            throw new Error(`Gemini image generation failed: ${error.message}`);
        }
    }

    /**
     * Post-processing phase: Update shared state and determine next action
     */
    async post(
        shared: AgentSharedState,
        request: ImageGenerationRequest,
        images: GeneratedImage[]
    ): Promise<string | undefined> {
        console.log('📋 GeminiImageGenerationLightNode: Post-processing results');

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
            tool: 'generate_images',
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
        const filename = `generated-image-${timestamp}-${image.id.split('-').pop()}.jpg`;
        
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
     * Truncate text for progress display
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}