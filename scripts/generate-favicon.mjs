import { writeFile } from 'node:fs/promises';

// Run with the same external Playwright installation as browser regressions.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const sizes = [16, 32, 48];
  const images = await page.evaluate(sizes => {
    const { document } = globalThis;
    const source = document.createElement('canvas');
    source.width = source.height = 192;
    const context = source.getContext('2d');
    context.fillStyle = '#0284c7';
    context.beginPath();
    context.roundRect(0, 0, 192, 192, 48);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '600 112px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('记', 96, 100);
    return sizes.map(size => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    });
  }, sizes);
  const pngs = images.map(image => Buffer.from(image, 'base64'));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngs[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += pngs[index].length;
  }
  await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header, ...pngs]));
  console.log('Generated public/favicon.ico: 16/32/48px, blue tile with white brand glyph');
} finally {
  await browser.close();
}
