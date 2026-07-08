const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, 'build', 'icons');
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

// Color palette
const BG = 0x1A1A2E;       // Deep navy background
const FG = 0xE94560;       // Crimson accent
const HIGHLIGHT = 0x16213E;  // Darker shade

async function createIcon(size) {
  const image = new Jimp({ width: size, height: size, color: BG });
  
  // Draw a rounded rectangle / square background accent
  const border = Math.max(2, Math.floor(size * 0.04));
  const inset = Math.floor(size * 0.12);
  const innerSize = size - inset * 2;
  
  // Fill inner area with slightly lighter shade
  for (let y = inset; y < size - inset; y++) {
    for (let x = inset; x < size - inset; x++) {
      const dist = Math.max(
        Math.abs(x - size/2) - (innerSize/2 - border*2),
        Math.abs(y - size/2) - (innerSize/2 - border*2)
      );
      if (dist < 0) {
        image.setPixelColor(HIGHLIGHT, x, y);
      }
    }
  }
  
  // Draw "AI" text in center
  const fontSize = Math.floor(size * 0.35);
  // Since Jimp native text rendering is tricky without loading fonts,
  // we draw a simple geometric "AI" symbol using pixels
  
  const cx = size / 2;
  const cy = size / 2;
  const unit = Math.floor(size * 0.06);
  
  // Draw 'A' shape (triangle with crossbar)
  const aTopY = cy - unit * 2.5;
  const aBottomY = cy + unit * 2;
  const aWidth = unit * 2.5;
  
  for (let y = aTopY; y <= aBottomY; y++) {
    const progress = (y - aTopY) / (aBottomY - aTopY);
    const halfW = aWidth * (0.3 + 0.7 * progress);
    const x1 = cx - unit * 1.2 - halfW;
    const x2 = cx - unit * 1.2 + halfW;
    const lineY = Math.round(y);
    if (lineY >= 0 && lineY < size) {
      for (let x = Math.round(x1); x <= Math.round(x2); x++) {
        if (x >= 0 && x < size) image.setPixelColor(FG, x, lineY);
      }
    }
  }
  // Crossbar for A
  const aCrossY = Math.round(cy + unit * 0.3);
  for (let x = Math.round(cx - unit * 2.2); x <= Math.round(cx - unit * 0.2); x++) {
    if (x >= 0 && x < size) image.setPixelColor(FG, x, aCrossY);
  }
  
  // Draw 'I' shape (vertical bar with serifs)
  const iX = Math.round(cx + unit * 1.2);
  const iTop = Math.round(cy - unit * 2.5);
  const iBottom = Math.round(cy + unit * 2);
  const iSerifW = Math.round(unit * 1.2);
  
  for (let y = iTop; y <= iBottom; y++) {
    if (y >= 0 && y < size) image.setPixelColor(FG, iX, y);
  }
  // Top serif
  for (let x = iX - iSerifW; x <= iX + iSerifW; x++) {
    if (x >= 0 && x < size) image.setPixelColor(FG, x, iTop);
  }
  // Bottom serif
  for (let x = iX - iSerifW; x <= iX + iSerifW; x++) {
    if (x >= 0 && x < size) image.setPixelColor(FG, x, iBottom);
  }
  
  // Add a small dot above I
  const dotY = Math.round(iTop - unit * 1.2);
  for (let dy = -unit/2; dy <= unit/2; dy++) {
    for (let dx = -unit/2; dx <= unit/2; dx++) {
      const px = iX + dx;
      const py = dotY + dy;
      if (px >= 0 && px < size && py >= 0 && py < size) {
        if (dx*dx + dy*dy <= (unit/2)*(unit/2)) {
          image.setPixelColor(FG, px, py);
        }
      }
    }
  }
  
  return image;
}

async function generateIcons() {
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  
  // Generate PNGs for each size
  for (const size of sizes) {
    const img = await createIcon(size);
    await img.write(path.join(ICONS_DIR, `icon_${size}x${size}.png`));
    console.log(`Generated icon_${size}x${size}.png`);
  }
  
  // Copy 512x512 as main icon.png
  fs.copyFileSync(
    path.join(ICONS_DIR, 'icon_512x512.png'),
    path.join(ICONS_DIR, 'icon.png')
  );
  
  // Generate ICO (Windows) - 256x256, 48x48, 32x32, 16x16
  // Jimp doesn't support ICO directly, so we use a simple ICO writer
  await generateICO();
  
  // Generate ICNS (macOS) - simplified format
  await generateICNS();
  
  console.log('All icons generated successfully in', ICONS_DIR);
}

async function generateICO() {
  // ICO format: header + directory entries + image data
  const sizes = [256, 48, 32, 16];
  const entries = [];
  let offset = 6 + 16 * sizes.length; // header + directory
  
  for (const size of sizes) {
    const img = await Jimp.read(path.join(ICONS_DIR, `icon_${size}x${size}.png`));
    const bmp = await img.getBuffer('image/bmp');
    // BMP in ICO needs header stripped (first 14 bytes of BMP header)
    const dib = bmp.slice(14);
    entries.push({ size, width: size, height: size, data: dib, offset });
    offset += dib.length;
  }
  
  const buf = Buffer.alloc(offset);
  
  // ICO header
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type: icon
  buf.writeUInt16LE(sizes.length, 4); // count
  
  // Directory entries
  for (let i = 0; i < sizes.length; i++) {
    const e = entries[i];
    const base = 6 + i * 16;
    const w = e.width >= 256 ? 0 : e.width;
    const h = e.height >= 256 ? 0 : e.height;
    buf.writeUInt8(w, base);
    buf.writeUInt8(h, base + 1);
    buf.writeUInt8(0, base + 2); // colors (0 = >256)
    buf.writeUInt8(0, base + 3); // reserved
    buf.writeUInt16LE(1, base + 4); // color planes
    buf.writeUInt16LE(32, base + 6); // bits per pixel
    buf.writeUInt32LE(e.data.length, base + 8); // size
    buf.writeUInt32LE(e.offset, base + 12); // offset
  }
  
  // Image data
  for (const e of entries) {
    e.data.copy(buf, e.offset);
  }
  
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.ico'), buf);
  console.log('Generated icon.ico');
}

async function generateICNS() {
  // ICNS format: icns header + icon entries
  // Each entry: 4-byte type + 4-byte size + data
  const typeMap = {
    16: 'icp4',  // 16x16
    32: 'icp5',  // 32x32
    48: 'icp6',  // 48x48 (not standard, use 32/128/256/512)
    128: 'ic07', // 128x128
    256: 'ic08', // 256x256
    512: 'ic09', // 512x512
  };
  
  const entries = [];
  let totalSize = 8; // icns header
  
  for (const [size, type] of Object.entries(typeMap)) {
    const pngPath = path.join(ICONS_DIR, `icon_${size}x${size}.png`);
    if (!fs.existsSync(pngPath)) continue;
    const data = fs.readFileSync(pngPath);
    entries.push({ type, data });
    totalSize += 8 + data.length;
  }
  
  const buf = Buffer.alloc(totalSize);
  buf.write('icns', 0, 4, 'ascii');
  buf.writeUInt32BE(totalSize, 4);
  
  let offset = 8;
  for (const e of entries) {
    buf.write(e.type, offset, 4, 'ascii');
    buf.writeUInt32BE(8 + e.data.length, offset + 4);
    e.data.copy(buf, offset + 8);
    offset += 8 + e.data.length;
  }
  
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.icns'), buf);
  console.log('Generated icon.icns');
}

generateIcons().catch(console.error);
