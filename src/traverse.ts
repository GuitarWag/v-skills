import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { PackageInfo, GenerateOptions, DocumentationSources } from './types.js';
import { fileExists, readJson } from './utils.js';

async function isDirectoryOrSymlinkToDir(
  entry: { isDirectory: () => boolean; isSymbolicLink: () => boolean; name: string },
  parentPath: string
): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink()) {
    try {
      const stats = await stat(join(parentPath, entry.name));
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  return false;
}

async function readTextFile(path: string, maxLines?: number): Promise<string | null> {
  try {
    const content = await readFile(path, 'utf-8');
    if (maxLines) {
      const lines = content.split('\n');
      return lines.slice(0, maxLines).join('\n');
    }
    return content;
  } catch {
    return null;
  }
}

export async function getDirectDependencies(cwd: string): Promise<Set<string>> {
  const packageJsonPath = join(cwd, 'package.json');
  const pkg = await readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(packageJsonPath);

  if (!pkg) return new Set();

  const deps = new Set<string>();
  if (pkg.dependencies) {
    Object.keys(pkg.dependencies).forEach(d => deps.add(d));
  }
  if (pkg.devDependencies) {
    Object.keys(pkg.devDependencies).forEach(d => deps.add(d));
  }
  return deps;
}

export async function* traverseNodeModules(
  nodeModulesPath: string,
  options: GenerateOptions = {}
): AsyncGenerator<PackageInfo> {
  const { include, exclude, additionalSources } = options;

  try {
    const entries = await readdir(nodeModulesPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!(await isDirectoryOrSymlinkToDir(entry, nodeModulesPath))) continue;

      // Handle scoped packages (@org/package)
      if (entry.name.startsWith('@')) {
        const scopePath = join(nodeModulesPath, entry.name);
        const scopedEntries = await readdir(scopePath, { withFileTypes: true });

        for (const scopedEntry of scopedEntries) {
          if (!(await isDirectoryOrSymlinkToDir(scopedEntry, scopePath))) continue;

          const fullName = `${entry.name}/${scopedEntry.name}`;
          if (shouldInclude(fullName, include, exclude)) {
            const info = await extractPackageInfo(
              join(scopePath, scopedEntry.name),
              fullName,
              nodeModulesPath,
              additionalSources
            );
            if (info) yield info;
          }
        }
      } else {
        // Skip hidden folders and common non-package directories
        if (entry.name.startsWith('.') || entry.name === '.bin') continue;

        if (shouldInclude(entry.name, include, exclude)) {
          const info = await extractPackageInfo(
            join(nodeModulesPath, entry.name),
            entry.name,
            nodeModulesPath,
            additionalSources
          );
          if (info) yield info;
        }
      }
    }
  } catch {
    // node_modules doesn't exist or can't be read
  }
}

function shouldInclude(name: string, include?: string[], exclude?: string[]): boolean {
  if (exclude?.some(pattern => matchPattern(name, pattern))) {
    return false;
  }
  if (include && include.length > 0) {
    return include.some(pattern => matchPattern(name, pattern));
  }
  return true;
}

function matchPattern(name: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(name);
  }
  return name === pattern || name.startsWith(pattern + '/');
}

async function extractPackageInfo(
  packagePath: string,
  name: string,
  nodeModulesPath: string,
  additionalSources?: string[]
): Promise<PackageInfo | null> {
  const packageJsonPath = join(packagePath, 'package.json');
  const pkg = await readJson<{
    name?: string;
    version?: string;
    description?: string;
    homepage?: string;
    repository?: string | { type?: string; url?: string };
    license?: string;
    peerDependencies?: Record<string, string>;
    engines?: Record<string, string>;
    keywords?: string[];
    types?: string;
    typings?: string;
    readme?: string;
  }>(packageJsonPath);

  if (!pkg || !pkg.version) return null;

  // Gather all documentation sources
  const docs = await gatherDocumentation(packagePath, nodeModulesPath, name, additionalSources);

  // Backwards compatibility: also set legacy fields
  const readme = docs.readme;
  const readmePath = docs.readmePath;

  return {
    name,
    version: pkg.version,
    description: pkg.description,
    homepage: pkg.homepage,
    repository: pkg.repository,
    licenseType: pkg.license,
    peerDependencies: pkg.peerDependencies,
    engines: pkg.engines,
    keywords: pkg.keywords,
    packagePath,
    docs,
    // Legacy fields
    readme,
    readmePath,
  };
}

async function gatherDocumentation(
  packagePath: string,
  nodeModulesPath: string,
  packageName: string,
  additionalSources?: string[]
): Promise<DocumentationSources> {
  const docs: DocumentationSources = {};

  // 1. Find README
  const readmePath = await findFile(packagePath, [
    'README.md',
    'readme.md',
    'Readme.md',
    'README.MD',
    'README',
    'readme',
    'README.markdown',
    'readme.markdown',
    'README.txt',
    'readme.txt',
  ]);
  if (readmePath) {
    docs.readmePath = readmePath;
    docs.readme = (await readTextFile(readmePath)) ?? undefined;
  }

  // 2. Find CHANGELOG
  const changelogPath = await findFile(packagePath, [
    'CHANGELOG.md',
    'changelog.md',
    'Changelog.md',
    'CHANGELOG',
    'changelog',
    'HISTORY.md',
    'history.md',
    'CHANGES.md',
    'changes.md',
  ]);
  if (changelogPath) {
    docs.changelogPath = changelogPath;
    // Only read first 200 lines of changelog to avoid huge files
    docs.changelog = (await readTextFile(changelogPath, 200)) ?? undefined;
  }

  // 3. Find LICENSE
  const licensePath = await findFile(packagePath, [
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'license',
    'license.md',
    'license.txt',
    'LICENCE',
    'LICENCE.md',
    'LICENCE.txt',
  ]);
  if (licensePath) {
    docs.licensePath = licensePath;
    docs.license = (await readTextFile(licensePath)) ?? undefined;
  }

  // 4. Find docs/ folder
  const docsFolder = await findDocsFolder(packagePath);
  if (docsFolder) {
    docs.docsPath = docsFolder.path;
    docs.docFiles = docsFolder.files;
  }

  // 5. Find TypeScript types
  const typesInfo = await findTypeDefinitions(packagePath, nodeModulesPath, packageName);
  if (typesInfo) {
    docs.typesPath = typesInfo.path;
    docs.typesFromDefinitelyTyped = typesInfo.fromDefinitelyTyped;
  }

  // 6. Find additional documentation files
  const defaultAdditional = [
    'CONTRIBUTING.md',
    'contributing.md',
    'ARCHITECTURE.md',
    'architecture.md',
    'API.md',
    'api.md',
    'GUIDE.md',
    'guide.md',
    'USAGE.md',
    'usage.md',
  ];
  const sourcesToCheck = [...defaultAdditional, ...(additionalSources || [])];
  const additionalDocs: { name: string; path: string }[] = [];

  for (const source of sourcesToCheck) {
    const filePath = join(packagePath, source);
    if (await fileExists(filePath)) {
      additionalDocs.push({ name: source, path: filePath });
    }
  }
  if (additionalDocs.length > 0) {
    docs.additionalDocs = additionalDocs;
  }

  return docs;
}

async function findFile(dir: string, names: string[]): Promise<string | null> {
  for (const name of names) {
    const fullPath = join(dir, name);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

async function findDocsFolder(
  packagePath: string
): Promise<{ path: string; files: string[] } | null> {
  const possibleNames = ['docs', 'doc', 'documentation', 'Docs', 'Doc'];

  for (const name of possibleNames) {
    const docsPath = join(packagePath, name);
    try {
      const stats = await stat(docsPath);
      if (stats.isDirectory()) {
        const files = await scanDocsFolder(docsPath);
        if (files.length > 0) {
          return { path: docsPath, files };
        }
      }
    } catch {
      // Folder doesn't exist
    }
  }
  return null;
}

async function scanDocsFolder(docsPath: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(docsPath, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        // Recursively scan subdirectories (max 2 levels deep)
        if (prefix.split('/').length < 2) {
          const subFiles = await scanDocsFolder(join(docsPath, entry.name), relativePath);
          files.push(...subFiles);
        }
      } else if (entry.isFile() && isDocFile(entry.name)) {
        files.push(relativePath);
      }
    }
  } catch {
    // Can't read directory
  }
  return files;
}

function isDocFile(name: string): boolean {
  const docExtensions = ['.md', '.markdown', '.txt', '.rst', '.adoc'];
  const lowerName = name.toLowerCase();
  return docExtensions.some(ext => lowerName.endsWith(ext));
}

async function findTypeDefinitions(
  packagePath: string,
  nodeModulesPath: string,
  packageName: string
): Promise<{ path: string; fromDefinitelyTyped: boolean } | null> {
  // First check if package has its own types
  const packageJsonPath = join(packagePath, 'package.json');
  const pkg = await readJson<{ types?: string; typings?: string }>(packageJsonPath);

  if (pkg?.types || pkg?.typings) {
    const typesField = pkg.types || pkg.typings;
    const typesPath = join(packagePath, typesField!);
    if (await fileExists(typesPath)) {
      return { path: typesPath, fromDefinitelyTyped: false };
    }
  }

  // Check for index.d.ts in package root
  const indexDts = join(packagePath, 'index.d.ts');
  if (await fileExists(indexDts)) {
    return { path: indexDts, fromDefinitelyTyped: false };
  }

  // Check for @types/package in node_modules
  // Handle scoped packages: @scope/package -> @types/scope__package
  let typesPackageName: string;
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.slice(1).split('/');
    typesPackageName = `@types/${scope}__${name}`;
  } else {
    typesPackageName = `@types/${packageName}`;
  }

  const typesPackagePath = join(nodeModulesPath, typesPackageName);
  if (await fileExists(typesPackagePath)) {
    // Find the main types file
    const typesPkg = await readJson<{ types?: string; typings?: string; main?: string }>(
      join(typesPackagePath, 'package.json')
    );
    const typesFile = typesPkg?.types || typesPkg?.typings || 'index.d.ts';
    const typesFilePath = join(typesPackagePath, typesFile);
    if (await fileExists(typesFilePath)) {
      return { path: typesFilePath, fromDefinitelyTyped: true };
    }
  }

  return null;
}
