import type { AstroIntegration } from 'astro';
import type { MarpConfig } from './types.js';
import { resolveTheme, validateTheme } from './lib/theme-resolver.js';
import { createViteMarpPlugin } from './lib/vite-plugin-marp.js';
import { fileURLToPath } from 'node:url';

// Non-public API types (following astro-typst pattern)
interface SetupHookParams {
  addPageExtension: (extension: string) => void;
  addContentEntryType: (options: {
    extensions: string[];
    getEntryInfo: (params: { fileUrl: URL; contents: string }) => Promise<{
      data: Record<string, any>;
      body: string;
      slug?: string;
      rawData?: string;
    }>;
    handlePropagation?: boolean;
    contentModuleTypes?: string;
  }) => void;
  updateConfig: (config: any) => void;
  logger: any;
  [key: string]: any;
}


export default function marp(userConfig: MarpConfig = {}): AstroIntegration {
  const config: Required<MarpConfig> = {
    defaultTheme: 'am_blue',
    ...userConfig,
  };

  return {
    name: 'astro-marp',
    hooks: {
      'astro:config:setup': (options) => {
        const { addPageExtension, addContentEntryType, updateConfig, logger } = options as unknown as SetupHookParams;

        logger.info('Setting up Marp integration...');

        // Validate theme at setup time
        if (!validateTheme(config.defaultTheme)) {
          logger.warn(`Theme "${config.defaultTheme}" not found, using "default"`);
          config.defaultTheme = 'default';
        }


        // TODO: Re-enable page extension after fixing Vite plugin compatibility
        // addPageExtension('.marp');
        // logger.info('Registered .marp page extension');

        // Add content entry type for content collections
        addContentEntryType({
          extensions: ['.marp'],
          async getEntryInfo({ fileUrl, contents }) {
            const { parseMarpFile } = await import('./lib/marp-parser.js');
            const { frontmatter, content } = await parseMarpFile(contents);

            return {
              data: frontmatter,
              body: contents, // Raw file contents
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
        logger.info('Registered .marp content entry type');

        // Add Vite plugin for transformation
        updateConfig({
          vite: {
            plugins: [createViteMarpPlugin(config)],
          },
        });
        logger.info('Added Vite plugin for .marp transformation');
      },

      'astro:config:done': ({ config: astroConfig, logger, injectTypes }) => {
        const resolvedTheme = resolveTheme(config.defaultTheme);
        logger.info(`Marp integration ready with theme: ${resolvedTheme}`);

        // Inject TypeScript definitions
        injectTypes({
          filename: "astro-marp.d.ts",
          content: `declare module '*.marp' {
    const component: () => any;
    export default component;
}`,
        });
      },

      'astro:build:start': ({ logger }) => {
        logger.info('Starting Marp build process...');
      },

      'astro:build:done': ({ logger }) => {
        logger.info('Marp build process completed');
      },
    },
  };
}