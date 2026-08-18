import fs from "node:fs";

const required = [
  "index.html",
  "app.js",
  "app.css",
  "vercel.json",
  "lib/web-security.js",
  "lib/web-handlers.js",
  "lib/store.js",
  "api/auth-login.js",
  "api/auth-me.js",
  "api/auth-logout.js",
  "api/health.js",
  "api/tasks.js",
  "api/messages.js",
  "api/audit.js",
  "api/backup.js",
  "api/chat.js",
  "api/github.js",
  "api/vercel.js",
  "api/readiness.js",
  "scripts/web-handler-test.mjs",
  ".github/workflows/ci.yml"
];

let failed = false;
for (const file of required) {
  const ok = fs.existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"} ${file}`);
  if (!ok) failed = true;
}

const handlers = fs.readFileSync("lib/web-handlers.js", "utf8");
const security = fs.readFileSync("lib/web-security.js", "utf8");
const store = fs.readFileSync("lib/store.js", "utf8");

for (const [name, ok] of [
  ["Web Standard Request/Response", handlers.includes("new Response") || handlers.includes("Response.json")],
  ["server-side OpenAI Responses API", handlers.includes("https://api.openai.com/v1/responses")],
  ["RBAC", handlers.includes('requireRole(request, ["admin", "operator"])')],
  ["same-origin mutation guard", handlers.includes("sameOrigin(request)")],
  ["HttpOnly session", handlers.includes("HttpOnly; SameSite=Strict")],
  ["PBKDF2 password verification", security.includes("pbkdf2Sync")],
  ["production storage fail-closed", store.includes("STORE_NOT_CONFIGURED")],
  ["Upstash/KV REST storage", store.includes("UPSTASH_REDIS_REST_URL") && store.includes("KV_REST_API_URL")],
  ["GitHub read-only integration", handlers.includes("api.github.com") && !handlers.includes('fetch(`https://api.github.com${path}`, { method: "POST"')],
  ["Vercel read-only integration", handlers.includes("api.vercel.com") && !handlers.includes('fetch(`https://api.vercel.com${path}`, { method: "POST"')]
]) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
console.log("PASS all source checks");
