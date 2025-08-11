# Docs Generation Scripts

## `generate-docs.ts`

This script generates Mintlify-ready documentation in `docs-generated/` by processing templates and submodules.

## 🏗️ **Architecture**

```
docs-template/              # Source templates & symlinks
├── docs-base.json         # Base Mintlify config
├── index.mdx             # Manual content
├── images/               # Assets
└── protocol -> ../submodules/divvi-protocol/docs  # Symlinks

docs-generated/            # Final Mintlify output
├── docs.json             # Final configuration
├── index.mdx            # Copied from template
├── images/              # Copied assets
└── protocol/            # Copied from submodule (.md→.mdx)
```

## 🔄 **How it works**

1. **Copy template files**: Copies manual content from `docs-template/` to `docs-generated/`
2. **Copy submodule files**: Follows symlinks and copies actual files with `.md` → `.mdx` conversion
3. **Process navigation**: Handles both manual navigation and `AUTO_GENERATE_FROM_FOLDER` sentinels
4. **Merge configuration**: Combines base config with submodule navigation
5. **Generate final docs.json**: Outputs Mintlify-ready configuration

## ⚙️ **Configuration**

### No Configuration Needed!

The script automatically discovers and processes all content in `docs-template/`:

- **Regular files/folders**: Copied as-is with .md→.mdx conversion
- **Symlinks**: Followed and their content copied (preserving structure)
- **docs.json files**: Used for navigation when found
- **`autogenerate` property**: Processed recursively

### Auto-generation Property

Use the `autogenerate` property to specify which folder to generate pages from:

```json
{
  "group": "KPI Calculations",
  "autogenerate": "calculate-kpi"
}
```

This will:

- Auto-generate pages from `.md`/`.mdx` files in the specified folder
- **Automatically create nested groups for subdirectories**
- Sort alphabetically (files first, then subdirectory groups)
- Preserve original folder names exactly (no case changes)
- Use existing `docs.json` if present in the folder
- Support deeply nested structures
- Apply proper path prefixes

## ✨ **Key Features**

- **Template-based**: Clean separation of manual vs generated content
- **Symlink-friendly development**: Use symlinks in template for easy editing
- **Mintlify-ready output**: Actual files (no symlinks) with proper extensions
- **Auto-generation**: Generate navigation from folder structure
- **MD→MDX conversion**: Automatically converts `.md` files to `.mdx`
- **Multi-submodule**: Handle multiple submodules with different configurations
- **Warning files**: Auto-generated directories include warning files

## 🚀 **Usage**

```bash
yarn generate-docs
```

This will:

1. Clean and recreate `docs-generated/`
2. Copy all template files (converting .md → .mdx)
3. Process symlinks and copy submodule content
4. Generate final `docs.json` with merged navigation
5. Ready for `mintlify dev` in `docs-generated/`

## 📁 **Adding New Submodules**

Simply add a symlink in the template directory:

```bash
cd docs-template
ln -s ../submodules/new-module/docs new-module
```

That's it! The script will automatically:

- Follow the symlink and copy all content
- Convert .md files to .mdx
- Use any docs.json found for navigation
- Process `autogenerate` properties recursively

## 🎯 **Benefits**

- **CI-friendly**: Generated output is deterministic and Mintlify-compatible
- **Flexible**: Mix manual navigation with auto-generated content
- **Scalable**: Easy to add new submodules
- **Clean separation**: Templates vs final output
