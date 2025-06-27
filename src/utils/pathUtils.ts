/**
 * Cross-platform path utilities for the LLM Plugin
 * Handles path operations consistently across Windows, macOS, and Linux
 */

/**
 * Normalizes path separators to forward slashes for cross-platform compatibility
 * @param path The path to normalize
 * @returns Normalized path with forward slashes
 */
export function normalizePath(path: string): string {
    if (!path) return path;
    return path.replace(/\\/g, '/');
}

/**
 * Joins path segments using forward slashes for cross-platform compatibility
 * @param segments Path segments to join
 * @returns Joined path with forward slashes
 */
export function joinPath(...segments: string[]): string {
    return segments
        .filter(segment => segment && segment.length > 0)
        .map(segment => normalizePath(segment))
        .join('/')
        .replace(/\/+/g, '/'); // Remove duplicate slashes
}

/**
 * Gets the filename from a path (cross-platform)
 * @param path The file path
 * @returns The filename or null if not found
 */
export function getFilename(path: string): string | null {
    if (!path) return null;
    const normalizedPath = normalizePath(path);
    const segments = normalizedPath.split('/');
    return segments[segments.length - 1] || null;
}

/**
 * Gets the directory path from a file path (cross-platform)
 * @param path The file path
 * @returns The directory path
 */
export function getDirname(path: string): string {
    if (!path) return '';
    const normalizedPath = normalizePath(path);
    const segments = normalizedPath.split('/');
    segments.pop(); // Remove filename
    return segments.join('/');
}

/**
 * Checks if a path is absolute (cross-platform)
 * @param path The path to check
 * @returns True if the path is absolute
 */
export function isAbsolutePath(path: string): boolean {
    if (!path) return false;
    const normalizedPath = normalizePath(path);
    
    // Unix-style absolute path
    if (normalizedPath.startsWith('/')) {
        return true;
    }
    
    // Windows-style absolute path (C:/, D:/, etc.)
    if (/^[A-Za-z]:\//.test(normalizedPath)) {
        return true;
    }
    
    return false;
}

/**
 * Checks if a path contains a specific folder (cross-platform)
 * @param path The path to check
 * @param folderName The folder name to look for
 * @returns True if the path contains the folder
 */
export function pathContainsFolder(path: string, folderName: string): boolean {
    if (!path || !folderName) return false;
    const normalizedPath = normalizePath(path);
    
    // Check for folder with path separators on both sides
    return normalizedPath.includes(`/${folderName}/`) || 
           normalizedPath.startsWith(`${folderName}/`) ||
           normalizedPath.endsWith(`/${folderName}`);
}

/**
 * Resolves a relative path against a base path (cross-platform)
 * @param basePath The base path
 * @param relativePath The relative path
 * @returns The resolved absolute path
 */
export function resolvePath(basePath: string, relativePath: string): string {
    if (!basePath || !relativePath) return relativePath || basePath || '';
    
    const normalizedBase = normalizePath(basePath);
    const normalizedRelative = normalizePath(relativePath);
    
    // If relative path is already absolute, return it
    if (isAbsolutePath(normalizedRelative)) {
        return normalizedRelative;
    }
    
    return joinPath(normalizedBase, normalizedRelative);
}

/**
 * Gets the file extension from a path (cross-platform)
 * @param path The file path
 * @returns The file extension (including the dot) or empty string
 */
export function getExtension(path: string): string {
    const filename = getFilename(path);
    if (!filename) return '';
    
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) return '';
    
    return filename.substring(lastDotIndex);
}

/**
 * Checks if a path has a valid image extension (cross-platform)
 * @param path The file path
 * @returns True if the path has a valid image extension
 */
export function hasImageExtension(path: string): boolean {
    const extension = getExtension(path).toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    return imageExtensions.includes(extension);
}
