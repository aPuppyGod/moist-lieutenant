// src/xp.js
// MEE6 leveling curve:
// XP needed to go from level L -> L+1:
//   5 * L^2 + 50 * L + 100
// Source: MEE6 docs / MEE6 wiki
// (Used by many bots that match MEE6)  :contentReference[oaicite:2]{index=2}

function xpToNextLevel(level) {
  return 5 * (level ** 2) + (50 * level) + 100;
}

// Total XP required to reach EXACTLY `level` (start of that level)
function totalXpForLevel(level) {
  let total = 0;
  for (let l = 0; l < level; l++) {
    total += xpToNextLevel(l);
  }
  return total;
}

// Convert TOTAL XP into a level using the MEE6 curve
function levelFromXp(totalXp) {
  let level = 0;
  let remaining = Math.max(0, Math.floor(totalXp));

  while (true) {
    const need = xpToNextLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level++;
    // safety guard (should never hit unless XP is insane)
    if (level > 1_000_000) break;
  }

  return level;
}

// Returns detailed progress for rank cards
function progressFromTotalXp(totalXp) {
  const level = levelFromXp(totalXp);
  const startXp = totalXpForLevel(level);
  const intoLevel = Math.max(0, totalXp - startXp);
  const need = xpToNextLevel(level);

  return {
    level,
    xpIntoLevel: intoLevel,
    xpToNext: need,
    totalXp
  };
}

module.exports = {
  xpToNextLevel,
  totalXpForLevel,
  levelFromXp,
  progressFromTotalXp
};