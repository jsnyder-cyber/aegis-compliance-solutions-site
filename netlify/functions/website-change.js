const crypto = require("crypto");

const REQUIRED_ENV = ["SLACK_SIGNING_SECRET", "GITHUB_TOKEN", "GITHUB_REPO"];

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function missingEnv() {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

function verifySlackSignature(event) {
  const timestamp = event.headers["x-slack-request-timestamp"];
  const signature = event.headers["x-slack-signature"];

  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 60 * 5) return false;

  const base = `v0:${timestamp}:${event.body || ""}`;
  const digest = crypto
    .createHmac("sha256", process.env.SLACK_SIGNING_SECRET)
    .update(base)
    .digest("hex");

  const expected = Buffer.from(`v0=${digest}`, "utf8");
  const actual = Buffer.from(signature, "utf8");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function parseSlackPayload(event) {
  const contentType = event.headers["content-type"] || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(event.body || "");
    return {
      text: params.get("text") || "",
      userName: params.get("user_name") || "Unknown Slack user",
      userId: params.get("user_id") || "",
      channelName: params.get("channel_name") || "",
      channelId: params.get("channel_id") || "",
      command: params.get("command") || "",
    };
  }

  if (contentType.includes("application/json")) {
    const body = JSON.parse(event.body || "{}");
    return {
      text: body.text || body.request || "",
      userName: body.user_name || body.userName || "Unknown Slack user",
      userId: body.user_id || body.userId || "",
      channelName: body.channel_name || body.channelName || "",
      channelId: body.channel_id || body.channelId || "",
      command: body.command || "webhook",
    };
  }

  return { text: "", userName: "Unknown Slack user" };
}

function buildIssue({ text, userName, userId, channelName, channelId, command }) {
  const cleanText = text.trim();
  const firstLine = cleanText.split("\n").find(Boolean) || "Website change request";
  const title = `Website request: ${firstLine.slice(0, 80)}`;
  const labels = (process.env.GITHUB_LABELS || "website-request,needs-preview")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

  return {
    title,
    labels,
    body: [
      "## Request",
      cleanText,
      "",
      "## Slack Source",
      `- User: ${userName}${userId ? ` (${userId})` : ""}`,
      `- Channel: ${channelName || "unknown"}${channelId ? ` (${channelId})` : ""}`,
      `- Command: ${command || "unknown"}`,
      "",
      "## Publishing Flow",
      "1. Codex creates a branch and preview deploy.",
      "2. Jeff reviews the preview.",
      "3. Approved changes are pushed to `main` for production deploy.",
    ].join("\n"),
  };
}

async function createGitHubIssue(issue) {
  await ensureLabels(issue.labels);

  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/issues`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "aegis-website-slack-bridge",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify(issue),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.message || `GitHub returned ${res.status}`);
  }

  return body;
}

async function ensureLabels(labels) {
  await Promise.all(
    labels.map(async (name) => {
      const res = await fetch(
        `https://api.github.com/repos/${process.env.GITHUB_REPO}/labels`,
        {
          method: "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            "content-type": "application/json",
            "user-agent": "aegis-website-slack-bridge",
            "x-github-api-version": "2022-11-28",
          },
          body: JSON.stringify({
            name,
            color: name === "needs-preview" ? "fbca04" : "0e8a16",
          }),
        },
      );

      if (res.ok || res.status === 422) return;

      const body = await res.json();
      throw new Error(body.message || `Could not create label ${name}`);
    }),
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, { message: "Use POST." });
  }

  const missing = missingEnv();
  if (missing.length) {
    return response(500, { message: `Missing environment variables: ${missing.join(", ")}` });
  }

  if (!verifySlackSignature(event)) {
    return response(401, { message: "Invalid Slack signature." });
  }

  const payload = parseSlackPayload(event);
  if (!payload.text.trim()) {
    return response(200, {
      response_type: "ephemeral",
      text: "Send the website change after the command, for example: /website-change Update the hero headline.",
    });
  }

  try {
    const issue = await createGitHubIssue(buildIssue(payload));
    return response(200, {
      response_type: "in_channel",
      text: `Website request captured: ${issue.html_url}`,
    });
  } catch (error) {
    return response(500, {
      response_type: "ephemeral",
      text: `I could not create the GitHub request yet: ${error.message}`,
    });
  }
};
