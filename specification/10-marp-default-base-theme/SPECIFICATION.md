# Specification: Marp Default as Base Theme

## Overview
Convert `marp_default.scss` from a user-selectable theme to an internal base theme that is imported by all `am_xx` themes. This restores the original Marp theme architecture where custom themes extend the default theme.

## Background

### Previous State
- All `am_xx` themes originally had `@import "default"` statements
- These imports caused build errors due to incorrect path resolution
- Imports were removed to fix the build

### Current State
- `marp_default.scss` exists as a standalone theme file
- Listed as the 7th user-selectable theme in documentation
- Not imported by any other themes
- Contains official Marp default styling with GitHub Markdown CSS integration

### Target State
- `marp_default.scss` becomes a base theme (not user-selectable)
- All 6 `am_xx` themes import and extend `marp_default`
- Only 6 themes shown in user-facing documentation and logs
- Theme discovery filters out `marp_default` from available themes list

## Requirements

### Functional Requirements

1. **Theme Imports**
   - All 6 `am_xx` themes must import `marp_default.scss`
   - Use modern Sass syntax: `@use "marp_default" as *;`
   - Import must be at the top of each theme file (after any existing comments)
   - Themes should extend/override default styles as needed

2. **Theme Discovery**
   - `getAvailableThemes()` must filter out `marp_default` from results
   - Only return 6 user-selectable themes: `am_blue`, `am_brown`, `am_dark`, `am_green`, `am_purple`, `am_red`
   - Log messages should show "Discovered 6 themes: am blue, am brown, am dark, am green, am purple, am red"

3. **Documentation**
   - Remove `marp_default` from all configuration examples
   - Update theme counts from 7 to 6
   - No mention of `marp_default` as a user option
   - Optional: Add technical note that `marp_default` is used internally

4. **File Structure**
   - Keep `marp_default.scss` in `src/themes/` directory
   - Maintain all 7 SCSS files in the themes directory
   - No changes to directory structure

### Non-Functional Requirements

1. **Backward Compatibility**
   - If users have `theme: marp_default` in their frontmatter, it should still work
   - `resolveTheme('marp_default')` should still return valid path
   - No breaking changes to existing presentations

2. **Build Performance**
   - Theme compilation time should remain similar
   - Sass import resolution must work correctly
   - No circular dependencies

3. **Code Quality**
   - Follow existing code style and patterns
   - Maintain type safety (TypeScript)
   - Keep error handling graceful

## Technical Design

### 1. Theme File Updates

**Location**: `src/themes/am_*.scss` (6 files)

**Changes**:
```scss
// Add to top of each am_xx.scss file (after comments)
@use "marp_default" as *;

// Existing theme styles follow...
```

**Files to modify**:
- `src/themes/am_blue.scss`
- `src/themes/am_brown.scss`
- `src/themes/am_dark.scss`
- `src/themes/am_green.scss`
- `src/themes/am_purple.scss`
- `src/themes/am_red.scss`

### 2. Theme Resolver Updates

**Location**: `src/lib/theme-resolver.ts`

**Current Implementation**:
```typescript
const themes = files
  .filter(file => file.endsWith('.scss'))
  .map(file => file.replace('.scss', ''))
  .sort();
```

**Updated Implementation**:
```typescript
const themes = files
  .filter(file => file.endsWith('.scss'))
  .map(file => file.replace('.scss', ''))
  .filter(name => name !== 'marp_default') // Filter out base theme
  .sort();
```

**Rationale**: Filter at discovery time to exclude internal base theme from user-facing theme list.

### 3. Documentation Updates

**Files to update**:
- `README.md` - Configuration examples, feature list
- `CLAUDE.md` - Configuration examples, theme system section, build indicators

**Changes**:
- Replace "7 themes" with "6 themes"
- Remove `marp_default` from theme lists
- Update example outputs to show only 6 themes
- Keep technical documentation about file structure (7 files exist, 6 user-selectable)

### 4. Sass Import Resolution

**How `@use "marp_default"` resolves**:

When Sass encounters `@use "marp_default"`:
1. Looks in the same directory as the importing file (`src/themes/`)
2. Finds `marp_default.scss` in the same directory
3. Compiles and includes the styles
4. The `as *` syntax imports all variables/mixins into the global namespace

**Dependencies**:
- `marp_default.scss` imports `github-markdown-css` via `@use 'sass:meta'` and `meta.load-css()`
- This requires the `github-markdown-css` npm package (already installed)
- Sass compiler handles `pkg:` protocol for npm package resolution

## Implementation Plan

### Phase 1: Specification (Current)
- [x] Create specification document
- [ ] Create implementation plan
- [ ] Create task list

### Phase 2: Implementation
1. Add `@use "marp_default" as *;` to all 6 am_xx themes
2. Update theme-resolver.ts to filter out marp_default
3. Update documentation (README.md, CLAUDE.md)
4. Build and verify compilation

### Phase 3: Testing
1. Verify all 6 themes compile successfully
2. Test theme discovery returns only 6 themes
3. Verify log messages show correct count
4. Test that marp_default still resolves if explicitly requested
5. Build example project and verify themes render correctly

### Phase 4: Cleanup & Commit
1. Remove old completed todo items
2. Verify no build warnings or errors
3. Commit with descriptive message
4. Push changes to repository

## Success Criteria

### Build Success
- [x] TypeScript compilation completes without errors
- [ ] All 6 themes compile successfully with Sass
- [ ] No circular dependency warnings
- [ ] Build output shows "Discovered 6 themes"

### Functional Success
- [ ] Theme discovery returns exactly 6 themes
- [ ] All 6 themes render correctly in presentations
- [ ] marp_default styles visible in am_xx themes
- [ ] Log messages show formatted theme names with spaces

### Documentation Success
- [ ] README.md updated to show 6 themes
- [ ] CLAUDE.md updated with correct counts
- [ ] Configuration examples exclude marp_default
- [ ] Technical documentation accurate

## Risks & Mitigation

### Risk 1: Sass Import Path Issues
**Risk**: `@use "marp_default"` might not resolve correctly
**Likelihood**: Low (same directory imports are straightforward)
**Mitigation**: Test compilation immediately after adding imports

### Risk 2: Style Conflicts
**Risk**: marp_default styles might conflict with am_xx theme styles
**Likelihood**: Medium (depends on CSS specificity)
**Mitigation**: Review compiled CSS, ensure am_xx styles override defaults as intended

### Risk 3: GitHub Markdown CSS Dependency
**Risk**: Multiple imports of github-markdown-css might cause issues
**Likelihood**: Low (Sass handles duplicate imports)
**Mitigation**: Verify CSS output size, check for duplicate styles

### Risk 4: Backward Compatibility
**Risk**: Users with `theme: marp_default` in frontmatter might experience issues
**Likelihood**: Low (resolveTheme still finds the file)
**Impact**: Low (graceful fallback already implemented)
**Mitigation**: Keep resolveTheme logic unchanged

## Open Questions

1. **CSS Size Impact**: Will importing marp_default in all themes significantly increase compiled CSS size?
   - Answer: Sass should handle duplicate imports efficiently, but we'll monitor output size

2. **Style Override Order**: Do am_xx themes need to restructure their styles to properly override defaults?
   - Answer: Will verify during testing phase

3. **Theme Caching**: Does theme compilation cache handle imports correctly?
   - Answer: Existing cache implementation should work, but we'll verify

## References

- Original Marp theme architecture: Uses base theme with custom overrides
- Sass `@use` documentation: https://sass-lang.com/documentation/at-rules/use
- Previous fix: Removed `@import "default"` statements that caused build errors
- Current implementation: `src/lib/theme-compiler.ts` handles SCSS compilation
