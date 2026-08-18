import {
  authenticate, signSession, session, requireRole, sameOrigin, json, readJson
} from "./web-security.js";
import {
  mode, tasks, createTask, updateTask, messages, addMessage, audit, audits, rate, backup
} from "./store.js";

export async function login(request) {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!sameOrigin(request)) return json({ error: "CROSS_ORIGIN_BLOCKED" }, 403);

  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (!await rate(`login:${ip}`, 10, 300)) return json({ error: "RATE_LIMITED" }, 429);

  let body;
  try { body = await readJson(request); }
  catch { return json({ error: "INVALID_JSON" }, 400); }

  const user = authenticate(String(body.username || "").trim(), String(body.password || ""));
  if (!user) {
    await audit("login.failed", String(body.username || "unknown"), { ip });
    return json({ error: "INVALID_CREDENTIALS", message: "로그인 정보가 올바르지 않습니다." }, 401);
  }

  const token = signSession(user);
  if (!token) return json({ error: "AUTH_NOT_CONFIGURED" }, 503);

  await audit("login.success", user.username, { role: user.role, ip });
  return json({ ok: true, user }, 200, {
    "Set-Cookie": `jkstory_office_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure`
  });
}

export async function me(request) {
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const s = session(request);
  return s
    ? json({ authenticated: true, user: { username: s.sub, role: s.role } })
    : json({ authenticated: false }, 401);
}

export async function logout(request) {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!sameOrigin(request)) return json({ error: "CROSS_ORIGIN_BLOCKED" }, 403);
  const s = session(request);
  if (s) await audit("logout", s.sub, { role: s.role });
  return json({ ok: true }, 200, {
    "Set-Cookie": "jkstory_office_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure"
  });
}

export async function health(request) {
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const s = session(request);
  return json({
    ok: true,
    authenticated: Boolean(s),
    role: s?.role || null,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    aiEnabled: process.env.ENABLE_AI_CHAT === "true",
    storeMode: mode(),
    githubConfigured: Boolean(process.env.GITHUB_REPO),
    vercelConfigured: Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID),
    model: process.env.OPENAI_MODEL || "gpt-5.6"
  });
}

export async function taskApi(request) {
  const s = requireRole(request);
  if (!s) return json({ error: "UNAUTHORIZED" }, 401);

  try {
    if (request.method === "GET") return json({ tasks: await tasks() });

    if (!["admin", "operator"].includes(s.role)) return json({ error: "FORBIDDEN" }, 403);
    if (!sameOrigin(request)) return json({ error: "CROSS_ORIGIN_BLOCKED" }, 403);

    const body = await readJson(request);

    if (request.method === "POST") {
      const task = await createTask(body);
      await audit("task.created", s.sub, { taskId: task.id, title: task.title });
      return json({ task }, 201);
    }

    if (request.method === "PATCH") {
      const task = await updateTask(body.id, body);
      await audit("task.updated", s.sub, { taskId: task.id, status: task.status });
      return json({ task });
    }

    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (error) {
    const status = error.message === "STORE_NOT_CONFIGURED" ? 503 : 400;
    return json({ error: error.message || "TASK_FAILED" }, status);
  }
}

export async function messageApi(request) {
  const s = requireRole(request);
  if (!s) return json({ error: "UNAUTHORIZED" }, 401);
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    return json({ messages: await messages() });
  } catch (error) {
    return json({ error: error.message }, 503);
  }
}

export async function auditApi(request) {
  const s = requireRole(request, ["admin"]);
  if (!s) return json({ error: "UNAUTHORIZED" }, 401);
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    return json({ audit: await audits() });
  } catch (error) {
    return json({ error: error.message }, 503);
  }
}

export async function backupApi(request) {
  const s = requireRole(request, ["admin"]);
  if (!s) return json({ error: "UNAUTHORIZED" }, 401);
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const data = await backup();
    await audit("backup.exported", s.sub, { tasks: data.tasks.length, messages: data.messages.length });
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="jkstory-office-backup-${Date.now()}.json"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return json({ error: error.message }, 503);
  }
}

export async function chatApi(request) {
  const s = requireRole(request, ["admin", "operator"]);
  if (!s) return json({ error: "UNAUTHORIZED" }, 401);
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!sameOrigin(request)) return json({ error: "CROSS_ORIGIN_BLOCKED" }, 403);
  if (!await rate(`ai:${s.sub}`, 20, 60)) return json({ error: "RATE_LIMITED" }, 429);

  if (process.env.ENABLE_AI_CHAT !== "true") {
    return json({ error: "AI_CHAT_DISABLED", message: "AI 채팅이 아직 활성화되지 않았습니다." }, 503);
  }
  if (!process.env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY_MISSING" }, 503);

  let body;
  try { body = await readJson(request); }
  catch { return json({ error: "INVALID_JSON" }, 400); }

  const message = String(body.message || "").trim().slice(0, 8000);
  if (!message) return json({ error: "MESSAGE_REQUIRED" }, 400);

  const c = body.context || {};
  const instructions = [
    "당신은 JKSTORY AI 전산센터장이다.",
    "한국어로 간결하고 실행 중심으로 답한다.",
    "확인하지 않은 파일, 테스트, Git 상태, 배포 성공을 만들어내지 않는다.",
    `현재 프로젝트: ${String(c.project || "정산서 작성 프로그램").slice(0, 200)}`,
    `현재 단계: ${String(c.stage || "GitHub / Vercel 이전").slice(0, 200)}`,
    `현재 Cloud Browser: ${String(c.browserUrl || "미연결").slice(0, 1000)}`
  ].join("\n");

  await addMessage("user", message, { username: s.sub, context: c }).catch(() => null);

  const history = Array.isArray(body.history)
    ? body.history.slice(-20).map((x) => ({
        role: x.role === "assistant" ? "assistant" : "user",
        content: String(x.content || "").slice(0, 4000)
      }))
    : [];

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6",
        instructions,
        input: [...history, { role: "user", content: message }]
      })
    });

    const data = await response.json();
    if (!response.ok) return json({ error: "OPENAI_REQUEST_FAILED" }, 502);

    let text = "";
    for (const item of data.output || []) {
      for (const part of item.content || []) {
        if (part.type === "output_text") text += part.text || "";
      }
    }
    text ||= "응답 텍스트가 없습니다.";

    await addMessage("assistant", text, { responseId: data.id }).catch(() => null);
    await audit("ai.response", s.sub, { responseId: data.id }).catch(() => null);

    return json({ text, responseId: data.id });
  } catch {
    return json({ error: "OPENAI_REQUEST_FAILED" }, 502);
  }
}

export async function githubApi(request) {
  const s = requireRole(request);
  if (!s) return json({ error: "UNAUTHORIZED" }, 401);
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const [owner, repo] = String(process.env.GITHUB_REPO || "").split("/");
  if (!owner || !repo) return json({ configured: false, status: null });

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
    "User-Agent": "JKSTORY-AI-Office"
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const gh = async (path) => {
    const r = await fetch(`https://api.github.com${path}`, { headers, cache: "no-store" });
    if (!r.ok) throw new Error(`GITHUB_HTTP_${r.status}`);
    return r.json();
  };

  try {
    const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const [repository, commits, runs] = await Promise.all([
      gh(base),
      gh(`${base}/commits?per_page=5`),
      gh(`${base}/actions/runs?per_page=5`)
    ]);

    return json({
      configured: true,
      status: {
        repository: {
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
          pushedAt: repository.pushed_at
        },
        commits: commits.map((x) => ({
          sha: x.sha,
          message: x.commit?.message || "",
          author: x.author?.login || x.commit?.author?.name || "unknown",
          date: x.commit?.author?.date || null
        })),
        workflowRuns: (runs.workflow_runs || []).map((x) => ({
          id: x.id,
          name: x.name,
          branch: x.head_branch,
          status: x.status,
          conclusion: x.conclusion,
          createdAt: x.created_at
        }))
      }
    });
  } catch (error) {
    return json({ configured: true, error: error.message }, 502);
  }
}

export async function vercelApi(request) {
  const s = requireRole(request);
  if (!s) return json({ error: "UNAUTHORIZED" }, 401);
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || "";
  if (!token || !projectId) return json({ configured: false, status: null });

  const vf = async (path) => {
    const r = await fetch(`https://api.vercel.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!r.ok) throw new Error(`VERCEL_HTTP_${r.status}`);
    return r.json();
  };

  try {
    const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const project = await vf(`/v9/projects/${encodeURIComponent(projectId)}${teamQuery}`);

    const params = new URLSearchParams({ projectId, limit: "10" });
    if (teamId) params.set("teamId", teamId);
    const deployments = await vf(`/v6/deployments?${params.toString()}`);

    return json({
      configured: true,
      status: {
        project: { id: project.id, name: project.name, framework: project.framework },
        deployments: (deployments.deployments || []).map((x) => ({
          uid: x.uid,
          url: x.url ? `https://${x.url}` : null,
          state: x.state || x.readyState || null,
          target: x.target || null,
          createdAt: x.createdAt || x.created || null,
          meta: { githubCommitMessage: x.meta?.githubCommitMessage || null }
        }))
      }
    });
  } catch (error) {
    return json({ configured: true, error: error.message }, 502);
  }
}

export async function readinessApi(request) {
  const s = requireRole(request);
  if (!s) return json({ error: "UNAUTHORIZED" }, 401);
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const checks = {
    auth: Boolean(
      process.env.OFFICE_SESSION_SECRET?.length >= 32 &&
      process.env.OFFICE_USERS_JSON
    ),
    storage: Boolean(
      (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
    ),
    openai: Boolean(
      process.env.OPENAI_API_KEY &&
      process.env.ENABLE_AI_CHAT === "true"
    ),
    github: Boolean(process.env.GITHUB_REPO),
    vercel: Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID)
  };

  const ready = Object.values(checks).every(Boolean);
  return json({ ready, checks }, ready ? 200 : 503);
}
