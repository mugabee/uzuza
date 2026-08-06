import { Client } from "pg";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1)];
    }),
);

const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
// Direct db.<ref>.supabase.co is IPv6-only; use the IPv4-compatible pooler.
const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`;

const migrationsDir = join(__dirname, "..", "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  for (const file of files) {
    console.log(`Applying ${file}...`);
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await client.query(sql);
    console.log(`  done.`);
  }
} finally {
  await client.end();
}
