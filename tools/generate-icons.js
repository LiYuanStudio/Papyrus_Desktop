const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoPromise = import('png-to-ico');
const { Icns, IcnsImage } = require('@fiahfy/icns');

const SOURCE_ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const FRONTEND_PUBLIC_DIR = path.join(__dirname, '..', 'frontend', 'public');
const TEMP_DIR = path.join(__dirname, '..', 'temp-icons');

const CANVAS_SIZE = 1024;
const CONTENT_SCALE = 1.0;

const ICNS_SIZES = [
  { size: 16, type: 'icp4' },
  { size: 32, type: 'icp5' },
  { size: 64, type: 'icp6' },
  { size: 128, type: 'ic07' },
  { size: 256, type: 'ic08' },
  { size: 512, type: 'ic09' },
  { size: 1024, type: 'ic10' },
  { size: 32, type: 'ic11' },
  { size: 64, type: 'ic12' },
  { size: 256, type: 'ic13' },
  { size: 512, type: 'ic14' },
];

const ICO_SIZES = [16, 32, 48, 64, 128, 256];

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function cleanup() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}

async function generateBasePng() {
  console.log('Generating base 1024x1024 PNG with safe margins...');

  const source = sharp(SOURCE_ICON);
  const metadata = await source.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read source icon dimensions');
  }

  const targetContentSize = Math.round(CANVAS_SIZE * CONTENT_SCALE);

  const resizedBuffer = await source
    .resize(targetContentSize, targetContentSize, { fit: 'inside' })
    .toBuffer();

  const resizedMeta = await sharp(resizedBuffer).metadata();

  const finalBuffer = await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resizedBuffer,
        top: Math.round((CANVAS_SIZE - (resizedMeta.height || targetContentSize)) / 2),
        left: Math.round((CANVAS_SIZE - (resizedMeta.width || targetContentSize)) / 2),
      },
    ])
    .png()
    .toBuffer();

  const basePath = path.join(TEMP_DIR, '1024.png');
  fs.writeFileSync(basePath, finalBuffer);
  console.log(`  Base PNG saved: ${basePath}`);

  return basePath;
}

async function generateSizeVariants(basePath) {
  console.log('Generating size variants...');

  const baseBuffer = fs.readFileSync(basePath);
  const allSizes = [...new Set([...ICNS_SIZES.map((s) => s.size), ...ICO_SIZES])];

  const paths = {};

  for (const size of allSizes) {
    if (size === 1024) {
      paths[size] = basePath;
      continue;
    }

    const outputPath = path.join(TEMP_DIR, `${size}.png`);
    await sharp(baseBuffer)
      .resize(size, size, { fit: 'fill' })
      .png()
      .toFile(outputPath);

    paths[size] = outputPath;
    console.log(`  ${size}x${size} -> ${outputPath}`);
  }

  return paths;
}

async function generateIcns(sizePaths) {
  console.log('Generating .icns for macOS...');

  const icns = new Icns();

  for (const { size, type } of ICNS_SIZES) {
    const pngPath = sizePaths[size];
    if (!pngPath) {
      console.warn(`  Warning: missing ${size}x${size} for type ${type}`);
      continue;
    }

    const buffer = fs.readFileSync(pngPath);
    const image = IcnsImage.fromPNG(buffer, type);
    icns.append(image);
    console.log(`  ${type}: ${size}x${size}`);
  }

  const outputPath = path.join(ASSETS_DIR, 'icon.icns');
  fs.writeFileSync(outputPath, icns.data);
  console.log(`  .icns saved: ${outputPath} (${icns.data.length} bytes)`);
}

async function generateIco(sizePaths) {
  console.log('Generating .ico for Windows...');

  const { default: pngToIco } = await pngToIcoPromise;
  const inputs = ICO_SIZES.map((size) => sizePaths[size]).filter(Boolean);
  const buf = await pngToIco(inputs);

  const outputPath = path.join(ASSETS_DIR, 'icon.ico');
  fs.writeFileSync(outputPath, buf);
  console.log(`  .ico saved: ${outputPath} (${buf.length} bytes)`);
}

async function copyToFrontend(basePath) {
  console.log('Copying icon to frontend/public...');

  const destPath = path.join(FRONTEND_PUBLIC_DIR, 'icon.png');
  fs.copyFileSync(basePath, destPath);
  console.log(`  Copied to: ${destPath}`);
}

async function updateAssetsPng(basePath) {
  console.log('Updating assets/icon.png...');

  const destPath = path.join(ASSETS_DIR, 'icon.png');
  fs.copyFileSync(basePath, destPath);
  console.log(`  Updated: ${destPath}`);
}

async function main() {
  console.log('=== Papyrus Icon Generator ===\n');

  try {
    if (!fs.existsSync(SOURCE_ICON)) {
      throw new Error(`Source icon not found: ${SOURCE_ICON}`);
    }

    await ensureDir(TEMP_DIR);
    await cleanup();
    await ensureDir(TEMP_DIR);

    const basePath = await generateBasePng();
    const sizePaths = await generateSizeVariants(basePath);

    await generateIcns(sizePaths);
    await generateIco(sizePaths);
    await updateAssetsPng(basePath);
    await copyToFrontend(basePath);

    console.log('\n=== Done ===');
    console.log('New icons generated successfully.');
  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();
