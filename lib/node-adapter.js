export async function adaptNodeToWeb(req, res, webHandler) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const url = `${proto}://${host}${req.url || "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, String(v));
    } else {
      headers.set(key, String(value));
    }
  }

  let body;
  if (!["GET", "HEAD"].includes(String(req.method || "GET").toUpperCase())) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length) body = Buffer.concat(chunks);
  }

  const request = new Request(url, {
    method: req.method || "GET",
    headers,
    body
  });

  const response = await webHandler(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      // Node/Vercel accepts Set-Cookie as response header.
      res.setHeader("Set-Cookie", value);
    } else {
      res.setHeader(key, value);
    }
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}
