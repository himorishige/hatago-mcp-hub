# Hatago Documentation Guide

This document defines the documentation strategy for the Hatago MCP Hub project, establishing clear guidelines for source locations, generation responsibilities, and CI/CD requirements.

## Primary Source Locations

### Documentation Sources

- **Package Documentation**: `packages/*/docs/` and `packages/*/README.md`
  - Each package owns its documentation
  - README.md must include frontmatter metadata
  - Package-specific guides and examples

- **Top-level Guides**: `apps/docs/src/content/docs/`
  - Hand-written conceptual documentation
  - Getting started guides
  - Architecture overviews
  - Migration guides

- **API Reference**: Auto-generated from TypeScript source
  - Source: TSDoc comments in `packages/*/src/**/*.ts`
  - Generated via TypeDoc or API Extractor
  - Never manually edited

- **Configuration Reference**: Auto-generated from schemas
  - Source: Zod schemas in `packages/core/src/schemas/`
  - Generated as Markdown tables
  - Includes validation rules and defaults

## Generation Responsibilities

### Collection Scripts

- **Purpose**: Normalize and collect documentation from packages
- **Location**: `tools/scripts/collect-docs.ts`
- **Process**:
  1. Read all `packages/*/README.md` and `packages/*/docs/**/*`
  2. Add/validate frontmatter
  3. Fix relative links
  4. Copy to `apps/docs/src/content/docs/[locale]/packages/`

### API Documentation Generation

- **Tool**: TypeDoc with markdown plugin
- **Source**: TypeScript source files with TSDoc comments
- **Output**: `apps/docs/src/content/docs/[locale]/reference/api/`
- **Timing**: Build-time generation (not committed)

### Configuration Reference Generation

- **Source**: Zod schemas
- **Output**: Markdown tables and property documentation
- **Location**: `apps/docs/src/content/docs/[locale]/reference/config/`
- **Features**: Type information, defaults, validation rules

## CI/CD Failure Conditions

### Required Checks

1. **Markdown Link Validation**
   - All internal links must resolve
   - External links must return 200 status

2. **API Breaking Changes**
   - API Extractor detects breaking changes
   - Requires explicit approval for major version

3. **Spell Check**
   - English and Japanese spell checking
   - Custom dictionary for technical terms

4. **TypeScript Compilation**
   - All code examples must compile
   - Type checking for MDX components

5. **Translation Status**
   - Detect untranslated pages
   - Warning for outdated translations

### Quality Gates

- **Coverage**: 100% of public APIs must be documented
- **Performance**: Page load under 1 second
- **Accessibility**: WCAG 2.1 AA compliance
- **SEO**: Valid meta tags and sitemap

## Documentation Standards

### Frontmatter Requirements

```yaml
---
title: Page Title (required)
description: Brief description (required)
lang: ja|en (required)
package: package-name (for package docs)
version: 1.0.0 (for versioned content)
tags: [concept, guide, reference] (optional)
lastUpdated: 2024-01-01 (auto-generated)
---
```

### File Naming Conventions

- Use kebab-case for all files: `getting-started.md`
- Index files for categories: `guides/index.md`
- Language suffix for translations: `getting-started.en.md`

### Content Structure

1. **Getting Started**: 5-minute quick start
2. **Concepts**: Core concepts and architecture
3. **Guides**: Task-oriented tutorials
4. **Packages**: Package-specific documentation
5. **Reference**: API and configuration details
6. **Cookbook**: Practical examples and snippets
7. **Migration**: Version migration guides

## Localization Strategy

### Language Priority

- **Primary**: Japanese (`ja`) - Original content
- **Secondary**: English (`en`) - Translated content

### Translation Workflow

1. Changes to Japanese content trigger translation PR
2. Untranslated pages show fallback with warning banner
3. Code blocks remain untranslated (comments only)
4. Preserve heading IDs across translations

## Build Pipeline

### Local Development

```bash
# Install dependencies
pnpm install

# Collect documentation
pnpm -C apps/docs collect

# Generate API docs
pnpm -C apps/docs gen:api

# Start dev server
pnpm -C apps/docs dev
```

### Production Build

```bash
# Full build with all generation
pnpm -C apps/docs build

# Deploy to GitHub Pages
pnpm -C apps/docs deploy
```

## Maintenance Guidelines

### Regular Tasks

- Weekly: Review and update package READMEs
- Monthly: Check for broken links and outdated content
- Quarterly: Review documentation coverage and gaps
- Major releases: Update migration guides

### Versioning Strategy

- Start with `latest` only
- Add version directories when needed: `/v1/`, `/v2/`
- Maintain last 2 major versions
- Archive older versions

## Tools and Scripts

### Required Tools

- **Starlight**: Documentation framework
- **TypeDoc**: API documentation generator
- **markdownlint**: Markdown linting
- **cspell**: Spell checking
- **broken-link-checker**: Link validation

### Helper Scripts

- `collect-docs.ts`: Collect package documentation
- `gen-api-docs.ts`: Generate API reference
- `gen-config-ref.ts`: Generate configuration reference
- `check-translations.ts`: Check translation status
- `validate-links.ts`: Validate all links

## CODEOWNERS

```
# Documentation ownership
/apps/docs/ @documentation-team
/packages/*/README.md @package-owners
/packages/*/docs/ @package-owners
```

## Review Checklist

For any documentation changes:

- [ ] Frontmatter is complete and valid
- [ ] Links are working
- [ ] Code examples compile
- [ ] Spell check passes
- [ ] Translation PR created (if applicable)
- [ ] API documentation updated (if applicable)
- [ ] Configuration reference updated (if applicable)

---

Last Updated: 2024-01-05
