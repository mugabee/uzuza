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
  await client.query(`
    create table if not exists public._migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows } = await client.query("select filename from public._migrations");
  const applied = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file} (already applied).`);
      continue;
    }
    console.log(`Applying ${file}...`);
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await client.query(sql);
    await client.query("insert into public._migrations (filename) values ($1)", [file]);
    console.log(`  done.`);
  }
} finally {
  await client.end();
}
