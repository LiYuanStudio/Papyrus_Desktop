#!/usr/bin/env node
/**
 * Extract changelog for specific version
 * Usage: node scripts/extract-changelog.js [version]
 * Example: node scripts/extract-changelog.js v2.0.0-beta.1
 * If no version provided, extracts [Unreleased] section
 */

const fs = require('fs');
const path = require('path');

function extractChangelog(version) {
  const changelogPath = path.join(process.cwd(), 'docs', 'guides', 'CHANGELOG.md');
  
  if (!fs.existsSync(changelogPath)) {
    console.error('Error: CHANGELOG.md not found');
    process.exit(1);
  }
  
  const content = fs.readFileSync(changelogPath, 'utf-8');
  
  // Determine search pattern
  let searchVersion = version || 'Unreleased';
  
  // Normalize version format (add 'v' prefix if missing and not Unreleased)
  if (searchVersion !== 'Unreleased' && !searchVersion.startsWith('v')) {
    searchVersion = 'v' + searchVersion;
  }
  
  // Support both ## [version] and ## version formats
  const headerPatterns = searchVersion === 'Unreleased'
    ? ['## [Unreleased]', '## Unreleased']
    : [`## [${searchVersion}]`, `## ${searchVersion}`];

  // Find the section
  const lines = content.split('\n');
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (headerPatterns.some(p => lines[i].startsWith(p))) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    console.error(`Error: Version ${searchVersion} not found in CHANGELOG.md`);
    process.exit(1);
  }

  // Find the next version header or end of file
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].match(/^## /) || lines[i].match(/^---$/)) {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex === -1) {
    endIndex = lines.length;
  }
  
  // Extract content
  let section = lines.slice(startIndex, endIndex).join('\n');
  
  // Remove the version header line itself (keep only content)
  section = section.replace(/^## \[.*?\].*?\n/, '');
  
  // Clean up
  section = section.trim();
  
  // Remove trailing separators
  section = section.replace(/\n---\s*$/, '');
  
  return section;
}

// Main
const version = process.argv[2];

try {
  const changelog = extractChangelog(version);
  
  if (!changelog) {
    console.error(`Warning: No changelog content found for ${version || 'Unreleased'}`);
    process.exit(0);
  }
  
  // Output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    // Multi-line output for GitHub Actions
    const delimiter = `CHANGELOG_${Date.now()}`;
    console.log(`changelog<<${delimiter}`);
    console.log(changelog);
    console.log(delimiter);
  } else {
    console.log(changelog);
  }
  
  // Also write to file for reference
  const outputPath = path.join(process.cwd(), 'RELEASE_NOTES.md');
  fs.writeFileSync(outputPath, changelog);
  
} catch (error) {
  console.error('Error extracting changelog:', error.message);
  process.exit(1);
}
