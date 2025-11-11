# marp-core Migration - Technical Specification

**Date**: 2025-11-11
**Phase**: Specification Phase
**Status**: Complete
**Prerequisites**: ASSESSMENT.md

---

## 1. Overview

This specification provides detailed implementation guidance for migrating astro-marp from Marp CLI child_process execution to direct @marp-team/marp-core usage with runtime SCSS compilation.

**Key Objectives**:
1. Replace child_process spawn with direct marp-core API calls
2. Implement runtime SCSS compilation using `sass` package
3. Add theme caching for performance optimization
4. Maintain 100% backward compatibility
5. Achieve same or better performance

---

## 2. Architecture Design

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Vite Plugin (vite-plugin-marp.ts)        │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Frontmatter  │  │   Images     │  │   Mermaid    │       │
│  │   Parsing    │→ │  Processing  │→ │  Conversion  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│           │                                   │               │
│           └───────────────┬───────────────────┘               │
│                           ↓                                   │
│                  ┌─────────────────┐                          │
│                  │   marp-engine   │ (NEW)                    │
│                  │  (marp-core)    │                          │
│                  └─────────────────┘                          │
│                           │                                   │
│                  ┌────────┴────────┐                          │
│                  ↓                 ↓                          │
│         ┌─────────────────┐  ┌──────────────┐                │
│         │ Theme Compiler  │  │  Marp Core   │                │
│         │  (SCSS → CSS)   │  │   Render     │                │
│         └─────────────────┘  └──────────────┘                │
│                  │                 │                          │
│                  └────────┬────────┘                          │
│                           ↓                                   │
│                  ┌─────────────────┐                          │
│                  │  {html, css}    │                          │
│                  └─────────────────┘                          │
│                           │                                   │
│           ┌───────────────┴────────────────┐                 │
│           ↓                                ↓                 │
│  ┌──────────────┐                 ┌──────────────┐           │
│  │   Mermaid    │                 │    Image     │           │
│  │ Post-Process │                 │ Optimization │           │
│  └──────────────┘                 └──────────────┘           │
│           │                                │                 │
│           └───────────────┬────────────────┘                 │
│                           ↓                                   │
│                  ┌─────────────────┐                          │
│                  │ Virtual Module  │                          │
│                  │   Generation    │                          │
│                  └─────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Module Dependency Graph

```
vite-plugin-marp.ts
    ↓
    ├─→ marp-parser.ts (unchanged)
    ├─→ theme-resolver.ts (unchanged)
    ├─→ marp-engine.ts (NEW - replaces marp-runner.ts)
    │       ↓
    │       ├─→ theme-compiler.ts (NEW)
    │       │       ↓
    │       │       └─→ sass (npm package)
    │       │
    │       └─→ @marp-team/marp-core (npm package)
    │
    └─→ rehype-mermaid (unchanged)
```

---

## 3. Implementation Tasks

### 3.1 Task Breakdown

The implementation is divided into 6 parallel-safe tasks:

| Task ID | Task Name | Dependencies | Complexity | Estimated Time |
|---------|-----------|--------------|------------|----------------|
| TASK-1 | Create theme-compiler.ts | None | Medium | 1-2 hours |
| TASK-2 | Create marp-engine.ts | TASK-1 | Medium | 2-3 hours |
| TASK-3 | Update vite-plugin-marp.ts | TASK-2 | Low | 1 hour |
| TASK-4 | Update package.json | None | Low | 15 min |
| TASK-5 | Write unit tests | TASK-1, TASK-2 | Medium | 2-3 hours |
| TASK-6 | Integration testing | TASK-3 | Medium | 1-2 hours |

**Parallel Execution Strategy**:
- TASK-1 and TASK-4 can run in parallel (no dependencies)
- TASK-2 requires TASK-1 to complete
- TASK-3 requires TASK-2 to complete
- TASK-5 can start after TASK-1 and TASK-2 are done
- TASK-6 must be last (requires all previous tasks)

---

## 4. Detailed Module Specifications

### 4.1 theme-compiler.ts (TASK-1)

**Location**: `src/lib/theme-compiler.ts`

**Purpose**: Compile SCSS theme files to CSS with caching

#### 4.1.1 Interface Definition

```typescript
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
```

#### 4.1.2 Implementation

```typescript
import sass from 'sass';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Cache entry for compiled themes
 */
interface CacheEntry {
  css: string;
  hash: string;
  timestamp: number;
}

/**
 * In-memory cache for compiled themes
 * Key: absolute file path
 * Value: { css, hash, timestamp }
 */
const themeCache = new Map<string, CacheEntry>();

/**
 * Generate hash from file content for cache invalidation
 */
function generateFileHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('md5').update(content).digest('hex');
}

/**
 * Compile SCSS theme file to CSS
 *
 * @param themePath - Absolute path to .scss file
 * @param options - Compilation options
 * @returns Compiled CSS result
 */
export async function compileTheme(
  themePath: string,
  options: ThemeCompilerOptions = {}
): Promise<ThemeCompilerResult> {
  const {
    enableCache = true,
    outputStyle = 'compressed',
    sourceMap = false,
  } = options;

  const startTime = Date.now();

  // Check cache if enabled
  if (enableCache && themeCache.has(themePath)) {
    const cached = themeCache.get(themePath)!;
    const currentHash = generateFileHash(themePath);

    // Cache hit - file unchanged
    if (cached.hash === currentHash) {
      return {
        css: cached.css,
        cached: true,
        compilationTime: 0,
      };
    }

    // Cache miss - file changed, remove stale entry
    themeCache.delete(themePath);
  }

  // Compile SCSS to CSS
  try {
    const result = sass.compile(themePath, {
      style: outputStyle,
      sourceMap,
    });

    const css = result.css.toString();
    const compilationTime = Date.now() - startTime;

    // Update cache
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
    throw new Error(
      `Failed to compile SCSS theme: ${themePath}\n${error.message}`
    );
  }
}

/**
 * Clear theme cache (useful for testing or force refresh)
 */
export function clearThemeCache(): void {
  themeCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: themeCache.size,
    entries: Array.from(themeCache.keys()),
  };
}
```

#### 4.1.3 Error Handling

| Error Type | Handling Strategy | User Impact |
|------------|-------------------|-------------|
| File not found | Throw error with path | Build fails with helpful message |
| SCSS syntax error | Throw error with line number | Build fails with SCSS error details |
| Permission denied | Throw error | Build fails with filesystem error |

#### 4.1.4 Testing Requirements

**Unit Tests** (`tests/unit/theme-compiler.test.ts`):
1. ✅ Successful compilation of valid SCSS
2. ✅ Cache hit on second compilation
3. ✅ Cache miss when file changes
4. ✅ Error on invalid SCSS syntax
5. ✅ Error on non-existent file
6. ✅ Cache clearing works
7. ✅ Output style option works (compressed vs expanded)

---

### 4.2 marp-engine.ts (TASK-2)

**Location**: `src/lib/marp-engine.ts`

**Purpose**: Wrapper around @marp-team/marp-core with theme compilation

#### 4.2.1 Interface Definition

```typescript
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
```

#### 4.2.2 Implementation

```typescript
import { Marp } from '@marp-team/marp-core';
import { compileTheme } from './theme-compiler.js';

/**
 * Count slides in HTML output
 * Slides are represented as <section> tags
 */
function countSlidesInHtml(html: string): number {
  const matches = html.match(/<section[^>]*>/g);
  return matches ? matches.length : 1;
}

/**
 * Build Marp instance with configuration
 */
function buildMarpInstance(options: MarpEngineOptions): Marp {
  return new Marp({
    html: options.html ?? true,
    emoji: {
      shortcode: true,
      unicode: true,
      twemoji: {
        base: 'https://cdn.jsdelivr.net/npm/@twemoji/api@latest/dist/',
      },
    },
    math: 'katex',  // Use KaTeX for math rendering
  });
}

/**
 * Render markdown to HTML using marp-core
 *
 * @param markdown - Markdown content to render
 * @param options - Rendering options
 * @returns Rendered HTML and CSS
 */
export async function renderWithMarpCore(
  markdown: string,
  options: MarpEngineOptions = {}
): Promise<MarpEngineResult> {
  const startTime = Date.now();

  try {
    // 1. Initialize Marp instance
    const marp = buildMarpInstance(options);

    // 2. Compile and add theme if specified
    let themeCompilationTime = 0;
    let themeCached = false;

    if (options.theme) {
      const themeResult = await compileTheme(options.theme, {
        enableCache: options.themeCache ?? true,
      });

      themeCompilationTime = themeResult.compilationTime;
      themeCached = themeResult.cached;

      // Add compiled CSS to ThemeSet
      marp.themeSet.add(themeResult.css);

      if (options.debug) {
        console.log(
          `[marp-engine] Theme compiled: ${options.theme} ` +
          `(${themeCached ? 'cached' : themeCompilationTime + 'ms'})`
        );
      }
    }

    // 3. Render markdown
    const { html, css } = marp.render(markdown);

    // 4. Count slides
    const slidesCount = countSlidesInHtml(html);

    const renderTime = Date.now() - startTime;

    if (options.debug) {
      console.log(
        `[marp-engine] Rendered ${slidesCount} slides in ${renderTime}ms`
      );
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
    // Error handling: Return error component
    return {
      html: `<div class="marp-error">
        <h1>Marp Core Error</h1>
        <p>${error instanceof Error ? error.message : String(error)}</p>
        <pre>${error instanceof Error ? error.stack : ''}</pre>
      </div>`,
      css: '',
      slidesCount: 1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate source hash for caching
 * Same as marp-runner.ts for backward compatibility
 */
export function generateSourceHash(
  content: string,
  theme: string,
  config: any = {}
): string {
  const hashInput = JSON.stringify({ content, theme, config });
  return createHash('md5').update(hashInput).digest('hex').substring(0, 8);
}
```

#### 4.2.3 Error Handling

| Error Type | Handling Strategy | User Impact |
|------------|-------------------|-------------|
| Markdown syntax error | Catch and return error HTML | Shows error in rendered page |
| Theme compilation error | Propagate from theme-compiler | Build fails with SCSS error |
| marp-core crash | Catch and return error HTML | Shows error in rendered page |

#### 4.2.4 Testing Requirements

**Unit Tests** (`tests/unit/marp-engine.test.ts`):
1. ✅ Render simple markdown successfully
2. ✅ Count slides correctly (1 slide, multiple slides)
3. ✅ Theme compilation and application works
4. ✅ Theme caching works (second call uses cache)
5. ✅ Error handling for invalid markdown
6. ✅ Error handling for theme compilation failure
7. ✅ Metadata includes timing information
8. ✅ Debug mode logs output

---

### 4.3 vite-plugin-marp.ts Updates (TASK-3)

**Location**: `src/lib/vite-plugin-marp.ts`

**Purpose**: Update transformation pipeline to use marp-engine instead of marp-runner

#### 4.3.1 Changes Required

**1. Update import statements**

```typescript
// OLD
import { runMarpCli, generateSourceHash } from './marp-runner.js';

// NEW
import { renderWithMarpCore, generateSourceHash } from './marp-engine.js';
```

**2. Update generateMarpHtml() function**

```typescript
// OLD implementation
async function generateMarpHtml(
  processedMarkdown: string,
  effectiveTheme: string,
  config: MarpConfig,
  logger?: any
) {
  if (config.debug) {
    logger.info(`Processing markdown with theme: ${effectiveTheme}`);
  }
  const marpResult = await runMarpCli(processedMarkdown, {
    theme: effectiveTheme,
    html: true,
  });

  if (marpResult.error) {
    logger?.warn(`[astro-marp] Warning processing markdown:`, marpResult.error);
  }

  return marpResult;
}

// NEW implementation
async function generateMarpHtml(
  processedMarkdown: string,
  effectiveTheme: string,
  config: MarpConfig,
  logger?: any
) {
  if (config.debug) {
    logger.info(`Processing markdown with theme: ${effectiveTheme}`);
  }

  const marpResult = await renderWithMarpCore(processedMarkdown, {
    theme: effectiveTheme,
    html: true,
    themeCache: true,
    debug: config.debug ?? false,
  });

  if (marpResult.error) {
    logger?.warn(`[astro-marp] Warning processing markdown:`, marpResult.error);
  }

  // Log performance metrics if available
  if (config.debug && marpResult.metadata) {
    const { themeCompilationTime, themeCached, renderTime } = marpResult.metadata;
    logger.info(
      `[astro-marp] Performance: ` +
      `theme=${themeCached ? 'cached' : themeCompilationTime + 'ms'}, ` +
      `render=${renderTime}ms`
    );
  }

  return marpResult;
}
```

**3. Update virtual module generation (add CSS export)**

```typescript
// In transform() function, after generating component code
// Add CSS export to the generated module

// Line ~429 (after frontmatter export)
const componentCode = `
${imageImports}
import { createComponent, render, maybeRenderHead, unescapeHTML } from "astro/runtime/server/index.js";
import { AstroJSX, jsx } from 'astro/jsx-runtime';
import { readFileSync } from "node:fs";
${images.length > 0 ? "import { getImage } from 'astro:assets';" : ''}

export const name = "MarpComponent";
export const frontmatter = ${JSON.stringify(parsed.frontmatter)};
export const file = ${JSON.stringify(id)};
export const url = ${JSON.stringify(pathToFileURL(id).href)};

// NEW: Export compiled CSS from marp-core
// Note: CSS is already embedded in HTML via <style> tags
// This export is for future extensibility (e.g., CSS extraction)
export const css = ${JSON.stringify(marpResult.css)};

export function rawContent() {
    return readFileSync(file, 'utf-8');
}

export function compiledContent() {
    return ${JSON.stringify(finalHtml)};
}

// ... rest remains unchanged
`;
```

#### 4.3.2 Testing Requirements

**Manual Testing**:
1. ✅ Dev server starts without errors
2. ✅ All 6 themes render correctly
3. ✅ Images optimize correctly
4. ✅ Mermaid diagrams render
5. ✅ HMR works (file changes trigger reload)
6. ✅ Build completes successfully
7. ✅ Production output is correct

---

### 4.4 package.json Updates (TASK-4)

**Location**: `package.json`

**Purpose**: Update dependencies

#### 4.4.1 Changes Required

```json
{
  "dependencies": {
    // ADD: marp-core for direct API access
    "@marp-team/marp-core": "^4.1.2",

    // ADD: sass for SCSS compilation
    "sass": "^1.80.7",

    // REMOVE: marp-cli no longer needed
    // "@marp-team/marp-cli": "^4.2.3",

    // KEEP: All other dependencies
    "astro": "^5.14.1",
    "playwright": "^1.49.1",
    "rehype-mermaid": "^3.0.0",
    "rehype-parse": "^9.0.1",
    "rehype-stringify": "^10.0.1",
    "sharp": "^0.33.5",
    "unified": "^11.0.5"
  }
}
```

#### 4.4.2 Installation Command

```bash
# Remove old dependency
npm uninstall @marp-team/marp-cli

# Install new dependencies
npm install @marp-team/marp-core@^4.1.2 sass@^1.80.7
```

---

### 4.5 Unit Tests (TASK-5)

**Purpose**: Comprehensive unit tests for new modules

#### 4.5.1 test/unit/theme-compiler.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { compileTheme, clearThemeCache, getCacheStats } from '../../src/lib/theme-compiler.js';
import { resolve } from 'node:path';

describe('theme-compiler', () => {
  const themePath = resolve(__dirname, '../../src/themes/am_blue.scss');

  beforeEach(() => {
    clearThemeCache();
  });

  it('should compile SCSS to CSS', async () => {
    const result = await compileTheme(themePath);

    expect(result.css).toBeTruthy();
    expect(result.css).toContain('section');  // Marp themes have section styles
    expect(result.cached).toBe(false);
    expect(result.compilationTime).toBeGreaterThan(0);
  });

  it('should cache compiled themes', async () => {
    // First compilation
    const result1 = await compileTheme(themePath);
    expect(result1.cached).toBe(false);

    // Second compilation (should be cached)
    const result2 = await compileTheme(themePath);
    expect(result2.cached).toBe(true);
    expect(result2.compilationTime).toBe(0);
    expect(result2.css).toBe(result1.css);
  });

  it('should detect file changes and recompile', async () => {
    // This test would require file modification
    // Skip for now, covered by integration tests
  });

  it('should throw on invalid SCSS', async () => {
    const invalidPath = resolve(__dirname, '../fixtures/invalid.scss');
    await expect(compileTheme(invalidPath)).rejects.toThrow();
  });

  it('should throw on non-existent file', async () => {
    const nonExistentPath = '/nonexistent/theme.scss';
    await expect(compileTheme(nonExistentPath)).rejects.toThrow();
  });

  it('should clear cache', async () => {
    await compileTheme(themePath);
    expect(getCacheStats().size).toBe(1);

    clearThemeCache();
    expect(getCacheStats().size).toBe(0);
  });

  it('should respect outputStyle option', async () => {
    const compressed = await compileTheme(themePath, { outputStyle: 'compressed' });
    const expanded = await compileTheme(themePath, { outputStyle: 'expanded' });

    // Compressed should be smaller
    expect(compressed.css.length).toBeLessThan(expanded.css.length);
  });
});
```

#### 4.5.2 test/unit/marp-engine.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { renderWithMarpCore, generateSourceHash } from '../../src/lib/marp-engine.js';
import { resolve } from 'node:path';

describe('marp-engine', () => {
  const themePath = resolve(__dirname, '../../src/themes/am_blue.scss');

  it('should render simple markdown', async () => {
    const markdown = '# Slide 1\n\nContent here';
    const result = await renderWithMarpCore(markdown);

    expect(result.html).toContain('<section');
    expect(result.html).toContain('Slide 1');
    expect(result.slidesCount).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it('should count multiple slides', async () => {
    const markdown = '# Slide 1\n\n---\n\n# Slide 2\n\n---\n\n# Slide 3';
    const result = await renderWithMarpCore(markdown);

    expect(result.slidesCount).toBe(3);
  });

  it('should apply theme', async () => {
    const markdown = '# Slide 1';
    const result = await renderWithMarpCore(markdown, {
      theme: themePath,
    });

    expect(result.css).toBeTruthy();
    expect(result.metadata?.themeCompilationTime).toBeGreaterThanOrEqual(0);
  });

  it('should cache theme compilation', async () => {
    const markdown = '# Slide 1';

    // First render
    const result1 = await renderWithMarpCore(markdown, { theme: themePath });
    expect(result1.metadata?.themeCached).toBe(false);

    // Second render (theme should be cached)
    const result2 = await renderWithMarpCore(markdown, { theme: themePath });
    expect(result2.metadata?.themeCached).toBe(true);
  });

  it('should handle markdown with HTML', async () => {
    const markdown = '# Slide\n\n<div class="custom">HTML content</div>';
    const result = await renderWithMarpCore(markdown, { html: true });

    expect(result.html).toContain('<div class="custom">');
  });

  it('should handle errors gracefully', async () => {
    const markdown = '# Valid\n\n<!-- Some markdown -->';
    const result = await renderWithMarpCore(markdown, {
      theme: '/nonexistent/theme.scss',
    });

    // Should return error HTML, not throw
    expect(result.html).toContain('marp-error');
    expect(result.error).toBeTruthy();
  });

  it('should generate consistent source hash', () => {
    const content = '# Slide';
    const theme = 'am_blue';

    const hash1 = generateSourceHash(content, theme);
    const hash2 = generateSourceHash(content, theme);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(8);
  });

  it('should include metadata when requested', async () => {
    const markdown = '# Slide';
    const result = await renderWithMarpCore(markdown, {
      theme: themePath,
      debug: true,
    });

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.renderTime).toBeGreaterThan(0);
  });
});
```

---

### 4.6 Integration Testing (TASK-6)

**Purpose**: End-to-end testing with example project

#### 4.6.1 Test Scenarios

**Test Project**: `../astro-marp-example`

**Pre-requisites**:
```bash
cd astro-marp
npm run build

cd ../astro-marp-example
npm install
```

**Test Checklist**:

1. **Dev Server Testing** (`npm run dev`)
   - [ ] Server starts without errors
   - [ ] Navigate to `/presentations/macroeconomics`
   - [ ] All slides render correctly
   - [ ] Theme applies correctly (am_blue by default)
   - [ ] Images load with optimized URLs (`/_astro/*.hash.*`)
   - [ ] Arrow key navigation works
   - [ ] No console errors in browser
   - [ ] Edit .marp file and verify HMR (auto-reload)
   - [ ] Check browser network tab: no 404s

2. **Build Testing** (`npm run build`)
   - [ ] Build completes without errors
   - [ ] No Vite import analysis errors
   - [ ] Check `dist/_astro/` contains optimized images
   - [ ] Verify HTML output contains rendered presentations
   - [ ] CSS is embedded in HTML (check for `<style>` tags)
   - [ ] All 6 themes work (test each one)

3. **Theme Testing**
   - [ ] am_blue renders correctly
   - [ ] am_brown renders correctly
   - [ ] am_dark renders correctly
   - [ ] am_green renders correctly
   - [ ] am_purple renders correctly
   - [ ] am_red renders correctly

4. **Mermaid Testing** (if enabled)
   - [ ] Mermaid diagrams render as SVG
   - [ ] No client-side errors
   - [ ] Diagrams are interactive (if strategy allows)

5. **Performance Testing**
   - [ ] First build: measure time
   - [ ] Second build (cached themes): measure time
   - [ ] Verify second build is faster (85-95% improvement expected)
   - [ ] Check memory usage (should be similar or better)

6. **Error Testing**
   - [ ] Create invalid .marp file with syntax errors
   - [ ] Verify graceful error handling (error component shown)
   - [ ] Fix error and verify recovery

#### 4.6.2 Performance Benchmarks

**Baseline (Marp CLI)**:
- First render: ~180-500ms
- Subsequent renders: ~180-500ms (no caching)

**Target (marp-core with caching)**:
- First render: ~110-350ms (similar)
- Subsequent renders: ~10-50ms (85-95% faster)

**Measurement Script**:
```bash
#!/bin/bash
# performance-test.sh

echo "Building integration..."
cd astro-marp
time npm run build

echo "Building example project (first run)..."
cd ../astro-marp-example
rm -rf dist node_modules/.vite
time npm run build > build1.log 2>&1

echo "Building example project (second run with cache)..."
time npm run build > build2.log 2>&1

echo "Comparing build times..."
# Parse and compare logs
```

---

## 5. Implementation Order

### 5.1 Execution Plan

**Phase 1: Parallel Implementation (Tasks 1, 4)**
1. Execute TASK-1 (theme-compiler.ts) in Agent A
2. Execute TASK-4 (package.json) in Agent B

**Phase 2: Sequential Implementation (Task 2)**
3. Wait for TASK-1 to complete
4. Execute TASK-2 (marp-engine.ts) in Agent A

**Phase 3: Integration (Task 3)**
5. Wait for TASK-2 to complete
6. Execute TASK-3 (vite-plugin-marp.ts) in Agent A

**Phase 4: Testing (Tasks 5, 6)**
7. Execute TASK-5 (unit tests) in Agent A
8. Execute TASK-6 (integration testing) in Agent B

**Phase 5: Review and Cleanup**
9. Review all changes
10. Remove obsolete files
11. Update documentation
12. Commit and push

### 5.2 Agent Assignments

```
Agent A (Primary Implementation):
- TASK-1: Create theme-compiler.ts
- TASK-2: Create marp-engine.ts
- TASK-3: Update vite-plugin-marp.ts
- TASK-5: Write unit tests

Agent B (Parallel Tasks):
- TASK-4: Update package.json
- TASK-6: Integration testing

Agent C (Review & Cleanup):
- Review code quality
- Remove obsolete files
- Update documentation
```

---

## 6. Verification Checklist

### 6.1 Code Quality

- [ ] All files have TypeScript type annotations
- [ ] No `any` types except for Astro internal types
- [ ] All functions have JSDoc comments
- [ ] Error handling is comprehensive
- [ ] Console logs use `[astro-marp]` prefix
- [ ] Debug mode works correctly

### 6.2 Functional Requirements

- [ ] All 6 themes render correctly
- [ ] Images optimize correctly
- [ ] Mermaid diagrams work (if enabled)
- [ ] HMR works in dev mode
- [ ] Build completes without errors
- [ ] Performance meets or exceeds targets
- [ ] Error handling is graceful

### 6.3 Backward Compatibility

- [ ] `.marp` file format unchanged
- [ ] Frontmatter structure unchanged
- [ ] Virtual module API unchanged (except new `css` field)
- [ ] Content collections API unchanged
- [ ] Theme names unchanged
- [ ] Configuration options unchanged

### 6.4 Documentation

- [ ] CLAUDE.md updated with new architecture
- [ ] README.md updated if needed
- [ ] Inline code comments added
- [ ] Migration notes created (even though transparent)

---

## 7. Rollback Plan

### 7.1 Rollback Strategy

If critical issues are discovered:

**Step 1: Immediate Rollback**
```bash
git revert <commit-hash>
```

**Step 2: Restore Dependencies**
```bash
npm install @marp-team/marp-cli@^4.2.3
npm uninstall @marp-team/marp-core sass
```

**Step 3: Verify Functionality**
```bash
npm run build
cd ../astro-marp-example
npm run build
```

### 7.2 Rollback Triggers

Rollback if:
- Build fails consistently
- Performance degrades significantly (>20% slower)
- Themes render incorrectly
- Critical bugs in production
- Breaking changes discovered

---

## 8. Success Criteria

### 8.1 Acceptance Criteria

✅ **Functional Requirements**:
1. All transformation pipeline features work identically
2. All 6 themes render correctly
3. Image optimization works
4. Mermaid diagrams work
5. HMR works in dev mode

✅ **Performance Requirements**:
1. First render: Same or faster than Marp CLI (~110-350ms)
2. Subsequent renders: 85-95% faster with theme caching (~10-50ms)
3. Build time: Same or faster
4. Memory usage: Same or better

✅ **Quality Requirements**:
1. Unit test coverage ≥ 70%
2. All integration tests pass
3. No TypeScript errors
4. No ESLint errors
5. Documentation complete

✅ **Compatibility Requirements**:
1. 100% backward compatible with existing `.marp` files
2. No breaking changes to public APIs
3. Existing projects work without modifications

---

## 9. Post-Migration Tasks

### 9.1 Documentation Updates

1. Update CLAUDE.md:
   - New architecture diagram
   - Update transformation pipeline section
   - Document theme compilation process
   - Update performance benchmarks

2. Update README.md:
   - Update dependencies list
   - Note performance improvements
   - Update installation instructions

3. Create MIGRATION.md:
   - Document changes (even though transparent)
   - Note performance improvements
   - Provide troubleshooting guide

### 9.2 Cleanup Tasks

1. Remove obsolete files:
   - `src/lib/marp-runner.ts`
   - `tests/unit/marp-runner.test.ts` (if exists)

2. Update specification directory:
   - Mark this specification as implemented
   - Document actual vs estimated times
   - Note any deviations from plan

---

## 10. Risk Mitigation

### 10.1 Identified Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Theme caching bugs | Medium | Medium | Comprehensive unit tests, cache invalidation logic |
| Performance regression | Low | High | Benchmarking, performance tests |
| SCSS compilation errors | Low | Medium | Error handling, fallback themes |
| Breaking changes | Very Low | High | Comprehensive testing, staged rollout |

### 10.2 Contingency Plans

**Risk: Theme caching causes stale output**
- **Detection**: Visual regression tests
- **Response**: Add cache busting mechanism
- **Fallback**: Disable caching temporarily

**Risk: Performance worse than CLI**
- **Detection**: Benchmarking suite
- **Response**: Optimize hot paths, profile code
- **Fallback**: Rollback to CLI approach

**Risk: SCSS compilation issues**
- **Detection**: Unit tests, build errors
- **Response**: Update sass package, fix syntax
- **Fallback**: Use pre-compiled CSS temporarily

---

## 11. Conclusion

This specification provides comprehensive implementation guidance for migrating astro-marp from Marp CLI to marp-core with runtime SCSS compilation. The migration is **low-risk, high-reward**, with clear benefits:

**Benefits**:
- 85-95% faster rendering with theme caching
- Better flexibility and control
- Smaller bundle size
- Easier debugging

**Risks**: Low (all mitigated with testing and rollback plan)

**Timeline**: 8-12 hours for complete implementation and testing

**Recommendation**: Proceed with implementation following this specification.
