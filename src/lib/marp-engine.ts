import { Marp } from '@marp-team/marp-core';
import { compileTheme } from './theme-compiler.js';
import { createHash } from 'node:crypto';

/**
 * Options for Marp engine
 */
export interface MarpEngineOptions {
  /** Theme file path (absolute path to .scss file) */
  theme?: string;
  /** Enable HTML (always true for us) */
  html?: boolean;
  /** Enable theme caching (default: true) */
  themeCache?: boolean;
  /** Debug mode (default: false) */
  debug?: boolean;
}

/**
 * Result from Marp engine
 */
export interface MarpEngineResult {
  /** Rendered HTML */
  html: string;
  /** Compiled CSS */
  css: string;
  /** Number of slides */
  slidesCount: number;
  /** Error message if rendering failed */
  error?: string;
  /** Compilation metadata */
  metadata?: {
    themeCompilationTime?: number;
    themeCached?: boolean;
    renderTime: number;
  };
}

/**
 * Count the number of slides in rendered HTML.
 *
 * Counts `<section>` tags which represent individual slides in Marp output.
 *
 * @param html - Rendered HTML string from Marp
 * @returns Number of slides found (minimum 1)
 */
function countSlidesInHtml(html: string): number {
  const matches = html.match(/<section[^>]*>/g);
  return matches ? matches.length : 1;
}

/**
 * Build and configure a Marp instance.
 *
 * Creates a new Marp instance with standard configuration including
 * HTML support, emoji rendering, and KaTeX math support.
 *
 * @param _options - Marp engine options (reserved for future use)
 * @returns Configured Marp instance
 */
function buildMarpInstance(_options: MarpEngineOptions): Marp {
  const marp = new Marp({
    html: true,
    emoji: {
      shortcode: true,
      unicode: true,
      twemoji: {
        base: 'https://cdn.jsdelivr.net/npm/@twemoji/api@latest/dist/',
      },
    },
    math: 'katex',
  });

  return marp;
}

/**
 * Render markdown to HTML using Marp Core.
 *
 * Main rendering function that:
 * 1. Initializes Marp instance
 * 2. Compiles and loads theme if provided
 * 3. Renders markdown to HTML/CSS
 * 4. Counts slides
 * 5. Tracks performance metrics
 * 6. Handles errors gracefully
 *
 * This function maintains backward compatibility with the old marp-runner.ts API
 * while adding new capabilities like CSS extraction and metadata tracking.
 *
 * @param markdown - Markdown content to render
 * @param options - Rendering options
 * @returns Promise resolving to render result with HTML, CSS, and metadata
 *
 * @example
 * ```typescript
 * const result = await renderWithMarpCore('# Hello World', {
 *   theme: '/path/to/theme.scss',
 *   debug: true
 * });
 * console.log(result.html); // Rendered HTML
 * console.log(result.css); // Compiled CSS
 * console.log(result.slidesCount); // Number of slides
 * ```
 */
export async function renderWithMarpCore(
  markdown: string,
  options: MarpEngineOptions = {}
): Promise<MarpEngineResult> {
  const { theme, themeCache = true, debug = false } = options;

  const startTime = Date.now();

  try {
    // Initialize Marp instance
    const marp = buildMarpInstance(options);

    let themeCompilationTime: number | undefined;
    let themeCached: boolean | undefined;

    // Compile and add theme if provided
    if (theme) {
      if (debug) {
        console.log(`[marp-engine] Compiling theme: ${theme}`);
      }

      try {
        const themeResult = await compileTheme(theme, {
          enableCache: themeCache,
          outputStyle: 'compressed',
          sourceMap: false,
        });

        themeCompilationTime = themeResult.compilationTime;
        themeCached = themeResult.cached;

        if (debug) {
          console.log(
            `[marp-engine] Theme compiled in ${themeResult.compilationTime}ms (cached: ${themeResult.cached})`
          );
        }

        // Add compiled CSS to Marp's theme set
        // themeSet.add() returns the created Theme instance with name property
        const addedTheme = marp.themeSet.add(themeResult.css);

        // Set the added theme as default
        marp.themeSet.default = addedTheme;

        if (debug) {
          console.log(`[marp-engine] Theme "${addedTheme.name}" set as default`);
        }
      } catch (themeError) {
        if (debug) {
          console.error(`[marp-engine] Theme compilation failed:`, themeError);
        }

        // Continue with default theme if custom theme fails
        if (themeError instanceof Error) {
          console.warn(`[marp-engine] Failed to compile theme, using default: ${themeError.message}`);
        }
      }
    }

    // Render markdown using Marp Core
    const { html, css } = marp.render(markdown);

    // Count slides
    const slidesCount = countSlidesInHtml(html);

    const renderTime = Date.now() - startTime;

    if (debug) {
      console.log(`[marp-engine] Rendered ${slidesCount} slides in ${renderTime}ms`);
    }

    return {
      html,
      css,
      slidesCount,
      metadata: {
        themeCompilationTime,
        themeCached,
        renderTime,
      },
    };
  } catch (error) {
    // Graceful error handling - return error HTML instead of throwing
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';

    if (debug) {
      console.error(`[marp-engine] Rendering failed:`, error);
    }

    return {
      html: `<div class="marp-error">
  <h1>Marp Core Error</h1>
  <p>${errorMessage}</p>
  <pre>${errorStack || 'No stack trace available'}</pre>
</div>`,
      css: `
.marp-error {
  font-family: system-ui, -apple-system, sans-serif;
  padding: 2rem;
  max-width: 800px;
  margin: 2rem auto;
  background: #fee;
  border: 2px solid #c33;
  border-radius: 8px;
}
.marp-error h1 {
  color: #c33;
  margin-top: 0;
}
.marp-error pre {
  background: #fff;
  padding: 1rem;
  overflow-x: auto;
  border-radius: 4px;
  font-size: 0.875rem;
}
`,
      slidesCount: 1,
      error: errorMessage,
      metadata: {
        renderTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Generate MD5 hash for caching purposes.
 *
 * Creates a hash from markdown content, theme path, and configuration
 * to enable efficient caching of render results. Compatible with the
 * old marp-runner.ts implementation.
 *
 * @param content - Markdown content
 * @param theme - Theme identifier or path
 * @param config - Additional configuration object
 * @returns MD5 hash string (8 characters)
 *
 * @example
 * ```typescript
 * const hash = generateSourceHash(markdown, '/path/to/theme.scss', { html: true });
 * // Returns: "a3f5c8d2" (8-character hash)
 * ```
 */
export function generateSourceHash(content: string, theme: string, config: any = {}): string {
  const hashInput = JSON.stringify({ content, theme, config });
  return createHash('md5').update(hashInput).digest('hex').substring(0, 8);
}
