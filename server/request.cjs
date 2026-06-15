function createRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeAnalyzeRequest(body) {
  const input = body && typeof body === 'object' ? body : {};
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const image = typeof input.image === 'string' && input.image.trim()
    ? input.image.trim()
    : null;
  const mode = input.mode === 'offline' ? 'offline' : 'online';
  const systemPrompt = typeof input.systemPrompt === 'string'
    && input.systemPrompt.trim()
    ? input.systemPrompt.trim()
    : null;

  if (!image && !prompt) {
    throw createRequestError('Missing image or prompt.');
  }

  return { image, prompt, mode, systemPrompt };
}

module.exports = { normalizeAnalyzeRequest };
