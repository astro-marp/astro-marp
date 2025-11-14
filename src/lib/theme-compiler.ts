import * as sass from 'sass';
import { NodePackageImporter } from 'sass';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Options for theme compilation
 */
export interface ThemeCompilerOptions {
  /** Enable caching (default: true) */
  enableCache?: boolean;
  /** Output style (default: 'compressed') */
  outputStyle?: 'expanded' | 'compressed';
  /** Enable source maps (default: false) */
  sourceMap?: boolean;
}

/**
 * Result of theme compilation
 */
export interface ThemeCompilerResult {
  /** Compiled CSS */
  css: string;
  /** Whether result was served from cache */
  cached: boolean;
  /** Compilation time in milliseconds */
  compilationTime: number;
}

/**
 * Cache entry structure
 */
interface CacheEntry {
  /** Compiled CSS content */
  css: string;
  /** MD5 hash of source file content */
  hash: string;
  /** Timestamp of cache entry creation */
  timestamp: number;
}

// In-memory cache for compiled themes
const themeCache = new Map<string, CacheEntry>();

/**
 * Generate MD5 hash from file content.
 *
 * Used for cache invalidation by detecting when theme files have changed.
 *
 * @param filePath - Absolute path to the file
 * @returns MD5 hash of file content as hex string
 * @throws Error if file cannot be read
 */
export function generateFileHash(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return createHash('md5').update(content).digest('hex');
  } catch (error) {
    throw new Error(`Failed to read file for hashing: ${filePath} - ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Compile SCSS theme file to CSS with intelligent caching.
 *
 * Compiles .scss theme files using the sass package. Results are cached
 * in memory with hash-based invalidation to avoid repeated compilation
 * of unchanged files.
 *
 * @param themePath - Absolute path to the .scss theme file
 * @param options - Compilation options
 * @returns Promise resolving to compilation result with CSS, cache status, and timing
 * @throws Error if file not found or compilation fails
 *
 * @example
 * ```typescript
 * const result = await compileTheme('/path/to/theme.scss');
 * console.log(result.css); // Compiled CSS
 * console.log(result.cached); // false on first compile, true on subsequent
 * console.log(result.compilationTime); // Time in milliseconds
 * ```
 */
export async function compileTheme(
  themePath: string,
  options: ThemeCompilerOptions = {}
): Promise<ThemeCompilerResult> {
  const enableCache = options.enableCache ?? true;
  const outputStyle = options.outputStyle ?? 'compressed';
  const sourceMap = options.sourceMap ?? false;

  // Check cache if enabled
  if (enableCache && themeCache.has(themePath)) {
    const cached = themeCache.get(themePath)!;

    try {
      // Validate cache with file hash
      const currentHash = generateFileHash(themePath);

      if (cached.hash === currentHash) {
        // Cache hit - return cached result
        return {
          css: cached.css,
          cached: true,
          compilationTime: 0,
        };
      }

      // Cache stale - will recompile below
    } catch {
      // File might have been deleted, will fail below with proper error
    }
  }

  // Compile theme
  const startTime = Date.now();

  try {
    console.log(`[theme-compiler] DEBUG: Compiling theme: ${themePath}`);
    console.log(`[theme-compiler] DEBUG: File exists? ${existsSync(themePath)}`);

    // Use NodePackageImporter for robust npm package resolution
    // This handles both pkg: protocol and standard node_modules resolution
    // Works correctly with pnpm's content-addressable storage structure
    const themeDir = dirname(themePath);
    console.log(`[theme-compiler] DEBUG: themeDir: ${themeDir}`);

    // Find package root for NodePackageImporter entry point
    // NodePackageImporter needs to start from a directory with access to node_modules
    // In development: /project/src/themes -> use process.cwd()
    // In production: /project/node_modules/.pnpm/astro-marp@.../node_modules/astro-marp/src/themes
    //                -> need to find the astro-marp package root
    let entryPointDir = process.cwd();

    // Check if we're in node_modules (production)
    if (themePath.includes('node_modules')) {
      // Extract package root from path like:
      // .../node_modules/.pnpm/astro-marp@.../node_modules/astro-marp/src/themes/am_blue.scss
      // -> .../node_modules/.pnpm/astro-marp@.../node_modules/astro-marp
      const match = themePath.match(/(.*node_modules[/\\]astro-marp)/);
      if (match) {
        entryPointDir = match[1];
      }
    }

    const result = sass.compile(themePath, {
      style: outputStyle,
      sourceMap: sourceMap,
      loadPaths: [
        themeDir,        // Theme file's directory (for local @use "marp_default")
      ],
      importers: [
        // NodePackageImporter: Modern Sass package resolution (handles pkg: URLs)
        // Uses package root as entry point for proper node_modules resolution
        new NodePackageImporter(entryPointDir),
        {
          // Custom importer for local theme files
          // Handles bare imports like "marp_default" in the same directory
          findFileUrl(url: string): URL | null {
            console.log(`[theme-compiler] DEBUG: Custom importer called with url: "${url}"`);

            // Only handle local, relative imports without protocol
            if (!url.startsWith('~') && !url.startsWith('/') && !url.includes(':')) {
              // Try to resolve as .scss file in the same directory
              const scssPath = `${themeDir}/${url}.scss`;
              console.log(`[theme-compiler] DEBUG: Trying to resolve: ${scssPath}`);
              console.log(`[theme-compiler] DEBUG: File exists? ${existsSync(scssPath)}`);

              try {
                // Check if file exists by attempting to read
                readFileSync(scssPath);
                const fileUrl = pathToFileURL(scssPath);
                console.log(`[theme-compiler] DEBUG: Resolved to: ${fileUrl.href}`);
                return fileUrl;
              } catch (error) {
                // File doesn't exist, let Sass handle it
                console.log(`[theme-compiler] DEBUG: Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
                return null;
              }
            }

            console.log(`[theme-compiler] DEBUG: Skipping url (has protocol or starts with ~ or /)`);
            return null;
          },
        },
      ],
    });

    const compilationTime = Date.now() - startTime;
    const css = result.css;

    // Update cache if enabled
    if (enableCache) {
      const hash = generateFileHash(themePath);
      themeCache.set(themePath, {
        css,
        hash,
        timestamp: Date.now(),
      });
    }

    return {
      css,
      cached: false,
      compilationTime,
    };
  } catch (error) {
    if (error instanceof Error && 'message' in error) {
      // Check if it's a file not found error
      if (error.message.includes('no such file') || error.message.includes('ENOENT')) {
        throw new Error(`Theme file not found: ${themePath}`);
      }

      // SCSS syntax or compilation error
      throw new Error(`Failed to compile theme at ${themePath}: ${error.message}`);
    }

    throw new Error(`Failed to compile theme at ${themePath}: ${String(error)}`);
  }
}

/**
 * Clear all cached theme compilation results.
 *
 * Useful for testing or when you need to force recompilation of all themes.
 *
 * @example
 * ```typescript
 * clearThemeCache();
 * // All subsequent compileTheme() calls will recompile from source
 * ```
 */
export function clearThemeCache(): void {
  themeCache.clear();
}

/**
 * Get statistics about the current cache state.
 *
 * Returns information about cached themes including size and entries.
 *
 * @returns Object containing cache statistics
 *
 * @example
 * ```typescript
 * const stats = getCacheStats();
 * console.log(`Cached themes: ${stats.size}`);
 * console.log(`Cache entries:`, stats.entries);
 * ```
 */
export function getCacheStats(): {
  /** Number of cached themes */
  size: number;
  /** Array of cache entry details */
  entries: Array<{
    /** File path */
    path: string;
    /** File hash */
    hash: string;
    /** Timestamp */
    timestamp: number;
    /** CSS size in bytes */
    cssSize: number;
  }>;
} {
  const entries = Array.from(themeCache.entries()).map(([path, entry]) => ({
    path,
    hash: entry.hash,
    timestamp: entry.timestamp,
    cssSize: entry.css.length,
  }));

  return {
    size: themeCache.size,
    entries,
  };
}
