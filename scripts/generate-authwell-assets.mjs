import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const brandDir = resolve(root, 'assets/branding/authwell');
const iconSvg = await readFile(resolve(brandDir, 'authwell-app-icon.svg'));
const markSvg = await readFile(resolve(brandDir, 'authwell-mark.svg'));
const logoSvg = await readFile(resolve(brandDir, 'authwell-logo-horizontal.svg'));
const darkLogoSvg = await readFile(resolve(brandDir, 'authwell-logo-horizontal-dark.svg'));

async function render(source, target, width, height = width) {
  await mkdir(dirname(target), { recursive: true });
  await sharp(source).resize(width, height, { fit: 'contain' }).png().toFile(target);
}

const appIconSizes = [16, 32, 48, 96, 128, 180, 192, 512];
for (const size of appIconSizes) {
  await render(iconSvg, resolve(brandDir, `app-icons/authwell-${size}.png`), size);
}

await render(iconSvg, resolve(brandDir, 'authwell-app-icon.png'), 1024);
await render(markSvg, resolve(brandDir, 'authwell-mark.png'), 512);
await render(logoSvg, resolve(brandDir, 'authwell-logo-horizontal.png'), 1120, 260);
await render(darkLogoSvg, resolve(brandDir, 'authwell-logo-horizontal-dark.png'), 1120, 260);

const webBrandDir = resolve(root, 'apps/web/public/brand');
for (const size of appIconSizes) {
  await render(iconSvg, resolve(webBrandDir, `app-icons/authwell-${size}.png`), size);
}
await render(iconSvg, resolve(webBrandDir, 'authwell-app-icon.png'), 512);
await render(markSvg, resolve(webBrandDir, 'authwell-mark.png'), 256);
await render(logoSvg, resolve(webBrandDir, 'authwell-logo-horizontal.png'), 560, 130);
await render(darkLogoSvg, resolve(webBrandDir, 'authwell-logo-horizontal-dark.png'), 560, 130);

const extensionDir = resolve(root, 'apps/extension/public');
for (const size of [16, 32, 48, 96, 128]) {
  await render(iconSvg, resolve(extensionDir, `icon/${size}.png`), size);
}
await render(logoSvg, resolve(extensionDir, 'brand/authwell-logo-horizontal.png'), 560, 130);

const androidRes = resolve(root, 'apps/mobile/android/app/src/main/res');
const androidIcons = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];
for (const [density, size] of androidIcons) {
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/ic_launcher.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/ic_launcher_round.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/authwell_launcher.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/authwell_launcher_round.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/lockbox_launcher.png`), size);
  await render(iconSvg, resolve(androidRes, `mipmap-${density}/lockbox_launcher_round.png`), size);
}

const splashSizes = [
  ['drawable/splash.png', 480, 320],
  ['drawable-port-mdpi/splash.png', 320, 480],
  ['drawable-port-hdpi/splash.png', 480, 800],
  ['drawable-port-xhdpi/splash.png', 720, 1280],
  ['drawable-port-xxhdpi/splash.png', 960, 1600],
  ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
  ['drawable-land-mdpi/splash.png', 480, 320],
  ['drawable-land-hdpi/splash.png', 800, 480],
  ['drawable-land-xhdpi/splash.png', 1280, 720],
  ['drawable-land-xxhdpi/splash.png', 1600, 960],
  ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
];
for (const [path, width, height] of splashSizes) {
  const markSize = Math.round(Math.min(width, height) * 0.34);
  const mark = await sharp(iconSvg).resize(markSize, markSize).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: '#10162F' } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(resolve(androidRes, path));
}

console.log('Generated Authwell brand assets for web, extension, and Android.');
