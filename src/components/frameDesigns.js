// Alternative World Sight Day frame layouts. Each one is drawn on top of the photo.
import { FRAME_PALETTE as P } from './frameStyles';

const formatName = (raw) => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return "Dr. [Doctor's Name]";
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
};

const eyeGlyph = (ctx, x, y, w, t = P) => {
  const h = w * 0.5;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x, y - h, x + w / 2, y);
  ctx.quadraticCurveTo(x, y + h, x - w / 2, y);
  ctx.closePath();
  ctx.fillStyle = t.eyeWhite;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, h * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = t.iris;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, h * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = t.pupil;
  ctx.fill();
};

// Design 2: solid caption bar along the bottom, name left-aligned, small label top-left
function drawEditorial(ctx, size, name, subtitle, t = P) {
  const barH = 230;
  const barY = size - barH;
  const g = ctx.createLinearGradient(0, barY, 0, size);
  g.addColorStop(0, 'rgba(8, 24, 48, 0.94)');
  g.addColorStop(1, 'rgba(4, 14, 32, 0.98)');
  ctx.fillStyle = g;
  ctx.fillRect(0, barY, size, barH);

  const rule = ctx.createLinearGradient(0, 0, size, 0);
  rule.addColorStop(0, '#0E7490');
  rule.addColorStop(0.5, '#38BDF8');
  rule.addColorStop(1, '#312E81');
  ctx.fillStyle = rule;
  ctx.fillRect(0, barY - 6, size, 6);

  // Top-left label chip
  ctx.save();
  ctx.font = '700 14px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '3px';
  const label = 'WORLD SIGHT DAY';
  const tw = ctx.measureText(label).width;
  ctx.letterSpacing = '0px';
  ctx.beginPath();
  ctx.roundRect(40, 40, tw + 40, 40, 20);
  ctx.fillStyle = 'rgba(8, 24, 48, 0.8)';
  ctx.fill();
  ctx.strokeStyle = t.badgeStroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  eyeGlyph(ctx, 62, 60, 22, t);
  ctx.fillStyle = t.badgeText;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '3px';
  ctx.font = '700 14px Inter, system-ui, sans-serif';
  ctx.fillText(label, 80, 61);
  ctx.restore();

  // Name and caption, left aligned
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.name;
  ctx.font = '700 46px Georgia, "Times New Roman", serif';
  ctx.fillText(name, 56, barY + 110);
  ctx.fillStyle = t.caption;
  ctx.font = '500 19px Inter, system-ui, sans-serif';
  ctx.fillText(subtitle, 58, barY + 150);
  ctx.restore();
}

// Design 3: circular medallion. The photo outside the circle is painted over with navy.
function drawCircle(ctx, size, name, subtitle, t = P) {
  const cx = size / 2;
  const cy = 430;
  const r = 370;
  ctx.save();
  ctx.fillStyle = '#0B1B2E';
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
  ctx.fill();

  // Ring
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, t.bandStops[0]);
  ring.addColorStop(0.5, '#38BDF8');
  ring.addColorStop(1, t.bandStops[2]);
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 22, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Eye badge on top of the ring
  ctx.beginPath();
  ctx.roundRect(cx - 118, cy - r - 28, 236, 44, 22);
  ctx.fillStyle = '#0F172A';
  ctx.fill();
  ctx.strokeStyle = t.badgeStroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  eyeGlyph(ctx, cx - 88, cy - r - 6, 26, t);
  ctx.fillStyle = t.badgeText;
  ctx.font = '700 14px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('WORLD SIGHT DAY', cx - 62, cy - r - 6);
  ctx.letterSpacing = '0px';
  ctx.restore();

  // Name and caption below the medallion
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.name;
  ctx.font = '700 40px Georgia, "Times New Roman", serif';
  ctx.fillText(name, cx, 878);
  ctx.fillStyle = t.caption;
  ctx.font = '500 18px Inter, system-ui, sans-serif';
  ctx.fillText(subtitle, cx, 920);
  ctx.restore();

  // Eyes flanking the caption
  eyeGlyph(ctx, cx - 300, 878 - 14, 30, t);
  eyeGlyph(ctx, cx + 300, 878 - 14, 30, t);
}

// Design 4: white instant-photo card with a handwritten-style name
function drawPolaroid(ctx, size, name, subtitle, t = P) {
  const pad = 46;
  const bottom = 160;
  ctx.save();
  ctx.fillStyle = '#F8FAFC';
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.rect(pad, pad, size - pad * 2, size - pad - bottom);
  ctx.fill('evenodd');

  // Thin inner border on the photo edge
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.15)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad, size - pad * 2, size - pad - bottom);

  // Eye stamp in the top-left corner of the white border
  eyeGlyph(ctx, pad / 2 + 2, pad / 2 + 2, 26, { ...t, eyeWhite: '#0F172A', iris: '#0EA5E9', pupil: '#F8FAFC' });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'italic 46px "Brush Script MT", "Segoe Script", cursive';
  ctx.fillText(name, size / 2, size - bottom + 78);
  ctx.fillStyle = '#475569';
  ctx.font = '500 17px Inter, system-ui, sans-serif';
  ctx.fillText(`${subtitle}`, size / 2, size - 44);
  ctx.restore();
}


// Design 5: awareness poster. Headline band, date line, name and three action tips.
function drawPoster(ctx, size, name, subtitle, t = P) {
  // Top headline band
  const top = ctx.createLinearGradient(0, 0, 0, 190);
  top.addColorStop(0, 'rgba(4, 14, 32, 0.96)');
  top.addColorStop(1, 'rgba(4, 14, 32, 0.0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, size, 190);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.name;
  ctx.font = '800 56px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText('WORLD SIGHT DAY', size / 2 + 3, 100);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = t.accent;
  ctx.font = '500 19px Inter, system-ui, sans-serif';
  ctx.fillText('Observed every year on the second Thursday of October', size / 2, 140);
  ctx.restore();

  // Bottom panel
  const panelY = size - 230;
  const bottom = ctx.createLinearGradient(0, panelY, 0, size);
  bottom.addColorStop(0, 'rgba(4, 14, 32, 0)');
  bottom.addColorStop(0.3, 'rgba(4, 14, 32, 0.92)');
  bottom.addColorStop(1, 'rgba(4, 14, 32, 0.98)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, panelY, size, 230);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.name;
  ctx.font = '700 42px Georgia, "Times New Roman", serif';
  ctx.fillText(name, size / 2, panelY + 84);
  ctx.fillStyle = t.caption;
  ctx.font = '500 18px Inter, system-ui, sans-serif';
  ctx.fillText(subtitle, size / 2, panelY + 114);
  ctx.restore();

  // Divider
  const dv = ctx.createLinearGradient(size * 0.1, 0, size * 0.9, 0);
  dv.addColorStop(0, 'rgba(56, 189, 248, 0)');
  dv.addColorStop(0.5, t.divider);
  dv.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.strokeStyle = dv;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(size * 0.1, panelY + 140);
  ctx.lineTo(size * 0.9, panelY + 140);
  ctx.stroke();

  // Three action tips, each with a small eye
  const tips = ['Book an eye check-up', 'Protect your eyes', 'Share the message'];
  tips.forEach((tip, i) => {
    const cx = size * (0.2 + i * 0.3);
    eyeGlyph(ctx, cx - 90, panelY + 178, 26, t);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.badgeText;
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    ctx.fillText(tip, cx - 68, panelY + 178);
    ctx.restore();
  });
}

export function drawFrameDesign(ctx, size, rawName, subtitle, design, t = P) {
  const name = formatName(rawName);
  const text = subtitle || '“See Yourself in a New Shade” • World Sight Day Initiative';
  if (design === 'editorial') return drawEditorial(ctx, size, name, text, t);
  if (design === 'circle') return drawCircle(ctx, size, name, text, t);
  if (design === 'polaroid') return drawPolaroid(ctx, size, name, text, t);
  if (design === 'poster') return drawPoster(ctx, size, name, text, t);
}
