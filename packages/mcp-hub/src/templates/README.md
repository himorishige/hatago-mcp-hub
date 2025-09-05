# Hatago Templates

This directory contains built-in templates for Hatago MCP Hub initialization.

## Available Templates

| Template         | Description                                        | Use Case                |
| ---------------- | -------------------------------------------------- | ----------------------- |
| **minimal**      | Basic setup with minimal dependencies              | Quick start, testing    |
| **local-dev**    | Local development with filesystem, Git, and search | Development workflow    |
| **ai-assistant** | AI-powered development with GitHub integration     | AI-enhanced coding      |
| **cloud-only**   | Remote services only, no local dependencies        | Serverless environments |
| **full-stack**   | Production-ready with database, monitoring         | Enterprise applications |

## Usage

### List Available Templates

```bash
hatago init --list-templates
```

### Use a Template

```bash
# Basic usage
hatago init --template minimal

# Interactive setup
hatago init --template ai-assistant --interactive

# Use defaults (no prompts)
hatago init --template full-stack --defaults
```

### Template Structure

Each template directory contains:

```
template-name/
├── template.json        # Template metadata and inputs
├── hatago.config.json.hbs  # Handlebars template for config
├── README.md           # Template documentation
├── .env.hatago.example # Environment variables example
└── hooks/              # Optional setup scripts
    └── setup.sh
```

### Template Metadata Format

```json
{
  "name": "template-name",
  "version": "1.0.0",
  "templateSpec": "1.0",
  "hatagoVersion": ">=0.0.2 <2.0",
  "description": "Template description",
  "tags": ["tag1", "tag2"],
  "inputs": [
    {
      "name": "inputName",
      "type": "string|boolean|number",
      "description": "Input description",
      "required": true|false,
      "default": "defaultValue"
    }
  ],
  "hooks": {
    "preInit": "./hooks/pre-setup.sh",
    "postInit": "./hooks/post-setup.sh"
  }
}
```

### Handlebars Templates

Template files ending in `.hbs` are processed with Handlebars:

```handlebars
{ "projectName": "{{projectName}}", "enableFeature":
{{#if enableFeature}}true{{else}}false{{/if}}, "servers": {
{{#if githubToken}}
  "github": { "env": { "GITHUB_TOKEN": "{{githubToken}}" } }
{{/if}}
} }
```

### Supported Variables

Variables are collected from:

1. Command-line prompts (interactive mode)
2. Environment variables (e.g., `${GITHUB_TOKEN}`)
3. Template defaults

Common variable patterns:

- `{{projectPath}}` - Project root directory
- `{{githubToken}}` - GitHub Personal Access Token
- `{{enableFeature}}` - Boolean feature flags
- `{{#if condition}}...{{/if}}` - Conditional sections

## Development

### Adding New Templates

1. Create template directory: `mkdir new-template`
2. Add `template.json` with metadata
3. Create `.hbs` template files
4. Add documentation and examples
5. Test with the template system

### Testing Templates

```bash
# Run template system tests
pnpm test src/templates/index.test.ts

# Test specific template generation
hatago init --template your-template --force
```

### Template Guidelines

1. **Keep it simple**: Templates should be easy to understand and modify
2. **Provide examples**: Include `.env.hatago.example` and comprehensive README
3. **Use meaningful defaults**: Sensible defaults for all optional inputs
4. **Document well**: Clear descriptions for all inputs and features
5. **Test thoroughly**: Ensure templates work in different environments

## Template System API

The template system provides these key functions:

```typescript
import {
  listTemplates,
  getTemplate,
  generateFromTemplate,
  validateInputs,
  applyDefaults,
  formatTemplateList
} from './index.js';

// List all available templates
const templates = listTemplates();

// Get specific template
const template = getTemplate('ai-assistant');

// Generate from template
generateFromTemplate(template, './output', variables);
```

## Future Enhancements

### Planned Features

- **Remote Templates**: Load templates from URLs and GitHub
- **Template Registry**: Community template sharing
- **Template Inheritance**: Extend existing templates
- **Custom Validators**: Template-specific input validation
- **Template Versioning**: Upgrade and migration support

### Remote Template Support (Coming Soon)

```bash
# From GitHub
hatago init --from-url gh:owner/repo#tag

# From direct URL
hatago init --from-url https://example.com/template.zip

# From template registry
hatago templates search react
hatago templates add my-template https://...
hatago init --template my-template
```

### File Naming Conventions

- **Templates use `.hbs` extension** for Handlebars processing
- **Generated files remove the `.hbs` extension** automatically
- **Template documentation uses `HATAGO_TEMPLATE.md`** to avoid overwriting project README.md
- **Environment examples use `.env.hatago.example`** (won't overwrite existing `.env` or `.env.example`)
- **Conflict detection** prevents accidental overwrites unless `--force` is used

### Conflict Resolution

```bash
# Force overwrite existing files
hatago init --template ai-assistant --force

# Generated files show clear status
✅ Generated configuration from template: ai-assistant

Files created:
  - hatago.config.json
  - HATAGO_TEMPLATE.md
  - .env.hatago.example

Files skipped (already exist):
  - README.md        # Your existing README is safe!
  - .env.example     # Your existing env example is safe!

Files skipped (already exist):
  - README.md  # Your existing README is safe!
```

## Contributing

To contribute new templates or improvements:

1. Fork the repository
2. Create a new template or modify existing ones
3. Add comprehensive tests
4. Update documentation
5. Submit a pull request

See [Contributing Guide](../../../CONTRIBUTING.md) for details.

## Resources

- [Handlebars Documentation](https://handlebarsjs.com/)
- [MCP Specification](https://github.com/modelcontextprotocol/specification)
- [Hatago Documentation](../../../README.md)
- [Template Examples](../../../examples/)
