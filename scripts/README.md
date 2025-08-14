# Docs Generation Scripts

## `generate-docs.ts`

This script generates Mintlify-ready documentation in `docs-generated/` by processing templates and submodules. It automatically handles Docusaurus to Mintlify migration, including frontmatter conversion and title extraction.

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

1. Copy template files (following symlinks, .md→.mdx conversion)
2. Process `autogenerate` properties and create nested groups
3. Merge configurations into final Mintlify-ready `docs.json`

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

Auto-generates navigation from folder structure:

- Creates pages from `.md`/`.mdx` files
- **Automatically creates nested groups for subdirectories**
- Preserves original folder names (no case changes)
- Uses existing `docs.json` if present (with recursive processing)
- Supports unlimited nesting depth

## ✨ **Key Features**

- **Template-based**: Clean separation of manual vs generated content
- **Symlink-friendly**: Use symlinks for development, get real files for Mintlify
- **Auto-generation**: Generate nested navigation from folder structure
- **MD→MDX conversion**: Automatic file conversion with frontmatter processing
- **Docusaurus migration**: Automatically converts Docusaurus frontmatter to Mintlify format
- **Title extraction**: Extracts titles from `# Heading` when missing from frontmatter
- **Recursive processing**: Works in root and nested groups

## 📝 **Frontmatter Processing**

The script automatically processes markdown frontmatter during `.md→.mdx` conversion to ensure Mintlify compatibility:

### **Title Extraction**

- **Missing titles**: Extracts title from first `# Heading` and adds to frontmatter
- **Duplicate removal**: Removes the `# Heading` from content to avoid duplication
- **Existing titles**: Preserved unchanged

### **Docusaurus Migration**

- **`sidebar_label`** → **`sidebarTitle`**: Automatic conversion for proper Mintlify sidebar navigation
- **Preservation**: Other frontmatter properties (like `sidebar_position`) are kept intact

## 🚀 **Usage**

```bash
yarn generate-docs
```

Generates Mintlify-ready docs in `docs-generated/` by:

1. Copying template files (following symlinks, .md→.mdx conversion)
2. Processing `autogenerate` properties recursively
3. Creating nested groups from folder structure
4. Outputting final `docs.json` with merged navigation

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
- **Migration-ready**: Seamless Docusaurus to Mintlify conversion
- **Zero-config**: Automatic frontmatter processing and title extraction
- **Flexible**: Mix manual navigation with auto-generated content
- **Scalable**: Easy to add new submodules
- **Clean separation**: Templates vs final output
