/**
 * Documentation sources found for a package
 */
export interface DocumentationSources {
  /** README file content */
  readme?: string;
  /** Path to README file */
  readmePath?: string;
  /** CHANGELOG file content (truncated to recent entries) */
  changelog?: string;
  /** Path to CHANGELOG file */
  changelogPath?: string;
  /** LICENSE file content */
  license?: string;
  /** Path to LICENSE file */
  licensePath?: string;
  /** Path to docs/ folder if exists */
  docsPath?: string;
  /** List of doc files found in docs/ folder */
  docFiles?: string[];
  /** Path to TypeScript type definitions */
  typesPath?: string;
  /** Whether types come from @types/ package */
  typesFromDefinitelyTyped?: boolean;
  /** Additional documentation files found (CONTRIBUTING.md, etc.) */
  additionalDocs?: { name: string; path: string }[];
}

/**
 * Package information extracted from node_modules
 */
export interface PackageInfo {
  /** Package name (e.g., "react" or "@scope/package") */
  name: string;
  /** Package version */
  version: string;
  /** Package description from package.json */
  description?: string;
  /** Homepage URL */
  homepage?: string;
  /** Repository info */
  repository?: string | { type?: string; url?: string };
  /** License identifier (e.g., "MIT", "Apache-2.0") */
  licenseType?: string;
  /** Peer dependencies */
  peerDependencies?: Record<string, string>;
  /** Engine requirements */
  engines?: Record<string, string>;
  /** Package keywords/tags */
  keywords?: string[];
  /** Path to the package in node_modules */
  packagePath?: string;
  /** All documentation sources found */
  docs: DocumentationSources;

  // Legacy fields for backwards compatibility
  /** @deprecated Use docs.readme instead */
  readme?: string;
  /** @deprecated Use docs.readmePath instead */
  readmePath?: string;
}

/**
 * Workspace detection result
 */
export interface WorkspaceInfo {
  /** Root directory of the workspace */
  root: string;
  /** Glob patterns or paths for workspace packages */
  packages: string[];
  /** Workspace type detected */
  type: 'npm' | 'yarn' | 'pnpm' | 'lerna' | 'nx' | 'single';
}

/**
 * Options for skill generation
 */
export interface GenerateOptions {
  /** Working directory */
  cwd?: string;
  /** Output directory for generated skills */
  output?: string;
  /** Only process direct dependencies from package.json */
  directOnly?: boolean;
  /** Packages to include (supports globs) */
  include?: string[];
  /** Packages to exclude (supports globs) */
  exclude?: string[];
  /** Additional doc files to look for */
  additionalSources?: string[];
}

/**
 * Generated skill file info
 */
export interface SkillFile {
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** Source path in node_modules */
  sourcePath: string;
  /** Target path for generated skill */
  targetPath: string;
  /** Generated content */
  content?: string;
}

/**
 * Result from skill generation
 */
export interface GenerateResult {
  /** Generated skill files */
  skills: SkillFile[];
  /** Detected workspace type */
  workspaceType: WorkspaceInfo['type'];
  /** Total packages scanned */
  packagesScanned: number;
  /** Generation duration in ms */
  duration: number;
}

/**
 * Configuration file options
 */
export interface VSkillsConfig {
  /** Packages to include (supports globs like "@tanstack/*") */
  include?: string[];
  /** Packages to exclude (supports globs like "@types/*") */
  exclude?: string[];
  /** Only process direct dependencies from package.json */
  directOnly?: boolean;
  /** Output directory for generated skills */
  output?: string;
  /** Additional documentation files to look for */
  additionalSources?: string[];
}
