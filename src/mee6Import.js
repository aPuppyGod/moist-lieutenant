const fs = require("fs");
const path = require("path");
const { initDb, run } = require("./db");

function assertEntry(e) {
  if (!e || typeof e.name !== "string") throw new Error("Entry missing name");
  if (!Number.isInteger(e.xp)) throw new Error(`Entry ${e.name} missing integer xp`);
  if (!Number.isInteger(e.level)) throw new Error(`Entry ${e.name} missing integer level`);
}

(async () => {
  await initDb();

  const file = path.join(__dirname, "..", "data", "mee6_snapshot.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const level = levelFromXp(entry.xp);

  const guildId = json.guildId;
  const entries = json.entries || [];
  if (!guildId) throw new Error("mee6_snapshot.json missing guildId");

  for (const e of entries) {
    assertEntry(e);
    await run(
      `INSERT OR REPLACE INTO mee6_snapshot (guild_id, mee6_name, xp, level, claimed_user_id)
       VALUES (?, ?, ?, ?, COALESCE((SELECT claimed_user_id FROM mee6_snapshot WHERE guild_id=? AND mee6_name=?), NULL))`,
      [guildId, e.name, e.xp, e.level, guildId, e.name]
    );
  }

  console.log(`Imported ${entries.length} MEE6 entries for guild ${guildId}.`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
