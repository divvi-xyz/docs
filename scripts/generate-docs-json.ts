#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import type { MintConfig, Navigation, NavigationGroup } from "@mintlify/models";

class DocsJsonGenerator {
  private baseConfigPath: string;
  private protocolConfigPath: string;
  private outputPath: string;

  constructor() {
    const rootDir = path.join(__dirname, "..");
    this.baseConfigPath = path.join(rootDir, "docs", "docs-base.json");
    this.protocolConfigPath = path.join(
      rootDir,
      "docs",
      "protocol",
      "docs",
      "docs.json"
    );
    this.outputPath = path.join(rootDir, "docs", "docs.json");
  }

  private readJsonFile(filePath: string): MintConfig {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
      throw error;
    }
  }

  private writeJsonFile(filePath: string, data: MintConfig): void {
    try {
      const content = JSON.stringify(data, null, 2);
      fs.writeFileSync(filePath, content, "utf-8");
      console.log(`✅ Successfully generated ${filePath}`);
    } catch (error) {
      console.error(`Error writing ${filePath}:`, error);
      throw error;
    }
  }

  private prependPrefix = (
    group: NavigationGroup,
    prefix: string
  ): NavigationGroup => {
    return {
      ...group,
      pages: group.pages.map((entry) =>
        typeof entry === "string"
          ? `${prefix}/${entry}`
          : this.prependPrefix(entry, prefix)
      ),
    };
  };

  private mergeNavigation = (
    mainConfig: MintConfig,
    subConfig: MintConfig,
    prefix: string
  ): Navigation => {
    // Handle both formats - direct Navigation array or nested in groups
    const mainNav: Navigation = Array.isArray(mainConfig.navigation)
      ? mainConfig.navigation
      : (mainConfig.navigation as any)?.groups || [];

    const subNav: Navigation = Array.isArray(subConfig.navigation)
      ? subConfig.navigation
      : (subConfig.navigation as any)?.groups || [];

    return [
      ...mainNav,
      ...subNav.map((group) => this.prependPrefix(group, prefix)),
    ];
  };

  public generate(): void {
    console.log("🔄 Generating docs.json...");

    // Validate input files exist
    if (!fs.existsSync(this.baseConfigPath)) {
      throw new Error(`Base config file not found: ${this.baseConfigPath}`);
    }

    if (!fs.existsSync(this.protocolConfigPath)) {
      throw new Error(
        `Protocol config file not found: ${this.protocolConfigPath}`
      );
    }

    // Read configurations
    const baseConfig = this.readJsonFile(this.baseConfigPath);
    const protocolConfig = this.readJsonFile(this.protocolConfigPath);

    console.log(`📖 Read base config: ${Object.keys(baseConfig).length} keys`);
    console.log(
      `📖 Read protocol config: ${Object.keys(protocolConfig).length} keys`
    );

    // Merge configurations
    const mergedConfig: MintConfig = {
      ...baseConfig,
      // Keep the base config's metadata but merge navigation
      navigation: this.mergeNavigation(baseConfig, protocolConfig, "protocol"),
    };

    // Log the merged navigation structure
    console.log("📋 Merged navigation structure:");
    mergedConfig.navigation?.forEach((group) => {
      console.log(`  📁 ${group.group}:`);
      group.pages.forEach((page) => {
        console.log(`    📄 ${typeof page === "string" ? page : "[nested]"}`);
      });
    });

    // Write the merged configuration
    this.writeJsonFile(this.outputPath, mergedConfig);

    console.log("✨ docs.json generation complete!");
  }
}

// CLI execution
if (require.main === module) {
  try {
    const generator = new DocsJsonGenerator();
    generator.generate();
  } catch (error) {
    console.error("❌ Error generating docs.json:", error);
    process.exit(1);
  }
}

export default DocsJsonGenerator;
