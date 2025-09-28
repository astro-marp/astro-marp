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

export function resolveTheme(themeName: string): string {
  // Handle built-in Marp themes (no file path needed)
  if (['default', 'gaia', 'uncover'].includes(themeName)) {
    return themeName;
  }

  // Handle built-in am_* themes with file paths
  if (['am_blue', 'am_brown', 'am_dark', 'am_green', 'am_purple', 'am_red'].includes(themeName)) {
    const themePath = resolve(THEMES_DIR, `${themeName}.scss`);
    if (existsSync(themePath)) {
      console.log(`[astro-marp] Using built-in theme: ${themeName} at ${themePath}`);
      return themePath;
    } else {
      console.warn(`[astro-marp] Built-in theme "${themeName}" not found at ${themePath}, falling back to "gaia"`);
      return 'gaia';
    }
  }

  // Handle absolute paths (for future extensibility)
  if (themeName.startsWith('/') && existsSync(themeName)) {
    return themeName;
  }

  // Fallback to default
  console.warn(`[astro-marp] Theme "${themeName}" not found, falling back to "default"`);
  return 'default';
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