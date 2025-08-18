#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import matter from "gray-matter";
import { execSync } from "child_process";
import type { MintConfig as MintConfigOriginal } from "@mintlify/models";

// Navigation types from @mintlify/models are incomplete so here we define our own
// With the subset of fields we use (tabs, groups, pages)
type Navigation = {
  tabs?: NavigationTab[];
  groups?: NavigationGroup[];
  pages?: NavigationItem[];
};

type BaseNavigation = {
  icon?: string;
  tag?: string;
  autogenerate?: string; // Custom field: auto-generate content from folder structure
};

type NavigationGroup = BaseNavigation & {
  group: string;
  pages?: NavigationItem[];
};

type NavigationTab = BaseNavigation & {
  tab: string;
  href?: string;
  groups?: NavigationGroup[];
  pages?: NavigationItem[];
};

type NavigationItem = string | NavigationGroup;

type MintConfig = Omit<MintConfigOriginal, "navigation"> & {
  navigation: Navigation;
};

// Global cache for sidebar positions collected during file processing
const sidebarPositions = new Map<string, number>();

const ROOT_DIR = path.join(__dirname, "..");
const TEMPLATE_DIR = path.join(ROOT_DIR, "docs-template");
const GENERATED_DIR = path.join(ROOT_DIR, "docs-generated");
const BASE_CONFIG_PATH = path.join(TEMPLATE_DIR, "docs-base.json");
const SIDEBAR_CACHE_PATH = path.join(GENERATED_DIR, ".sidebar-positions.json");

/**
 * Load sidebar positions from cache file
 */
function loadSidebarPositions(): void {
  try {
    if (fs.existsSync(SIDEBAR_CACHE_PATH)) {
      const content = fs.readFileSync(SIDEBAR_CACHE_PATH, "utf-8");
      const cached = JSON.parse(content);
      for (const [relativePath, position] of Object.entries(cached)) {
        if (typeof position === "number") {
          sidebarPositions.set(relativePath, position);
        }
      }
      console.log(
        `📋 Loaded ${sidebarPositions.size} cached sidebar positions`
      );
    }
  } catch (error) {
    console.warn("Warning: Failed to load sidebar positions cache:", error);
  }
}

/**
 * Get the last modification date of a file from Git history
 * Returns the date in ISO format or null if not found
 * Handles files in submodules by running git commands in the correct directory
 */
function getGitLastModified(filePath: string): string | null {
  try {
    const absolutePath = path.resolve(filePath);
    const workspaceRoot = path.resolve(".");
    const submodulesDir = path.join(workspaceRoot, "submodules");

    let gitCwd = workspaceRoot;
    let relativePath = path.relative(workspaceRoot, absolutePath);

    // Check if file is in a submodule
    if (absolutePath.startsWith(submodulesDir)) {
      const relativeToSubmodules = path.relative(submodulesDir, absolutePath);
      const submoduleName = relativeToSubmodules.split(path.sep)[0];
      const submoduleRoot = path.join(submodulesDir, submoduleName);

      // Run git command in the submodule directory
      gitCwd = submoduleRoot;
      relativePath = path.relative(submoduleRoot, absolutePath);
    }

    const result = execSync(`git log -1 --format="%ci" -- "${relativePath}"`, {
      encoding: "utf8",
      cwd: gitCwd,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (result) {
      // Convert git date format to ISO string
      const date = new Date(result);
      return date.toISOString();
    }
    return null;
  } catch (error) {
    // If git command fails, return null
    return null;
  }
}

/**
 * Save sidebar positions to cache file (only if changed)
 */
function saveSidebarPositions(): void {
  try {
    const cacheData = Object.fromEntries(sidebarPositions);
    const newContent = JSON.stringify(cacheData, null, 2);

    // Check if content has changed
    let existingContent = "";
    if (fs.existsSync(SIDEBAR_CACHE_PATH)) {
      existingContent = fs.readFileSync(SIDEBAR_CACHE_PATH, "utf-8");
    }

    if (newContent !== existingContent) {
      fs.writeFileSync(SIDEBAR_CACHE_PATH, newContent, "utf-8");
      console.log(
        `💾 Saved ${sidebarPositions.size} sidebar positions to cache`
      );
    }
  } catch (error) {
    console.warn("Warning: Failed to save sidebar positions cache:", error);
  }
}

function readMintConfig(filePath: string): MintConfig {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    throw error;
  }
}

function writeMintConfig(filePath: string, data: MintConfig): void {
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
 * Also collects sidebar_position for navigation sorting
 */
function processMarkdownFrontmatter(content: string, filePath: string): string {
  try {
    const parsed = matter(content);
    let needsUpdate = false;
    let contentToUse = parsed.content;

    // Collect sidebar_position for navigation sorting (using relative path)
    if (typeof parsed.data.sidebar_position === "number") {
      const relativePath = path.relative(GENERATED_DIR, filePath);
      sidebarPositions.set(relativePath, parsed.data.sidebar_position);
    }

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
 * Inject an "Edit this page" component at the end of markdown content using a Mintlify snippet
 * Uses the actual source file path to determine the exact repository and file path
 */
function injectEditPageComponent(
  content: string,
  destFile: string,
  srcFile: string
): string {
  // Get the relative path from the generated directory to determine if we should skip
  const relativePath = path.relative(GENERATED_DIR, destFile);

  // Skip injection for snippet files
  if (relativePath.startsWith("snippets/")) {
    return content;
  }

  // Determine the edit URL based on the actual source file path
  function getEditUrlFromSource(sourcePath: string): string {
    const absoluteSrc = path.resolve(sourcePath);
    const workspaceRoot = path.resolve(".");
    const submodulesDir = path.join(workspaceRoot, "submodules");

    // Check if file is in a submodule
    if (absoluteSrc.startsWith(submodulesDir)) {
      // Extract submodule name from path
      const relativePath = path.relative(submodulesDir, absoluteSrc);
      const submoduleName = relativePath.split(path.sep)[0];
      const filePathInSubmodule = path.relative(
        path.join(submodulesDir, submoduleName),
        absoluteSrc
      );

      // Repository name matches submodule name
      const repoName = submoduleName;
      return `https://github.com/divvi-xyz/${repoName}/edit/main/${filePathInSubmodule}`;
    } else {
      // File is in main docs repository
      const relativeToRoot = path.relative(workspaceRoot, absoluteSrc);
      return `https://github.com/divvi-xyz/docs/edit/main/${relativeToRoot}`;
    }
  }

  const editUrl = getEditUrlFromSource(srcFile);
  const lastModified = getGitLastModified(srcFile);

  // Import and use the edit page snippet with the editUrl and lastModified props
  const editComponent = `

import { EditPage } from '/snippets/edit-page.jsx';

<EditPage editUrl="${editUrl}" lastModified="${lastModified || ""}" />`;

  return content + editComponent;
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
        // Read, process frontmatter, convert links, inject edit component, write (for both .md and .mdx files)
        const content = fs.readFileSync(src, "utf-8");
        const processedContent = processMarkdownFrontmatter(content, destFile);
        const convertedContent = convertLocalMarkdownLinks(processedContent);
        const finalContent = injectEditPageComponent(
          convertedContent,
          destFile,
          src
        );
        fs.writeFileSync(destFile, finalContent, "utf-8");
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

/**
 * Get cached sidebar position for a file
 * Returns Infinity if not found (for files without sidebar_position)
 */
function getSidebarPosition(filePath: string): number {
  const relativePath = path.relative(GENERATED_DIR, filePath);
  return sidebarPositions.get(relativePath) ?? Infinity;
}

function generatePagesFromFolder(
  folderPath: string,
  prefix: string = ""
): NavigationItem[] {
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  const files = fs.readdirSync(folderPath, { withFileTypes: true });
  const pages: NavigationItem[] = [];

  // First, add all .md/.mdx files in this folder
  files
    .filter(
      (file) =>
        file.isFile() &&
        (file.name.endsWith(".md") || file.name.endsWith(".mdx"))
    )
    .filter((file) => file.name !== "docs.json")
    .filter((file) => !file.name.startsWith("_"))
    .sort((a, b) => {
      const isReadmeOrIndex = (name: string) =>
        /^(readme|index)\.(md|mdx)$/i.test(name);

      // README/index files always come first
      const aPriority = isReadmeOrIndex(a.name);
      const bPriority = isReadmeOrIndex(b.name);

      if (aPriority !== bPriority) return aPriority ? -1 : 1;
      if (aPriority) return a.name.localeCompare(b.name); // README before index alphabetically

      // Regular files: sort by sidebar_position when available
      const positionA = getSidebarPosition(path.join(folderPath, a.name));
      const positionB = getSidebarPosition(path.join(folderPath, b.name));

      if (positionA !== positionB) {
        return positionA - positionB;
      }

      // If positions are equal, sort alphabetically
      return a.name.localeCompare(b.name);
    })
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

function countPagesRecursively(pages: NavigationItem[]): number {
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

// Unified autogeneration logic for both groups and tabs
function processAutogeneration(
  item: { autogenerate?: string; [key: string]: any },
  currentPrefix?: string
): NavigationItem[] {
  const autoGenerateFolder = item.autogenerate!;
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
    console.log(`📄 Found docs.json in ${folderPath}, using it for navigation`);
    const subDocsConfig = readMintConfig(docsJsonPath);
    const processedNavigation = processDocsNavigation(
      subDocsConfig.navigation,
      prefix
    );
    const groupNavigation = convertNavigationToGroup(
      processedNavigation,
      subDocsConfig.name || "Documentation"
    );
    return groupNavigation.pages || [];
  }

  // Generate from folder structure
  const generatedPages = generatePagesFromFolder(folderPath, prefix);
  const totalPageCount = countPagesRecursively(generatedPages);
  console.log(
    `🤖 Auto-generated ${totalPageCount} pages from folder: ${autoGenerateFolder}`
  );

  return generatedPages;
}

function processNavigationGroup(
  group: NavigationGroup,
  currentPrefix?: string
): NavigationGroup {
  // Handle autogeneration
  if (group.autogenerate) {
    const generatedPages = processAutogeneration(group, currentPrefix);
    return {
      ...group,
      pages: generatedPages,
    };
  }

  // Handle regular pages
  if (group.pages) {
    if (currentPrefix) {
      return prependPrefix(group, currentPrefix);
    } else {
      // Process nested groups recursively
      return {
        ...group,
        pages: group.pages.map((entry) =>
          typeof entry === "string"
            ? entry
            : processNavigationGroup(entry, currentPrefix)
        ),
      };
    }
  }

  return group;
}

function processNavigationTab(
  tab: NavigationTab,
  currentPrefix?: string
): NavigationTab {
  // Handle autogeneration
  if (tab.autogenerate) {
    const generatedPages = processAutogeneration(tab, currentPrefix);
    return {
      ...tab,
      pages: generatedPages,
    };
  }

  // Handle groups within tab
  if (tab.groups) {
    return {
      ...tab,
      groups: tab.groups.map((group) =>
        processNavigationGroup(group, currentPrefix)
      ),
    };
  }

  // Handle pages within tab
  if (tab.pages) {
    return {
      ...tab,
      pages: tab.pages.map((entry) =>
        typeof entry === "string"
          ? entry
          : processNavigationGroup(entry, currentPrefix)
      ),
    };
  }

  return tab;
}

function processDocsNavigation(
  navigation: Navigation,
  prefix?: string
): Navigation {
  // Process tabs
  if (navigation.tabs) {
    console.log("📑 Processing tabs navigation structure...");
    return {
      tabs: navigation.tabs.map((tab) => {
        console.log(`🔖 Processing tab: ${tab.tab}`);
        return processNavigationTab(tab, prefix);
      }),
    };
  }

  // Process groups
  if (navigation.groups) {
    console.log("📁 Processing groups navigation structure...");
    return {
      groups: navigation.groups.map((group) =>
        processNavigationGroup(group, prefix)
      ),
    };
  }

  // Process pages
  if (navigation.pages) {
    console.log("📄 Processing pages navigation structure...");
    return {
      pages: navigation.pages.map((entry) =>
        typeof entry === "string"
          ? entry
          : processNavigationGroup(entry, prefix)
      ),
    };
  }

  throw new Error(
    "Invalid navigation structure: expected 'tabs', 'groups', or 'pages'"
  );
}

function convertNavigationToGroup(
  navigation: Navigation,
  groupName: string = "Documentation"
): NavigationGroup {
  const allItems: NavigationItem[] = [];

  // Flatten tabs into groups
  if (navigation.tabs) {
    navigation.tabs.forEach((tab) => {
      if (tab.groups) {
        allItems.push(...tab.groups);
      } else if (tab.pages) {
        // Convert tab pages to a group
        allItems.push({
          group: tab.tab,
          pages: tab.pages,
          icon: tab.icon,
          tag: tab.tag,
        });
      }
    });
  }
  // Add direct groups
  else if (navigation.groups) {
    allItems.push(...navigation.groups);
  }
  // Convert pages to a group
  else if (navigation.pages && navigation.pages.length > 0) {
    allItems.push({
      group: groupName,
      pages: navigation.pages,
    });
  }

  // If single group, return it directly
  if (allItems.length === 1 && typeof allItems[0] !== "string") {
    return allItems[0] as NavigationGroup;
  }

  // Multiple items - wrap in container group
  return {
    group: groupName,
    pages: allItems,
  };
}

function cleanGeneratedDir(): void {
  if (fs.existsSync(GENERATED_DIR)) {
    console.log("🧹 Cleaning docs-generated directory...");
    fs.rmSync(GENERATED_DIR, { recursive: true, force: true });
    console.log("✅ Cleaned docs-generated directory");
  }
}

/**
 * Logs a navigation group in a hierarchical format
 */
function logGroup(group: NavigationGroup, indent: string = "  "): void {
  console.log(`${indent}📁 ${group.group}:`);
  if (group.pages) {
    logPages(group.pages, indent + "  ");
  } else {
    console.log(`${indent}  ⚠️  No pages generated`);
  }
}

/**
 * Logs navigation pages in a hierarchical format
 */
function logPages(pages: NavigationItem[], indent: string = "  "): void {
  pages.forEach((page) => {
    if (typeof page === "string") {
      console.log(`${indent}📄 ${page}`);
    } else {
      logGroup(page, indent);
    }
  });
}

/**
 * Logs the navigation structure in a hierarchical format
 */
function logNavigationStructure(navigation: Navigation): void {
  console.log("📋 Final navigation structure:");

  if (navigation.tabs) {
    navigation.tabs.forEach((tab) => {
      console.log(`📑 Tab: ${tab.tab}`);
      if (tab.groups) {
        tab.groups.forEach((group) => logGroup(group, "    "));
      } else if (tab.pages) {
        logPages(tab.pages, "    ");
      }
    });
  } else if (navigation.groups) {
    navigation.groups.forEach((group) => logGroup(group));
  } else if (navigation.pages) {
    logPages(navigation.pages);
  }
}

function generateDocs(clean: boolean = false): void {
  console.log("🔄 Generating docs...");

  // Clean the generated directory if requested
  if (clean) {
    cleanGeneratedDir();
  }

  // Load cached sidebar positions before file processing
  loadSidebarPositions();

  // Copy all template files to docs-generated directory (following symlinks, converting .md to .mdx)
  copyAllTemplateFiles();

  // Validate base config exists
  if (!fs.existsSync(BASE_CONFIG_PATH)) {
    throw new Error(`Base config file not found: ${BASE_CONFIG_PATH}`);
  }

  // Read and process base configuration
  const baseConfig = readMintConfig(BASE_CONFIG_PATH);
  console.log(`📖 Read base config: ${Object.keys(baseConfig).length} keys`);

  const finalConfig: MintConfig = {
    ...baseConfig,
    navigation: processDocsNavigation(baseConfig.navigation),
  };

  // Log the final navigation structure
  logNavigationStructure(finalConfig.navigation);

  // Write the final configuration to docs-generated directory
  const outputPath = path.join(GENERATED_DIR, "docs.json");
  writeMintConfig(outputPath, finalConfig);

  // Save sidebar positions to cache for future runs
  saveSidebarPositions();

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
