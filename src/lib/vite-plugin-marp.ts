import type { Plugin } from 'vite';
import type { MarpConfig } from '../types.js';
import { parseMarpFile } from './marp-parser.js';
import { resolveTheme } from './theme-resolver.js';
import { runMarpCli, generateSourceHash } from './marp-runner.js';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';

// Image info interface for ESM imports
interface ImageInfo {
  index: number;
  originalSrc: string;
  resolvedPath: string;
  alt: string;
}

// Asset tracking interface
interface ProcessedAsset {
  source: string;
  output: string;
  size: number;
  mode: 'dev' | 'build';
}

// Asset tracking for build summary
const processedAssets = new Map<string, Array<ProcessedAsset>>();

export function getProcessedAssets() {
  return processedAssets;
}

export function clearProcessedAssets() {
  processedAssets.clear();
}

function isMarpFile(id: string) {
  return /\.marp$/.test(id);
}

function isLocalImage(src: string): boolean {
  // Check if it's a local image (not http/https/data URL)
  return !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:');
}

/**
 * Prepares content by parsing frontmatter and resolving theme
 */
async function prepareContent(code: string, config: MarpConfig, logger?: any) {
  const parsed = await parseMarpFile(code);
  const theme = resolveTheme(config.defaultTheme || 'am_blue', logger);
  const sourceHash = generateSourceHash(code, theme, config);

  // Use the theme from frontmatter if specified
  const effectiveTheme = parsed.frontmatter.theme ? resolveTheme(parsed.frontmatter.theme as string, logger) : theme;

  return { parsed, effectiveTheme, sourceHash };
}

/**
 * Processes images in markdown content
 */
async function processImages(code: string, id: string, logger?: any) {
  // Collect images for ESM import generation (triggers Astro's asset pipeline)
  const images = await collectImagesFromMarkdown(code, id, logger);

  // Generate ESM import statements
  const imageImports = generateImageImports(images);

  // Replace images in markdown with placeholders
  const processedMarkdown = images.length > 0
    ? replaceImagesWithPlaceholders(code, images)
    : code;

  return { images, processedMarkdown, imageImports };
}

/**
 * Generates HTML using Marp CLI
 */
async function generateMarpHtml(processedMarkdown: string, effectiveTheme: string, config: MarpConfig, logger?: any) {
  // Run Marp CLI to process the markdown
  if (config.debug) {
    logger.info(`Processing markdown with theme: ${effectiveTheme}`);
  }
  const marpResult = await runMarpCli(processedMarkdown, {
    theme: effectiveTheme,
    html: true,
  });

  if (marpResult.error) {
    logger?.warn(`[astro-marp] Warning processing markdown:`, marpResult.error);
  }

  return marpResult;
}

/**
 * Tracks processed assets for build summary
 */
function trackProcessedAssets(id: string, images: ImageInfo[], isBuild: boolean) {
  if (images.length > 0) {
    if (!processedAssets.has(id)) {
      processedAssets.set(id, []);
    }
    images.forEach(img => {
      processedAssets.get(id)!.push({
        source: img.originalSrc,
        output: img.resolvedPath,
        size: 0, // Size will be shown by Astro's optimization pipeline
        mode: isBuild ? 'build' : 'dev'
      });
    });
  }
}

// Collect images from markdown for ESM import generation
async function collectImagesFromMarkdown(
  markdown: string,
  marpFilePath: string,
  logger?: any
): Promise<ImageInfo[]> {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const marpDir = dirname(marpFilePath);
  const images: ImageInfo[] = [];
  let imageIndex = 0;

  let match;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const [fullMatch, alt, src] = match;

    if (!isLocalImage(src)) {
      // Skip remote images - they don't need optimization
      logger.debug(`[astro-marp] Skipping remote image: ${src}`);
      continue;
    }

    try {
      // Resolve the image path relative to the .marp file
      const imagePath = resolve(marpDir, src);

      // Check if file exists
      if (!existsSync(imagePath)) {
        logger.warn(`[astro-marp] Image file not found: ${imagePath}`);
        continue;
      }

      // Add to collection for ESM import generation
      images.push({
        index: imageIndex++,
        originalSrc: src,
        resolvedPath: imagePath,
        alt: alt || ''
      });

      logger.debug(`[astro-marp] Collected image: ${src} → ${imagePath}`);
    } catch (error) {
      logger.warn(`[astro-marp] Failed to process image ${src}:`, error);
    }
  }

  return images;
}

// Generate ESM import statements for images
function generateImageImports(images: ImageInfo[]): string {
  if (images.length === 0) return '';

  return images
    .map(img => `import image${img.index} from '${img.resolvedPath}';`)
    .join('\n');
}

// Replace images in markdown with placeholders
// IMPORTANT: Keep Markdown syntax to preserve Marp directives (height:300px, bg, etc.)
function replaceImagesWithPlaceholders(
  markdown: string,
  images: ImageInfo[]
): string {
  let processed = markdown;

  // Process in reverse order to maintain string indices
  const sortedImages = [...images].sort((a, b) => {
    const posA = markdown.indexOf(`![${a.alt}](${a.originalSrc})`);
    const posB = markdown.indexOf(`![${b.alt}](${b.originalSrc})`);
    return posB - posA;
  });

  sortedImages.forEach(img => {
    // Keep Markdown syntax, replace only the image path
    // This preserves Marp directives like ![height:300px](image.png)
    // which Marp CLI will convert to <img style="height:300px;" />
    const original = `![${img.alt}](${img.originalSrc})`;
    const placeholder = `![${img.alt}](__MARP_IMAGE_${img.index}__)`;
    processed = processed.replace(original, placeholder);
  });

  return processed;
}

/**
 * Converts ```mermaid fenced code blocks to <div class="mermaid"> HTML
 * This allows Marp CLI to pass them through unchanged with --html flag
 * The Mermaid.js script injected by marp-runner.ts will render these client-side
 *
 * @param markdown - Markdown content with potential ```mermaid blocks
 * @returns Markdown with mermaid blocks converted to HTML divs
 */
function convertMermaidBlocksToHtml(markdown: string): string {
  // Match ```mermaid blocks (case-insensitive)
  // Captures diagram code between opening ```mermaid and closing ```
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/gi;

  return markdown.replace(mermaidRegex, (match, diagramCode) => {
    const trimmedCode = diagramCode.trim();

    // Skip empty blocks
    if (!trimmedCode) {
      return match;
    }

    // Convert to HTML div that Marp CLI will preserve with --html flag
    // The div class="mermaid" is required for Mermaid.js to find and render
    return `<div class="mermaid">\n${trimmedCode}\n</div>`;
  });
}


/**
 * Creates a Vite plugin for transforming .marp files into Astro components.
 *
 * This plugin handles the complete transformation pipeline:
 * 1. Parses frontmatter from .marp files
 * 2. Extracts and processes local images for optimization
 * 3. Runs Marp CLI to generate HTML
 * 4. Creates virtual ESM modules with Astro components
 *
 * @param config - Marp integration configuration
 * @param command - Current Astro command (dev/build/preview)
 * @param logger - Optional logger for debug output
 * @returns Vite plugin configuration
 */
export function createViteMarpPlugin(
  config: MarpConfig,
  command: 'dev' | 'build' | 'preview',
  logger?: any
): Plugin {
  const isBuild = command === 'build';
  return {
    name: 'vite-plugin-marp',
    enforce: 'pre',

    // Configure file watching for .marp files (following Astro's content collections pattern)
    configureServer(viteServer) {
      if (isBuild) return;

      // Watch for .marp file changes and invalidate modules
      viteServer.watcher.on('change', (file) => {
        if (!isMarpFile(file)) return;

        if (config.debug) {
          logger?.info(`[astro-marp] File watcher detected change: ${file}`);
        }

        // Invalidate modules that depend on this .marp file
        const modules = viteServer.moduleGraph.getModulesByFile(file);
        if (modules) {
          for (const mod of modules) {
            viteServer.moduleGraph.invalidateModule(mod);
          }

          if (config.debug) {
            logger?.info(`[astro-marp] Invalidated ${modules.size} module(s) from watcher`);
          }
        }
      });
    },

    load(id) {
      if (!isMarpFile(id)) return;
      logger?.debug(`[vite-plugin-marp] Loading id: ${id}`);
    },

    async transform(code: string, id: string) {
      if (!isMarpFile(id)) return;

      // Validate input parameters
      if (!code || typeof code !== 'string') {
        logger?.error(`[astro-marp] Invalid code input for ${id}`);
        return;
      }

      try {
        // Parse and prepare content
        const { parsed, effectiveTheme, sourceHash } = await prepareContent(code, config, logger);

        // Process images
        const { images, processedMarkdown, imageImports } = await processImages(code, id, logger);

        // Process Mermaid diagrams (convert ```mermaid to <div class="mermaid">)
        // This step happens AFTER image processing and BEFORE Marp CLI execution
        // Default to true if not explicitly disabled
        const processedMarkdownWithMermaid = config.enableMermaid !== false
          ? convertMermaidBlocksToHtml(processedMarkdown)
          : processedMarkdown;

        if (config.debug && processedMarkdownWithMermaid !== processedMarkdown) {
          logger?.info(`[astro-marp] Converted Mermaid fenced code blocks to HTML divs`);
        }

        // Generate Marp HTML
        const marpResult = await generateMarpHtml(processedMarkdownWithMermaid, effectiveTheme, config, logger);

        // Track assets for build summary
        trackProcessedAssets(id, images, isBuild);

        // Use the Marp CLI output
        const finalHtml = marpResult.html;

        // Generate getImage() calls for optimization
        const imageOptimizations = images.length > 0
          ? images.map(img =>
              `  const optimized${img.index} = await getImage({ src: image${img.index}, format: 'webp', quality: 80 });`
            ).join('\n')
          : '';

        // Generate runtime replacement code for image placeholders
        const imageReplacements = images.length > 0
          ? images.map(img =>
              `  processedHtml = processedHtml.replace('__MARP_IMAGE_${img.index}__', optimized${img.index}.src);`
            ).join('\n')
          : '';

        // Generate component with ESM imports and getImage() optimization
        const componentCode = `
${imageImports}
import { createComponent, render, maybeRenderHead, unescapeHTML } from "astro/runtime/server/index.js";
import { AstroJSX, jsx } from 'astro/jsx-runtime';
import { readFileSync } from "node:fs";
${images.length > 0 ? "import { getImage } from 'astro:assets';" : ''}

export const name = "MarpComponent";
export const frontmatter = ${JSON.stringify(parsed.frontmatter)};
export const file = ${JSON.stringify(id)};
export const url = ${JSON.stringify(pathToFileURL(id).href)};

export function rawContent() {
    return readFileSync(file, 'utf-8');
}

export function compiledContent() {
    return ${JSON.stringify(finalHtml)};
}

export function getHeadings() {
    return [];
}

export const Content = createComponent(async (result, _props, slots) => {
    const { layout, ...content } = frontmatter;
    const slot = await slots?.default?.();
    content.file = file;
    content.url = url;

    // Optimize images using Astro's getImage() - triggers "generating optimized images"
${imageOptimizations}

    // Replace image placeholders with optimized URLs
    let processedHtml = compiledContent();
${imageReplacements}

    // Inject Vite HMR client script for browser auto-reload (critical for HMR)
    return render\`\${maybeRenderHead(result)}\${unescapeHTML(processedHtml)}\`;
});

export default Content;
`;

        return {
          code: componentCode,
          map: null,
        };
      } catch (error) {
        logger.error('[astro-marp] Error transforming .marp file:', error);

        // Return error following the same pattern
        const errorHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Marp Processing Error</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .error { color: red; background: #ffeaea; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="error">
        <h1>Marp Processing Error</h1>
        <p>${String(error)}</p>
    </div>
</body>
</html>`;
        const errorCode = `
import { createComponent, render, maybeRenderHead, unescapeHTML } from "astro/runtime/server/index.js";
import { AstroJSX, jsx } from 'astro/jsx-runtime';

export const name = "MarpErrorComponent";
export const html = ${JSON.stringify(errorHtml)};
export const frontmatter = {};
export const file = ${JSON.stringify(id)};
export const url = ${JSON.stringify(pathToFileURL(id).href)};

export function rawContent() {
    return "";
}

export function compiledContent() {
    return ${JSON.stringify(errorHtml)};
}

export function getHeadings() {
    return [];
}

export const Content = createComponent(async (result, _props, slots) => {
    return render\`\${maybeRenderHead(result)}\${unescapeHTML(compiledContent())}\`;
});

export default Content;
`;

        return {
          code: errorCode,
          map: null,
        };
      }
    },

    // Handle Hot Module Replacement for .marp files
    // Following modern Astro pattern (PR #9706): minimal, let Vite handle default HMR
    async handleHotUpdate(ctx) {
      const { file } = ctx;

      // Only handle .marp files
      if (!isMarpFile(file)) {
        return;
      }

      if (config.debug) {
        logger?.info(`[astro-marp] HMR triggered for: ${file}`);
      }

      // Let Vite handle module invalidation automatically
      // The maybeRenderHead() in component generation ensures Vite client is present
      // No need to manually track importers or send reload messages
      return undefined;
    },
  };
}