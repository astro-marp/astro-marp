import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

export interface OptimizedImage {
  original: string;
  optimizedSrc: string;
  width?: number;
  height?: number;
  format?: string;
  alt?: string;
}

export interface ImageProcessorOptions {
  projectRoot: string;
  filePath?: string; // Path to the .marp file for relative resolution
  getImage?: (path: string) => Promise<{ src: string; width: number; height: number; format: string }>;
}

export class ImageProcessor {
  private optimizationCache = new Map<string, OptimizedImage>();

  constructor(private options: ImageProcessorOptions) {}

  async processMarkdownImages(content: string): Promise<{
    processedContent: string;
    images: OptimizedImage[];
  }> {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)(?:\s+"([^"]*)")?\)/g;
    const images: OptimizedImage[] = [];
    let processedContent = content;
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
      const [fullMatch, alt, src, title] = match;
      const optimizedImage = await this.processImage(src, alt, title);

      if (optimizedImage) {
        images.push(optimizedImage);

        // Replace the image reference in the content
        if (optimizedImage.optimizedSrc !== optimizedImage.original) {
          const newImageRef = title
            ? `![${alt}](${optimizedImage.optimizedSrc} "${title}")`
            : `![${alt}](${optimizedImage.optimizedSrc})`;

          processedContent = processedContent.replace(fullMatch, newImageRef);
        }
      }
    }

    return {
      processedContent,
      images,
    };
  }

  private async processImage(src: string, alt: string, title?: string): Promise<OptimizedImage | null> {
    // Check if it's a remote URL
    if (this.isRemoteUrl(src)) {
      return {
        original: src,
        optimizedSrc: src,
        alt,
      };
    }

    // Check if it's a data URL
    if (src.startsWith('data:')) {
      return {
        original: src,
        optimizedSrc: src,
        alt,
      };
    }

    // Process local image
    return this.processLocalImage(src, alt, title);
  }

  private async processLocalImage(src: string, alt: string, title?: string): Promise<OptimizedImage | null> {
    try {
      // Check cache first
      const cacheKey = src;
      if (this.optimizationCache.has(cacheKey)) {
        const cached = this.optimizationCache.get(cacheKey)!;
        return { ...cached, alt };
      }

      // Resolve to absolute path
      const absolutePath = this.resolveLocalPath(src);

      if (!absolutePath || !existsSync(absolutePath)) {
        console.warn(`[astro-marp] Missing image: ${src} (left unmodified)`);
        return {
          original: src,
          optimizedSrc: src,
          alt,
        };
      }

      console.log(`[astro-marp] Processing image: ${src} -> ${absolutePath}`);

      // For now, keep the original path to allow Astro's asset pipeline to handle it
      // In a full implementation, this would integrate with Astro's getImage() API
      // which requires runtime context not available in Vite plugin
      const result: OptimizedImage = {
        original: src,
        optimizedSrc: src, // Keep original path for Astro's asset handling
        alt,
      };

      this.optimizationCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.warn(`[astro-marp] Error processing image ${src}:`, error);
      return {
        original: src,
        optimizedSrc: src,
        alt,
      };
    }
  }

  private isRemoteUrl(src: string): boolean {
    return src.startsWith('http://') ||
           src.startsWith('https://') ||
           src.startsWith('//');
  }

  private resolveLocalPath(src: string): string | null {
    try {
      // Handle different path types
      if (src.startsWith('/')) {
        // Absolute path - check both public directory and project root
        const publicPath = resolve(this.options.projectRoot, 'public', src.slice(1));
        const rootPath = resolve(this.options.projectRoot, src.slice(1));

        // Prefer public directory for images (Astro convention)
        if (existsSync(publicPath)) {
          console.log(`[astro-marp] Found image in public: ${publicPath}`);
          return publicPath;
        } else if (existsSync(rootPath)) {
          console.log(`[astro-marp] Found image in root: ${rootPath}`);
          return rootPath;
        } else {
          console.log(`[astro-marp] Trying public path: ${publicPath}`);
          console.log(`[astro-marp] Trying root path: ${rootPath}`);
          return publicPath; // Return public path for Astro's asset handling
        }
      } else if (src.startsWith('@/')) {
        // Alias path (treat as src/ relative)
        return resolve(this.options.projectRoot, 'src', src.slice(2));
      } else if (src.startsWith('./') || src.startsWith('../')) {
        // Relative path - resolve relative to the .marp file
        if (this.options.filePath) {
          const fileDir = dirname(this.options.filePath);
          return resolve(fileDir, src);
        } else {
          // Fallback to project root if no file context
          return resolve(this.options.projectRoot, src);
        }
      } else {
        // No leading path indicators - try relative to project root
        return resolve(this.options.projectRoot, src);
      }
    } catch (error) {
      console.warn(`[astro-marp] Path resolution failed for ${src}:`, error);
      return null;
    }
  }
}