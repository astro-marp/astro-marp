# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **astro-marp**, a standalone Astro integration plugin that transforms `.marp` Markdown slide sources into optimized presentation pages. The integration leverages Astro's full build and dev lifecycle (routing, content collections, asset optimization) to make slide decks feel native to Astro projects.

## Architecture

The plugin follows the **astro-typst pattern** for deep Astro integration:

### Core Integration Structure
- **Main Integration** (`src/index.ts`): Exports the `marp()` function that registers with Astro's `astro:config:setup` hook
- **Page Extension**: Uses `addPageExtension('.marp')` to register `.marp` files as routable pages
- **Content Collections**: Uses `addContentEntryType()` to make `.marp` files queryable via Astro's content APIs
- **Vite Plugin**: Custom Vite plugin for transforming `.marp` files into virtual modules

### Virtual Module System
Each `.marp` file is transformed into a virtual module (`virtual:astro-marp/<slug>`) that exports:
```typescript
export const html: string;              // Marp-rendered HTML fragment
export const meta: {                    // Presentation metadata
  id, slug, title, theme, slidesCount,
  updatedAt, sourceHash, images, frontmatter
};
export const raw: string;               // Post-processed Markdown
```

### Transformation Pipeline
1. **Parse** `.marp` file and extract frontmatter
2. **Image Processing**: Collect local image references, optimize via Astro's `getImage()`, rewrite URLs
3. **Marp CLI Execution**: Pipe processed Markdown to `marp --stdin --theme <path> -o -`
4. **Module Generation**: Create virtual module with rendered HTML + metadata
5. **Content Collection**: Register entry for querying via `getCollection()`

### Key Components
- **Vite Plugin** (`src/lib/vite-plugin-marp.ts`): Handles file transformation and virtual module creation
- **Theme System** (`src/themes/`, `src/lib/theme-resolver.ts`): Dynamic theme discovery and built-in SCSS themes passed to Marp CLI via `--theme` flag
- **Image Processor**: Local image optimization through Astro's asset pipeline
- **Content Entry Type**: Integration with Astro's content collection system

## Configuration

The integration supports minimal configuration:
```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import marp from 'astro-marp';

export default defineConfig({
  integrations: [
    marp({
      defaultTheme: 'am_blue'  // Built-in theme name
    })
  ]
});
```

## Development Workflow

### File Structure
- `.marp` files are placed in content collections (e.g., `src/content/presentations/`)
- Each file becomes a routable presentation and content collection entry
- Local images are automatically optimized via Astro's pipeline
- Remote images pass through unchanged

### Key Features
- **HMR Support**: Changes to `.marp` files trigger automatic re-rendering
- **Content Collections**: Query presentations via `getCollection('presentations')`
- **Asset Optimization**: Local images processed through Astro's optimization
- **Dynamic Theme System**: Automatic discovery of available themes from filesystem, no hardcoded lists
- **Mermaid Support**: Automatic injection of Mermaid initialization script

## Testing Strategy

### Manual Testing
The plugin includes a comprehensive manual testing protocol using a parent test-astro-project:
1. Install integration in test project with `src/content/presentations/` collection
2. Verify route accessibility (`/presentations/macroeconomics`)
3. Browser console validation (no errors/warnings)
4. Slide navigation testing with arrow keys
5. HMR validation on file changes
6. Image optimization verification

### Automated Testing
- Playwright/Chrome DevTools MCP tools for browser automation
- Console log capture and analysis
- Process management verification (clean shutdown)

## Current Implementation Status

### ✅ COMPLETED (90%)
- **Core Integration**: Full Astro lifecycle integration
- **Image Optimization**: Local images → `dist/_astro/` with hashing
- **Content Collections**: Complete `getCollection('presentations')` support
- **Build Pipeline**: Clean builds without Vite conflicts
- **Dynamic Theme System**: Automatic theme discovery from filesystem (6 built-in themes: am_blue, am_brown, am_dark, am_green, am_purple, am_red)
- **Virtual Modules**: Proper `virtual:astro-marp/<slug>` pattern
- **Error Handling**: Graceful failure with error components

### 🔄 PENDING (10%)
- **Page Routing**: Direct `/presentations/[slug]` access (removed due to conflicts)
- **Custom Themes**: User-provided SCSS themes (temporarily disabled)
- **Advanced Features**: Navigation controls, presenter mode

### 🚨 CRITICAL ARCHITECTURAL DECISION
**Page Extension Conflict Resolution**: Removed `addPageExtension('.marp')` due to Vite import analysis conflicts. This fixed the core image optimization pipeline but requires alternative routing implementation.

**Technical Debt**: Need to restore direct page routing without Vite conflicts, possibly using `injectRoute()` or enhanced content collections.

## Dependencies

- **Core**: `@marp-team/marp-cli` (direct dependency, not npx)
- **Astro APIs**: `addContentEntryType`, `addRenderer`, Vite plugin system
- **Image Processing**: Astro's native asset pipeline with runtime template replacement
- **Themes**: Dynamic theme discovery from `/src/themes/` directory with built-in SCSS files

## Security Considerations

- Only local file theme references allowed (under approved directories)
- Remote theme URLs disabled in MVP
- Filesystem reads restricted to project root and allowed alias directories
- No remote image fetching (keeps builds deterministic)

## Known Issues & Workarounds

### 1. Page Routing Disabled
**Issue**: Direct `.marp` page routing disabled due to Vite conflicts
**Workaround**: Use content collections with manual routing: `src/pages/presentations/[...slug].astro`
**Fix Needed**: Implement `injectRoute()` or safe page extension alternative

### 2. Custom Themes Disabled
**Issue**: Custom themes cause CSS import errors in Marp CLI
**Workaround**: Use built-in themes (am_blue, am_brown, am_dark, am_green, am_purple, am_red)
**Fix Needed**: Enhanced theme path resolution and Marp CLI integration

### 3. Test Project Warning
**Issue**: `Unsupported file type test.marp found` warning in build
**Impact**: Cosmetic only, doesn't affect functionality
**Workaround**: Prefix with underscore: `_test.marp` to ignore

## Debug Information

### Successful Build Indicators
```
✅ [astro-marp] Discovered 6 themes: am_blue, am_brown, am_dark, am_green, am_purple, am_red
✅ [astro-marp] Processing local image: ./images/business-cycle.svg -> import image0
✅ dist/_astro/business-cycle.Cz_Ut2UY.svg (optimized asset created)
✅ <img src="/_astro/business-cycle.Cz_Ut2UY.svg" alt="Business Cycle" /> (correct URL in HTML)
✅ Build completes without Vite import analysis errors
```

### Common Issues
```
❌ TypeError: Cannot read property 'src' of undefined
   → Image import statement malformed, check generated component code

❌ Vite import analysis error on .marp files
   → Page extension conflict, ensure addPageExtension is disabled

❌ Images showing as ${image0.src} in output
   → Template literal replacement not working, check runtime replacement logic
```

## Maintenance Notes

### When Updating Dependencies
1. **Astro Updates**: Check for API changes in `addContentEntryType` and Vite plugin interfaces
2. **Marp CLI Updates**: Verify theme loading and HTML output format compatibility
3. **Vite Updates**: Test that plugin ordering and transformation pipeline still works

### Performance Monitoring
- Watch for increased build times with large numbers of presentations
- Monitor memory usage during image optimization
- Check that template literal replacement doesn't cause runtime performance issues

This integration represents a successful implementation of the astro-typst pattern with significant enhancements for image optimization and asset pipeline integration.