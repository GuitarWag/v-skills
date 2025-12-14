import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import type { PackageInfo, SkillFile } from './types.js';
import { fileExists } from './utils.js';

async function ensureDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch {
    // Directory exists
  }
}

/**
 * Create a safe folder name from package name
 *
 * Preserves the original package name structure, including scoped packages.
 * Used with the folder structure layout where each package gets its own directory.
 *
 * @param name - Package name (e.g., "react" or "@scope/package")
 * @returns The folder name (same as input, preserving scopes)
 *
 * @example
 * ```typescript
 * createSkillFolderName('react') // => 'react'
 * createSkillFolderName('@tanstack/react-query') // => '@tanstack/react-query'
 * ```
 */
export function createSkillFolderName(name: string): string {
  return name;
}

/**
 * Create a safe filename from package name (legacy flat structure)
 *
 * Converts package names to filesystem-safe filenames by replacing special characters.
 * Used with the flat file structure where all packages are in one directory.
 *
 * @param name - Package name (e.g., "react" or "@scope/package")
 * @param version - Package version (e.g., "18.3.1")
 * @returns Filesystem-safe filename with version
 *
 * @example
 * ```typescript
 * createSkillFileName('react', '18.3.1') // => 'react@18.3.1.md'
 * createSkillFileName('@tanstack/react-query', '5.0.0') // => 'tanstack__react-query@5.0.0.md'
 * ```
 */
export function createSkillFileName(name: string, version: string): string {
  const safeName = name.replace(/^@/, '').replace(/\//g, '__');
  return `${safeName}@${version}.md`;
}

/**
 * Get repository URL from various formats
 */
function getRepositoryUrl(repo: PackageInfo['repository']): string | undefined {
  if (!repo) return undefined;
  if (typeof repo === 'string') return repo;
  return repo.url?.replace(/^git\+/, '').replace(/\.git$/, '');
}

/**
 * Generate relative path from skill file to target
 */
function getRelativePath(skillPath: string, targetPath: string): string {
  const skillDir = dirname(skillPath);
  return relative(skillDir, targetPath);
}

/**
 * Generate the unified SKILL.md content
 */
function generateSkillContent(pkg: PackageInfo, skillPath: string): string {
  const lines: string[] = [];
  const repoUrl = getRepositoryUrl(pkg.repository);
  const now = new Date().toISOString().split('T')[0];

  // Header comment for v-skills identification
  lines.push(`<!-- v-skills: ${pkg.name}@${pkg.version} -->`);
  lines.push(`# ${pkg.name}`);
  lines.push('');

  // Metadata section
  lines.push(`**Version:** ${pkg.version}`);
  if (pkg.description) {
    lines.push(`**Description:** ${pkg.description}`);
  }
  if (repoUrl) {
    lines.push(`**Repository:** ${repoUrl}`);
  }
  if (pkg.homepage) {
    lines.push(`**Homepage:** ${pkg.homepage}`);
  }
  if (pkg.licenseType) {
    lines.push(`**License:** ${pkg.licenseType}`);
  }
  if (pkg.engines && Object.keys(pkg.engines).length > 0) {
    const enginesStr = Object.entries(pkg.engines)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    lines.push(`**Engines:** ${enginesStr}`);
  }
  if (pkg.peerDependencies && Object.keys(pkg.peerDependencies).length > 0) {
    const peersStr = Object.entries(pkg.peerDependencies)
      .map(([k, v]) => `${k}@${v}`)
      .join(', ');
    lines.push(`**Peer Dependencies:** ${peersStr}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // README section
  const readme = pkg.docs?.readme ?? pkg.readme;
  if (readme) {
    lines.push('## Documentation');
    lines.push('');
    lines.push(readme);
    lines.push('');
  } else if (pkg.description) {
    lines.push('## About');
    lines.push('');
    lines.push(pkg.description);
    lines.push('');
  }

  // Additional Documentation section
  const docs = pkg.docs || {};
  const hasAdditionalDocs =
    docs.docsPath || docs.additionalDocs?.length || pkg.homepage || docs.typesPath;

  if (hasAdditionalDocs) {
    lines.push('## Additional Resources');
    lines.push('');

    // Docs folder
    if (docs.docsPath && docs.docFiles?.length) {
      const docsRelPath = pkg.packagePath
        ? getRelativePath(skillPath, docs.docsPath)
        : docs.docsPath;
      lines.push('### Local Documentation');
      lines.push('');
      for (const docFile of docs.docFiles.slice(0, 10)) {
        lines.push(`- [${docFile}](${docsRelPath}/${docFile})`);
      }
      if (docs.docFiles.length > 10) {
        lines.push(`- *...and ${docs.docFiles.length - 10} more files*`);
      }
      lines.push('');
    }

    // Additional docs (CONTRIBUTING.md, etc.)
    if (docs.additionalDocs?.length) {
      lines.push('### Additional Docs');
      lines.push('');
      for (const doc of docs.additionalDocs) {
        const relPath = pkg.packagePath ? getRelativePath(skillPath, doc.path) : doc.path;
        lines.push(`- [${doc.name}](${relPath})`);
      }
      lines.push('');
    }

    // Homepage / Official docs
    if (pkg.homepage) {
      lines.push('### Official Documentation');
      lines.push('');
      lines.push(`- [${pkg.homepage}](${pkg.homepage})`);
      lines.push('');
    }

    // TypeScript types
    if (docs.typesPath) {
      const typesRelPath = pkg.packagePath
        ? getRelativePath(skillPath, docs.typesPath)
        : docs.typesPath;
      const typesSource = docs.typesFromDefinitelyTyped ? ' (from DefinitelyTyped)' : '';
      lines.push('### API Reference');
      lines.push('');
      lines.push(`- [TypeScript Definitions${typesSource}](${typesRelPath})`);
      lines.push('');
    }
  }

  // Changelog section (truncated)
  if (docs.changelog) {
    lines.push('## Recent Changes');
    lines.push('');
    // Only include first 50 lines of changelog
    const changelogLines = docs.changelog.split('\n').slice(0, 50);
    lines.push(changelogLines.join('\n'));
    if (docs.changelog.split('\n').length > 50) {
      lines.push('');
      lines.push('*[Changelog truncated - see full file for complete history]*');
    }
    lines.push('');
  }

  // Keywords section
  if (pkg.keywords && Array.isArray(pkg.keywords) && pkg.keywords.length > 0) {
    lines.push('## Keywords');
    lines.push('');
    lines.push(pkg.keywords.join(', '));
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Auto-generated by v-skills on ${now}. Do not edit manually.*`);

  return lines.join('\n');
}

/**
 * Create a skill file for a package
 *
 * Generates a comprehensive SKILL.md file containing all package documentation,
 * metadata, and links to additional resources. Returns null if the package has
 * no useful content to document.
 *
 * @param pkg - Package information extracted from node_modules
 * @param outputDir - Directory where the skill file should be created
 * @param options - Configuration options
 * @param options.useFolderStructure - Use folder structure (package-name/SKILL.md) vs flat (package-name@version.md). Default: true
 * @returns Skill file information, or null if package has no content
 *
 * @example
 * ```typescript
 * const pkg = {
 *   name: 'react',
 *   version: '18.3.1',
 *   description: 'React is a JavaScript library for building user interfaces',
 *   docs: {
 *     readme: '# React\n\nDocumentation here...',
 *     typesPath: '/path/to/index.d.ts'
 *   }
 * };
 *
 * const skill = await createSkillFile(pkg, '.claude/skills/v-skills');
 * // Creates: .claude/skills/v-skills/react/SKILL.md
 * console.log(skill?.targetPath); // => '.claude/skills/v-skills/react/SKILL.md'
 * ```
 */
export async function createSkillFile(
  pkg: PackageInfo,
  outputDir: string,
  options: { useFolderStructure?: boolean } = {}
): Promise<SkillFile | null> {
  const { useFolderStructure = true } = options;

  // Check if package has any useful content
  const docs = pkg.docs || {};
  const hasAnyContent =
    docs.readme ||
    docs.changelog ||
    docs.docsPath ||
    docs.typesPath ||
    docs.additionalDocs?.length ||
    pkg.description ||
    pkg.homepage ||
    // Legacy check
    pkg.readme;

  if (!hasAnyContent) {
    return null;
  }

  let targetPath: string;
  if (useFolderStructure) {
    // New folder structure: package-name/SKILL.md
    const folderName = createSkillFolderName(pkg.name);
    const folderPath = join(outputDir, folderName);
    await ensureDir(folderPath);
    targetPath = join(folderPath, 'SKILL.md');
  } else {
    // Legacy flat structure: package-name@version.md
    await ensureDir(outputDir);
    const fileName = createSkillFileName(pkg.name, pkg.version);
    targetPath = join(outputDir, fileName);
  }

  // Remove existing file
  if (await fileExists(targetPath)) {
    await rm(targetPath, { force: true });
  }

  // Generate and write content
  const content = generateSkillContent(pkg, targetPath);
  await writeFile(targetPath, content, 'utf-8');

  return {
    name: pkg.name,
    version: pkg.version,
    sourcePath: pkg.packagePath || pkg.readmePath || '',
    targetPath,
    content,
  };
}

/**
 * Generate markdown content for a package (standalone utility)
 *
 * Creates formatted markdown documentation from package information without
 * writing to disk. Useful for previewing content or custom integrations.
 *
 * The generated markdown includes:
 * - Package metadata (version, description, homepage, repository, license)
 * - README documentation
 * - Links to TypeScript definitions
 * - Links to docs/ folder (if available)
 * - Recent changelog entries
 * - Additional documentation files (CONTRIBUTING.md, API.md, etc.)
 *
 * @param pkg - Package information to generate documentation from
 * @param skillPath - Path where the skill file would be written (used for relative links)
 * @returns Formatted markdown content as a string
 *
 * @example
 * ```typescript
 * const pkg = {
 *   name: 'react',
 *   version: '18.3.1',
 *   description: 'React is a JavaScript library for building user interfaces',
 *   homepage: 'https://react.dev',
 *   docs: { readme: '# React\n\nDocumentation...' }
 * };
 *
 * const markdown = generateMarkdown(pkg, '.claude/skills/v-skills/react/SKILL.md');
 * console.log(markdown);
 * // Output:
 * // <!-- v-skills: react@18.3.1 -->
 * // # react
 * // **Version:** 18.3.1
 * // ...
 * ```
 */
export function generateMarkdown(pkg: PackageInfo, skillPath: string): string {
  return generateSkillContent(pkg, skillPath);
}
