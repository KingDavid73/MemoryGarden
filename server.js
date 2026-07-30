const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

loadEnv(path.join(__dirname, ".env"));

const port = Number(process.env.PORT || 3000);
const model =
  process.env.OPENROUTER_MODEL || "inclusionai/ling-3.0-flash:free";
const publicDir = path.join(__dirname, "public");

function loadEnv(filename) {
  if (!fs.existsSync(filename)) return;

  for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function serveStatic(request, response) {
  const pathname = new URL(request.url, `http://localhost:${port}`).pathname;
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filename = path.resolve(publicDir, `.${requestedPath}`);

  if (
    (filename !== publicDir && !filename.startsWith(`${publicDir}${path.sep}`)) ||
    !fs.existsSync(filename)
  ) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
  };
  response.writeHead(200, {
    "Content-Type":
      contentTypes[path.extname(filename)] || "application/octet-stream",
  });
  fs.createReadStream(filename).pipe(response);
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) {
      throw new Error("Request is too large.");
    }
  }
  return JSON.parse(body || "{}");
}

async function callModel(messages, options = {}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY. Add it to the local .env file.");
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": `http://localhost:${port}`,
      "X-Title": "Memory Garden",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options.maxTokens || 300,
      temperature: options.temperature ?? 0.65,
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    const error = new Error(data.error?.message || "OpenRouter request failed.");
    error.status = upstream.status;
    throw error;
  }
  return data;
}

async function handleChat(request, response) {
  try {
    const { messages } = await readBody(request);
    if (!Array.isArray(messages) || messages.length === 0) {
      sendJson(response, 400, { error: "At least one message is required." });
      return;
    }
    const data = await callModel([
      {
        role: "system",
        content:
          "You are a warm, concise journaling companion. Ask thoughtful questions without pretending to be a therapist.",
      },
      ...messages.slice(-12),
    ]);
    sendJson(response, 200, {
      reply: data.choices?.[0]?.message?.content || "The model returned no text.",
      model: data.model || model,
      usage: data.usage || null,
    });
  } catch (error) {
    sendJson(response, error.status || 500, {
      error: error.message || "Unexpected server error.",
    });
  }
}

async function handleSuggestion(request, response) {
  try {
    const { threads = [] } = await readBody(request);
    const context = JSON.stringify(threads.slice(0, 8));
    const data = await callModel(
      [
        {
          role: "system",
          content:
            "You are Sprig, a gentle tiny garden bird in a private journaling app. Write exactly one concise journaling suggestion, 12-28 words. It may gently revisit one supplied thread or offer a fresh reflective topic. Never diagnose, moralize, mention metadata, or use quotation marks.",
        },
        {
          role: "user",
          content: threads.length
            ? `Current garden threads: ${context}`
            : "The garden has no threads yet. Offer a fresh, approachable prompt.",
        },
      ],
      { maxTokens: 300, temperature: 0.85 },
    );
    const suggestion =
      data.choices?.[0]?.message?.content?.trim() ||
      "What has been quietly returning to your attention?";
    sendJson(response, 200, { suggestion });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message });
  }
}

function parseJsonObject(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model returned invalid JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function handleAnalysis(request, response) {
  try {
    const { text, existingTags = [] } = await readBody(request);
    if (typeof text !== "string" || !text.trim()) {
      sendJson(response, 400, { error: "Entry text is required." });
      return;
    }
    const data = await callModel(
      [
        {
          role: "system",
          content:
            'Extract 1-4 useful, respectful journal metadata tags. Tags may describe broad themes, topics, interests, ongoing roles/personas, or projects explicitly supported by the entry. Avoid diagnoses, sensitive inferred traits, sentiment labels, and overly specific phrases. Return only strict JSON shaped exactly like {"tags":["tag one","tag two"]}.',
        },
        {
          role: "user",
          content:
            `Existing tags: ${JSON.stringify(existingTags.slice(0, 20))}\n` +
            `Entry:\n${text.slice(0, 6000)}`,
        },
      ],
      { maxTokens: 500, temperature: 0.2 },
    );
    const parsed = parseJsonObject(data.choices?.[0]?.message?.content);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((tag) => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    sendJson(response, 200, { tags });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message });
  }
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/chat") {
    handleChat(request, response);
    return;
  }
  if (request.method === "POST" && request.url === "/api/suggest") {
    handleSuggestion(request, response);
    return;
  }
  if (request.method === "POST" && request.url === "/api/analyze") {
    handleAnalysis(request, response);
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`Memory Garden is growing at http://localhost:${port}`);
  console.log(`Model: ${model}`);
});
