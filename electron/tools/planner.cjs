const {
  getOllamaTools,
  getToolByName,
} = require('./registry.cjs');

const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL
  || 'http://127.0.0.1:11434/api/chat';
const TOOL_MODEL = process.env.BRIGHTLENS_TOOL_MODEL || 'functiongemma';
const PLANNER_TIMEOUT_MS = Number(
  process.env.BRIGHTLENS_TOOL_TIMEOUT_MS || 60000,
);
const PLANNER_MAX_TOKENS = 128;
const TOOL_DEBUG = process.env.BRIGHTLENS_TOOL_DEBUG === '1';

function logPlannerDiagnostic(label, value) {
  if (!TOOL_DEBUG) {
    return;
  }

  const output = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);
  console.log(`[Mini-Jarvis planner] ${label}:\n${output}`);
}

function parseToolArguments(rawArguments, toolName) {
  if (rawArguments === undefined || rawArguments === null) {
    return {};
  }

  if (typeof rawArguments !== 'string') {
    return rawArguments;
  }

  const trimmedArguments = rawArguments.trim();
  if (!trimmedArguments) {
    return {};
  }

  try {
    return JSON.parse(trimmedArguments);
  } catch (error) {
    throw new Error(
      `Ollama returned invalid JSON arguments for ${toolName}: ${error.message}`,
    );
  }
}

function normalizeArguments(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  );
}

function normalizeToolCall(rawCall) {
  if (!rawCall || typeof rawCall !== 'object') {
    return null;
  }

  const functionCall = rawCall.function && typeof rawCall.function === 'object'
    ? rawCall.function
    : rawCall;
  const rawName = functionCall.name
    || rawCall.name
    || rawCall.tool
    || rawCall.tool_name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';

  if (!name || !getToolByName(name)) {
    return null;
  }

  const rawArguments = functionCall.arguments
    ?? rawCall.arguments
    ?? rawCall.args
    ?? {};

  try {
    return {
      name,
      arguments: normalizeArguments(parseToolArguments(rawArguments, name)),
    };
  } catch (error) {
    logPlannerDiagnostic(`invalid arguments for ${name}`, error.message);
    return null;
  }
}

function parseJsonContent(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    return [];
  }

  const candidates = [trimmed];
  const fencedMatch = trimmed.match(
    /```(?:json)?\s*([\s\S]*?)\s*```/i,
  );
  if (fencedMatch) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(candidate);
      const values = Array.isArray(parsed) ? parsed : [parsed];
      const calls = values.map(normalizeToolCall).filter(Boolean);
      if (calls.length > 0) {
        return calls;
      }
    } catch {
      // Try the next possible JSON segment.
    }
  }

  return [];
}

function parseFunctionGemmaText(content) {
  const text = String(content || '');
  const callMatch = text.match(
    /(?:<start_function_call>\s*)?call:([a-zA-Z_][\w]*)\s*(\{[\s\S]*?\})(?:<end_function_call>)?/i,
  );
  if (!callMatch) {
    return [];
  }

  const [, name, rawArguments] = callMatch;
  let args = {};

  try {
    args = JSON.parse(rawArguments);
  } catch {
    const escapedArguments = {};
    const argumentPattern = /([a-zA-Z_][\w]*)\s*:\s*<escape>([\s\S]*?)<escape>/g;
    let argumentMatch;
    while ((argumentMatch = argumentPattern.exec(rawArguments)) !== null) {
      escapedArguments[argumentMatch[1]] = argumentMatch[2];
    }
    args = escapedArguments;
  }

  const call = normalizeToolCall({ name, arguments: args });
  return call ? [call] : [];
}

function parseToolCallsFromMessage(message, allowedToolNames) {
  const allowedNames = new Set(
    allowedToolNames || getOllamaTools().map((tool) => tool.function.name),
  );
  const isAllowed = (call) => call && allowedNames.has(call.name);
  const nativeCalls = Array.isArray(message?.tool_calls)
    ? message.tool_calls.map(normalizeToolCall).filter(isAllowed)
    : [];

  if (nativeCalls.length > 0) {
    return nativeCalls.slice(0, 1);
  }

  const jsonCalls = parseJsonContent(message?.content).filter(isAllowed);
  if (jsonCalls.length > 0) {
    return jsonCalls.slice(0, 1);
  }

  return parseFunctionGemmaText(message?.content)
    .filter(isAllowed)
    .slice(0, 1);
}

function inferObviousToolCall(userCommand) {
  const command = String(userCommand || '').trim();
  if (!command) {
    return null;
  }

  let match = command.match(
    /^run\s+powershell(?:\s+command)?\s+([\s\S]+)$/i,
  );
  if (match) {
    return {
      name: 'run_powershell',
      arguments: { command: match[1].trim() },
    };
  }

  match = command.match(
    /^(?:search\s+youtube|youtube\s+search)(?:\s+for)?\s+(.+)$/i,
  );
  if (match) {
    return {
      name: 'youtube_search',
      arguments: { query: match[1].trim() },
    };
  }

  match = command.match(
    /^(?:search(?:\s+the)?\s+web|web\s+search|google(?:\s+search)?)(?:\s+for)?\s+(.+)$/i,
  );
  if (match) {
    return {
      name: 'web_search',
      arguments: { query: match[1].trim() },
    };
  }

  match = command.match(
    /^copy\s+([\s\S]+?)\s+to\s+(?:the\s+)?clipboard$/i,
  );
  if (match) {
    return {
      name: 'copy_to_clipboard',
      arguments: { text: match[1].trim() },
    };
  }

  match = command.match(/^open\s+(https?:\/\/\S+)$/i);
  if (match) {
    return {
      name: 'open_url',
      arguments: { url: match[1].trim() },
    };
  }

  match = command.match(
    /^open\s+(?:the\s+)?(?:app(?:lication)?\s+)?(.+)$/i,
  );
  if (match) {
    return {
      name: 'open_app',
      arguments: { app: match[1].trim() },
    };
  }

  return null;
}

function createSystemPrompt(toolNames) {
  return [
    'You are a model that can do function calling with the following functions.',
    `Select exactly one structured tool call using one of these exact names: ${toolNames.join(', ')}.`,
    'Never invent a tool name, omit the tool name, or call a tool more than once.',
    'Use web_search for requests to search the web.',
    'Use youtube_search for requests to search YouTube.',
    'Use run_powershell when the user explicitly asks to run PowerShell.',
  ].join(' ');
}

async function planToolCalls(userCommand) {
  const command = String(userCommand || '').trim();
  const fallbackToolCall = inferObviousToolCall(command);
  const allOllamaTools = getOllamaTools();
  const ollamaTools = fallbackToolCall
    ? allOllamaTools.filter(
      (tool) => tool.function.name === fallbackToolCall.name,
    )
    : allOllamaTools;
  const allowedToolNames = ollamaTools.map((tool) => tool.function.name);
  let response;

  try {
    response = await fetch(OLLAMA_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TOOL_MODEL,
        messages: [
          {
            role: 'system',
            content: createSystemPrompt(allowedToolNames),
          },
          { role: 'user', content: command },
        ],
        tools: ollamaTools,
        stream: false,
        keep_alive: '10m',
        options: {
          temperature: 0,
          seed: 0,
          num_predict: PLANNER_MAX_TOKENS,
        },
      }),
      signal: AbortSignal.timeout(PLANNER_TIMEOUT_MS),
    });
  } catch (error) {
    if (fallbackToolCall && error?.name === 'TimeoutError') {
      logPlannerDiagnostic(
        'timeout fallback tool call',
        fallbackToolCall,
      );
      return [fallbackToolCall];
    }
    throw error;
  }

  const rawResponse = await response.text();
  logPlannerDiagnostic('raw Ollama response', rawResponse);

  if (!response.ok) {
    throw new Error(
      `Ollama planner failed: ${response.status} ${rawResponse}`,
    );
  }

  let data;
  try {
    data = JSON.parse(rawResponse);
  } catch (error) {
    throw new Error(`Ollama planner returned invalid JSON: ${error.message}`);
  }

  const message = data.message || {};
  logPlannerDiagnostic('data.message', message);
  logPlannerDiagnostic('message.tool_calls', message.tool_calls);

  const toolCalls = parseToolCallsFromMessage(message, allowedToolNames);
  if (toolCalls.length === 0) {
    logPlannerDiagnostic('fallback text content', message.content || '');
    if (fallbackToolCall) {
      logPlannerDiagnostic('obvious command fallback', fallbackToolCall);
      return [fallbackToolCall];
    }
    return toolCalls;
  }

  if (fallbackToolCall && toolCalls[0].name === fallbackToolCall.name) {
    return [fallbackToolCall];
  }

  return toolCalls;
}

module.exports = {
  inferObviousToolCall,
  parseToolCallsFromMessage,
  planToolCalls,
};
