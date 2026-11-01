// Génère lib/migration-sql.ts et supabase/upgrade.sql depuis scripts/upgrade.sql
import { readFileSync, writeFileSync } from "node:fs";
const sql = readFileSync(new URL("./upgrade.sql", import.meta.url), "utf8");
writeFileSync(new URL("../supabase/upgrade.sql", import.meta.url), sql);
writeFileSync(new URL("../lib/migration-sql.ts", import.meta.url), `/** Généré par scripts/gen-migration.mjs : ne pas modifier à la main. */\nexport const MIGRATION_SQL = ${JSON.stringify(sql)};\n`);
