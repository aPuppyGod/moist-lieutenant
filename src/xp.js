function xpNeededForNextLevel(level) {
  // Simple curve (tweakable). Keeps early levels quick and higher levels harder.
  // You can change this any time; XP is stored total, so levels will follow.
  return 100 + (level * level * 20) + (level * 50);
}

function levelFromXp(totalXp) {
  let level = 0;
  let xp = totalXp;
  while (true) {
    const need = xpNeededForNextLevel(level);
    if (xp >= need) {
      xp -= need;
      level += 1;
    } else {
      break;
    }
  }
  return level;
}

function xpIntoLevel(totalXp) {
  let level = 0;
  let xp = totalXp;
  while (true) {
    const need = xpNeededForNextLevel(level);
    if (xp >= need) {
      xp -= need;
      level += 1;
    } else {
      return { level, into: xp, need };
    }
  }
}

module.exports = { xpNeededForNextLevel, levelFromXp, xpIntoLevel };
