#!/usr/bin/env node

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const categoriesDir = path.join(root, 'categories');
const skillsDir = path.join(root, 'skills');
const licensePath = path.join(root, 'LICENSE');

const excludedAgents = new Set([
  // This upstream agent installs Claude Code subagents into ~/.claude/agents.
  // It is not useful in a skills.sh catalog and is misleading if converted mechanically.
  'agent-installer',
]);

const categoryLabels = new Map([
  ['01-core-development', 'Core Development'],
  ['02-language-specialists', 'Language Specialists'],
  ['03-infrastructure', 'Infrastructure'],
  ['04-quality-security', 'Quality & Security'],
  ['05-data-ai', 'Data & AI'],
  ['06-developer-experience', 'Developer Experience'],
  ['07-specialized-domains', 'Specialized Domains'],
  ['08-business-product', 'Business & Product'],
  ['09-meta-orchestration', 'Meta Orchestration'],
  ['10-research-analysis', 'Research & Analysis'],
]);

const categoryGroups = new Map([
  ['01-core-development', { slug: 'core', description: 'Core development, UI, API, mobile, and full-stack skills' }],
  ['02-language-specialists', { slug: 'lang', description: 'Language and framework specialist skills' }],
  ['03-infrastructure', { slug: 'infra', description: 'Infrastructure, cloud, DevOps, and operations skills' }],
  ['04-quality-security', { slug: 'quality', description: 'Quality, testing, security, compliance, and reliability skills' }],
  ['05-data-ai', { slug: 'data-ai', description: 'Data, machine learning, AI, and database skills' }],
  ['06-developer-experience', { slug: 'dx', description: 'Developer experience, tooling, documentation, and workflow skills' }],
  ['07-specialized-domains', { slug: 'domains', description: 'Specialized domain skills such as fintech, IoT, gaming, and healthcare' }],
  ['08-business-product', { slug: 'biz', description: 'Business, product, sales, customer, and content skills' }],
  ['09-meta-orchestration', { slug: 'meta', description: 'Multi-agent coordination, orchestration, and shared context skills' }],
  ['10-research-analysis', { slug: 'research', description: 'Research, market intelligence, SEO, and analysis skills' }],
]);

const frontmatterPattern = /^---\n([\s\S]*?)\n---\n?/;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleCase(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => {
      if (part === 'api') return 'API';
      if (part === 'ai') return 'AI';
      if (part === 'ci') return 'CI';
      if (part === 'cd') return 'CD';
      if (part === 'cli') return 'CLI';
      if (part === 'db') return 'DB';
      if (part === 'devops') return 'DevOps';
      if (part === 'dx') return 'DX';
      if (part === 'gcp') return 'GCP';
      if (part === 'iot') return 'IoT';
      if (part === 'llm') return 'LLM';
      if (part === 'ml') return 'ML';
      if (part === 'mlops') return 'MLOps';
      if (part === 'nlp') return 'NLP';
      if (part === 'php') return 'PHP';
      if (part === 'qa') return 'QA';
      if (part === 'sql') return 'SQL';
      if (part === 'ui') return 'UI';
      if (part === 'ux') return 'UX';
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function parseFrontmatter(markdown, filePath) {
  const match = markdown.match(frontmatterPattern);
  if (!match) throw new Error(`Missing frontmatter: ${filePath}`);

  const fields = {};
  for (const line of match[1].split('\n')) {
    const fieldMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!fieldMatch) continue;
    const [, key, rawValue] = fieldMatch;
    fields[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
  }

  return {
    fields,
    body: markdown.slice(match[0].length).trim(),
  };
}

function escapeYaml(value) {
  return JSON.stringify(value.replace(/\s+/g, ' ').trim());
}

function yamlList(values) {
  return values.map((value) => `  - ${value}`).join('\n');
}

function getCategoryGroup(categoryDir) {
  return categoryGroups.get(categoryDir) ?? { slug: slugify(categoryDir), description: categoryLabels.get(categoryDir) ?? categoryDir };
}

function getTags(name, categoryDir) {
  const group = getCategoryGroup(categoryDir).slug;
  const category = slugify(categoryLabels.get(categoryDir) ?? categoryDir);
  return [...new Set([group, category, ...name.split('-').filter((part) => part.length > 2)])];
}

function cleanBody(body) {
  let cleaned = body;

  cleaned = cleaned.replace(/## Communication Protocol[\s\S]*?(?=\n## |\n# |$)/gi, '');
  cleaned = cleaned.replace(/^.*curl\s+[^\n|]+\|\s*(?:bash|sh).*$/gim, '- **Install:** Review upstream installation instructions before running remote scripts. Do not pipe remote code directly into a shell unless you have inspected and trust it.');

  const replacements = [
    [/Claude Code/gi, 'the host agent environment'],
    [/context-manager/g, 'available project context or memory system'],
    [/Query context manager/g, 'Gather available project context'],
    [/querying the context-manager/g, 'gathering available project context'],
    [/Notify context-manager/g, 'Update available project context'],
  ];

  for (const [pattern, replacement] of replacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

function cleanDescription(description) {
  return description
    .replace(/Use this agent when/gi, 'Use this skill when')
    .replace(/Use this agent to/gi, 'Use this skill to')
    .replace(/Invoke this agent/gi, 'Invoke this skill')
    .replace(/Claude Code/gi, 'agent');
}

function buildSkill({ name, description, categoryDir, sourcePath, body }) {
  const category = categoryLabels.get(categoryDir) ?? categoryDir;
  const categoryGroup = getCategoryGroup(categoryDir).slug;
  const title = titleCase(name);
  const tags = getTags(name, categoryDir);

  return `---\nname: ${name}\ndescription: ${escapeYaml(cleanDescription(description))}\nlicense: MIT\ntags:\n${yamlList(tags)}\nmetadata:\n  category: ${escapeYaml(category)}\n  group: ${escapeYaml(categoryGroup)}\n  source: ${escapeYaml(sourcePath)}\n---\n\n# ${title}\n\nThis skill is an agent-agnostic adaptation of the original VoltAgent Claude Code subagent. Use the workflow guidance below with whatever tools, permissions, and execution model your host agent provides.\n\n## Attribution\n\nAdapted from [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents), copyright (c) 2025 VoltAgent, licensed under the MIT License. The repository-level LICENSE file contains the full license text.\n\n## Compatibility Notes\n\n- Treat references to files, commands, tests, repositories, and project context as host-environment capabilities rather than Claude-specific tools.\n- Ask for missing context before making irreversible changes.\n- Prefer read-only discovery before edits, and verify changes with the project's available checks.\n\n${cleanBody(body)}\n`;
}

function buildInstallCommand(groupSkills) {
  const parts = ['npx skills add joaroo/awesome-agnostic-skills'];
  for (const skill of groupSkills) parts.push(`  --skill ${skill}`);
  return `${parts.join(' \\\n')}\n`;
}

async function listAgentFiles() {
  const categoryDirs = (await readdir(categoriesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const files = [];
  for (const categoryDir of categoryDirs) {
    const absoluteCategory = path.join(categoriesDir, categoryDir);
    const entries = await readdir(absoluteCategory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue;
      files.push({ categoryDir, fileName: entry.name, absolutePath: path.join(absoluteCategory, entry.name) });
    }
  }
  return files;
}

async function main() {
  const rootEntries = new Set(await readdir(root));
  if (!rootEntries.has('categories') || !rootEntries.has('LICENSE')) {
    throw new Error(`Refusing to run: expected repository root at ${root}`);
  }

  const licenseText = await readFile(licensePath, 'utf8');
  const agentFiles = await listAgentFiles();
  await rm(skillsDir, { recursive: true, force: true });
  await mkdir(skillsDir, { recursive: true });

  const index = [];
  const groups = {};
  const seen = new Set();

  for (const agentFile of agentFiles) {
    const markdown = await readFile(agentFile.absolutePath, 'utf8');
    const { fields, body } = parseFrontmatter(markdown, agentFile.absolutePath);
    const sourceName = fields.name ?? path.basename(agentFile.fileName, '.md');
    const name = slugify(sourceName);
    if (excludedAgents.has(name)) continue;
    if (!name) throw new Error(`Invalid skill name from ${agentFile.absolutePath}`);
    if (seen.has(name)) throw new Error(`Duplicate skill name after slugify: ${name}`);
    seen.add(name);

    const description = fields.description ?? `Use when ${titleCase(name).toLowerCase()} expertise is needed.`;
    const relativeSource = path.relative(root, agentFile.absolutePath);
    const skillMarkdown = buildSkill({
      name,
      description,
      categoryDir: agentFile.categoryDir,
      sourcePath: relativeSource,
      body,
    });

    const targetDir = path.join(skillsDir, name);
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, 'SKILL.md'), skillMarkdown, 'utf8');
    await writeFile(path.join(targetDir, 'LICENSE'), licenseText, 'utf8');

    const group = getCategoryGroup(agentFile.categoryDir);
    groups[group.slug] ??= {
      description: group.description,
      category: categoryLabels.get(agentFile.categoryDir) ?? agentFile.categoryDir,
      skills: [],
    };
    groups[group.slug].skills.push(name);

    index.push({ name, description: cleanDescription(description), category: categoryLabels.get(agentFile.categoryDir) ?? agentFile.categoryDir, group: group.slug });
  }

  for (const group of Object.values(groups)) {
    group.skills.sort((a, b) => a.localeCompare(b));
  }

  const indexMarkdown = [
    '# Generated Skills Index',
    '',
    '<!-- Generated by scripts/convert-agents-to-skills.mjs. Do not edit manually. -->',
    '',
    '## Install Groups',
    '',
    '`npx skills` does not yet support publisher-defined `--group` installs, so these generated groups are provided as copy-paste commands and in [`groups.json`](./groups.json).',
    '',
  ];

  for (const [groupSlug, group] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
    indexMarkdown.push(`### ${groupSlug}`, '', group.description, '', '```bash', buildInstallCommand(group.skills).trimEnd(), '```', '');
  }

  for (const category of [...new Set(index.map((item) => item.category))]) {
    indexMarkdown.push(`## ${category}`, '');
    for (const item of index.filter((entry) => entry.category === category).sort((a, b) => a.name.localeCompare(b.name))) {
      indexMarkdown.push(`- [${item.name}](./${item.name}/SKILL.md) - ${item.description}`);
    }
    indexMarkdown.push('');
  }

  await writeFile(path.join(skillsDir, 'groups.json'), `${JSON.stringify(groups, null, 2)}\n`, 'utf8');
  await writeFile(path.join(skillsDir, 'README.md'), `${indexMarkdown.join('\n').trim()}\n`, 'utf8');
  console.log(`Generated ${index.length} skills in ${path.relative(root, skillsDir)}/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
