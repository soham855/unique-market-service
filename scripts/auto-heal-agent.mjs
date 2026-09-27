#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const log = fs.readFileSync(process.env.AUTO_HEAL_LOG || "auto-heal/error.log", "utf8").slice(-20000);
const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const forbidden = [
  /^\.github\//, /^\.env/, /^supabase\//, /(^|\/)(auth|security|payment|payments)(\/|\.|$)/i,
  /package-lock\.json$/, /pnpm-lock\.yaml$/, /yarn\.lock$/
];

function sh(cmd, args=[]) {
  return execFileSync(cmd, args, { encoding:"utf8", stdio:["ignore","pipe","pipe"], maxBuffer: 8*1024*1024 });
}

function snapshot() {
  const files = sh("git", ["ls-files"])
    .split("\n").filter(Boolean)
    .filter(f => /\.(js|mjs|jsx|ts|tsx|json|css|html)$/i.test(f))
    .filter(f => !forbidden.some(r => r.test(f)))
    .slice(0, 250);
  return files.map(f => {
    try { return `--- ${f}\n${fs.readFileSync(f,"utf8").slice(0,12000)}`; }
    catch { return ""; }
  }).join("\n");
}

const prompt = `You are the repair agent for Unique Market service app.
A CI workflow failed. Diagnose the failure and propose the smallest safe code patch.
Only modify existing application/source/config files with extensions js,mjs,jsx,ts,tsx,json,css,html.
NEVER modify .github, .env files, Supabase migrations/schema, auth/security/payment/payments files, lockfiles, or dependencies.
Maximum 3 files and 300 changed lines. Do not invent secrets.
Return JSON only matching the requested schema.
Failure log:
${log}

Repository snapshot:
${snapshot()}`;

const body = {
  model,
  input: [
    { role:"system", content:"Return only valid JSON. Prefer no-op when evidence is insufficient." },
    { role:"user", content:prompt }
  ],
  text: {
    format: {
      type:"json_schema",
      name:"repair_plan",
      strict:true,
      schema:{
        type:"object",
        additionalProperties:false,
        properties:{
          safe:{type:"boolean"},
          diagnosis:{type:"string"},
          confidence:{type:"number"},
          files:{type:"array",items:{type:"object",additionalProperties:false,properties:{
            path:{type:"string"},
            patch:{type:"string"}
          },required:["path","patch"]}},
          tests:{type:"array",items:{type:"string"}}
        },
        required:["safe","diagnosis","confidence","files","tests"]
      }
    }
  }
};

const res = await fetch("https://api.openai.com/v1/responses", {
  method:"POST",
  headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
  body:JSON.stringify(body)
});
if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
const data = await res.json();
const textOut = data.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text;
if (!textOut) throw new Error("No structured repair output returned");
const plan = JSON.parse(textOut);
if (!plan.safe || plan.confidence < 0.85 || plan.files.length === 0) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(2);
}
if (plan.files.length > 3) throw new Error("Repair exceeds file limit");
for (const f of plan.files) {
  if (forbidden.some(r => r.test(f.path))) throw new Error(`Forbidden path: ${f.path}`);
  if (!/\.(js|mjs|jsx|ts|tsx|json|css|html)$/i.test(f.path)) throw new Error(`Unsupported path: ${f.path}`);
  fs.writeFileSync("auto-heal.patch", f.patch + "\n", {flag:"a"});
}
if (!fs.existsSync("auto-heal.patch")) throw new Error("No patch produced");
console.log(JSON.stringify(plan, null, 2));
