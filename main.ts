// The World in One Image — 26 November 2026.
// A Node 22 program, standard library only. It draws one 1024x1024 PNG that sums
// up Thursday 26 November 2026 in six stories, each verified against at least two
// independent news sources, and writes it to $MAKEFUN_OUTPUT_DIR/entry.png
// (or /output/entry.png under the grader).
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The picture is fully deterministic: the same bytes come out of every run.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette ---
const INK = [13, 27, 42]; // page background, deep navy
const GOLD: RGB = [242, 193, 78];
const WHITE: RGB = [255, 255, 255];
const SOFT: RGB = [216, 222, 230]; // detail text
const MUTED: RGB = [150, 165, 185]; // footer text

type RGB = [number, number, number];

// ------------------------------------------------------------- framebuffer ---
const px = new Uint8Array(W * H * 3);
function fill(r: number, g: number, b: number): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = r;
    px[i * 3 + 1] = g;
    px[i * 3 + 2] = b;
  }
}
function set(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) set(xx, yy, c);
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = cy - r; yy <= cy + r; yy++) {
    for (let xx = cx - r; xx <= cx + r; xx++) {
      if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) set(xx, yy, c);
    }
  }
}
function ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
  for (let yy = cy - r - t; yy <= cy + r + t; yy++) {
    for (let xx = cx - r - t; xx <= cx + r + t; xx++) {
      const d = Math.sqrt((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy));
      if (Math.abs(d - r) <= t / 2) set(xx, yy, c);
    }
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let yy = cy - ry; yy <= cy + ry; yy++) {
    for (let xx = cx - rx; xx <= cx + rx; xx++) {
      const dx = (xx - cx) / rx;
      const dy = (yy - cy) / ry;
      if (dx * dx + dy * dy <= 1) set(xx, yy, c);
    }
  }
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    set(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

// ------------------------------------------------------------ 5x7 bitmap font ---
// Each glyph: 7 rows of 5 cells, '#' = on.
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  $: ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '"': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
  '•': ['00000', '00100', '01110', '01110', '01110', '00100', '00000'],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const g = FONT[up[i]] ?? FONT['?'];
    const ox = x + i * 6 * scale;
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === '1') rect(ox + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}
function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}
// Greedy word wrap to maxWidth pixels.
function wrap(s: string, scale: number, maxWidth: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (textWidth(next, scale) <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------ stories ---
// Six stories from Thursday 26 November 2026, each verified in at least two
// independent sources (Reuters, BBC, AP, CNN, KCNA, The News Pakistan).
interface Story {
  kicker: string;
  place: string;
  headline: string;
  detail: string;
  bg: RGB;
  icon: 'bars' | 'drop' | 'stars' | 'atom' | 'balloon' | 'rocket';
}
const STORIES: Story[] = [
  {
    kicker: 'TRADE',
    place: 'WASHINGTON',
    headline: 'US TARIFFS HIT 14 PARTNERS',
    detail: 'Washington proposes duties on China, the EU, Japan and more.',
    bg: [122, 59, 46],
    icon: 'bars',
  },
  {
    kicker: 'ENERGY',
    place: 'RIYADH',
    headline: 'OIL NEARS $95 AFTER HOUTHI STRIKE',
    detail: "Brent jumps as Houthis claim a hit on Saudi Arabia's largest refinery.",
    bg: [107, 78, 18],
    icon: 'drop',
  },
  {
    kicker: 'EUROPE',
    place: 'BRUSSELS',
    headline: 'EU SPLIT OVER 45BN UKRAINE LOAN',
    detail: 'Leaders meet in Brussels to bridge gaps on war funding and the budget.',
    bg: [31, 78, 121],
    icon: 'stars',
  },
  {
    kicker: 'SECURITY',
    place: 'PYONGYANG',
    headline: 'KIM ORDERS WIDER NUCLEAR SPREAD',
    detail: 'North Korea to deploy tactical nuclear weapons across more domains.',
    bg: [91, 42, 74],
    icon: 'atom',
  },
  {
    kicker: 'USA',
    place: 'NEW YORK',
    headline: "MACY'S PARADE POSTPONED, A FIRST",
    detail: 'The 100th Thanksgiving parade moves to Saturday as a storm hits NYC.',
    bg: [140, 74, 31],
    icon: 'balloon',
  },
  {
    kicker: 'SPACE',
    place: 'JIUQUAN, CHINA',
    headline: 'FIRST PAKISTANI ABOARD TIANGONG',
    detail: "Shenzhou-24 docks; Zeeshan Ali is the first foreigner on China's station.",
    bg: [46, 58, 92],
    icon: 'rocket',
  },
];

// -------------------------------------------------------------------- icons ---
function drawIcon(kind: Story['icon'], x: number, y: number, c: RGB): void {
  const cx = x + 28;
  const cy = y + 28;
  if (kind === 'bars') {
    rect(x + 8, y + 30, 10, 18, c);
    rect(x + 22, y + 20, 10, 28, c);
    rect(x + 36, y + 10, 10, 38, c);
    drawText('%', x + 40, y + 2, 2, c);
  } else if (kind === 'drop') {
    disc(cx, cy + 8, 13, c);
    line(cx - 11, cy + 2, cx, cy - 16, c);
    line(cx + 11, cy + 2, cx, cy - 16, c);
    line(cx - 7, cy - 5, cx, cy - 16, c);
    line(cx + 7, cy - 5, cx, cy - 16, c);
  } else if (kind === 'stars') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      disc(Math.round(cx + 19 * Math.cos(a)), Math.round(cy + 19 * Math.sin(a)), 3, c);
    }
    disc(cx, cy, 4, c);
  } else if (kind === 'atom') {
    disc(cx, cy, 5, c);
    ring(cx, cy, 17, 2, c);
    ring(cx, cy, 17, 2, c);
    line(cx - 24, cy - 12, cx + 24, cy + 12, c);
    line(cx - 24, cy + 12, cx + 24, cy - 12, c);
  } else if (kind === 'balloon') {
    ellipse(cx, cy - 8, 15, 18, c);
    line(cx, cy + 10, cx, cy + 26, c);
    disc(cx - 20, cy + 14, 5, c);
    disc(cx + 20, cy + 18, 4, c);
  } else {
    // rocket
    line(cx, cy - 24, cx - 8, cy + 2, c);
    line(cx, cy - 24, cx + 8, cy + 2, c);
    line(cx - 8, cy + 2, cx + 8, cy + 2, c);
    line(cx - 8, cy + 2, cx - 14, cy + 12, c);
    line(cx + 8, cy + 2, cx + 14, cy + 12, c);
    line(cx, cy + 2, cx, cy + 16, c);
    disc(cx - 22, cy - 18, 2, c);
    disc(cx + 20, cy + 20, 2, c);
    disc(cx - 18, cy + 22, 2, c);
  }
}

// ------------------------------------------------------------------- layout ---
function draw(): void {
  fill(INK[0], INK[1], INK[2]);

  // Header.
  drawTextCentered('THE WORLD IN ONE IMAGE', W / 2, 34, 5, WHITE);
  drawTextCentered('THURSDAY 26 NOVEMBER 2026', W / 2, 96, 4, GOLD);
  rect(24, 148, W - 48, 4, GOLD);

  // Six story tiles, 2 columns x 3 rows.
  const tileW = 480;
  const tileH = 210;
  const gap = 16;
  const x0 = 24;
  const y0 = 170;
  STORIES.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const tx = x0 + col * (tileW + gap);
    const ty = y0 + row * (tileH + 12);
    rect(tx, ty, tileW, tileH, s.bg);
    // Icon chip.
    rect(tx + 14, ty + 14, 56, 56, [0, 0, 0]);
    drawIcon(s.icon, tx + 14, ty + 14, GOLD);
    // Kicker + headline + detail.
    drawText(s.kicker, tx + 84, ty + 18, 2, GOLD);
    drawText(s.place, tx + 84, ty + 40, 2, SOFT);
    const headLines = wrap(s.headline, 3, tileW - 28);
    headLines.slice(0, 2).forEach((ln, li) => {
      drawText(ln, tx + 14, ty + 84 + li * 26, 3, WHITE);
    });
    const detLines = wrap(s.detail, 2, tileW - 28);
    detLines.slice(0, 2).forEach((ln, li) => {
      drawText(ln, tx + 14, ty + 144 + li * 20, 2, SOFT);
    });
  });

  // Footer.
  const fy = y0 + 3 * tileH + 2 * 12 + 22;
  rect(24, fy - 12, W - 48, 3, GOLD);
  drawTextCentered('SIX STORIES  •  ONE DAY  •  26 NOVEMBER 2026', W / 2, fy + 8, 3, WHITE);
  drawTextCentered('SOURCES: REUTERS, BBC, AP, CNN, KCNA, THE NEWS', W / 2, fy + 46, 2, MUTED);
}

// -------------------------------------------------------------- PNG encoding ---
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------- main ---
draw();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePNG());
