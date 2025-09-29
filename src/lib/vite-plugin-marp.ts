import type { Plugin } from 'vite';
import type { MarpConfig } from '../types.js';
import { parseMarpFile } from './marp-parser.js';
import { resolveTheme } from './theme-resolver.js';
import { runMarpCli, generateSourceHash } from './marp-runner.js';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';

function isMarpFile(id: string) {
  return /\.marp$/.test(id);
}

function isLocalImage(src: string): boolean {
  // Check if it's a local image (not http/https/data URL)
  return !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:');
}

// Helper function to normalize paths like Astro's fileURLToNormalizedPath
function filePathToNormalizedPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

// Helper function to add forward slash
function prependForwardSlash(path: string): string {
  return path.startsWith('/') ? path : '/' + path;
}

async function processImagesInMarkdown(
  markdown: string,
  marpFilePath: string,
  emitFile?: (options: { type: 'asset'; fileName: string; source: Buffer | string }) => string
): Promise<string> {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let processedMarkdown = markdown;
  const marpDir = dirname(marpFilePath);

  // Collect all image promises for parallel processing
  const imagePromises: Promise<{ match: RegExpMatchArray; replacement: string }>[] = [];

  let match;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const [fullMatch, alt, src] = match;

    if (!isLocalImage(src)) {
      // Keep remote images unchanged
      continue;
    }

    const imagePromise = (async () => {
      try {
        // Resolve the image path relative to the .marp file
        const imagePath = resolve(marpDir, src);

        // Check if file exists
        if (!existsSync(imagePath)) {
          console.warn(`[astro-marp] Image file not found: ${imagePath}`);
          return {
            match,
            replacement: fullMatch, // Keep original if file doesn't exist
          };
        }

        // Simplified detection using environment variable like astro-typst
        const isBuild = import.meta.env.PROD && typeof emitFile === 'function';
        let optimizedSrc: string = '';

        if (isBuild) {
          // Build mode: emit file and use Astro asset placeholder
          const imageBuffer = readFileSync(imagePath);
          const fileExtension = extname(imagePath);
          const baseName = basename(imagePath, fileExtension);
          const contentHash = createHash('md5').update(imageBuffer).digest('hex').slice(0, 8);
          const fileName = `${baseName}_${contentHash}${fileExtension}`;

          // Emit the file and get the reference handle
          const handle = emitFile!({
            type: 'asset',
            fileName: `_astro/${fileName}`,
            source: imageBuffer,
          });

          // Use Astro's asset placeholder pattern
          optimizedSrc = `__ASTRO_ASSET_IMAGE__${handle}__`;
          //console.debug(`[astro-marp] Build mode: emitted ${src} with handle: ${handle}`);
        }

        if (!isBuild) {
          // Development mode: use Astro's /@fs pattern with metadata
          const url = pathToFileURL(imagePath);

          // Read image metadata for query params (following Astro's pattern)
          const imageBuffer = readFileSync(imagePath);
          // Basic image metadata - simplified version
          const format = extname(imagePath).slice(1).toLowerCase();

          // Add metadata query params like Astro does
          url.searchParams.append('origFormat', format);
          url.searchParams.append('astroMarpProcessed', 'true');

          // Use Astro's /@fs pattern
          optimizedSrc = `/@fs${prependForwardSlash(filePathToNormalizedPath(url.pathname + url.search))}`;
          //console.debug(`[astro-marp] Dev mode: using /@fs pattern for ${src}: ${optimizedSrc}`);
        }

        return {
          match,
          replacement: `<img src="${optimizedSrc}" alt="${alt}" />`,
        };
      } catch (error) {
        console.warn(`[astro-marp] Failed to process image ${src}:`, error);
        // Fallback to original markdown
        return {
          match,
          replacement: fullMatch,
        };
      }
    })();

    imagePromises.push(imagePromise);
  }

  // Process all images in parallel
  const imageResults = await Promise.all(imagePromises);

  // Apply replacements (in reverse order to maintain string indices)
  imageResults.reverse().forEach(({ match, replacement }) => {
    const startIndex = match.index!;
    const endIndex = startIndex + match[0].length;
    processedMarkdown = processedMarkdown.slice(0, startIndex) + replacement + processedMarkdown.slice(endIndex);
  });

  return processedMarkdown;
}


export function createViteMarpPlugin(config: MarpConfig): Plugin {
  return {
    name: 'vite-plugin-marp',
    enforce: 'pre',

    load(id) {
      if (!isMarpFile(id)) return;
      //console.debug(`[vite-plugin-marp] Loading id: ${id}`);
    },

    async transform(code: string, id: string) {
      if (!isMarpFile(id)) return;

      try {
        const parsed = await parseMarpFile(code);
        const theme = resolveTheme(config.defaultTheme || 'am_blue');
        const sourceHash = generateSourceHash(code, theme, config);

        // Use the theme from frontmatter if specified
        const effectiveTheme = parsed.frontmatter.theme ? resolveTheme(parsed.frontmatter.theme as string) : theme;

        // Process images in the markdown before Marp CLI
        const processedMarkdown = await processImagesInMarkdown(code, id, this.emitFile?.bind(this));

        // Run Marp CLI to process the processed markdown
        const marpResult = await runMarpCli(processedMarkdown, {
          theme: effectiveTheme,
          html: true,
        });

        if (marpResult.error) {
          console.warn(`[astro-marp] Warning processing ${id}:`, marpResult.error);
        }

        // Use the Marp CLI output directly (it now contains __ASTRO_IMAGE__ placeholders)
        const finalHtml = marpResult.html;

        // Complete Marp CLI output with optimized images - following exact astro-typst pattern
        const componentCode = `
import { createComponent, render, renderJSX, renderComponent, unescapeHTML } from "astro/runtime/server/index.js";
import { AstroJSX, jsx } from 'astro/jsx-runtime';
import { readFileSync } from "node:fs";

export const name = "MarpComponent";
export const html = ${JSON.stringify(finalHtml)};
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
    // Return unescaped HTML exactly like astro-typst
    return render\`\${unescapeHTML(compiledContent())}\`;
});

export default Content;
`;

        return {
          code: componentCode,
          map: null,
        };
      } catch (error) {
        console.error('[astro-marp] Error transforming .marp file:', error);

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