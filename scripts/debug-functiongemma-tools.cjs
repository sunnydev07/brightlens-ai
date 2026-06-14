process.env.BRIGHTLENS_TOOL_DEBUG = '1';

const { planToolCalls } = require('../electron/tools/planner.cjs');
const { validateToolCall } = require('../electron/tools/safety.cjs');

const commands = [
  'open notepad',
  'search the web for Ollama FunctionGemma',
  'search YouTube for local AI assistant',
  'copy hello to clipboard',
  'run powershell Get-Process | Select-Object -First 3',
];

async function debugCommand(command) {
  console.log('\n============================================================');
  console.log(`Input command: ${command}`);

  try {
    const toolCalls = await planToolCalls(command);
    console.log('Parsed tool call:');
    console.dir(toolCalls, { depth: null });

    if (toolCalls.length === 0) {
      console.log('Validation result: no tool call to validate');
      return;
    }

    for (const toolCall of toolCalls) {
      console.log('Validation result:');
      console.dir(validateToolCall(toolCall), { depth: null });
    }
  } catch (error) {
    console.error('Planner error:');
    console.error(error);
  }
}

async function main() {
  for (const command of commands) {
    await debugCommand(command);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
