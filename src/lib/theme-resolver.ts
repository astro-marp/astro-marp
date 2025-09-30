import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { AstroIntegrationLogger } from 'astro';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BUILT_IN_THEMES = ['am_blue', 'am_brown', 'am_dark', 'am_green', 'am_purple', 'am_red'];

// Try multiple possible theme directories
function getThemesDir(logger: any): string {
  const possibleDirs = [
    resolve(__dirname, '../themes'),           // When running from dist/
    resolve(__dirname, '../../src/themes'),    // When running from dist/lib/
    resolve(__dirname, '../src/themes'),       // Alternative structure
    resolve(__dirname, '../../themes'),        // Themes in package root
  ];

  for (const dir of possibleDirs) {
    if (existsSync(dir)) {
      // logger.info(`[astro-marp] Found themes directory: ${dir}`);
      return dir;
    }
  }

  console.warn(`[astro-marp] No themes directory found. Tried: ${possibleDirs.join(', ')}`);
  // Fallback to the first option
  return possibleDirs[0];
}



// Cache to prevent duplicate logging
const resolvedThemes = new Map<string, string>();

export function resolveTheme(themeName: string, logger: any): string {
  // Return cached result if already resolved
  if (resolvedThemes.has(themeName)) {
    return resolvedThemes.get(themeName)!;
  }

  let result = '';

  // Handle built-in Marp themes (no file path needed)
  if (['am_blue', 'am_brown', 'am_dark', 'am_green', 'am_purple', 'am_red'].includes(themeName)) {
    const THEMES_DIR = getThemesDir(logger);
    const themePath = resolve(THEMES_DIR, `${themeName}.scss`);
    result = themePath;

  }
  // Handle absolute paths (for future extensibility)
  else if (themeName.startsWith('/') && existsSync(themeName)) {
    result = themeName;
  }
  // Fallback to default
  else {
    console.warn(`[astro-marp] Theme "${themeName}" not found, falling back to "am_blue"`);
    result = 'am_blue';
  }

  // Cache the result
  resolvedThemes.set(themeName, result);
  return result;
}

export function validateTheme(themeName: string): boolean {
  if (BUILT_IN_THEMES.includes(themeName)) {
    return true;
  }

  if (themeName.startsWith('/') && existsSync(themeName)) {
    return true;
  }

  return false;
}