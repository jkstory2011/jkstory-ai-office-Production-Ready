import crypto from "node:crypto";

function secret() {
  const s = process.env.OFFICE_SESSION_SECRET || "";
  return s.length >= 32 ? s : null;
}

export function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  const out = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    out[decodeURIComponent(part.slice(0, i).trim())] =
      decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function signSession(user) {
  const s = secret();
  if (!s) return null;
  const payload = {
    sub: user.username,
    role: user.role,
    exp: Date.now() + 12 * 60 * 60 * 1000
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", s).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function session(request) {
  const s = secret();
  const token = parseCookies(request).jkstory_office_session;
  if (!s || !token) return null;

  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", s).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function requireRole(request, allowed = ["admin", "operator", "viewer"]) {
  const s = session(request);
  return s && allowed.includes(s.role) ? s : null;
}

function verifyPbkdf2(password, encoded) {
  const [kind, iterationsRaw, salt, hex] = String(encoded || "").split("$");
  const iterations = Number(iterationsRaw);
  if (kind !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 210000) return false;
  const derived = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256");
  const expected = Buffer.from(hex || "", "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export function authenticate(username, password) {
  let users = [];
  try {
    users = JSON.parse(process.env.OFFICE_USERS_JSON || "[]");
  } catch {}
  const found = Array.isArray(users) ? users.find((u) => u.username === username) : null;
  if (!found) return null;

  let valid = false;
  if (found.passwordHash) {
    valid = verifyPbkdf2(password, found.passwordHash);
  } else if (process.env.NODE_ENV !== "production" && typeof found.password === "string") {
    const a = Buffer.from(String(password));
    const b = Buffer.from(found.password);
    valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return valid ? { username: found.username, role: found.role } : null;
}

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders
    }
  });
}

export async function readJson(request, maxBytes = 65536) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  return text ? JSON.parse(text) : {};
}
