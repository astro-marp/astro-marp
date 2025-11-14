# Task List: Marp Default as Base Theme

## Overview
Convert marp_default from user-selectable theme to internal base theme imported by all am_xx themes.

## Task Breakdown

### ✅ Phase 1: Specification (Completed)
- [x] Create specification document
- [x] Create task list

---

### 🔄 Phase 2: Implementation

#### Task 2.1: Add @use imports to am_xx themes
**Priority**: High
**Estimated Time**: 10 minutes
**Dependencies**: None

**Steps**:
1. Read each am_xx.scss file to understand current structure
2. Add `@use "marp_default" as *;` at the top of each file (after initial comments)
3. Maintain existing structure and styles

**Files to modify**:
- [ ] `src/themes/am_blue.scss`
- [ ] `src/themes/am_brown.scss`
- [ ] `src/themes/am_dark.scss`
- [ ] `src/themes/am_green.scss`
- [ ] `src/themes/am_purple.scss`
- [ ] `src/themes/am_red.scss`

**Acceptance Criteria**:
- Import statement at top of each file
- No syntax errors
- Files compile successfully

---

#### Task 2.2: Update theme discovery filter
**Priority**: High
**Estimated Time**: 5 minutes
**Dependencies**: None

**Steps**:
1. Open `src/lib/theme-resolver.ts`
2. Locate `getAvailableThemes()` function
3. Add filter to exclude `marp_default` from results
4. Update TypeScript types if needed

**Implementation**:
```typescript
// In getAvailableThemes() function
const themes = files
  .filter(file => file.endsWith('.scss'))
  .map(file => file.replace('.scss', ''))
  .filter(name => name !== 'marp_default') // Add this line
  .sort();
```

**Acceptance Criteria**:
- Theme discovery returns exactly 6 themes
- `marp_default` not in returned array
- Log messages show "Discovered 6 themes"

---

#### Task 2.3: Update README.md documentation
**Priority**: Medium
**Estimated Time**: 10 minutes
**Dependencies**: None

**Steps**:
1. Find all references to theme counts
2. Change "7 themes" to "6 themes"
3. Remove `marp_default` / "marp default" from theme lists
4. Update configuration examples

**Sections to update**:
- [ ] Quick Start configuration example (line ~36)
- [ ] Features section (line ~193)
- [ ] Any other theme list references

**Acceptance Criteria**:
- No mentions of 7 themes
- No mentions of "marp default" as user option
- Theme lists show only 6 themes
- Configuration examples accurate

---

#### Task 2.4: Update CLAUDE.md documentation
**Priority**: Medium
**Estimated Time**: 15 minutes
**Dependencies**: None

**Steps**:
1. Update project structure section (add note about marp_default as base)
2. Update configuration examples
3. Update theme system section
4. Update build indicators section
5. Update known issues section

**Sections to update**:
- [ ] Architecture > Core Integration Structure (~line 97)
- [ ] Configuration examples (~line 255)
- [ ] Development Workflow > Dynamic Theme System (~line 389)
- [ ] Debugging > Successful Build Indicators (~line 543)
- [ ] Known Issues (~line 579)

**Acceptance Criteria**:
- File structure shows 7 files, 6 user-selectable
- Configuration shows 6 themes only
- Build indicators show correct output
- Technical accuracy maintained

---

### 🧪 Phase 3: Testing

#### Task 3.1: Build and verify TypeScript compilation
**Priority**: High
**Estimated Time**: 2 minutes
**Dependencies**: Tasks 2.1, 2.2

**Steps**:
1. Run `pnpm run build`
2. Verify no TypeScript errors
3. Check dist/ output exists
4. Verify theme-resolver.js has correct filter logic

**Acceptance Criteria**:
- Build succeeds without errors
- No TypeScript warnings
- Compiled JavaScript includes filter logic

---

#### Task 3.2: Test theme Sass compilation
**Priority**: High
**Estimated Time**: 10 minutes
**Dependencies**: Task 2.1

**Steps**:
1. Create test script to compile each theme
2. Verify all 6 themes compile successfully
3. Check compiled CSS includes marp_default styles
4. Verify no circular dependency errors
5. Check compiled CSS file sizes are reasonable

**Test Command**:
```bash
# In test project or create temporary test
node -e "
const { compileTheme } = require('./dist/lib/theme-compiler.js');
const themes = ['am_blue', 'am_brown', 'am_dark', 'am_green', 'am_purple', 'am_red'];
for (const theme of themes) {
  console.log(\`Testing \${theme}...\`);
  const path = require('path').resolve(__dirname, 'src/themes', \`\${theme}.scss\`);
  compileTheme(path, { enableCache: false }).then(result => {
    console.log(\`✅ \${theme}: \${result.css.length} bytes\`);
  }).catch(err => {
    console.error(\`❌ \${theme}: \${err.message}\`);
  });
}
"
```

**Acceptance Criteria**:
- All 6 themes compile without errors
- Compiled CSS includes GitHub Markdown styles
- No duplicate style warnings
- File sizes reasonable (<500KB each)

---

#### Task 3.3: Test theme discovery
**Priority**: High
**Estimated Time**: 5 minutes
**Dependencies**: Task 2.2

**Steps**:
1. Create test script to call getThemeList()
2. Verify exactly 6 themes returned
3. Verify marp_default not in list
4. Test formatThemeName on results

**Test Command**:
```bash
node -e "
const { getThemeList, formatThemeName } = require('./dist/lib/theme-resolver.js');
const themes = getThemeList();
console.log('Discovered themes:', themes.length);
console.log('Theme list:', themes.map(formatThemeName).join(', '));
console.log('Contains marp_default?', themes.includes('marp_default'));
"
```

**Acceptance Criteria**:
- Returns exactly 6 themes
- `marp_default` not in list
- Formatted names correct (with spaces)

---

#### Task 3.4: Integration test with example project
**Priority**: Medium
**Estimated Time**: 15 minutes
**Dependencies**: Tasks 3.1, 3.2, 3.3

**Steps**:
1. Navigate to `../astro-marp-example`
2. Run `npm install` (to get updated package)
3. Run `npm run dev`
4. Check dev server logs for theme discovery message
5. Navigate to presentation pages
6. Verify themes render correctly
7. Check for console errors

**Acceptance Criteria**:
- Dev server starts without errors
- Logs show "Discovered 6 themes: am blue, am brown, ..."
- Presentations render with correct styling
- No browser console errors
- marp_default styles visible (inherited by am_xx themes)

---

### 🧹 Phase 4: Cleanup & Finalization

#### Task 4.1: Verify no build warnings
**Priority**: High
**Estimated Time**: 5 minutes
**Dependencies**: All Phase 3 tasks

**Steps**:
1. Run `pnpm run build` again
2. Run `pnpm run lint`
3. Check for any warnings or deprecation notices
4. Fix any issues found

**Acceptance Criteria**:
- Build completes with zero warnings
- Lint passes with no issues
- No deprecation notices

---

#### Task 4.2: Review and cleanup
**Priority**: Medium
**Estimated Time**: 10 minutes
**Dependencies**: Task 4.1

**Steps**:
1. Review all changed files
2. Remove any debug console.log statements
3. Verify code style consistency
4. Check for unused imports
5. Ensure proper TypeScript types

**Acceptance Criteria**:
- No debug statements in code
- Code style consistent
- All imports used
- TypeScript types correct

---

#### Task 4.3: Commit and push changes
**Priority**: High
**Estimated Time**: 5 minutes
**Dependencies**: Task 4.2

**Steps**:
1. Stage all modified files
2. Create descriptive commit message
3. Push to repository

**Commit Message Template**:
```
refactor: convert marp_default to internal base theme

Make marp_default.scss an internal base theme that is imported by all
am_xx themes, rather than a user-selectable theme. This aligns with the
original Marp theme architecture.

Changes:
- Add @use "marp_default" imports to all 6 am_xx themes
- Filter marp_default from theme discovery (show only 6 user themes)
- Update documentation to reflect 6 user-selectable themes
- Keep marp_default.scss in themes/ directory as base

Benefits:
- Consistent base styling across all themes
- Follows Marp best practices for theme inheritance
- Cleaner user-facing theme list
- Maintains backward compatibility

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Commands**:
```bash
git add src/themes/am_*.scss
git add src/lib/theme-resolver.ts
git add README.md CLAUDE.md
git add specification/10-marp-default-base-theme/

git commit -m "$(cat <<'EOF'
refactor: convert marp_default to internal base theme

Make marp_default.scss an internal base theme that is imported by all
am_xx themes, rather than a user-selectable theme. This aligns with the
original Marp theme architecture.

Changes:
- Add @use "marp_default" imports to all 6 am_xx themes
- Filter marp_default from theme discovery (show only 6 user themes)
- Update documentation to reflect 6 user-selectable themes
- Keep marp_default.scss in themes/ directory as base

Benefits:
- Consistent base styling across all themes
- Follows Marp best practices for theme inheritance
- Cleaner user-facing theme list
- Maintains backward compatibility

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

git push
```

**Acceptance Criteria**:
- All changes committed
- Commit message descriptive and follows convention
- Changes pushed to remote repository

---

## Summary

**Total Tasks**: 13
**Estimated Total Time**: ~90 minutes
**Critical Path**: Tasks 2.1 → 3.2 → 3.4 → 4.3

**Key Milestones**:
1. ✅ Specification complete
2. 🔄 Implementation (Tasks 2.1-2.4)
3. 🧪 Testing (Tasks 3.1-3.4)
4. 🚀 Deployment (Tasks 4.1-4.3)
