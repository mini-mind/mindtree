const { buildModelRequestOptions } = require("../model-capabilities");
const { createHttpError } = require("./errors");

async function requestModelJson({
  baseUrl,
  apiKey,
  model,
  config,
  prompt,
  fetchImpl = fetch,
}) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const body = {
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: 0.9,
    ...buildModelRequestOptions(model, config),
  };

  const response = await fetchImpl(new URL("chat/completions", normalizedBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createHttpError(response.status, errorText || "LLM request failed", {
      model,
    });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw createHttpError(502, "No content returned by model");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw createHttpError(502, "Model did not return valid JSON", {
      raw: content,
    });
  }
}

module.exports = {
  requestModelJson,
};
