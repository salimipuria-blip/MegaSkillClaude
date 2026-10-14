#!/usr/bin/env node
/**
 * Smoke-test the Persian routing examples and preview verified skill content.
 *
 * Usage:
 *   node psk/scripts/test_routing.mjs [path/to/registry.json] [path/to/skillsRoot]
 *
 * With no arguments, uses psk/data/skills-registry.json and psk/data. A custom
 * registry/root path is resolved relative to the current working directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRegistry, routeSkills, skillTexts} from '../engine/router.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pskRoot = path.resolve(scriptDir, '..');
const defaultDataDir = path.join(pskRoot, 'data');
const defaultRegistryPath = path.join(defaultDataDir, 'skills-registry.json');
const repairedFile = path.join(defaultDataDir, 'skills-repaired.json');

function usage() {
  console.log(`Usage:\n  node psk/scripts/test_routing.mjs [path/to/registry.json] [path/to/skillsRoot]\n\nWithout arguments, uses:\n  Registry: ${defaultRegistryPath}\n  Skills root: ${defaultDataDir}`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}
if (args.length > 2) {
  console.error('Expected at most two arguments: registry path and skills root.');
  usage();
  process.exit(2);
}

const registryPath = args[0] ? path.resolve(args[0]) : defaultRegistryPath;
const skillsRoot = args[1] ? path.resolve(args[1]) : defaultDataDir;

try {
  if (!fs.existsSync(registryPath) || !fs.statSync(registryPath).isFile()) {
    throw new Error(`Registry not found or not a file: ${registryPath}`);
  }
  if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) {
    throw new Error(`Skills root not found or not a directory: ${skillsRoot}`);
  }

  console.log('Loading registry:', registryPath);
  console.log('Skills root:', skillsRoot);
  const registryOptions = {skillsRoot};
  // Use the bundled repair allowlist only with the bundled registry.
  if (registryPath === defaultRegistryPath && fs.existsSync(repairedFile)) {
    registryOptions.repairedFile = repairedFile;
  }
  const registry = loadRegistry(registryPath, registryOptions);
  console.log(`Loaded ${registry.records.length} skill records.`);
  console.log('Content verification:', registry.content);

  const queries = [
    'طراحی لوگو برای برند لوکس',
    'ایده استوری اینستاگرام و کپشن',
    'برنامه بازاریابی یک محصول جدید',
    'ساخت لندینگ پیج برای خدمات وبسایت',
    'ویرایش عکس محصول برای فروشگاه',
  ];

  let unmatchedQueries = 0;
  for (const query of queries) {
    console.log(`\n=== QUERY ===\n${query}`);
    const output = routeSkills(registry, query, {limit: 8});
    console.log('queryTokens:', output.queryTokens);
    console.log('matches:', output.matches);

    if (output.selected.length === 0) {
      unmatchedQueries += 1;
      console.log('No skills selected for this query.');
      continue;
    }

    for (const skill of output.selected) {
      console.log(
        `- ${skill.name} (domain=${skill.domain}) ` +
        `score=${skill.score} hits=${skill.triggerHits} ` +
        `loaded=${skill.skillLoaded} status=${skill.contentStatus}`,
      );
    }

    const texts = skillTexts(registry, output.selected, {maxEach: 400});
    if (texts.loaded.length > 0) {
      console.log('\nVerified skill previews (first 200 characters):');
      for (const skill of texts.loaded) {
        const fullContent = skill.content || '';
        const preview = fullContent.slice(0, 200).replace(/\s+/g, ' ');
        console.log(
          `\n-- ${skill.name} (${skill.status})\n` +
          `${skill.description || '(no description)'}\n${preview}${fullContent.length > 200 ? '…' : ''}`,
        );
      }
    }
    if (texts.missing.length > 0) {
      console.log('Content missing:', texts.missing.join(', '));
    }
    if (texts.rejected.length > 0) {
      console.log('Content rejected:', texts.rejected.map((item) => item.name).join(', '));
    }
  }

  if (unmatchedQueries > 0) {
    console.error(`\nRouting smoke test failed: ${unmatchedQueries} query/queries had no selected skills.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Error running route test:', error);
  process.exitCode = 1;
}
