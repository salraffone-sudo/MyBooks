// Renders the MB logo to the PNG sizes a PWA needs. Run: npm run make-icons
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });
const svg = readFileSync('public/icon.svg');

async function plain(size: number, file: string) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(`public/icons/${file}`);
}
// Maskable icons need the artwork inside the central safe zone on a full-bleed background.
async function maskable(size: number, file: string) {
  const inner = Math.round(size * 0.78);
  const logo = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#1f8a4c' } })
    .composite([{ input: logo, gravity: 'center' }]).png().toFile(`public/icons/${file}`);
}

async function main() {
await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await plain(180, 'apple-touch-icon.png');
await maskable(512, 'maskable-512.png');
console.log('Icons written to public/icons');
}
main();
