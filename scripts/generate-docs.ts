#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import type { MintConfig, Navigation, NavigationGroup } from "@mintlify/models";

const ROOT_DIR = path.join(__dirname, "..");
const TEMPLATE_DIR = path.join(ROOT_DIR, "docs-template");
const GENERATED_DIR = path.join(ROOT_DIR, "docs-generated");
const BASE_CONFIG_PATH = path.join(TEMPLATE_DIR, "docs-base.json");
const OUTPUT_PATH = path.join(GENERATED_DIR, "docs.json");

function readJsonFile(filePath: string): MintConfig {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    throw error;
  }
}

function writeJsonFile(filePath: string, data: MintConfig): void {
  try {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`✅ Successfully generated ${filePath}`);
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    throw error;
  }
}

function prependPrefix(
  group: NavigationGroup,
  prefix: string
): NavigationGroup {
  // If group doesn't have pages array, process it first
  if (!Array.isArray(group.pages)) {
    const processedGroup = processNavigationGroup(group as any, prefix);
    return processedGroup;
  }

  return {
    ...group,
    pages: group.pages.map((entry) =>
      typeof entry === "string"
        ? `${prefix}/${entry}`
        : prependPrefix(entry, prefix)
    ),
  };
}

function copyRecursively(
  src: string,
  dest: string,
  relativePath: string = ""
): void {
  const srcStat = fs.lstatSync(src);

  if (srcStat.isSymbolicLink()) {
    // Follow symlink and copy its content
    const linkTarget = fs.readlinkSync(src);
    const resolvedTarget = path.resolve(path.dirname(src), linkTarget);
    console.log(`🔗 Following symlink: ${relativePath} → ${linkTarget}`);
    copyRecursively(resolvedTarget, dest, relativePath);
    return;
  }

  if (srcStat.isDirectory()) {
    // Create directory and copy contents
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src);

    for (const file of files) {
      const srcFile = path.join(src, file);
      const destFile = path.join(dest, file);
      const newRelativePath = relativePath ? `${relativePath}/${file}` : file;
      copyRecursively(srcFile, destFile, newRelativePath);
    }
  } else if (srcStat.isFile()) {
    // Copy file, converting .md to .mdx
    let destFile = dest;
    if (src.endsWith(".md") && !src.endsWith(".mdx")) {
      destFile = dest.replace(/\.md$/, ".mdx");
      console.log(`📝 Converting ${relativePath} (.md → .mdx)`);
    }
    fs.copyFileSync(src, destFile);
  }
}

function copyAllTemplateFiles(): void {
  console.log("📁 Copying all template files...");

  // Remove and recreate generated directory
  if (fs.existsSync(GENERATED_DIR)) {
    fs.rmSync(GENERATED_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  // Copy everything from template (following symlinks, converting .md to .mdx)
  const templateFiles = fs.readdirSync(TEMPLATE_DIR);

  for (const file of templateFiles) {
    // Skip docs-base.json (we'll process it separately)
    if (file === "docs-base.json") {
      continue;
    }

    const srcPath = path.join(TEMPLATE_DIR, file);
    const destPath = path.join(GENERATED_DIR, file);

    copyRecursively(srcPath, destPath, file);
  }
}

function generatePagesFromFolder(
  folderPath: string,
  prefix: string = ""
): (string | any)[] {
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  const files = fs.readdirSync(folderPath, { withFileTypes: true });
  const pages: (string | any)[] = [];

  // First, add all .md/.mdx files in this folder
  files
    .filter(
      (file) =>
        file.isFile() &&
        (file.name.endsWith(".md") || file.name.endsWith(".mdx"))
    )
    .filter((file) => file.name !== "docs.json")
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((file) => {
      const fileName = file.name.replace(/\.(md|mdx)$/, "");
      pages.push(prefix ? `${prefix}/${fileName}` : fileName);
    });

  // Then, create nested groups for subdirectories that contain .md/.mdx files
  files
    .filter((file) => file.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((dir) => {
      const subfolderPath = path.join(folderPath, dir.name);
      const subfolderPrefix = prefix ? `${prefix}/${dir.name}` : dir.name;
      const subPages = generatePagesFromFolder(subfolderPath, subfolderPrefix);

      if (subPages.length > 0) {
        // Create a nested group for this subdirectory
        pages.push({
          group: dir.name,
          pages: subPages,
        });
      }
    });

  return pages;
}

function countPagesRecursively(pages: (string | any)[]): number {
  let count = 0;
  for (const page of pages) {
    if (typeof page === "string") {
      count++;
    } else if (page.pages && Array.isArray(page.pages)) {
      count += countPagesRecursively(page.pages);
    }
  }
  return count;
}

function processNavigationGroup(
  group: any,
  currentPrefix?: string
): NavigationGroup {
  // Handle autogenerate property
  const autoGenerateFolder = group.autogenerate;

  if (autoGenerateFolder) {
    let folderPath: string;
    let prefix: string | undefined;

    if (currentPrefix) {
      // We're inside a submodule, look in the prefixed folder
      folderPath = path.join(GENERATED_DIR, currentPrefix, autoGenerateFolder);
      prefix = `${currentPrefix}/${autoGenerateFolder}`;

      // If that doesn't exist, try the current prefix folder directly
      if (!fs.existsSync(folderPath)) {
        folderPath = path.join(GENERATED_DIR, currentPrefix);
        prefix = currentPrefix;
      }
    } else {
      // Base navigation, look for the specified folder
      folderPath = path.join(GENERATED_DIR, autoGenerateFolder);
      prefix = autoGenerateFolder;

      // If folder doesn't exist, try without prefix (for root-level files)
      if (!fs.existsSync(folderPath)) {
        folderPath = GENERATED_DIR;
        prefix = undefined;
      }
    }

    // Check if folder has its own docs.json
    const docsJsonPath = path.join(folderPath, "docs.json");
    if (fs.existsSync(docsJsonPath)) {
      console.log(
        `📄 Found docs.json in ${folderPath}, using it for navigation`
      );
      const subDocsConfig = readJsonFile(docsJsonPath);
      return processDocsConfig(subDocsConfig, prefix);
    }

    // Generate from folder structure
    const generatedPages = generatePagesFromFolder(folderPath, prefix);
    const totalPageCount = countPagesRecursively(generatedPages);
    console.log(
      `🤖 Auto-generated ${totalPageCount} pages for ${group.group} from folder: ${autoGenerateFolder}`
    );

    return {
      ...group,
      pages: generatedPages,
    };
  }

  // Handle regular navigation group
  if (Array.isArray(group.pages)) {
    if (currentPrefix) {
      return prependPrefix(group, currentPrefix);
    } else {
      // Root-level group - still need to process nested autogenerate groups
      return {
        ...group,
        pages: group.pages.map((entry: any) =>
          typeof entry === "string"
            ? entry
            : processNavigationGroup(entry as any, currentPrefix)
        ),
      };
    }
  }

  return group;
}

function processDocsConfig(
  config: MintConfig,
  prefix?: string
): NavigationGroup {
  const navGroups = Array.isArray(config.navigation)
    ? config.navigation
    : (config.navigation as any)?.groups || [];

  // If single group, return it directly
  if (navGroups.length === 1) {
    return processNavigationGroup(navGroups[0], prefix);
  }

  // If multiple groups, we need to return a wrapper group
  // For now, let's merge them into a single group
  const allPages: any[] = [];
  for (const group of navGroups) {
    const processedGroup = processNavigationGroup(group, prefix);
    allPages.push(...processedGroup.pages);
  }

  return {
    group: config.name || "Documentation",
    pages: allPages,
  };
}

function generateDocs(): void {
  console.log("🔄 Generating docs...");

  // Copy all template files (following symlinks, converting .md to .mdx)
  copyAllTemplateFiles();

  // Validate base config exists
  if (!fs.existsSync(BASE_CONFIG_PATH)) {
    throw new Error(`Base config file not found: ${BASE_CONFIG_PATH}`);
  }

  // Read and process base configuration
  const baseConfig = readJsonFile(BASE_CONFIG_PATH);
  console.log(`📖 Read base config: ${Object.keys(baseConfig).length} keys`);

  // Start with base config
  let mergedConfig: MintConfig = { ...baseConfig };
  const baseNavGroups = (baseConfig.navigation as any)?.groups || [];

  let allNavigation: Navigation = [];

  // Process base navigation groups (handle AUTO_GENERATE_FROM_FOLDER sentinels)
  for (const group of baseNavGroups) {
    const processedGroup = processNavigationGroup(group);
    allNavigation.push(processedGroup);
  }

  // Update merged config with processed navigation
  mergedConfig.navigation = { groups: allNavigation } as any;

  // Log the merged navigation structure
  console.log("📋 Final navigation structure:");
  const logGroup = (group: any, indent: string = "  ") => {
    console.log(`${indent}📁 ${group.group}:`);
    if (group.pages && Array.isArray(group.pages)) {
      group.pages.forEach((page: any) => {
        if (typeof page === "string") {
          console.log(`${indent}  📄 ${page}`);
        } else {
          logGroup(page, indent + "  ");
        }
      });
    } else {
      console.log(`${indent}  ⚠️  No pages generated`);
    }
  };

  allNavigation.forEach((group: any) => {
    logGroup(group);
  });

  // Write the final configuration
  writeJsonFile(OUTPUT_PATH, mergedConfig);

  console.log("✨ docs generation complete!");
}

// CLI execution
if (require.main === module) {
  try {
    generateDocs();
  } catch (error) {
    console.error("❌ Error generating docs:", error);
    process.exit(1);
  }
}
