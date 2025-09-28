import type { Plugin } from 'vite';
import type { MarpConfig } from '../types.js';
import { parseMarpFile, countSlides } from './marp-parser.js';
import { resolveTheme } from './theme-resolver.js';
import { runMarpCli, generateSourceHash } from './marp-runner.js';
import { ImageProcessor } from './image-processor.js';
import { pathToFileURL } from 'node:url';
import { basename } from 'node:path';

function isMarpFile(id: string) {
  return /\.marp$/.test(id);
}

function isVirtualMarpModule(id: string) {
  return id.startsWith('virtual:astro-marp/');
}

function getSlugFromId(id: string): string {
  return basename(id, '.marp');
}

export function createViteMarpPlugin(config: MarpConfig): Plugin {
  const virtualModules = new Map<string, string>();
  let getImageFunction: ((path: string) => Promise<{ src: string; width: number; height: number; format: string }>) | undefined;

  // Transform images to use Astro's asset pipeline
  async function transformImagesForAstro(content: string, filePath: string): Promise<{
    processedContent: string;
    images: any[];
    imageImports: string[];
  }> {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)(?:\s+"([^"]*)")?\)/g;
    const images: any[] = [];
    const imageImports: string[] = [];
    let processedContent = content;
    let match;
    let imageCounter = 0;

    while ((match = imageRegex.exec(content)) !== null) {
      const [fullMatch, alt, src, title] = match;

      if (src.startsWith('./') || src.startsWith('../')) {
        // Local image - create import statement and placeholder
        const importName = `image${imageCounter++}`;
        const importPath = src.startsWith('./') ? src : src;

        imageImports.push(`import ${importName} from '${importPath}';`);

        // Replace in content with placeholder that will be post-processed
        const placeholder = `![${alt}](ASTRO_IMAGE_${importName})`;
        processedContent = processedContent.replace(fullMatch, placeholder);

        images.push({
          original: src,
          importName,
          alt,
          placeholder: `ASTRO_IMAGE_${importName}`,
        });

        console.log(`[astro-marp] Processing local image: ${src} -> import ${importName}`);
      } else {
        // Remote image or absolute path - keep as-is
        images.push({
          original: src,
          optimizedSrc: src,
          alt,
        });

        console.log(`[astro-marp] Found external image: ${src} (will be processed by Astro's asset pipeline)`);
      }
    }

    return {
      processedContent,
      images,
      imageImports,
    };
  }

  return {
    name: 'vite-plugin-marp',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      // For now, we'll implement a simpler approach that works with Astro's public directory
      // In a full implementation, this would integrate with Astro's asset pipeline
      getImageFunction = undefined; // Will implement proper asset handling below
    },

    resolveId(id) {
      if (isVirtualMarpModule(id)) {
        return id;
      }
    },

    load(id) {
      if (isVirtualMarpModule(id)) {
        return virtualModules.get(id);
      }
      if (!isMarpFile(id)) return;

      // This will be transformed by the transform function
      return null;
    },

    async transform(code: string, id: string) {
      if (!isMarpFile(id)) return;

      try {
        const parsed = await parseMarpFile(code);
        const theme = resolveTheme(config.defaultTheme || 'am_blue');

        // Create image processor for this specific file
        const imageProcessor = new ImageProcessor({
          projectRoot: process.cwd(),
          filePath: id,
          getImage: getImageFunction, // Add Astro's getImage integration
        });

        // Process images first - transform to import syntax for Astro asset pipeline
        const { processedContent, images, imageImports } = await transformImagesForAstro(parsed.content, id);

        const sourceHash = generateSourceHash(processedContent, theme, config);

        // Use the theme from frontmatter if specified
        const effectiveTheme = parsed.frontmatter.theme ? resolveTheme(parsed.frontmatter.theme as string) : theme;

        // Run Marp CLI to process the image-processed markdown
        const marpResult = await runMarpCli(processedContent, {
          theme: effectiveTheme,
          html: true,
        });

        if (marpResult.error) {
          console.warn(`[astro-marp] Warning processing ${id}:`, marpResult.error);
        }

        // Create virtual module following the specification
        const slug = getSlugFromId(id);
        const virtualModuleId = `virtual:astro-marp/${slug}`;

        const meta = {
          id: slug,
          slug,
          title: parsed.title,
          theme: effectiveTheme,
          slidesCount: marpResult.slidesCount,
          filePath: id,
          updatedAt: new Date().toISOString(),
          sourceHash,
          images,
          frontmatter: parsed.frontmatter,
        };

        const virtualModuleCode = `
export const html = ${JSON.stringify(marpResult.html)};
export const meta = ${JSON.stringify(meta)};
export const raw = ${JSON.stringify(processedContent)};
`;

        virtualModules.set(virtualModuleId, virtualModuleCode);

        // Post-process HTML to replace image placeholders with optimized imports
        let processedHtml = marpResult.html;
        for (const image of images) {
          if (image.placeholder) {
            processedHtml = processedHtml.replace(
              new RegExp(`ASTRO_IMAGE_${image.importName}`, 'g'),
              `\${${image.importName}.src}`
            );
          }
        }

        // Return proper Astro component exports following astro-typst pattern
        const componentCode = `
import { createComponent, render, renderComponent, unescapeHTML } from "astro/runtime/server/index.js";
import { readFileSync } from "node:fs";
${imageImports.join('\n')}

export const name = "MarpComponent";
export const frontmatter = ${JSON.stringify(parsed.frontmatter)};
export const file = ${JSON.stringify(id)};
export const url = ${JSON.stringify(pathToFileURL(id).href)};

const htmlTemplate = ${JSON.stringify(processedHtml)};

export function rawContent() {
    return readFileSync(file, 'utf-8');
}

export function compiledContent() {
    // Replace template literals with actual values and return complete HTML
    let finalHtml = htmlTemplate;
    ${images.map(img => img.placeholder ?
      `finalHtml = finalHtml.replace(/ASTRO_IMAGE_${img.importName}/g, ${img.importName}.src);` : ''
    ).filter(Boolean).join('\n    ')}
    return finalHtml;
}

export function getHeadings() {
    return [];
}

export const Content = createComponent(async (result, _props, slots) => {
    const { layout, ...content } = frontmatter;
    const slot = await slots?.default?.();
    content.file = file;
    content.url = url;

    // Replace template literals with actual values at render time
    let finalHtml = htmlTemplate;
    ${images.map(img => img.placeholder ?
      `finalHtml = finalHtml.replace(/ASTRO_IMAGE_${img.importName}/g, ${img.importName}.src);` : ''
    ).filter(Boolean).join('\n    ')}

    return render\`<div>\${unescapeHTML(finalHtml)}</div>\`;
});

export const html = Content;
export default Content;
`;

        return {
          code: componentCode,
          map: null,
        };
      } catch (error) {
        console.error('[astro-marp] Error transforming .marp file:', error);

        // Return error component following the same pattern
        const errorCode = `
import { createComponent, render, unescapeHTML } from "astro/runtime/server/index.js";

export const name = "MarpErrorComponent";
export const frontmatter = {};
export const file = ${JSON.stringify(id)};
export const url = ${JSON.stringify(pathToFileURL(id).href)};

const htmlContent = "<div class='marp-error'><h1>Marp Processing Error</h1><p>" + ${JSON.stringify(String(error))} + "</p></div>";

export function rawContent() {
    return "";
}

export function compiledContent() {
    return htmlContent;
}

export const html = htmlContent;

export function getHeadings() {
    return [];
}

export const Content = createComponent(async (result, _props, slots) => {
    return render\`<div>\${unescapeHTML(htmlContent)}</div>\`;
});

export const html = Content;
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