import { role, json } from "../lib/security.js";
import { mode } from "../lib/store.js";

export default async function readiness(req, res) {
  const session = role(req);
  if (!session) return json(res, 401, { error: "UNAUTHORIZED" });

  if (req.method !== "GET") {
    return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  }

  const checks = {
    auth: Boolean(
      process.env.OFFICE_SESSION_SECRET &&
      process.env.OFFICE_SESSION_SECRET.length >= 32 &&
      process.env.OFFICE_USERS_JSON
    ),
    storage: mode() !== "unconfigured",
    openai: Boolean(
      process.env.OPENAI_API_KEY &&
      process.env.ENABLE_AI_CHAT === "true"
    ),
    github: Boolean(process.env.GITHUB_REPO),
    vercel: Boolean(
      process.env.VERCEL_TOKEN &&
      process.env.VERCEL_PROJECT_ID
    )
  };

  const ready = Object.values(checks).every(Boolean);
  return json(res, ready ? 200 : 503, { ready, checks });
}
