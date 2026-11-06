import { readFile, writeFile } from 'node:fs/promises';

// Run with the same external Playwright installation as browser regressions.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const source = await readFile(new URL('../public/brand/logo-a2-equator.png', import.meta.url));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const sizes = [16, 32, 48, 128, 256];
  const images = await page.evaluate(async ({ sizes, png }) => {
    const { Image, document } = globalThis;
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    return [...sizes, 180].map(size => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    });
  }, { sizes, png: source.toString('base64') });
  const touch = images.pop();
  await writeFile(new URL('../public/apple-touch-icon.png', import.meta.url), Buffer.from(touch, 'base64'));
  const pngs = images.map(image => Buffer.from(image, 'base64'));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngs[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += pngs[index].length;
  }
  await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header, ...pngs]));
  console.log('Generated A2 equator favicon: 16/32/48/128/256px and 180px Apple touch icon from approved PNG');
} finally {
  await browser.close();
}
