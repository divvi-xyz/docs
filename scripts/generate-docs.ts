#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import matter from "gray-matter";
import type { MintConfig, Navigation, NavigationGroup } from "@mintlify/models";

const ROOT_DIR = path.join(__dirname, "..");
const TEMPLATE_DIR = path.join(ROOT_DIR, "docs-template");
const GENERATED_DIR = path.join(ROOT_DIR, "docs-generated");
const BASE_CONFIG_PATH = path.join(TEMPLATE_DIR, "docs-base.json");

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

    // Check if file exists and content is the same
    let shouldWrite = true;
    if (fs.existsSync(filePath)) {
      try {
        const existingContent = fs.readFileSync(filePath, "utf-8");
        if (existingContent === content) {
          shouldWrite = false;
          console.log(`✅ No changes to ${filePath} - skipping write`);
        }
      } catch (error) {
        // If we can't read the existing file, we'll write it
        shouldWrite = true;
      }
    }

    if (shouldWrite) {
      fs.writeFileSync(filePath, content, "utf-8");
      console.log(`✅ Successfully generated ${filePath}`);
    }
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    throw error;
  }
}

function ensureDirExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
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

/**
 * Extract the first H1 heading from markdown content
 * Returns the heading text without the # symbol and leading/trailing whitespace
 */
function extractFirstHeading(content: string): string | null {
  // Match the first # heading (H1) - allow for whitespace before #
  const headingMatch = content.match(/^\s*#\s+(.+)$/m);
  return headingMatch ? headingMatch[1].trim() : null;
}

/**
 * Process md/mdx content to ensure frontmatter has a title and convert Docusaurus properties to Mintlify
 * If no title exists in frontmatter, extract it from the first # heading and remove the heading from content
 * Convert sidebar_label to sidebarTitle for Mintlify compatibility
 */
function processMarkdownFrontmatter(content: string): string {
  try {
    const parsed = matter(content);
    let needsUpdate = false;
    let contentToUse = parsed.content;

    // Start with existing frontmatter
    const newFrontmatter = { ...parsed.data };

    // Convert Docusaurus sidebar_label to Mintlify sidebarTitle
    if (parsed.data.sidebar_label && !parsed.data.sidebarTitle) {
      newFrontmatter.sidebarTitle = parsed.data.sidebar_label;
      delete newFrontmatter.sidebar_label;
      needsUpdate = true;
    }

    // Handle title extraction if no title exists
    if (!parsed.data.title) {
      const firstHeading = extractFirstHeading(parsed.content);
      if (firstHeading) {
        // Remove the first heading from content to avoid duplication
        // Match the first # heading line and remove it along with any trailing newlines
        contentToUse = parsed.content.replace(/^\s*#\s+.+$\n*/m, "");
        newFrontmatter.title = firstHeading;
        needsUpdate = true;
      }
    }

    // If no changes needed, return original content
    if (!needsUpdate) {
      return content;
    }

    // Reconstruct the file with updated frontmatter
    return matter.stringify(contentToUse, newFrontmatter);
  } catch (error) {
    console.warn(
      `Warning: Failed to process frontmatter, using original content:`,
      error
    );
    return content;
  }
}

/**
 * Convert local markdown links by removing .md/.mdx extensions for Mintlify compatibility
 * Ensuring local links are relative otherwise they are treated as external links by Mintlify
 * Processes both .md and .mdx files to handle links consistently
 * Handles .md, .mdx files and extension-less links in a single pass
 * Only convert links that don't start with http:// or https://
 *
 * Examples:
 *   [text](README.md) → [text](./README)
 *   [text](file.mdx) → [text](./file)
 *   [text](file.md#section) → [text](./file#section)
 *   [text](folder/file.md) → [text](./folder/file)
 *   [text](../README.md) → [text](../README)
 *   [text](./other.md) → [text](./other)
 *   [text](README) → [text](./README)
 *   [text](https://example.com/file.md) → [text](https://example.com/file.md) (unchanged)
 */
function convertLocalMarkdownLinks(content: string): string {
  return content.replace(
    /\[([^\]]*)\]\(([^)]+)\)/g,
    (match, linkText, linkPath) => {
      // Skip if this is an external link
      if (linkPath.startsWith("http://") || linkPath.startsWith("https://")) {
        return match;
      }

      // Skip if it's clearly not a local document link (has protocol, query params, etc.)
      if (
        linkPath.includes("://") ||
        linkPath.includes("?") ||
        linkPath.includes("=")
      ) {
        return match;
      }

      let convertedPath = linkPath;

      // Remove .md/.mdx extensions while preserving any anchor fragments
      if (linkPath.includes(".md")) {
        convertedPath = linkPath.replace(/\.mdx?(#|$)/, "$1");
      }

      // Add ./ prefix for relative links to make them explicitly relative
      // This prevents Mintlify from treating them as external links
      if (
        !convertedPath.startsWith("./") &&
        !convertedPath.startsWith("/") &&
        !convertedPath.startsWith("../")
      ) {
        convertedPath = "./" + convertedPath;
      }

      return `[${linkText}](${convertedPath})`;
    }
  );
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
    // Determine destination file path, converting .md to .mdx if needed
    let destFile = dest;
    let conversionNote = "";
    const isMarkdownFile = src.endsWith(".md") && !src.endsWith(".mdx");
    const isMdxFile = src.endsWith(".mdx");
    const needsLinkProcessing = isMarkdownFile || isMdxFile;
    if (isMarkdownFile) {
      destFile = dest.replace(/\.md$/, ".mdx");
      conversionNote = " (.md → .mdx)";
    }

    // Check if destination exists and compare mtime
    let shouldCopy = true;
    if (fs.existsSync(destFile)) {
      try {
        const destStat = fs.lstatSync(destFile);
        // If dest has same mtime as source, skip (works for .md, .mdx, and other files)
        if (srcStat.mtime.getTime() === destStat.mtime.getTime()) {
          shouldCopy = false;
        }
      } catch (error) {
        // If we can't stat destination, we'll copy it
        shouldCopy = true;
      }
    }

    if (shouldCopy) {
      console.log(`📝 Copying ${relativePath}${conversionNote}`);

      if (needsLinkProcessing) {
        // Read, process frontmatter, convert links, write (for both .md and .mdx files)
        const content = fs.readFileSync(src, "utf-8");
        const processedContent = processMarkdownFrontmatter(content);
        const convertedContent = convertLocalMarkdownLinks(processedContent);
        fs.writeFileSync(destFile, convertedContent, "utf-8");
        // Preserve timestamps (critical for mtime optimization)
        fs.utimesSync(destFile, srcStat.atime, srcStat.mtime);
      } else {
        // Copy, preserve timestamps
        fs.cpSync(src, destFile, { preserveTimestamps: true });
      }
    }
  }
}

function copyAllTemplateFiles(): void {
  console.log("📁 Copying template files to docs-generated...");

  // Ensure docs-generated directory exists
  ensureDirExists(GENERATED_DIR);

  // Copy everything from template to docs-generated (following symlinks, converting .md to .mdx)
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

function cleanGeneratedDir(): void {
  if (fs.existsSync(GENERATED_DIR)) {
    console.log("🧹 Cleaning docs-generated directory...");
    fs.rmSync(GENERATED_DIR, { recursive: true, force: true });
    console.log("✅ Cleaned docs-generated directory");
  }
}

function generateDocs(clean: boolean = false): void {
  console.log("🔄 Generating docs...");

  // Clean the generated directory if requested
  if (clean) {
    cleanGeneratedDir();
  }

  // Copy all template files to docs-generated directory (following symlinks, converting .md to .mdx)
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

  // Process navigation structure (tabs or groups)
  const navigation = baseConfig.navigation as any;

  if (navigation?.tabs) {
    console.log("📑 Processing tabs navigation structure...");
    mergedConfig.navigation = {
      tabs: navigation.tabs.map((tab: any) => {
        console.log(`🔖 Processing tab: ${tab.tab}`);
        return {
          ...tab,
          groups: tab.groups.map((group: any) => processNavigationGroup(group)),
        };
      }),
    } as any;
  } else if (navigation?.groups) {
    console.log("📁 Processing groups navigation structure...");
    mergedConfig.navigation = {
      groups: navigation.groups.map((group: any) =>
        processNavigationGroup(group)
      ),
    } as any;
  } else {
    throw new Error(
      "Invalid navigation structure: expected either 'tabs' or 'groups'"
    );
  }

  // Log the final navigation structure
  console.log("📋 Final navigation structure:");
  if (navigation?.tabs) {
    (mergedConfig.navigation as any).tabs.forEach((tab: any) => {
      console.log(`📑 Tab: ${tab.tab}`);
      tab.groups.forEach((group: any) => logGroup(group, "    "));
    });
  } else {
    (mergedConfig.navigation as any).groups.forEach((group: any) =>
      logGroup(group)
    );
  }

  // Helper function for logging navigation structure
  function logGroup(group: any, indent: string = "  ") {
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
  }

  // Write the final configuration to docs-generated directory
  const outputPath = path.join(GENERATED_DIR, "docs.json");
  writeJsonFile(outputPath, mergedConfig);

  console.log("✨ docs generation complete!");
}

// CLI execution
if (require.main === module) {
  const argv = yargs(hideBin(process.argv))
    .option("clean", {
      alias: "c",
      type: "boolean",
      description: "Clean the docs-generated directory before generating",
      default: false,
    })
    .help()
    .alias("help", "h")
    .version(false)
    .strict()
    .parseSync();

  try {
    generateDocs(argv.clean);
  } catch (error) {
    console.error("❌ Error generating docs:", error);
    process.exit(1);
  }
}
