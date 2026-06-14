const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockOllamaResponse(message) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ message, done: true }),
  };
}

test('maps explicit supported commands to registered fallback calls', () => {
  const { inferObviousToolCall } = require('../electron/tools/planner.cjs');

  assert.deepEqual(inferObviousToolCall('open notepad'), {
    name: 'open_app',
    arguments: { app: 'notepad' },
  });
  assert.deepEqual(
    inferObviousToolCall('search the web for Ollama FunctionGemma'),
    {
      name: 'web_search',
      arguments: { query: 'Ollama FunctionGemma' },
    },
  );
  assert.deepEqual(
    inferObviousToolCall('search YouTube for local AI assistant'),
    {
      name: 'youtube_search',
      arguments: { query: 'local AI assistant' },
    },
  );
  assert.deepEqual(inferObviousToolCall('copy hello to clipboard'), {
    name: 'copy_to_clipboard',
    arguments: { text: 'hello' },
  });
  assert.deepEqual(
    inferObviousToolCall(
      'run powershell Get-Process | Select-Object -First 3',
    ),
    {
      name: 'run_powershell',
      arguments: {
        command: 'Get-Process | Select-Object -First 3',
      },
    },
  );
});

test('filters unnamed native calls and parses JSON content calls', () => {
  const {
    parseToolCallsFromMessage,
  } = require('../electron/tools/planner.cjs');

  assert.deepEqual(
    parseToolCallsFromMessage({
      tool_calls: [
        { function: { name: '', arguments: {} } },
        {
          function: {
            name: 'open_app',
            arguments: { app: 'notepad' },
          },
        },
      ],
    }),
    [{ name: 'open_app', arguments: { app: 'notepad' } }],
  );

  assert.deepEqual(
    parseToolCallsFromMessage({
      content: JSON.stringify({
        name: 'web_search',
        arguments: { query: 'Ollama FunctionGemma' },
      }),
    }),
    [{
      name: 'web_search',
      arguments: { query: 'Ollama FunctionGemma' },
    }],
  );
});

test('uses the explicit fallback when Ollama returns no usable call', async () => {
  const { planToolCalls } = require('../electron/tools/planner.cjs');
  global.fetch = async () => mockOllamaResponse({
    role: 'assistant',
    content: '',
  });

  assert.deepEqual(await planToolCalls('open notepad'), [{
    name: 'open_app',
    arguments: { app: 'notepad' },
  }]);
});

test('uses the explicit fallback when Ollama times out', async () => {
  const { planToolCalls } = require('../electron/tools/planner.cjs');
  global.fetch = async () => {
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  };

  assert.deepEqual(
    await planToolCalls('search the web for Ollama FunctionGemma'),
    [{
      name: 'web_search',
      arguments: { query: 'Ollama FunctionGemma' },
    }],
  );
});

test('narrows explicit commands to one tool and bounds model output', async () => {
  const { planToolCalls } = require('../electron/tools/planner.cjs');
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return mockOllamaResponse({
      role: 'assistant',
      tool_calls: [{
        function: {
          name: 'web_search',
          arguments: { query: 'Ollama FunctionGemma' },
        },
      }],
    });
  };

  await planToolCalls('search the web for Ollama FunctionGemma');

  assert.equal(requestBody.tools.length, 1);
  assert.equal(requestBody.tools[0].function.name, 'web_search');
  assert.equal(requestBody.options.num_predict, 128);
  assert.equal(requestBody.options.seed, 0);
});

test('keeps PowerShell fallback behind validation and confirmation', () => {
  const { inferObviousToolCall } = require('../electron/tools/planner.cjs');
  const {
    requiresConfirmation,
    validateToolCall,
  } = require('../electron/tools/safety.cjs');
  const safeCall = inferObviousToolCall(
    'run powershell Get-Process | Select-Object -First 3',
  );
  const safeValidation = validateToolCall(safeCall);

  assert.equal(safeValidation.ok, true);
  assert.equal(safeValidation.tool.name, 'run_powershell');
  assert.equal(requiresConfirmation(safeValidation.tool), true);

  const blockedCall = inferObviousToolCall(
    'run powershell Remove-Item -Recurse -Force C:\\',
  );
  assert.equal(validateToolCall(blockedCall).ok, false);
});
