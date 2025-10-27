# Astro-Marp Specification Index

This directory contains all specifications organized by implementation order. Each subdirectory represents a feature or fix implemented during the project's development.

## Directory Structure

Specifications are organized with the pattern `[index]-[feature-name]`:

```
specification/
├── 0-core-integration/           # Session 1: Core Astro integration
├── 1-hmr-support/                # Session 2: Hot Module Replacement
├── 2-image-directives/           # Session 2: Marp image directive preservation
├── 3-ci-cd-pipeline/             # Session 2: GitHub Actions workflows
├── 4-testing-infrastructure/     # Session 2: Vitest setup
├── 5-server-side-mermaid/        # Session 3: Initial Mermaid rendering
├── 6-mermaid-server-only/        # Session 4: Remove client-side rendering
├── 7-eslint-v9-migration/        # Session 4: ESLint flat config migration
└── 8-mermaid-version-update/     # Session 4: Update to Mermaid 11.12.0
```

## Implementation Sessions

### Session 1: Core Integration (2025-09-04 to 2025-10-08)
- **Spec Directory**: `0-core-integration/`
- **Key Files**:
  - `requirements.md` - Complete project requirements
  - `tasks.md` - Implementation tasks and milestones
- **Accomplishments**:
  - astro-typst pattern implementation
  - Content collections integration
  - Virtual module system
  - Theme system (6 built-in themes)
  - Image optimization pipeline
  - 31-slide navigation working

### Session 2: Developer Experience Enhancement (2025-10-09)
- **Spec Directories**: `1-hmr-support/`, `2-image-directives/`, `3-ci-cd-pipeline/`, `4-testing-infrastructure/`
- **Accomplishments**:
  - **HMR Support** (1-hmr-support): Browser auto-reload with `maybeRenderHead()`
  - **Image Directives** (2-image-directives): Preserved Marp directives like `![height:300px]`
  - **CI/CD Pipeline** (3-ci-cd-pipeline): GitHub Actions for automated publishing
  - **Testing** (4-testing-infrastructure): 45 unit tests with Vitest

### Session 3: Mermaid Diagram Support (2025-10-14)
- **Spec Directory**: `5-server-side-mermaid/`
- **Accomplishments**:
  - Server-side Mermaid rendering with rehype-mermaid
  - Build-time diagram generation (no client-side JS)
  - Multiple rendering strategies (inline-svg, img-svg, img-png)
  - Playwright integration for diagram rendering

### Session 4: Refinements & Updates (2025-10-14 to 2025-10-15)
- **Spec Directories**: `6-mermaid-server-only/`, `7-eslint-v9-migration/`, `8-mermaid-version-update/`
- **Accomplishments**:
  - **Server-Only Mermaid** (6-mermaid-server-only): Simplified to server-side only
  - **ESLint v9** (7-eslint-v9-migration): Migrated to flat config format
  - **Mermaid 11.12.0** (8-mermaid-version-update): Updated from 10.9.4 to latest

## File Organization Within Each Spec

Each specification directory should contain:

- **requirements.md**: What needs to be done, acceptance criteria
- **research.md** (optional): Investigation findings, best practices, design decisions
- **tasks.md**: Specific implementation tasks with status tracking
- **implementation-summary.md**: What was accomplished, lessons learned, challenges

## Status: Production Ready ✅

- **Project Status**: 100% Complete
- **License**: MIT
- **Node Requirement**: >=22.0.0
- **Astro Version**: ^5.14.0

## Related Documents

- **Root Level**:
  - `CLAUDE.md` - Development guidance for AI assistants
  - `IMPLEMENTATION_SUMMARY.md` - Comprehensive session-by-session implementation history
  - `README.md` - User-facing documentation

- **GitHub Workflows**:
  - `.github/workflows/publish.yml` - Automated npm publishing
  - `.github/workflows/ci.yml` - Build verification
  - `.github/PUBLISH.md` - Publishing documentation

## Development Process

This specification organization follows the development process rules defined in `CLAUDE.md`:

1. **Clarify Requirements**: Document in `requirements.md`
2. **Research Phase**: Document findings in `research.md`
3. **Specification Phase**: Create detailed `tasks.md`
4. **Execution Phase**: Track progress in task files
5. **Documentation Phase**: Summarize in `implementation-summary.md`

## Version History

- **v0.1.0** - Initial core integration
- **v0.2.0** - HMR support + developer experience improvements
- **v0.3.0** - Server-side Mermaid rendering
- **v0.4.0** - Mermaid 11.12.0 + ESLint v9 migration

---

**Last Updated**: 2025-10-27
**Maintained By**: astro-marp project team
