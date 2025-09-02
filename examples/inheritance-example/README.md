# Configuration Inheritance Examples

This directory demonstrates how to use the `extends` field for configuration inheritance in Hatago MCP Hub.

## Files

- **base.config.json** - Base configuration with common servers
- **development.config.json** - Development environment (extends base)
- **production.config.json** - Production environment (extends base)
- **personal.config.json** - Personal customization (multiple inheritance)

## Usage

### Development Environment

```bash
# Use the development configuration
hatago serve --config ./development.config.json

# Filter by tags within development
hatago serve --config ./development.config.json --tags essential
```

### Production Environment

```bash
# Use the production configuration
hatago serve --config ./production.config.json

# Only load monitoring servers
hatago serve --config ./production.config.json --tags monitoring
```

### Personal Setup

```bash
# Use personal configuration with multiple inheritance
hatago serve --config ./personal.config.json
```

## Key Features Demonstrated

### 1. Basic Inheritance

`development.config.json` and `production.config.json` both extend from `base.config.json`:

- They inherit the filesystem and github servers
- They override specific settings (logLevel, environment variables)
- They add environment-specific servers

### 2. Multiple Inheritance

`personal.config.json` extends from both base and development:

```json
"extends": ["./base.config.json", "./development.config.json"]
```

- Later parents override earlier ones
- Allows layered customization

### 3. Environment Variable Override

Development adds DEBUG flag:

```json
"env": {
  "LOG_LEVEL": "debug",
  "DEBUG": "true"
}
```

Production removes DEBUG flag using null:

```json
"env": {
  "LOG_LEVEL": "warn",
  "DEBUG": null
}
```

### 4. Combining with Tags

All configurations use tags for additional filtering:

- `essential` - Core servers needed in all environments
- `development` - Development-only tools
- `production` - Production-specific services
- `personal` - Personal customizations

## Benefits

1. **DRY Principle**: Common settings defined once in base
2. **Environment Isolation**: Clear separation between dev/prod
3. **Easy Customization**: Personal configs can layer on top
4. **Flexibility**: Combine inheritance with tag filtering
5. **Maintainability**: Changes to base automatically propagate

## Testing

```bash
# Validate configurations
hatago config validate --config ./base.config.json
hatago config validate --config ./development.config.json
hatago config validate --config ./production.config.json
hatago config validate --config ./personal.config.json

# Test inheritance resolution
hatago config show --config ./development.config.json
```
