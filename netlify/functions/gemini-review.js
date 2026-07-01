function response(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, { message: "Use POST." });
  }

  const webhookUrl = process.env.APPS_SCRIPT_SCAN_WEBHOOK_URL;
  const token = process.env.APPS_SCRIPT_SCAN_TOKEN;

  if (!webhookUrl || !token) {
    return response(500, {
      message: "Gemini review is not configured.",
    });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      return response(502, {
        message: "Gemini review could not be started.",
      });
    }

    return response(202, {
      message: "Gemini review started",
    });
  } catch (error) {
    return response(502, {
      message: "Gemini review could not be started.",
    });
  }
};
