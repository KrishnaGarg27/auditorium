import { createCanvas, type CanvasRenderingContext2D } from 'canvas';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { DramaStyle } from '../types/index.js';

export const WIDTH = 640;
export const HEIGHT = 360;

export const STYLE_COLORS: Record<DramaStyle, { from: string; to: string }> = {
  noir: { from: '#36454F', to: '#FFBF00' },
  anime: { from: '#FF69B4', to: '#E6E6FA' },
  horror: { from: '#000000', to: '#8B0000' },
  cyberpunk: { from: '#800080', to: '#00FFFF' },
  'dark-thriller': { from: '#000080', to: '#71797E' },
  'fantasy-epic': { from: '#013220', to: '#FFD700' },
  romance: { from: '#FF6FFF', to: '#FF7F50' },
  comedy: { from: '#FFFF00', to: '#FFA500' },
  documentary: { from: '#8C92AC', to: '#FFFFFF' },
  cinematic: { from: '#310062', to: '#C0C0C0' },
};

const OUTPUT_DIR = join(process.cwd(), 'temp', 'thumbnails');

function drawGradientBackground(
  ctx: CanvasRenderingContext2D,
  colors: { from: string; to: string },
): void {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, colors.from);
  gradient.addColorStop(1, colors.to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawTitleText(ctx: CanvasRenderingContext2D, title: string): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px sans-serif';

  // Word-wrap title if too wide
  const maxWidth = WIDTH - 80;
  const words = title.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = 44;
  const totalHeight = lines.length * lineHeight;
  const startY = HEIGHT / 2 - totalHeight / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], WIDTH / 2, startY + i * lineHeight);
  }

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function drawStyleBadge(ctx: CanvasRenderingContext2D, style: DramaStyle): void {
  const label = style.charAt(0).toUpperCase() + style.slice(1);
  ctx.font = 'bold 16px sans-serif';
  const textMetrics = ctx.measureText(label);
  const paddingX = 16;
  const paddingY = 8;
  const badgeWidth = textMetrics.width + paddingX * 2;
  const badgeHeight = 28 + paddingY;
  const badgeX = WIDTH / 2 - badgeWidth / 2;
  const badgeY = HEIGHT - 60;
  const radius = 14;

  // Rounded rectangle
  ctx.beginPath();
  ctx.moveTo(badgeX + radius, badgeY);
  ctx.lineTo(badgeX + badgeWidth - radius, badgeY);
  ctx.arcTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + radius, radius);
  ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - radius);
  ctx.arcTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX + badgeWidth - radius, badgeY + badgeHeight, radius);
  ctx.lineTo(badgeX + radius, badgeY + badgeHeight);
  ctx.arcTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - radius, radius);
  ctx.lineTo(badgeX, badgeY + radius);
  ctx.arcTo(badgeX, badgeY, badgeX + radius, badgeY, radius);
  ctx.closePath();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fill();

  // Badge text
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
}

export async function generateThumbnail(title: string, style: DramaStyle): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const colors = STYLE_COLORS[style];
  drawGradientBackground(ctx, colors);
  drawTitleText(ctx, title);
  drawStyleBadge(ctx, style);

  const filename = `${uuidv4()}.png`;
  const filePath = join(OUTPUT_DIR, filename);
  const buffer = canvas.toBuffer('image/png');
  await writeFile(filePath, buffer);

  return filePath;
}
