# Docs Generation Scripts

## `generate-docs.ts`

This script generates the final Mintlify `docs.json` configuration by merging:

- `docs/docs-base.json` - Base configuration with global settings, theming, navbar, footer, etc.
- Multiple submodule documentation from configured sources

### How it works

1. **Copies submodule files**: Replaces symlinks with actual files from configured submodules
2. **Reads base configuration**: Loads the main docs configuration with global settings
3. **Processes each submodule**: Reads navigation from each configured submodule
4. **Merges navigation**: Combines all navigation groups with appropriate path prefixes
5. **Writes merged config**: Outputs the final `docs/docs.json` file

### Configuration

Submodules are configured in the script constructor:

```typescript
this.submodules = [
  {
    name: "protocol",
    source: "submodules/divvi-protocol/docs",
    dest: "protocol",
    docsConfig: "docs.json",
  },
  // Add more submodules here:
  // {
  //   name: "mobile",
  //   source: "submodules/divvi-mobile/docs",
  //   dest: "mobile",
  //   docsConfig: "docs.json"
  // }
];
```

### Key features

- **Multi-submodule support**: Handles any number of submodules with flexible configuration
- **Automatic file copying**: Replaces symlinks with actual files for Mintlify compatibility
- **Path prefixing**: Submodule pages are automatically prefixed to match the file structure
- **Safe merging**: Base configuration takes precedence, submodules only add navigation
- **Warning files**: Creates `README-AUTO-GENERATED.md` in copied directories
- **Graceful handling**: Skips missing submodules with warnings instead of failing
- **Verbose logging**: Shows exactly what's being processed for debugging

### Usage

#### Via npm script (recommended):

```bash
npm run generate-docs
```

#### Direct execution:

```bash
npx ts-node scripts/generate-docs.ts
```

### Adding new submodules

To add a new submodule:

1. **Add to configuration** in the script:

```typescript
{
  name: "mobile",                     // Display name
  source: "submodules/divvi-mobile/docs", // Source path (relative to project root)
  dest: "mobile",                     // Destination in docs/ directory
  docsConfig: "docs.json"             // Path to docs.json (relative to source)
}
```

2. **Run the script**:

```bash
npm run generate-docs
```

The script will automatically:

- Copy files from `submodules/divvi-mobile/docs/` to `docs/mobile/`
- Read navigation from `docs/mobile/docs.json`
- Prefix pages with `mobile/`
- Merge into the final configuration

### Requirements

- Node.js 18+
- TypeScript and required dependencies (see `package.json`)

### Error handling

The script will:

- **Skip missing submodules** with warnings instead of failing
- **Fail gracefully** if base config is missing or malformed
- **Log clear errors** for debugging

This allows partial builds when some submodules are unavailable.
