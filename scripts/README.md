# Docs Generation Scripts

## `generate-docs-json.ts`

This script generates the final Mintlify `docs.json` configuration by merging:

- `docs/docs-base.json` - Base configuration with global settings, theming, navbar, footer, etc.
- `docs/protocol/docs/docs.json` - Protocol-specific navigation and content from the submodule

### How it works

1. **Reads base configuration**: Loads the main docs configuration with global settings
2. **Reads protocol configuration**: Loads the protocol-specific navigation structure
3. **Merges navigation**: Combines navigation groups, prefixing protocol pages with `protocol/`
4. **Writes merged config**: Outputs the final `docs/docs.json` file

### Key features

- **Path prefixing**: Protocol pages are automatically prefixed with `protocol/` to match the file structure
- **Navigation merging**: Protocol navigation groups are renamed to avoid conflicts (e.g., "General" → "Protocol")
- **Safe merging**: Base configuration takes precedence, protocol config only adds navigation
- **Verbose logging**: Shows exactly what's being merged for debugging

### Usage

#### Via npm script (recommended):

```bash
npm run generate-docs
```

#### Direct execution:

```bash
npx ts-node scripts/generate-docs-json.ts
```

### Example output

The script merges this base navigation:

```json
{
  "navigation": {
    "groups": [
      {
        "group": "Getting Started",
        "pages": ["index", "builder-camp"]
      }
    ]
  }
}
```

With this protocol navigation:

```json
{
  "navigation": {
    "groups": [
      {
        "group": "General",
        "pages": ["overview", "fund-managers", "contracts"]
      }
    ]
  }
}
```

To produce:

```json
{
  "navigation": {
    "groups": [
      {
        "group": "Getting Started",
        "pages": ["index", "builder-camp"]
      },
      {
        "group": "Protocol",
        "pages": [
          "protocol/overview",
          "protocol/fund-managers",
          "protocol/contracts"
        ]
      }
    ]
  }
}
```

### Requirements

- Node.js 18+
- TypeScript (`npm install typescript ts-node @types/node --save-dev`)

### Error handling

The script will fail gracefully if:

- Input files don't exist
- JSON parsing fails
- File write permissions are insufficient

All errors are logged with clear messages for debugging.
