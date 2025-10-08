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
    const original = `![${img.alt}](${img.originalSrc})`;
    const placeholder = `<img src="__MARP_IMAGE_${img.index}__" alt="${img.alt}" />`;
    processed = processed.replace(original, placeholder);
  });

  return processed;
}


export function createViteMarpPlugin(
  config: MarpConfig,
  command: 'dev' | 'build' | 'preview',
  logger?: any
): Plugin {
  const isBuild = command === 'build';
  return {
    name: 'vite-plugin-marp',
    enforce: 'pre',
    load(id) {
      if (!isMarpFile(id)) return;
      logger.debug(`[vite-plugin-marp] Loading id: ${id}`);
    },

    async transform(code: string, id: string) {
      if (!isMarpFile(id)) return;

      try {
        const parsed = await parseMarpFile(code);
        const theme = resolveTheme(config.defaultTheme || 'am_blue', logger);
        const sourceHash = generateSourceHash(code, theme, config);

        // Use the theme from frontmatter if specified
        const effectiveTheme = parsed.frontmatter.theme ? resolveTheme(parsed.frontmatter.theme as string, logger) : theme;

        // Collect images for ESM import generation (triggers Astro's asset pipeline)
        const images = await collectImagesFromMarkdown(code, id, logger);

        // Generate ESM import statements
        const imageImports = generateImageImports(images);

        // Replace images in markdown with placeholders
        const processedMarkdown = images.length > 0
          ? replaceImagesWithPlaceholders(code, images)
          : code;

        // Run Marp CLI to process the markdown
        if (config.debug) {
          logger.info(`Processing ${id}`);
        }
        const marpResult = await runMarpCli(processedMarkdown, {
          theme: effectiveTheme,
          html: true,
        });

        if (marpResult.error) {
          logger.warn(`[astro-marp] Warning processing ${id}:`, marpResult.error);
        }

        // Track for build summary
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
import { createComponent, render, renderJSX, renderComponent, unescapeHTML } from "astro/runtime/server/index.js";
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

    return render\`\${unescapeHTML(processedHtml)}\`;
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
import { createComponent, render, renderJSX, renderComponent, unescapeHTML } from "astro/runtime/server/index.js";
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
    return render\`\${unescapeHTML(compiledContent())}\`;
});

export default Content;
`;

        return {
          code: errorCode,
          map: null,
        };
      }
    },
  };
}