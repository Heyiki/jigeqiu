import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Source dimensions are native maxima; never upscale to advertise more detail.
const inputDirectory = resolve(process.argv[2] ?? '/tmp');
const outputDirectory = resolve('public/wallpapers');
const wallpapers = [
  { id: 'cyan-lake', source: 'lake', native: [3840, 2560], desktop: [0, 40, 2560, 1600], mobile: [720, 0, 1138, 1707] },
  { id: 'snow-mountain', source: 'snow', native: [3840, 1919], desktop: [0, 0, 2560, 1280], mobile: [900, 0, 852, 1280] },
];
mkdirSync(outputDirectory, { recursive: true });
for (const wallpaper of wallpapers) {
  for (const [variant, width, quality, maxBytes] of [
    ['desktop', 3840, 88, 3_500_000], ['mobile', 1200, 85, 700_000], ['thumb', 320, 65, 15_000],
  ]) {
    const output = resolve(outputDirectory, `${wallpaper.id}-${variant}.webp`);
    const crop = (variant === 'mobile' ? wallpaper.mobile : wallpaper.desktop)
      .map(value => Math.floor(value * wallpaper.native[0] / 2560));
    crop[2] = Math.min(crop[2], wallpaper.native[0] - crop[0]);
    crop[3] = Math.min(crop[3], wallpaper.native[1] - crop[1]);
    execFileSync('cwebp', [
      '-quiet', '-m', '6', '-q', String(quality), '-metadata', 'none',
      '-crop', ...crop.map(String), '-resize', String(Math.min(width, crop[2])), '0',
      resolve(inputDirectory, `jigeqiu-${wallpaper.source}-hi.jpg`), '-o', output,
    ]);
    const bytes = statSync(output).size;
    if (bytes > maxBytes) throw new Error(`${output} exceeds ${maxBytes} bytes (${bytes})`);
    console.log(`${wallpaper.id}-${variant}.webp: ${(bytes / 1024).toFixed(1)} KiB`);
  }
}
