const { createCanvas, loadImage } = require('canvas');

// Helper to abbreviate XP numbers
function formatXP(xp) {
  if (xp >= 1000) return (xp / 1000).toFixed(2).replace(/\.00$/, '') + 'K';
  return xp.toString();
}

async function generateRankCard({
  avatarUrl,
  username,
  rank,
  level,
  currentXP,
  xpToNextLevel
}) {
  const width = 480;
  const height = 110;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Colors & fonts
  const bg = '#181a20';
  const barBg = '#23272a';
  const barFill = '#00bfff';
  const text = '#f5f6fa';
  const usernameFont = 'bold 22px Sans-serif';
  const xpFont = '16px Sans-serif';
  const rankFont = 'bold 18px Sans-serif';
  const rankLabelFont = '12px Sans-serif';
  const levelFont = 'bold 24px Sans-serif';
  const levelLabelFont = '14px Sans-serif';
  const highlight = '#00bfff';

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Avatar
  const avatarSize = 70;
  const avatarX = 20;
  const avatarY = (height - avatarSize) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  try {
    const avatarImg = await loadImage(avatarUrl);
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } catch {
    ctx.fillStyle = '#444';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();

  // Status dot (optional, always online for demo)
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + 12, avatarY + avatarSize - 12, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#43b581';
  ctx.fill();
  ctx.restore();

  // Username
  ctx.font = usernameFont;
  ctx.fillStyle = text;
  let uname = username;
  if (ctx.measureText(uname).width > 180) {
    while (ctx.measureText(uname + '...').width > 180 && uname.length > 0) {
      uname = uname.slice(0, -1);
    }
    uname += '...';
  }
  ctx.fillText(uname, avatarX + avatarSize + 18, avatarY + 28);

  // XP progress bar
  const barX = avatarX + avatarSize + 18;
  const barY = avatarY + 45;
  const barW = 200;
  const barH = 18;
  const radius = barH / 2;
  const progress = Math.max(0, Math.min(1, currentXP / xpToNextLevel));

  // Bar background
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(barX + radius, barY);
  ctx.lineTo(barX + barW - radius, barY);
  ctx.arc(barX + barW - radius, barY + radius, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(barX + radius, barY + barH);
  ctx.arc(barX + radius, barY + radius, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = barBg;
  ctx.fill();
  ctx.restore();

  // Bar fill
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(barX + radius, barY);
  ctx.lineTo(barX + radius + (barW - 2 * radius) * progress, barY);
  ctx.arc(barX + radius + (barW - 2 * radius) * progress, barY + radius, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(barX + radius, barY + barH);
  ctx.arc(barX + radius, barY + radius, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = barFill;
  ctx.fill();
  ctx.restore();

  // XP text
  ctx.font = xpFont;
  ctx.fillStyle = text;
  ctx.textAlign = 'left';
  ctx.fillText(
    `${formatXP(currentXP)} / ${formatXP(xpToNextLevel)} XP`,
    barX + barW + 12,
    barY + barH - 2
  );

  // Right section: Rank & Level
  ctx.textAlign = 'right';
  // Rank
  ctx.font = rankLabelFont;
  ctx.fillStyle = '#aaa';
  ctx.fillText('RANK', width - 22, avatarY + 22);
  ctx.font = rankFont;
  ctx.fillStyle = text;
  ctx.fillText(`#${rank}`, width - 22, avatarY + 38);

  // Level
  ctx.font = levelLabelFont;
  ctx.fillStyle = '#aaa';
  ctx.fillText('LEVEL', width - 22, avatarY + avatarSize - 22);
  ctx.font = levelFont;
  ctx.fillStyle = highlight;
  ctx.fillText(`${level}`, width - 22, avatarY + avatarSize - 2);

  ctx.textAlign = 'left';

  return canvas.toBuffer();
}

module.exports = { generateRankCard };
