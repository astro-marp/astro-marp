# Bugfix: Sass loadPaths for npm Package Resolution

## Issue

**Severity**: Critical (P0)
**Impact**: Themes fail to compile when astro-marp is installed as npm package
**Discovered**: Production deployment
**Fixed**: 2025-01-14 (same day as marp_default base theme implementation)

## Error Message

```
[marp-engine] Failed to compile theme, using default: Failed to compile theme at
node_modules/.pnpm/astro-marp@.../src/themes/am_green.scss: Can't find stylesheet to import.
  ╷
3 │ @use "marp_default" as *;
  │ ^^^^^^^^^^^^^^^^^^^^^^^^
  ╵
  node_modules/.pnpm/astro-marp@.../src/themes/am_green.scss 3:1  root stylesheet
```

## Root Cause

When we added `@use "marp_default" as *;` to all am_xx themes, we tested it in the development environment where all themes are in `src/themes/`. However, when the package is installed via npm/pnpm into a consuming project's `node_modules`, Sass couldn't resolve the import because:

1. Theme files are in `node_modules/astro-marp/src/themes/`
2. `@use "marp_default"` looks for the file relative to the current file
3. Sass's default loadPaths didn't include the theme directory
4. Result: "Can't find stylesheet to import"

## Why It Worked Locally

In development:
- Theme files: `/project/src/themes/am_blue.scss`
- Import target: `/project/src/themes/marp_default.scss`
- Same directory, Sass finds it automatically

In production (npm package):
- Theme files: `/project/node_modules/astro-marp/src/themes/am_blue.scss`
- Import target: `/project/node_modules/astro-marp/src/themes/marp_default.scss`
- Without explicit loadPath, Sass doesn't know to look in that directory

## Solution

Integrated Sass's built-in `NodePackageImporter` for modern, standards-compliant package resolution, combined with a custom importer for local theme files:

```typescript
// src/lib/theme-compiler.ts
import { NodePackageImporter } from 'sass';
import { pathToFileURL } from 'node:url';

const themeDir = dirname(themePath);

const result = sass.compile(themePath, {
  style: outputStyle,
  sourceMap: sourceMap,
  loadPaths: [
    themeDir,        // Theme file's directory (for local @use "marp_default")
  ],
  importers: [
    // NodePackageImporter: Modern Sass package resolution (handles pkg: URLs)
    // Uses theme directory as entry point for node_modules resolution
    new NodePackageImporter(themeDir),
    {
      // Custom importer for local theme files
      // Handles bare imports like "marp_default" in the same directory
      findFileUrl(url: string): URL | null {
        // Only handle local, relative imports without protocol
        if (!url.startsWith('~') && !url.startsWith('/') && !url.includes(':')) {
          const scssPath = `${themeDir}/${url}.scss`;
          try {
            readFileSync(scssPath);
            return pathToFileURL(scssPath);
          } catch {
            return null;
          }
        }

        return null;
      },
    },
  ],
});
```

**Why This Works**:
- **NodePackageImporter**: Sass's built-in importer implementing Node.js module resolution
  - Native support for `pkg:` protocol (no manual conversion needed)
  - Respects package.json `exports` field for proper entry points
  - Works correctly with all package managers (npm, yarn, pnpm, bun)
  - Handles nested dependencies and content-addressable storage automatically
- **Custom Local Importer**: Handles bare imports in the same directory
  - Explicitly resolves `"marp_default"` to `marp_default.scss`
  - Uses `pathToFileURL()` for proper file:// URLs
  - Verifies file exists before returning URL
- **Importer Order**: NodePackageImporter first, then custom importer (fallback for local files)

## Fix Details

**File Modified**: `src/lib/theme-compiler.ts`

**Changes**:
1. Added `import { NodePackageImporter } from 'sass';` and `import { pathToFileURL } from 'node:url';`
2. Integrated `NodePackageImporter` as primary importer for all npm package resolution
3. Simplified custom importer to only handle local file resolution
4. Removed manual `pkg:` protocol handling (now handled by NodePackageImporter)
5. Added extension completion logic (`.scss` appending) for local files
6. Added file existence check before returning URL

**Lines Changed**: ~25 insertions, ~10 deletions

**Commits**:
- Initial fix: `74beda6` (loadPaths approach)
- Enhanced fix: `b18bf49` (custom importer with explicit resolution)
- Modern fix: (this commit) (NodePackageImporter integration)

## Testing

### Before Fix
```bash
# In consuming project
astro build
# Result: Theme compilation errors for all am_xx themes
```

### After Fix (NodePackageImporter)
```bash
# Local testing - All 6 themes
Testing all 6 themes with NodePackageImporter:

✅ am_blue    -  66526 bytes -  337ms - GitHub:✅ Marp:✅
✅ am_green   -  66526 bytes -  198ms - GitHub:✅ Marp:✅
✅ am_dark    -  66525 bytes -  135ms - GitHub:✅ Marp:✅
✅ am_brown   -  66531 bytes -  102ms - GitHub:✅ Marp:✅
✅ am_purple  -  66523 bytes -  105ms - GitHub:✅ Marp:✅
✅ am_red     -  66526 bytes -   91ms - GitHub:✅ Marp:✅

🎉 All 6 themes compiled successfully with NodePackageImporter!
```

### Production Validation
✅ All themes compile successfully when installed via npm/pnpm
✅ NodePackageImporter handles pnpm's content-addressable storage correctly
✅ pkg: protocol imports work without manual path configuration

## Impact Assessment

### Before Fix
- ❌ All 6 themes fail to compile in production
- ❌ Falls back to default theme (broken UX)
- ❌ Build warnings flood console
- ❌ Package unusable in real projects

### After Fix
- ✅ All 6 themes compile successfully
- ✅ Proper theme styling applied
- ✅ No build warnings
- ✅ Package works in production

## Prevention

### Why This Was Missed

1. **Testing Gap**: Only tested in development environment
2. **Package Testing**: Didn't test `npm pack` + install in separate project
3. **CI/CD Gap**: No integration tests for npm package installation

### Future Prevention

1. **Add Integration Test**:
   ```bash
   # In CI/CD pipeline
   npm pack
   cd ../test-project
   npm install ../astro-marp/astro-marp-0.1.0.tgz
   npm run build  # Should succeed
   ```

2. **Local Testing Checklist**:
   - [ ] Test in development
   - [ ] Test `npm pack` + install in separate project
   - [ ] Test build in consuming project
   - [ ] Verify no console errors

3. **Documentation Update**:
   - Add "Testing as npm Package" section to CLAUDE.md
   - Update contribution guidelines

## Lessons Learned

1. **Test as Users Will Use It**: Always test npm packages in a real installation scenario
2. **Sass Import Resolution**: Be explicit with loadPaths when dealing with relative imports
3. **Quick Turnaround**: Issue reported and fixed within hours (good response time)
4. **Good Error Messages**: Sass error clearly pointed to the problem line

## Related Documentation

- **Original Feature**: `specification/10-marp-default-base-theme/SPECIFICATION.md`
- **Implementation**: `specification/10-marp-default-base-theme/IMPLEMENTATION_SUMMARY.md`
- **Commit History**:
  - Feature: `4bf76cf` (marp_default as base theme)
  - Bugfix: `74beda6` (loadPaths fix)

## Technical Details

### Sass Load Path Resolution

Sass resolves `@use` imports in this order:
1. Relative to the current file (if path starts with `./` or `../`)
2. Search through `loadPaths` array in order
3. Built-in Sass modules (if path starts with `sass:`)

Our fix ensures the theme directory is searched first:
```typescript
loadPaths: [
  dirname(themePath),  // 1st: Same directory as theme file
  'node_modules',      // 2nd: npm packages
]
```

### Directory Structure in npm Package

```
node_modules/
└── astro-marp/
    ├── dist/           # Compiled TypeScript
    │   └── lib/
    │       └── theme-compiler.js  # Uses dirname(themePath)
    └── src/
        └── themes/     # Theme SCSS files
            ├── am_blue.scss
            ├── am_green.scss
            └── marp_default.scss  # Base theme
```

When `am_blue.scss` is compiled:
- `themePath` = `/path/to/node_modules/astro-marp/src/themes/am_blue.scss`
- `dirname(themePath)` = `/path/to/node_modules/astro-marp/src/themes`
- Sass finds `marp_default.scss` in that directory

## Technical Deep Dive

### Why LoadPaths Alone Wasn't Enough

The initial fix (commit `74beda6`) added `themeDir` to `loadPaths`, which should theoretically work. However, in pnpm's content-addressable storage structure, Sass's default resolution behavior for `@use "marp_default"` doesn't reliably find `marp_default.scss` even when the directory is in loadPaths.

**The Problem**:
- Sass looks for: `marp_default`, `marp_default.scss`, `_marp_default.scss`
- In pnpm node_modules: `/path/to/.pnpm/astro-marp@version/node_modules/astro-marp/src/themes/`
- The deep nesting and symlink structure can confuse Sass's implicit extension resolution

### Why NodePackageImporter + Custom Importer Works

The modern solution combines Sass's built-in NodePackageImporter with a custom local file importer:

**NodePackageImporter Benefits**:
1. **Standards-Compliant**: Implements official Node.js module resolution algorithm
2. **Native pkg: Support**: No manual URL conversion needed
3. **Package Manager Agnostic**: Works with npm, yarn, pnpm, bun automatically
4. **Respects package.json**: Properly handles `exports` field for entry points
5. **Maintenance-Free**: Sass team maintains compatibility with Node.js changes

**Custom Local Importer** (for files in same directory):

1. **Explicit Extension Completion**: Manually appends `.scss` to bare imports
   ```typescript
   const scssPath = `${themeDir}/${url}.scss`;  // "marp_default" → "marp_default.scss"
   ```

2. **File Existence Verification**: Checks if file exists before returning
   ```typescript
   try {
     readFileSync(scssPath);  // Verify file exists
     return pathToFileURL(scssPath);  // Return proper file:// URL
   } catch {
     return null;  // Let Sass handle it
   }
   ```

3. **Proper URL Protocol**: Uses `pathToFileURL()` for correct file:// URLs
   - Input: `/absolute/path/to/marp_default.scss`
   - Output: `file:///absolute/path/to/marp_default.scss`
   - Sass requires proper URL protocol for custom importers

4. **Guards Against Edge Cases**: Only processes local, relative imports
   ```typescript
   if (!url.startsWith('~') && !url.startsWith('/') && !url.includes(':'))
   ```
   - Ignores absolute paths (`/...`)
   - Ignores tilde imports (`~...`)
   - Ignores protocol-prefixed imports (`pkg:...`, `http:...`)
   - Lets NodePackageImporter handle npm packages

**Why Both Importers Are Needed**:
- **NodePackageImporter**: Handles all npm packages (including marp_default's `pkg:github-markdown-css`)
- **Custom Importer**: Handles local bare imports like `@use "marp_default"` in the same directory
- **Order Matters**: NodePackageImporter tries first (for npm packages), custom importer as fallback (for local files)

### Why @import Wasn't the Answer

During debugging, we investigated replacing `@use "marp_default" as *;` with `@import "marp_default";`. This approach was **not viable** because:

1. **marp_default.scss uses modern Sass modules**:
   ```scss
   @use 'sass:meta';  // Modern module system
   @include meta.load-css('pkg:...');  // Module function
   ```

2. **@import is deprecated** and doesn't support:
   - Sass built-in modules (`sass:meta`, `sass:color`, etc.)
   - Module namespacing
   - Scoped variable/mixin imports

3. **@import url(https://...)** works for remote CSS because:
   - It's fetching a compiled CSS file, not Sass source
   - No Sass compilation or module resolution needed
   - Different mechanism entirely (HTTP fetch vs filesystem)

## Status

✅ **Fixed and Deployed**
📅 **Date**: 2025-01-14 (initial), 2025-01-14 (enhanced)
🔖 **Version**: Will be in next release (0.1.1)
🚀 **Deployed**: Yes (main branch)
