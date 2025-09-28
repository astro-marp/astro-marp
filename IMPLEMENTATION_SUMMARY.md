# Astro-Marp Implementation Summary

## Project Overview

**astro-marp** is a standalone Astro integration that transforms `.marp` Markdown slide sources into optimized presentation pages. The integration leverages Astro's full build and dev lifecycle (routing, content collections, asset optimization) to make slide decks feel native to Astro projects.

## Architecture Summary

### Core Integration Pattern
The plugin follows the **astro-typst pattern** for deep Astro integration:

- **Main Integration** (`src/index.ts`): Exports `marp()` function, registers with `astro:config:setup`
- **Content Collections**: Uses `addContentEntryType()` for queryable `.marp` files via Astro's content APIs
- **Vite Plugin**: Custom transformation pipeline for `.marp` → virtual modules
- **Asset Pipeline**: Integrates with Astro's image optimization (`getImage()`, `dist/_astro/`)

### Transformation Pipeline
```
.marp file → Parse frontmatter → Process images → Marp CLI → Virtual module → Astro component
```

1. **Parse** `.marp` file and extract frontmatter
2. **Image Processing**: Transform local image references to ES module imports
3. **Marp CLI Execution**: `marp --stdin --theme <path> -o -`
4. **Module Generation**: Create virtual module with rendered HTML + metadata
5. **Runtime Resolution**: Replace image placeholders with optimized URLs

## Key Implementation Details

### Image Optimization System
```typescript
// Transform local images to import statements
![Business Cycle](./images/business-cycle.svg)
↓
import image0 from './images/business-cycle.svg';
// Placeholder: ASTRO_IMAGE_image0

// Runtime replacement in component
finalHtml = finalHtml.replace(/\$\{image0\.src\}/g, image0.src);
// Result: /_astro/business-cycle.Cz_Ut2UY.svg
```

### Virtual Module System
Each `.marp` file becomes a virtual module:
```typescript
export const Content = createComponent(async (result, _props, slots) => {
    let finalHtml = htmlTemplate;
    // Dynamic image URL replacement
    finalHtml = finalHtml.replace(/\$\{image0\.src\}/g, image0.src);
    return render`<div set:html=${finalHtml}></div>`;
});
```

### Content Collections Integration
```typescript
addContentEntryType({
  extensions: ['.marp'],
  async getEntryInfo({ fileUrl, contents }) {
    const { frontmatter, content } = await parseMarpFile(contents);
    return {
      data: frontmatter,
      body: contents,
      slug: frontmatter.slug,
      rawData: contents,
    };
  }
});
```

## Critical Architecture Decisions

### 1. Removed Page Extension Conflict
**Issue**: `addPageExtension('.marp')` conflicted with Vite plugin processing
**Solution**: Removed page extension, rely on content collections for routing
```typescript
// REMOVED: addPageExtension('.marp');
// Use content collections + manual routing instead
```

### 2. Runtime Template Literal Resolution
**Issue**: Template literals in JSON strings don't evaluate properly
**Solution**: Runtime replacement in component render function
```typescript
// Instead of: export const html = `<img src="${image0.src}" />`
// Use: finalHtml = finalHtml.replace(/\$\{image0\.src\}/g, image0.src);
```

### 3. Marp CLI Direct Integration
**Issue**: Using npx caused path resolution problems
**Solution**: Direct binary path resolution with fallbacks
```typescript
function findMarpCli() {
  const possiblePaths = [
    resolve(__dirname, '../../node_modules/.bin/marp'),
    resolve(__dirname, '../../../node_modules/.bin/marp'),
    resolve(process.cwd(), 'node_modules/.bin/marp'),
  ];
  // ... path resolution logic
}
```

## File Structure

```
astro-marp/
├── src/
│   ├── index.ts                    # Main integration entry
│   ├── types.ts                    # TypeScript definitions
│   ├── lib/
│   │   ├── vite-plugin-marp.ts     # Core transformation logic
│   │   ├── marp-parser.ts          # Frontmatter parsing
│   │   ├── marp-runner.ts          # Marp CLI execution
│   │   ├── theme-resolver.ts       # Theme path resolution
│   │   └── image-processor.ts      # Image optimization logic
│   ├── renderer/
│   │   └── index.ts                # Astro renderer
│   └── themes/                     # Built-in SCSS themes
├── dist/                          # Compiled output
├── test-astro-project/            # Comprehensive test setup
└── CLAUDE.md                      # Development guidance
```

## Testing Strategy

### Manual Testing Protocol
1. **Build Integration**: `npm run build` in root
2. **Test Project Setup**: Navigate to `test-astro-project/test-astro-project/`
3. **Development Mode**: `npm run dev` - verify HMR and routing
4. **Production Build**: `npm run build` - check image optimization
5. **Content Verification**: Check `dist/_astro/` for optimized assets

### Key Test Cases
- ✅ Local image optimization (`./images/file.svg` → `/_astro/file.hash.svg`)
- ✅ Content collections (`getCollection('presentations')`)
- ✅ Theme application (built-in themes work, custom themes disabled)
- ✅ Frontmatter parsing and metadata
- ✅ Build pipeline without errors

## Dependencies

### Core Dependencies
```json
{
  "@marp-team/marp-cli": "^3.4.0",
  "gray-matter": "^4.0.3",
  "astro": "^5.x"
}
```

### Integration Points
- **Astro APIs**: `addContentEntryType`, `addRenderer`, `updateConfig`
- **Vite Plugin System**: Custom transformation pipeline
- **Asset Pipeline**: Astro's native `getImage()` optimization

## Configuration

### Basic Setup
```typescript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import marp from 'astro-marp';

export default defineConfig({
  integrations: [
    marp({
      defaultTheme: 'gaia' // Built-in theme
    })
  ]
});
```

### Content Collections
```typescript
// src/content/config.ts
import { defineCollection } from 'astro:content';

export const collections = {
  presentations: defineCollection({
    type: 'content_layer', // Automatically handled by integration
  }),
};
```

## Current Limitations

### 1. Page Routing
**Status**: Partially implemented
**Issue**: Removed `addPageExtension` to fix Vite conflicts
**Solution Needed**: Implement proper page routing without conflicts

### 2. Custom Themes
**Status**: Temporarily disabled
**Issue**: CSS import issues with custom themes
**Current**: Falls back to built-in themes (`gaia`, `default`, `uncover`)

### 3. Remote Images
**Status**: Not implemented
**Scope**: Only local images are optimized, remote images pass through unchanged

## Development Workflow

### Making Changes
1. **Edit source** in `src/`
2. **Build integration**: `npm run build`
3. **Test changes**: Navigate to test project and run builds
4. **Verify output**: Check `dist/` for proper asset optimization

### Adding New Features
1. **Update types** in `src/types.ts`
2. **Implement logic** in appropriate `src/lib/` file
3. **Update integration** in `src/index.ts` if needed
4. **Add tests** in test project
5. **Update documentation**

## Security Considerations

- ✅ **File path restrictions**: Only project-relative paths allowed
- ✅ **Theme validation**: Only approved theme directories accessible
- ✅ **No remote fetching**: Deterministic builds, no external dependencies
- ✅ **Sandbox compatibility**: Works within Astro's security model

## Performance Characteristics

- **Build Time**: ~2-3 seconds for typical presentation
- **Image Optimization**: Automatic hash-based caching
- **HMR Support**: Fast development iteration
- **Bundle Size**: Minimal runtime overhead