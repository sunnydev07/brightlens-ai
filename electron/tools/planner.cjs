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

  const withoutTrailingPunctuation = (value) => String(value)
    .trim()
    .replace(/[.?!]+$/, '')
    .trim();
  const normalizeUserPath = (value) => withoutTrailingPunctuation(value)
    .replace(/^(?:my|the)\s+/i, '')
    .replace(/\s+(?:folder|directory)$/i, '')
    .trim();
  const toMinutes = (amount, unit) => {
    const value = Number(amount);
    if (/^seconds?/i.test(unit)) {
      return value / 60;
    }
    if (/^hours?/i.test(unit)) {
      return value * 60;
    }
    if (/^days?/i.test(unit)) {
      return value * 1440;
    }
    return value;
  };
  const toSeconds = (amount, unit) => {
    const value = Number(amount);
    return /^minutes?/i.test(unit) ? value * 60 : value;
  };

  let match = command.match(
    /^run\s+powershell(?:\s+command)?\s+([\s\S]+)$/i,
  );
  if (match) {
    return {
      name: 'run_powershell',
      arguments: { command: match[1].trim() },
    };
  }

  if (/^(?:abort|cancel)\s+(?:the\s+)?(?:pending\s+)?(?:shutdown|restart)$/i.test(command)) {
    return { name: 'abort_shutdown', arguments: {} };
  }

  match = command.match(
    /^(?:shut\s*down)(?:\s+(?:the\s+)?(?:computer|pc))?(?:\s+in\s+(\d+(?:\.\d+)?)\s+(seconds?|minutes?))?$/i,
  );
  if (match) {
    return {
      name: 'shutdown_computer',
      arguments: {
        delay_seconds: match[1] ? toSeconds(match[1], match[2]) : 60,
      },
    };
  }

  match = command.match(
    /^restart(?:\s+(?:the\s+)?(?:computer|pc))?(?:\s+in\s+(\d+(?:\.\d+)?)\s+(seconds?|minutes?))?$/i,
  );
  if (match) {
    return {
      name: 'restart_computer',
      arguments: {
        delay_seconds: match[1] ? toSeconds(match[1], match[2]) : 60,
      },
    };
  }

  match = command.match(
    /^(?:remind\s+me|set\s+(?:a\s+)?reminder)\s+in\s+(\d+(?:\.\d+)?)\s+(seconds?|minutes?|hours?|days?)\s+(?:to|for)\s+([\s\S]+)$/i,
  );
  if (match) {
    return {
      name: 'set_reminder',
      arguments: {
        message: withoutTrailingPunctuation(match[3]),
        delay_minutes: toMinutes(match[1], match[2]),
      },
    };
  }

  if (/^(?:list|show)(?:\s+my)?\s+reminders$/i.test(command)) {
    return { name: 'list_reminders', arguments: {} };
  }

  match = command.match(
    /^(?:cancel|delete)\s+reminder\s+([a-zA-Z0-9-]+)$/i,
  );
  if (match) {
    return {
      name: 'cancel_reminder',
      arguments: { id: match[1] },
    };
  }

  if (/^(?:take|capture|save)(?:\s+a)?\s+screenshot(?:\s+of\s+(?:the\s+)?screen)?$/i.test(command)) {
    return { name: 'take_screenshot', arguments: {} };
  }

  if (/^(?:get|show|display)(?:\s+the)?\s+system\s+info(?:rmation)?$/i.test(command)) {
    return { name: 'get_system_info', arguments: {} };
  }

  if (/^(?:clear|empty)(?:\s+the)?\s+clipboard$/i.test(command)) {
    return { name: 'clear_clipboard', arguments: {} };
  }

  if (/^(?:get|show|read)(?:\s+the)?\s+clipboard(?:\s+text)?$/i.test(command)) {
    return { name: 'get_clipboard', arguments: {} };
  }

  if (/^(?:get|show|what(?:'s|\s+is))(?:\s+the)?\s+(?:current\s+)?volume(?:\s+level)?$/i.test(command)) {
    return { name: 'get_volume', arguments: {} };
  }

  match = command.match(
    /^(?:set|change)(?:\s+the)?\s+volume(?:\s+(?:level))?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%?$/i,
  );
  if (match) {
    return {
      name: 'set_volume',
      arguments: { level: Number(match[1]) },
    };
  }

  if (/^(?:mute|mute\s+(?:the\s+)?(?:sound|audio|volume))$/i.test(command)) {
    return { name: 'set_mute', arguments: { muted: true } };
  }

  if (/^(?:unmute|unmute\s+(?:the\s+)?(?:sound|audio|volume))$/i.test(command)) {
    return { name: 'set_mute', arguments: { muted: false } };
  }

  match = command.match(
    /^(minimize|maximize|restore|focus)(?:\s+on)?\s+(?:the\s+)?(.+?)(?:\s+window)?$/i,
  );
  if (match) {
    return {
      name: 'manage_window',
      arguments: {
        app: withoutTrailingPunctuation(match[2]),
        action: match[1].toLowerCase(),
      },
    };
  }

  match = command.match(
    /^(?:close|quit|exit)\s+(?:the\s+)?(?:app(?:lication)?\s+)?(.+)$/i,
  );
  if (match) {
    return {
      name: 'close_app',
      arguments: {
        app: withoutTrailingPunctuation(match[1])
          .replace(/\s+app(?:lication)?$/i, ''),
      },
    };
  }

  match = command.match(
    /^(?:find|search\s+for)\s+files?(?:\s+(?:named|matching|containing))?\s+(.+)$/i,
  );
  if (match) {
    return {
      name: 'find_files',
      arguments: { query: withoutTrailingPunctuation(match[1]) },
    };
  }

  match = command.match(
    /^(?:list|show)(?:\s+(?:the))?\s+(?:files|contents)(?:\s+(?:in|of))\s+(.+)$/i,
  );
  if (match) {
    return {
      name: 'list_directory',
      arguments: { path: normalizeUserPath(match[1]) },
    };
  }

  match = command.match(
    /^create\s+(?:a\s+)?(?:new\s+)?folder\s+(.+)$/i,
  );
  if (match) {
    return {
      name: 'create_folder',
      arguments: { path: normalizeUserPath(match[1]) },
    };
  }

  match = command.match(
    /^create\s+(?:a\s+)?(?:new\s+)?(?:text\s+)?file\s+(.+?)(?:\s+with\s+(?:the\s+)?(?:content|text)\s+([\s\S]+))?$/i,
  );
  if (match) {
    return {
      name: 'create_text_file',
      arguments: {
        path: normalizeUserPath(match[1]),
        ...(match[2] ? { content: withoutTrailingPunctuation(match[2]) } : {}),
      },
    };
  }

  match = command.match(/^rename\s+(.+?)\s+to\s+([^\\/]+)$/i);
  if (match) {
    return {
      name: 'rename_path',
      arguments: {
        path: normalizeUserPath(match[1]),
        new_name: withoutTrailingPunctuation(match[2]),
      },
    };
  }

  match = command.match(/^move\s+(.+?)\s+to\s+(.+)$/i);
  if (match) {
    return {
      name: 'move_path',
      arguments: {
        source: normalizeUserPath(match[1]),
        destination: normalizeUserPath(match[2]),
      },
    };
  }

  match = command.match(
    /^(?:delete|remove|trash)\s+(?:the\s+)?(?:file|folder|directory)?\s*(.+)$/i,
  );
  if (match) {
    return {
      name: 'delete_path',
      arguments: { path: normalizeUserPath(match[1]) },
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
      arguments: {
        app: match[1].trim().replace(/\s+app(?:lication)?$/i, ''),
      },
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
    'Use list_directory, create_folder, create_text_file, rename_path, move_path, and delete_path for file management.',
    'Use get_volume, set_volume, and set_mute for audio controls.',
    'Use manage_window for minimize, maximize, restore, or focus requests.',
    'Use close_app only when the user asks to close an application.',
    'Use shutdown_computer or restart_computer only for explicit system power requests.',
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
