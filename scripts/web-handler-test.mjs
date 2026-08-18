import fs from "node:fs";
import crypto from "node:crypto";

const dataFile = "./data/ci-web-handler.json";
try { fs.unlinkSync(dataFile); } catch {}

process.env.NODE_ENV = "development";
process.env.OFFICE_DATA_FILE = dataFile;
process.env.OFFICE_SESSION_SECRET = "ci-web-handler-session-secret-32-characters-minimum";
process.env.ENABLE_AI_CHAT = "false";

const iterations = 310000;
const salt = "0123456789abcdef0123456789abcdef";
const password = "DevelopmentPass!123";
const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
process.env.OFFICE_USERS_JSON = JSON.stringify([
  { username: "ceo", passwordHash: `pbkdf2$${iterations}$${salt}$${hash}`, role: "admin" }
]);

const {
  login, me, taskApi, chatApi, auditApi, backupApi, logout
} = await import("../lib/web-handlers.js");

const origin = "https://office.example.test";

async function call(handler, path, method = "GET", body = null, cookie = "") {
  const headers = new Headers();
  headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  if (body !== null) headers.set("Content-Type", "application/json");

  const request = new Request(origin + path, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  return handler(request);
}

function assert(ok, name) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) process.exitCode = 1;
}

let r = await call(me, "/api/auth-me");
assert(r.status === 401, "unauthenticated blocked");

r = await call(login, "/api/auth-login", "POST", {
  username: "ceo",
  password
});
assert(r.status === 200, "login");
const setCookie = r.headers.get("set-cookie") || "";
const cookie = setCookie.split(";")[0];
assert(cookie.startsWith("jkstory_office_session="), "session cookie");

r = await call(me, "/api/auth-me", "GET", null, cookie);
assert(r.status === 200, "session validation");

r = await call(taskApi, "/api/tasks", "GET", null, cookie);
let d = await r.json();
assert(r.status === 200 && d.tasks.length >= 3, "task list");

r = await call(taskApi, "/api/tasks", "POST", { title: "CI 작업" }, cookie);
d = await r.json();
assert(r.status === 201 && d.task?.id, "task create");
const taskId = d.task.id;

r = await call(taskApi, "/api/tasks", "PATCH", { id: taskId, status: "완료" }, cookie);
d = await r.json();
assert(r.status === 200 && d.task?.status === "완료", "task update");

r = await call(chatApi, "/api/chat", "POST", { message: "테스트" }, cookie);
d = await r.json();
assert(r.status === 503 && d.error === "AI_CHAT_DISABLED", "AI disabled fail-safe");

r = await call(auditApi, "/api/audit", "GET", null, cookie);
d = await r.json();
assert(r.status === 200 && d.audit.some((x) => x.event === "task.created"), "audit");

r = await call(backupApi, "/api/backup", "GET", null, cookie);
d = await r.json();
assert(r.status === 200 && d.tasks.length >= 4, "backup");

const hostile = new Request("https://office.example.test/api/tasks", {
  method: "POST",
  headers: {
    Origin: "https://evil.example",
    Cookie: cookie,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ title: "evil" })
});
r = await taskApi(hostile);
assert(r.status === 403, "cross-origin mutation blocked");

r = await call(logout, "/api/auth-logout", "POST", {}, cookie);
assert(r.status === 200, "logout");

try { fs.unlinkSync(dataFile); } catch {}
