import type { AstroIntegration } from 'astro';
import type { MarpConfig } from './types.js';
import { resolveTheme, validateTheme } from './lib/theme-resolver.js';
import { createViteMarpPlugin } from './lib/vite-plugin-marp.js';

// Non-public API types (following astro-typst pattern)
interface ContentEntryData {
  data: Record<string, unknown>;
  body: string;
  slug?: string;
  rawData?: string;
}

interface ContentEntryTypeOptions {
  extensions: string[];
  getEntryInfo: (params: { fileUrl: URL; contents: string }) => Promise<ContentEntryData>;
  handlePropagation?: boolean;
  contentModuleTypes?: string;
}

interface RendererConfig {
  name: string;
  serverEntrypoint: URL;
}

interface ViteConfig {
  plugins?: unknown[];
}

interface AstroConfig {
  vite?: ViteConfig;
}

interface AstroIntegrationLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug?: (message: string) => void;
}

interface SetupHookParams {
  addRenderer: (renderer: RendererConfig) => void;
  addContentEntryType: (options: ContentEntryTypeOptions) => void;
  updateConfig: (config: AstroConfig) => void;
  logger: AstroIntegrationLogger;
  command: 'dev' | 'build' | 'preview';
  [key: string]: unknown;
}


/**
 * Astro integration for Marp markdown presentations.
 *
 * This integration transforms `.marp` Markdown files into optimized presentation pages
 * with full Astro build pipeline integration, including image optimization and content collections.
 *
 * @param userConfig - Configuration options for the integration
 * @returns Astro integration object
 *
 * @example
 * ```typescript
 * // astro.config.mjs
 * import { marp } from 'astro-marp';
 *
 * export default defineConfig({
 *   integrations: [
 *     marp({
 *       defaultTheme: 'am_blue',
 *       debug: false
 *     })
 *   ]
 * });
 * ```
 */
export function marp(userConfig: MarpConfig = {}): AstroIntegration {
  // Validate and normalize configuration
  const config = {
    defaultTheme: 'am_blue',
    debug: false,
    maxSlides: 100,
    enableMermaid: true,
    marpCliArgs: [],
    ...userConfig,
  };

  // Validate configuration values
  if (config.maxSlides && (config.maxSlides < 1 || config.maxSlides > 1000)) {
    throw new Error('maxSlides must be between 1 and 1000');
  }

  if (config.marpCliArgs && !Array.isArray(config.marpCliArgs)) {
    throw new Error('marpCliArgs must be an array of strings');
  }

  return {
    name: 'astro-marp',
    hooks: {
      'astro:config:setup': (options) => {
        const { addRenderer, addContentEntryType, updateConfig, logger, command } = options as unknown as SetupHookParams;

        if (config.debug) {
          logger.info('[astro-marp] Setting up Marp integration...');
        }

        // Validate theme at setup time
        if (!validateTheme(config.defaultTheme)) {
          logger.warn(`[astro-marp] Theme "${config.defaultTheme}" not found, using "am_blue"`);
          config.defaultTheme = 'am_blue';
        }

        // Register renderer for .marp files
        addRenderer({
          name: 'astro:jsx',
          serverEntrypoint: new URL('../dist/renderer/index.js', import.meta.url),
        });
        if (config.debug) {
          logger.info('[astro-marp] Registered Marp renderer');
        }

        // Note: addPageExtension is removed in Astro 6
        // .marp files are routed via content collections with glob loader

        // Add content entry type for content collections
        addContentEntryType({
          extensions: ['.marp'],
          async getEntryInfo({ contents }) {
            const { parseMarpFile } = await import('./lib/marp-parser.js');
            const { frontmatter } = await parseMarpFile(contents);

            return {
              data: frontmatter,
              body: contents, // Raw content - image processing happens in Vite plugin
              slug: frontmatter.slug,
              rawData: contents, // astro-typst pattern
            };
          },
          handlePropagation: false, // Marp files cannot import scripts and styles directly
          contentModuleTypes: `
declare module 'astro:content' {
  interface Render {
    '.marp': Promise<{
      Content: import('astro').MarkdownInstance<{}>['Content'];
    }>;
  }
}
          `,
        });
        if (config.debug) {
          logger.info('Registered .marp content entry type');
        }

        // Add Vite plugin for transformation
        updateConfig({
          vite: {
            plugins: [createViteMarpPlugin(config, command, logger)],
          },
        });
        if (config.debug) {
          logger.info('Added Vite plugin for .marp transformation');
        }
      },

      'astro:config:done': ({ logger, injectTypes }) => {
        // Verify theme is valid
        resolveTheme(config.defaultTheme, logger);

        // Inject TypeScript definitions
        injectTypes({
          filename: "astro-marp.d.ts",
          content: `declare module '*.marp' {
    const component: () => any;
    export default component;
}`,
        });
      },

      'astro:build:start': async ({ logger: _logger }) => {
        // Clear asset tracking from previous builds
        const { clearProcessedAssets } = await import('./lib/vite-plugin-marp.js');
        clearProcessedAssets();
      },
    },
  };
}