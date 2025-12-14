import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

interface MockPackage {
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  repository?: string | { type: string; url: string };
  readme?: string;
  peerDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  keywords?: string[];
}

interface MockWorkspace {
  root: string;
  packages?: MockPackage[];
  workspaceConfig?: {
    type: 'npm' | 'yarn' | 'pnpm';
    packages?: string[];
  };
  directDeps?: string[];
  devDeps?: string[];
}

/**
 * Creates a unique temporary directory for testing
 */
export async function createTempDir(): Promise<string> {
  const id = randomBytes(8).toString('hex');
  const dir = join(tmpdir(), `v-skills-test-${id}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Cleans up a temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * Creates a mock package in node_modules
 */
export async function createMockPackage(
  nodeModulesPath: string,
  pkg: MockPackage
): Promise<string> {
  // Handle scoped packages
  const packagePath = pkg.name.startsWith('@')
    ? join(nodeModulesPath, ...pkg.name.split('/'))
    : join(nodeModulesPath, pkg.name);

  await mkdir(packagePath, { recursive: true });

  // Create package.json
  const packageJson: Record<string, unknown> = {
    name: pkg.name,
    version: pkg.version,
  };

  if (pkg.description) packageJson.description = pkg.description;
  if (pkg.homepage) packageJson.homepage = pkg.homepage;
  if (pkg.repository) packageJson.repository = pkg.repository;
  if (pkg.peerDependencies) packageJson.peerDependencies = pkg.peerDependencies;
  if (pkg.engines) packageJson.engines = pkg.engines;
  if (pkg.keywords) packageJson.keywords = pkg.keywords;

  await writeFile(join(packagePath, 'package.json'), JSON.stringify(packageJson, null, 2));

  // Create README if provided
  if (pkg.readme) {
    await writeFile(join(packagePath, 'README.md'), pkg.readme);
  }

  return packagePath;
}

/**
 * Creates a complete mock workspace with node_modules
 */
export async function createMockWorkspace(config: MockWorkspace): Promise<string> {
  const { root, packages = [], workspaceConfig, directDeps = [], devDeps = [] } = config;

  await mkdir(root, { recursive: true });

  // Create root package.json
  const rootPackageJson: Record<string, unknown> = {
    name: 'test-project',
    version: '1.0.0',
  };

  if (directDeps.length > 0) {
    rootPackageJson.dependencies = Object.fromEntries(directDeps.map(d => [d, '*']));
  }

  if (devDeps.length > 0) {
    rootPackageJson.devDependencies = Object.fromEntries(devDeps.map(d => [d, '*']));
  }

  if (workspaceConfig?.type === 'npm' || workspaceConfig?.type === 'yarn') {
    rootPackageJson.workspaces = workspaceConfig.packages || [];
  }

  await writeFile(join(root, 'package.json'), JSON.stringify(rootPackageJson, null, 2));

  // Create yarn.lock for yarn workspaces
  if (workspaceConfig?.type === 'yarn') {
    await writeFile(join(root, 'yarn.lock'), '# yarn lockfile v1\n');
  }

  // Create pnpm-workspace.yaml for pnpm
  if (workspaceConfig?.type === 'pnpm') {
    const yaml = `packages:\n${(workspaceConfig.packages || [])
      .map(p => `  - '${p}'`)
      .join('\n')}\n`;
    await writeFile(join(root, 'pnpm-workspace.yaml'), yaml);
  }

  // Create node_modules and packages
  const nodeModulesPath = join(root, 'node_modules');
  await mkdir(nodeModulesPath, { recursive: true });

  for (const pkg of packages) {
    await createMockPackage(nodeModulesPath, pkg);
  }

  return root;
}

/**
 * Pre-defined test packages for common scenarios
 */
export const testPackages = {
  react: {
    name: 'react',
    version: '18.3.1',
    description: 'React is a JavaScript library for building user interfaces.',
    homepage: 'https://react.dev/',
    repository: { type: 'git', url: 'https://github.com/facebook/react.git' },
    engines: { node: '>=0.10.0' },
    readme: `# React

React is a JavaScript library for building user interfaces.

## Installation

\`\`\`bash
npm install react
\`\`\`

## Usage

\`\`\`jsx
import React from 'react';

function App() {
  return <h1>Hello World</h1>;
}
\`\`\`
`,
  } satisfies MockPackage,

  express: {
    name: 'express',
    version: '4.21.0',
    description: 'Fast, unopinionated, minimalist web framework for node.',
    homepage: 'https://expressjs.com/',
    repository: 'expressjs/express',
    engines: { node: '>= 0.10.0' },
    readme: `# Express

Fast, unopinionated, minimalist web framework for Node.js.

## Installation

\`\`\`bash
npm install express
\`\`\`

## Quick Start

\`\`\`js
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(3000);
\`\`\`
`,
  } satisfies MockPackage,

  zod: {
    name: 'zod',
    version: '3.23.8',
    description: 'TypeScript-first schema validation with static type inference',
    homepage: 'https://zod.dev',
    repository: { type: 'git', url: 'https://github.com/colinhacks/zod.git' },
    readme: `# Zod

TypeScript-first schema validation with static type inference.

## Installation

\`\`\`bash
npm install zod
\`\`\`

## Basic Usage

\`\`\`ts
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number(),
});
\`\`\`
`,
  } satisfies MockPackage,

  scopedPackage: {
    name: '@company/utils',
    version: '1.0.0',
    description: 'Internal utilities',
    peerDependencies: { typescript: '^5.0.0' },
    readme: `# @company/utils

Internal company utilities.
`,
  } satisfies MockPackage,

  noReadme: {
    name: 'no-readme-pkg',
    version: '0.0.1',
    description: 'A package without a README',
  } satisfies MockPackage,

  noContent: {
    name: 'empty-pkg',
    version: '0.0.1',
    // No readme, no description, no homepage - truly empty
  } satisfies MockPackage,

  withKeywords: {
    name: 'tagged-pkg',
    version: '2.0.0',
    description: 'Package with keywords',
    keywords: ['testing', 'mock', 'utility'],
    readme: '# Tagged Package\n\nA package with keywords.',
  } satisfies MockPackage,
};
