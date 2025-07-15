import { Node } from "pocketflow";
import { GoogleGenAI } from "@google/genai";
import { 
    AgentSharedState, 
    GeneratedAudio, 
    TTSConfig,
    AgentProgressEvent,
    LLMProvider 
} from '../types';

/**
 * Interface for TTS processing request data
 */
interface TTSRequest {
    text: string;           // Original text input
    processedText: string;  // Cleaned text for TTS
    config: TTSConfig;      // TTS configuration with voice selection
}

/**
 * PocketFlow Node for Gemini text-to-speech generation using official Google GenAI SDK
 * Supports gemini-2.5-flash-preview-tts model with intelligent voice selection
 */
export class GeminiTTSNode extends Node<AgentSharedState> {
    private geminiClient: GoogleGenAI;

    constructor(
        private apiKey: string,
        private llmProvider: LLMProvider,
        maxRetries: number = 2,
        waitTime: number = 5 // Longer wait time for TTS processing
    ) {
        super(maxRetries, waitTime);
        this.geminiClient = new GoogleGenAI({ apiKey: this.apiKey });
    }

    /**
     * Preparation phase: Process text and select voice intelligently
     */
    async prep(shared: AgentSharedState): Promise<TTSRequest> {
        console.log('🎙️ GeminiTTSNode: Preparing TTS request');
        
        // Extract text to convert to speech
        const originalText = this.extractTTSText(shared);
        
        // Process text for TTS (remove emojis, clean formatting)
        const processedText = this.processTextForTTS(originalText);
        
        // Select voice intelligently based on user context and content
        const selectedVoice = await this.selectVoiceIntelligently(originalText, shared);
        
        console.log(`🎙️ Selected voice: ${selectedVoice}`);
        console.log(`🎙️ Original text length: ${originalText.length} chars`);
        console.log(`🎙️ Processed text length: ${processedText.length} chars`);
        
        // Emit progress event
        this.emitProgress(shared, 'action_start', {
            action: 'generate_speech',
            tool: 'text_to_speech',
            server: 'gemini-sdk',
            justification: 'Converting text to speech using Gemini TTS API',
            voice: selectedVoice,
            textLength: processedText.length
        });

        return {
            text: originalText,
            processedText: processedText,
            config: {
                voiceName: selectedVoice,
                responseModalities: ['AUDIO']
            }
        };
    }

    /**
     * Execution phase: Generate audio using Gemini TTS API
     */
    async exec(request: TTSRequest): Promise<GeneratedAudio[]> {
        console.log('🔊 GeminiTTSNode: Executing TTS generation via Gemini API');
        
        try {
            console.log(`🎙️ Generating speech with voice: ${request.config.voiceName || 'kore'}`);
            console.log(`📝 Text to convert (${request.processedText.length} chars): ${request.processedText.substring(0, 100)}...`);
            
            // Construct the API request
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${this.apiKey}`;
            
            const requestBody = {
                contents: [{
                    parts: [{
                        text: request.processedText
                    }]
                }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: request.config.voiceName || 'kore'
                            }
                        }
                    }
                }
            };
            
            console.log(`🌐 Making TTS API request to: ${apiUrl}`);
            
            // Make the API request
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ TTS API request failed: ${response.status} ${response.statusText}`);
                console.error(`❌ Error response: ${errorText}`);
                throw new Error(`Gemini TTS API request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }
            
            const responseData = await response.json();
            console.log(`✅ TTS API response received`);
            
            // Process the response and extract audio data
            const audios = this.processResponse(responseData, request);
            
            if (audios.length === 0) {
                throw new Error('No audio data found in Gemini TTS API response');
            }
            
            console.log(`✅ Generated ${audios.length} audio(s) via Gemini TTS`);
            return audios;
            
        } catch (error) {
            console.error(`❌ TTS generation failed:`, error);
            throw new Error(`Gemini TTS generation failed: ${error.message}`);
        }
    }

    /**
     * Post-processing phase: Update shared state and determine next action
     */
    async post(
        shared: AgentSharedState,
        request: TTSRequest,
        audios: GeneratedAudio[]
    ): Promise<string | undefined> {
        console.log(`📋 GeminiTTSNode: Post-processing TTS results`);

        // Update shared state with generated audio
        if (!shared.generatedAudios) {
            shared.generatedAudios = [];
        }
        shared.generatedAudios.push(...audios);

        // Save audio files to local filesystem
        const savedAudioPaths: string[] = [];
        const saveErrors: string[] = [];
        
        for (const audio of audios) {
            try {
                const audioPath = await this.saveAudioToFile(audio, shared);
                savedAudioPaths.push(audioPath);
                
                // Add relative path to audio metadata
                const relativePath = this.convertToRelativePath(audioPath, shared);
                audio.localFilePath = relativePath;
                console.log(`✅ Successfully saved audio ${audio.id} to: ${audioPath} (relative: ${relativePath})`);
                
                // Save metadata with text and voice information
                try {
                    await this.saveAudioMetadata(audio, audioPath, shared);
                } catch (metadataError) {
                    console.warn(`⚠️ Failed to save metadata for ${audio.id}: ${metadataError.message}`);
                    // Continue - metadata failure shouldn't break TTS generation
                }
            } catch (error) {
                const errorMsg = `Failed to save audio ${audio.id}: ${error.message}`;
                console.error(`❌ ${errorMsg}`);
                saveErrors.push(errorMsg);
                // Continue processing other audio files even if one fails
            }
        }
        
        // Log save summary
        console.log(`📊 Audio save summary: ${savedAudioPaths.length}/${audios.length} audios saved successfully`);
        if (saveErrors.length > 0) {
            console.warn(`⚠️ Audio save errors encountered:`, saveErrors);
        }
        
        // Store paths in shared state
        const relativePaths = savedAudioPaths.map(path => this.convertToRelativePath(path, shared));
        
        if (savedAudioPaths.length > 0) {
            if (!shared.generatedAudioPaths) {
                shared.generatedAudioPaths = [];
            }
            shared.generatedAudioPaths.push(...relativePaths);
        }

        // Add to action history for agent reference
        const actionResult = {
            step: shared.currentStep || 0,
            stepType: 'action' as const,
            server: 'gemini-sdk',
            tool: 'generate_speech',
            parameters: {
                text: request.text,
                processedText: request.processedText,
                voiceName: request.config.voiceName,
                audioPaths: relativePaths
            },
            result: this.formatAudioResults(audios, relativePaths),
            justification: 'Generated speech audio using Gemini TTS API',
            success: audios.length > 0,
            historyId: `gemini-tts-sdk-${Date.now()}`
        };

        if (!shared.actionHistory) {
            shared.actionHistory = [];
        }
        shared.actionHistory.push(actionResult);

        // Emit completion progress
        this.emitProgress(shared, 'action_complete', {
            action: 'generate_speech',
            tool: 'generate_speech',
            server: 'gemini-sdk',
            success: audios.length > 0,
            result: this.formatAudioResults(audios),
            audioCount: audios.length,
            voiceUsed: request.config.voiceName
        });

        console.log(`🎉 Successfully processed ${audios.length} audio(s) via TTS`);
        
        // Continue to reasoning node for potential follow-up actions
        console.log(`🔄 TTS generation complete - continuing workflow for potential follow-up`);
        return 'default';
    }

    /**
     * Process API response and extract audio data
     */
    private processResponse(response: any, request: TTSRequest): GeneratedAudio[] {
        const processedAudios: GeneratedAudio[] = [];
        
        console.log('🔍 Processing TTS API response structure');
        
        if (response.candidates) {
            for (const [candidateIndex, candidate] of response.candidates.entries()) {
                if (candidate.content?.parts) {
                    for (const [partIndex, part] of candidate.content.parts.entries()) {
                        if (part.inlineData?.mimeType?.includes('audio') && part.inlineData.data) {
                            console.log(`🎵 Found audio data: ${part.inlineData.mimeType}, ${part.inlineData.data.length} chars base64`);
                            
                            // Convert PCM to WAV format since Gemini returns audio/L16;codec=pcm;rate=24000
                            const wavAudioBytes = this.convertPCMToWAV(part.inlineData.data);
                            
                            const processedAudio: GeneratedAudio = {
                                id: `gemini-tts-${Date.now()}-${candidateIndex}-${partIndex}`,
                                text: request.text,
                                processedText: request.processedText,
                                audioBytes: wavAudioBytes,
                                format: 'audio/wav', // Converted from PCM to WAV
                                voiceName: request.config.voiceName || 'kore',
                                generatedAt: Date.now()
                            };
                            processedAudios.push(processedAudio);
                            console.log(`✅ Processed audio ${processedAudio.id} (${wavAudioBytes.length} chars WAV)`);
                        }
                    }
                }
            }
        }

        if (processedAudios.length === 0) {
            console.warn('⚠️ No audio data found in response');
            console.log('📋 Response structure:', JSON.stringify(response, null, 2));
        }

        console.log(`✅ Processed ${processedAudios.length} audio(s) via TTS`);
        return processedAudios;
    }

    /**
     * Extract text for TTS from shared state
     */
    private extractTTSText(shared: AgentSharedState): string {
        console.log('🔍 DEBUG: extractTTSText called');
        
        // Priority order for text extraction
        if (shared.currentTTSText) {
            console.log('🔍 DEBUG: Using shared.currentTTSText');
            return shared.currentTTSText;
        }
        
        if (shared.userRequest) {
            console.log('🔍 DEBUG: Using shared.userRequest');
            return shared.userRequest;
        }
        
        throw new Error('No text found for TTS conversion');
    }

    /**
     * Process text for TTS by removing emojis and cleaning formatting
     */
    private processTextForTTS(text: string): string {
        console.log('🧹 Processing text for TTS');
        
        // Remove emojis using regex
        let processedText = text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
        
        // Clean up markdown formatting for natural speech
        processedText = processedText.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold
        processedText = processedText.replace(/\*(.*?)\*/g, '$1'); // Italic
        processedText = processedText.replace(/`(.*?)`/g, '$1'); // Code
        processedText = processedText.replace(/#{1,6}\s*(.*?)$/gm, '$1'); // Headers
        
        // Clean up extra whitespace
        processedText = processedText.replace(/\s+/g, ' ').trim();
        
        // Handle special TTS formatting for multiple speakers if needed
        // This is a placeholder for future multi-speaker support
        if (processedText.includes('Speaker 1:') || processedText.includes('Speaker 2:')) {
            console.log('🎭 Multi-speaker content detected (future feature)');
        }
        
        console.log(`🧹 Text processed: ${text.length} → ${processedText.length} characters`);
        return processedText;
    }

    /**
     * Select voice intelligently based on user context and content
     */
    private async selectVoiceIntelligently(text: string, shared: AgentSharedState): Promise<string> {
        console.log('🎯 Selecting voice intelligently via LLM');
        
        try {
            // Get all available voices (based on Gemini TTS documentation)
            const availableVoices = this.getAvailableVoices();
            
            const voiceSelectionPrompt = `You are an expert at selecting the most appropriate voice for text-to-speech conversion. 

User Request Context: "${shared.userRequest || 'No specific context'}"
Text to Convert: "${text.substring(0, 500)}${text.length > 500 ? '...' : ''}"

Available Voices:
${availableVoices.map(voice => `- ${voice}`).join('\n')}

Instructions:
1. Analyze the user's request context for voice preferences (e.g., "read this cheerfully", "professional voice", "friendly tone")
2. Analyze the text content type (e.g., formal document, casual note, technical content, story)
3. Select the most appropriate voice from the available options
4. Consider factors like:
   - Content formality level
   - Desired emotional tone
   - User's explicit preferences
   - Text type and audience

Respond with ONLY the voice name from the list above, no explanations or quotes.`;

            const selectedVoice = await this.llmProvider.callLLM(voiceSelectionPrompt);
            
            // Validate selected voice
            const cleanedVoice = selectedVoice.trim();
            if (availableVoices.includes(cleanedVoice)) {
                console.log(`🎯 LLM selected voice: ${cleanedVoice}`);
                return cleanedVoice;
            } else {
                console.warn(`⚠️ LLM selected invalid voice "${cleanedVoice}", using default`);
                return 'kore'; // Default voice (lowercase)
            }
            
        } catch (error) {
            console.error('❌ Voice selection failed, using default:', error);
            return 'kore'; // Fallback to default voice (lowercase)
        }
    }

    /**
     * Get list of available voices for Gemini TTS
     */
    private getAvailableVoices(): string[] {
        // Based on actual Gemini API error response - correct voice names
        return [
            'achernar', 'achird', 'algenib', 'algieba', 'alnilam', 'aoede', 'autonoe', 
            'callirrhoe', 'charon', 'despina', 'enceladus', 'erinome', 'fenrir', 
            'gacrux', 'iapetus', 'kore', 'laomedeia', 'leda', 'orus', 'puck', 
            'pulcherrima', 'rasalgethi', 'sadachbia', 'sadaltager', 'schedar', 
            'sulafat', 'umbriel', 'vindemiatrix', 'zephyr', 'zubenelgenubi'
        ];
    }

    /**
     * Save audio to local file system
     */
    private async saveAudioToFile(audio: GeneratedAudio, shared: AgentSharedState): Promise<string> {
        console.log(`💾 Saving audio ${audio.id} to filesystem`);
        
        // Get audio save directory
        const audioDir = await this.getAudioSaveDirectory(shared);
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
        const filename = `generated-audio-${timestamp}-${audio.id.split('-').pop()}.wav`;
        const fullPath = `${audioDir}/${filename}`;
        
        // Convert PCM to WAV and save
        const wavData = this.convertPCMToWAV(audio.audioBytes);
        await this.saveToTargetDirectory(wavData, fullPath, shared);
        
        console.log(`💾 Audio saved to: ${fullPath}`);
        return fullPath;
    }

    /**
     * Convert PCM audio data to WAV format
     */
    private convertPCMToWAV(pcmBase64: string): string {
        // Convert base64 PCM to Buffer
        const pcmBuffer = Buffer.from(pcmBase64, 'base64');
        
        // WAV header parameters for Gemini TTS output
        const sampleRate = 24000; // 24kHz
        const channels = 1; // Mono
        const bitsPerSample = 16;
        
        // Calculate sizes
        const byteRate = sampleRate * channels * bitsPerSample / 8;
        const blockAlign = channels * bitsPerSample / 8;
        const dataSize = pcmBuffer.length;
        const fileSize = 36 + dataSize;
        
        // Create WAV header
        const header = Buffer.alloc(44);
        
        // RIFF header
        header.write('RIFF', 0);
        header.writeUInt32LE(fileSize, 4);
        header.write('WAVE', 8);
        
        // fmt chunk
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16); // fmt chunk size
        header.writeUInt16LE(1, 20); // PCM format
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        
        // data chunk
        header.write('data', 36);
        header.writeUInt32LE(dataSize, 40);
        
        // Combine header and data
        const wavBuffer = Buffer.concat([header, pcmBuffer]);
        
        // Convert to base64 for consistent handling
        return wavBuffer.toString('base64');
    }

    /**
     * Get audio save directory
     */
    private async getAudioSaveDirectory(shared: AgentSharedState): Promise<string> {
        try {
            // First try: MCP filesystem working directory from settings.json
            const mcpWorkingDir = shared.mcpConfig?.workingDirectory;
            if (mcpWorkingDir) {
                return `${mcpWorkingDir}/audios`;
            }
        } catch (error) {
            console.warn('Failed to get MCP working directory from config:', error);
        }
        
        // Fallback: Obsidian plugin working directory
        const pluginDir = shared.pluginWorkingDir || process.cwd();
        return `${pluginDir}/audios`;
    }

    /**
     * Save audio data to target directory using Node.js fs
     */
    private async saveToTargetDirectory(wavBase64: string, fullPath: string, shared: AgentSharedState): Promise<void> {
        const fs = require('fs').promises;
        const path = require('path');
        
        // Extract directory from full path
        const audioDir = path.dirname(fullPath);
        
        // Create directory if it doesn't exist
        try {
            await fs.mkdir(audioDir, { recursive: true });
            console.log(`📂 Created directory: ${audioDir}`);
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
        
        // Convert base64 to buffer and save
        const audioBuffer = Buffer.from(wavBase64, 'base64');
        await fs.writeFile(fullPath, audioBuffer);
        console.log(`📊 Audio file created: ${fullPath} (${audioBuffer.length} bytes)`);
    }

    /**
     * Save audio metadata JSON file alongside the audio (safe, non-breaking)
     */
    private async saveAudioMetadata(audio: GeneratedAudio, audioPath: string, shared: AgentSharedState): Promise<void> {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            
            // Create metadata file path (.json extension)
            const audioDir = path.dirname(audioPath);
            const audioBasename = path.basename(audioPath, path.extname(audioPath));
            const metadataPath = path.join(audioDir, `${audioBasename}.json`);
            
            // Create metadata object
            const metadata = {
                audioId: audio.id,
                originalText: audio.text,
                processedText: audio.processedText,
                voiceName: audio.voiceName,
                generatedAt: new Date(audio.generatedAt).toISOString(),
                format: audio.format,
                audioFile: path.basename(audioPath),
                duration: audio.duration,
                version: "1.0"
            };
            
            // Save metadata file
            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
            console.log(`📋 Saved audio metadata: ${metadataPath}`);
            
        } catch (error) {
            // Safe failure - don't break audio generation
            throw new Error(`Audio metadata save failed: ${error.message}`);
        }
    }

    /**
     * Convert absolute path to relative path
     */
    private convertToRelativePath(absolutePath: string, shared: AgentSharedState): string {
        try {
            const path = require('path');
            
            // Extract just the filename from the absolute path
            const filename = path.basename(absolutePath);
            
            // For Obsidian, use simple relative path from vault root
            return `audios/${filename}`;
            
        } catch (error) {
            console.warn('Failed to convert to relative path:', error);
            // Fallback: return just the filename
            return absolutePath.split('/').pop() || absolutePath;
        }
    }

    /**
     * Format audio results for action history
     */
    private formatAudioResults(audios: GeneratedAudio[], savedPaths?: string[]): string {
        if (audios.length === 0) {
            return 'No audio generated';
        }
        
        const audioInfo = audios.map(audio => {
            const duration = audio.duration ? ` (${audio.duration}s)` : '';
            return `${audio.id} [${audio.voiceName}]${duration}`;
        }).join(', ');
        
        let result = `Generated ${audios.length} audio(s): ${audioInfo}`;
        
        // Include file paths information
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
     * Truncate text for progress display
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}