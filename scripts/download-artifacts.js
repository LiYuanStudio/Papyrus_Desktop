#!/usr/bin/env node
/**
 * Download GitHub Actions artifacts
 * Usage: node scripts/download-artifacts.js [run-id]
 * If no run-id provided, uses the latest run
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (e) {
    return null;
  }
}

function downloadArtifacts(runId) {
  const outputDir = path.join(process.cwd(), 'downloaded-artifacts');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`📦 Downloading artifacts${runId ? ` for run #${runId}` : ' (latest)'}...`);
  console.log(`📁 Output directory: ${outputDir}`);
  console.log('');

  // Build command
  let cmd = `gh run download`;
  if (runId) {
    cmd += ` ${runId}`;
  } else {
    // Get latest run
    const latestRun = exec('gh run list --workflow=release.yml --limit=1 --json databaseId -q ".[0].databaseId"');
    if (!latestRun) {
      console.error('❌ No runs found. Make sure you have pushed to trigger the workflow.');
      process.exit(1);
    }
    cmd += ` ${latestRun}`;
  }
  
  cmd += ` -D "${outputDir}"`;

  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log('');
    console.log('✅ Download complete!');
    console.log('');
    
    // List downloaded files
    const files = fs.readdirSync(outputDir, { recursive: true });
    console.log('📋 Downloaded files:');
    files.forEach(f => {
      const fullPath = path.join(outputDir, f);
      const stats = fs.statSync(fullPath);
      if (stats.isFile()) {
        const size = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`   - ${f} (${size} MB)`);
      }
    });
    
    console.log('');
    console.log(`📂 All files saved to: ${outputDir}`);
    
  } catch (error) {
    console.error('❌ Download failed:', error.message);
    console.log('');
    console.log('💡 Make sure you have:');
    console.log('   1. GitHub CLI installed: https://cli.github.com/');
    console.log('   2. Authenticated: gh auth login');
    console.log('   3. Workflow has completed successfully');
    process.exit(1);
  }
}

// Main
const runId = process.argv[2];
downloadArtifacts(runId);
