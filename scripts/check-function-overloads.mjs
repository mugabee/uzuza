#!/usr/bin/env node
// Guards against the exact bug class documented in CLAUDE.md: "adding a
// new trailing parameter to an existing RPC... CREATE OR REPLACE FUNCTION
// only replaces a function with the *exact same* signature — a changed
// parameter list silently creates a second overload instead" (bit twice:
// create_group in Phase 6, fixed in 20260806211500_fix_create_group_overloads.sql).
//
// Replays every migration in order, reconstructing which signatures are
// *currently live* for each function name (a create/create-or-replace
// with a signature not already live adds a new overload; a matching
// `drop function` removes one). Reports functions that end this replay
// with more than one live signature — i.e. real, standing overload debt
// in the schema as it exists today, not just a moment in project history
// that was later fixed. That distinction matters for this to work as an
// ongoing CI gate: the historical create_group incident (three coexisting
// signatures, cleaned up in 20260806211500) must NOT flag forever just
// because it happened once.
//
// Heuristic, not a real SQL parser — matches on balanced parens and
// simple token splitting, not a full grammar. False positives/negatives
// are possible for unusual formatting; read the flagged migrations
// before assuming a bug. Run with: node scripts/check-function-overloads.mjs

import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

function splitTopLevelCommas(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function normalizeType(t) {
  return t
    .replace(/\bpublic\./gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// A `create function` parameter entry looks like `p_name type... [default
// ...]`; a `drop function` entry is just a bare type. Reduce either to a
// type-only signature so the two statement kinds can be matched against
// each other.
function typeSignatureFromCreateParams(paramsBlob) {
  return splitTopLevelCommas(paramsBlob)
    .map((entry) => {
      const withoutDefault = entry.split(/\bdefault\b/i)[0].trim();
      const tokens = withoutDefault.split(/\s+/);
      tokens.shift(); // drop the parameter name
      return normalizeType(tokens.join(" "));
    })
    .join(", ");
}

function typeSignatureFromDropParams(paramsBlob) {
  return splitTopLevelCommas(paramsBlob).map(normalizeType).join(", ");
}

function fullSignature(paramsBlob) {
  return paramsBlob.replace(/\s+/g, " ").replace(/\bpublic\./gi, "").trim();
}

function extractStatements(sql) {
  const statements = [];
  const re = /(drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)\s*\()|((create\s+(?:or\s+replace\s+)?function)\s+public\.(\w+)\s*\()/gi;
  let match;
  while ((match = re.exec(sql))) {
    const isDrop = !!match[1];
    const name = isDrop ? match[2] : match[5];
    const parenStart = re.lastIndex - 1;
    let depth = 1;
    let i = parenStart + 1;
    while (i < sql.length && depth > 0) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") depth--;
      i++;
    }
    const params = sql.slice(parenStart + 1, i - 1);
    statements.push({ isDrop, name, params });
    re.lastIndex = i;
  }
  return statements;
}

// name -> Map<typeSignature, { fullSignature, addedIn }>
const live = new Map();
const events = [];

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  for (const stmt of extractStatements(sql)) {
    if (!live.has(stmt.name)) live.set(stmt.name, new Map());
    const overloads = live.get(stmt.name);

    if (stmt.isDrop) {
      const typeSig = typeSignatureFromDropParams(stmt.params);
      overloads.delete(typeSig);
      continue;
    }

    const typeSig = typeSignatureFromCreateParams(stmt.params);
    if (!overloads.has(typeSig)) {
      overloads.set(typeSig, { fullSignature: fullSignature(stmt.params), addedIn: file });
      if (overloads.size > 1) {
        events.push({ file, name: stmt.name, overloads: new Map(overloads) });
      }
    }
  }
}

// Only currently-standing debt matters — re-check final state, not every
// transient moment a new overload was added (a later migration in the
// same run may have already cleaned it up).
const standingDebt = [...live.entries()].filter(([, overloads]) => overloads.size > 1);

if (standingDebt.length === 0) {
  console.log(`✓ No standing function-overload debt across ${files.length} migrations.`);
  process.exit(0);
}

console.error(`✗ ${standingDebt.length} function(s) with multiple live signatures (real overload debt):\n`);
for (const [name, overloads] of standingDebt) {
  console.error(`  public.${name} has ${overloads.size} live signatures:`);
  for (const [, info] of overloads) {
    console.error(`    - (${info.fullSignature})  [added in ${info.addedIn}]`);
  }
  console.error("");
}
process.exit(1);
