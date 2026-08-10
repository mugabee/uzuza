import { readFileSync } from "fs";

const toolsEnv = Object.fromEntries(
  readFileSync(".env.tools.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const appEnv = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const TOKEN = toolsEnv.VERCEL_TOKEN;
const PROJECT_ID = "prj_zJN5XO5EOsS0a0tvVB9EE87rczKa";
const TEAM_ID = "team_18kwICodQ8QMFhvfblyIT9L8";

// Only vars the deployed app's server code actually reads right now.
const VARS_TO_SYNC = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AFRICAS_TALKING_API_KEY",
  "AFRICAS_TALKING_USERNAME",
  "SEND_SMS_HOOK_SECRET",
  "MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY",
  "MOMO_DISBURSEMENTS_API_USER",
  "MOMO_DISBURSEMENTS_API_KEY",
  "MOMO_REMITTANCES_SUBSCRIPTION_KEY",
  "MOMO_REMITTANCES_API_USER",
  "MOMO_REMITTANCES_API_KEY",
  "NEXT_PUBLIC_UZUZA_CUSTODY_MOMO_NUMBER",
  "CRON_SECRET",
];

const base = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;

const existingRes = await fetch(
  `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
);
const existing = (await existingRes.json()).envs;

for (const key of VARS_TO_SYNC) {
  const value = appEnv[key];
  if (!value) {
    console.log(`SKIP ${key} — not set in .env.local`);
    continue;
  }
  const found = existing.find((e) => e.key === key);
  if (found) {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${found.id}?teamId=${TEAM_ID}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      },
    );
    console.log(`UPDATE ${key} ->`, res.status);
  } else {
    const res = await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview", "development"],
      }),
    });
    console.log(`CREATE ${key} ->`, res.status);
  }
}
