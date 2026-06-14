const { getOllamaTools } = require('./registry.cjs');

const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL
  || 'http://127.0.0.1:11434/api/chat';
const TOOL_MODEL = process.env.BRIGHTLENS_TOOL_MODEL || 'functiongemma';
const PLANNER_TIMEOUT_MS = 30000;

function parseToolArguments(rawArguments, toolName) {
  if (typeof rawArguments !== 'string') {
    return rawArguments || {};
  }

  try {
    return JSON.parse(rawArguments);
  } catch (error) {
    throw new Error(
      `Ollama returned invalid JSON arguments for ${toolName}: ${error.message}`,
    );
  }
}

function normalizeArguments(args) {
  return Object.fromEntries(
    Object.entries(args || {}).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  );
}

async function planToolCalls(userCommand) {
  const response = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TOOL_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are Brightlens Mini-Jarvis. Choose the best available tool for the user request. Prefer structured tool calls. If no tool fits, answer briefly that no tool is available.',
        },
        { role: 'user', content: String(userCommand || '') },
      ],
      tools: getOllamaTools(),
      stream: false,
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(PLANNER_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama planner failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const message = data.message || {};

  if (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
    return [];
  }

  const toolCalls = message.tool_calls.map((call) => {
    const name = call.function?.name || call.name;
    const rawArguments = call.function?.arguments ?? call.arguments ?? {};

    return {
      name,
      arguments: normalizeArguments(
        parseToolArguments(rawArguments, name || 'unknown tool'),
      ),
    };
  });

  // Mini-Jarvis handles one user intent at a time. This also prevents a small
  // local planner from executing unrelated extra calls in a single response.
  return toolCalls.slice(0, 1);
}

module.exports = { planToolCalls };
