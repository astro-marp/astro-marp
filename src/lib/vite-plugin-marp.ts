import type { Plugin } from 'vite';
import type { MarpConfig } from '../types.js';
import { parseMarpFile } from './marp-parser.js';
import { resolveTheme } from './theme-resolver.js';
import { runMarpCli, generateSourceHash } from './marp-runner.js';
import { pathToFileURL } from 'node:url';

function isMarpFile(id: string) {
  return /\.marp$/.test(id);
}


export function createViteMarpPlugin(config: MarpConfig): Plugin {
  return {
    name: 'vite-plugin-marp',
    enforce: 'pre',

    load(id) {
      if (!isMarpFile(id)) return;
      console.debug(`[vite-plugin-marp] Loading id: ${id}`);
    },

    async transform(code: string, id: string) {
      if (!isMarpFile(id)) return;

      try {
        const parsed = await parseMarpFile(code);
        const theme = resolveTheme(config.defaultTheme || 'am_blue');
        const sourceHash = generateSourceHash(code, theme, config);

        // Use the theme from frontmatter if specified
        const effectiveTheme = parsed.frontmatter.theme ? resolveTheme(parsed.frontmatter.theme as string) : theme;

        // Run Marp CLI to process the markdown - pass complete file with frontmatter for headingDivider processing
        const marpResult = await runMarpCli(code, {
          theme: effectiveTheme,
          html: true,
        });

        if (marpResult.error) {
          console.warn(`[astro-marp] Warning processing ${id}:`, marpResult.error);
        }

        // Complete unmodified Marp CLI output - following exact astro-typst pattern
        const componentCode = `
import { createComponent, render, renderJSX, renderComponent, unescapeHTML } from "astro/runtime/server/index.js";
import { AstroJSX, jsx } from 'astro/jsx-runtime';
import { readFileSync } from "node:fs";

export const name = "MarpComponent";
export const html = ${JSON.stringify(marpResult.html)};
export const frontmatter = ${JSON.stringify(parsed.frontmatter)};
export const file = ${JSON.stringify(id)};
export const url = ${JSON.stringify(pathToFileURL(id).href)};

export function rawContent() {
    return readFileSync(file, 'utf-8');
}

export function compiledContent() {
    return ${JSON.stringify(marpResult.html)};
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
export const name = "MarpErrorComponent";
export const marpHtml = ${JSON.stringify(errorHtml)};
export const html = marpHtml;
export const frontmatter = {};
export const file = ${JSON.stringify(id)};
export const url = ${JSON.stringify(pathToFileURL(id).href)};

export function rawContent() {
    return "";
}

export function compiledContent() {
    return marpHtml;
}

export function getHeadings() {
    return [];
}

export const Content = marpHtml;

export default marpHtml;
`;

        return {
          code: errorCode,
          map: null,
        };
      }
    },
  };
}