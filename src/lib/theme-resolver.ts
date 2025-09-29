import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BUILT_IN_THEMES = ['am_blue', 'am_brown', 'am_dark', 'am_green', 'am_purple', 'am_red', 'default', 'gaia', 'uncover'];

// Try multiple possible theme directories
function getThemesDir(): string {
  const possibleDirs = [
    resolve(__dirname, '../themes'),           // When running from dist/
    resolve(__dirname, '../../src/themes'),    // When running from dist/lib/
    resolve(__dirname, '../src/themes'),       // Alternative structure
    resolve(__dirname, '../../themes'),        // Themes in package root
  ];

  for (const dir of possibleDirs) {
    if (existsSync(dir)) {
      console.log(`[astro-marp] Found themes directory: ${dir}`);
      return dir;
    }
  }

  console.warn(`[astro-marp] No themes directory found. Tried: ${possibleDirs.join(', ')}`);
  // Fallback to the first option
  return possibleDirs[0];
}

const THEMES_DIR = getThemesDir();

// Cache to prevent duplicate logging
const resolvedThemes = new Map<string, string>();

export function resolveTheme(themeName: string): string {
  // Return cached result if already resolved
  if (resolvedThemes.has(themeName)) {
    return resolvedThemes.get(themeName)!;
  }

  let result: string;

  // Handle built-in Marp themes (no file path needed)
  if (['default', 'gaia', 'uncover'].includes(themeName)) {
    result = themeName;
  }
  // Handle built-in am_* themes with file paths
  else if (['am_blue', 'am_brown', 'am_dark', 'am_green', 'am_purple', 'am_red'].includes(themeName)) {
    const themePath = resolve(THEMES_DIR, `${themeName}.scss`);
    if (existsSync(themePath)) {
      console.log(`[astro-marp] Using built-in theme: ${themeName} at ${themePath}`);
      result = themePath;
    } else {
      console.warn(`[astro-marp] Built-in theme "${themeName}" not found at ${themePath}, falling back to "gaia"`);
      result = 'gaia';
    }
  }
  // Handle absolute paths (for future extensibility)
  else if (themeName.startsWith('/') && existsSync(themeName)) {
    result = themeName;
  }
  // Fallback to default
  else {
    console.warn(`[astro-marp] Theme "${themeName}" not found, falling back to "default"`);
    result = 'default';
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