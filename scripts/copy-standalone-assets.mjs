import { cpSync, mkdirSync } from "fs";

// output: "standalone" deliberately excludes public/ and .next/static from
// the bundle it produces, expecting the deploy step to copy them in - a
// well-documented Next.js gotcha. Done in plain Node (not shell `cp -r`)
// so this works identically on Windows (local verification) and Linux
// (the actual cPanel server), rather than depending on npm's script
// runner picking a POSIX shell.
mkdirSync(".next/standalone/.next", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });

console.log("Copied public/ and .next/static into .next/standalone/");
