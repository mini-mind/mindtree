function createHttpError(statusCode, message, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

function mapApiError(error, knownModels) {
  return {
    statusCode: error.statusCode || 500,
    body: {
      error:
        error.statusCode === 404
          ? `Model not found: ${error.model || "unknown"}. Check the exact model name or select a known model.`
          : error.message || "LLM request failed",
      ...(error.statusCode === 404 ? { knownModels } : {}),
      ...(error.raw ? { raw: error.raw } : {}),
    },
  };
}

module.exports = {
  createHttpError,
  mapApiError,
};
