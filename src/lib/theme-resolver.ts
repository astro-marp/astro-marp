import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for discovered themes to avoid repeated file system access
let cachedThemes: string[] | null = null;

// Try multiple possible theme directories
function getThemesDir(_logger: any): string {
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

// Dynamically discover available themes from the themes directory
function getAvailableThemes(logger: any): string[] {
  if (cachedThemes !== null) {
    return cachedThemes;
  }

  const themesDir = getThemesDir(logger);

  try {
    if (!existsSync(themesDir)) {
      console.warn(`[astro-marp] Themes directory does not exist: ${themesDir}`);
      cachedThemes = [];
      return cachedThemes;
    }

    const files = readdirSync(themesDir);
    const themes = files
      .filter(file => file.endsWith('.scss'))
      .map(file => file.replace('.scss', ''))
      .sort(); // Sort for consistent ordering

    cachedThemes = themes;
    logger?.info(`[astro-marp] Discovered ${themes.length} themes: ${themes.join(', ')}`);
    return themes;
  } catch (error) {
    console.error(`[astro-marp] Error reading themes directory: ${error}`);
    cachedThemes = [];
    return cachedThemes;
  }
}



// Cache to prevent duplicate logging
const resolvedThemes = new Map<string, string>();

/**
 * Resolves a theme name to its absolute file path.
 *
 * Searches for built-in themes in the themes directory, or validates
 * absolute paths for custom themes.
 *
 * @param themeName - Name of the theme to resolve
 * @param logger - Logger for debug output
 * @returns Absolute path to the theme file, or fallback theme name
 */
export function resolveTheme(themeName: string, logger: any): string {
  // Return cached result if already resolved
  if (resolvedThemes.has(themeName)) {
    return resolvedThemes.get(themeName)!;
  }

  let result = '';

  // Handle available themes dynamically discovered from themes directory
  const availableThemes = getAvailableThemes(logger);
  if (availableThemes.includes(themeName)) {
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

export function validateTheme(themeName: string, logger?: any): boolean {
  const availableThemes = getAvailableThemes(logger);
  if (availableThemes.includes(themeName)) {
    return true;
  }

  if (themeName.startsWith('/') && existsSync(themeName)) {
    return true;
  }

  return false;
}

// Export available themes for external use
export function getThemeList(logger?: any): string[] {
  return getAvailableThemes(logger);
}

// Clear the themes cache (useful for testing or when themes directory changes)
export function clearThemeCache(): void {
  cachedThemes = null;
}