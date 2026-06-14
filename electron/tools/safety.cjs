const { SafetyLevel } = require('./toolTypes.cjs');
const { getToolByName } = require('./registry.cjs');

const blockedPowerShellFragments = [
  'Remove-Item -Recurse -Force C:\\',
  'Format-Volume',
  'Clear-Disk',
  'Remove-Partition',
  'Stop-Computer -Force',
  'Restart-Computer -Force',
];

function parseArguments(rawArguments) {
  if (typeof rawArguments !== 'string') {
    return rawArguments;
  }

  try {
    return JSON.parse(rawArguments);
  } catch {
    return null;
  }
}

function validateToolCall(toolCall) {
  if (!toolCall || typeof toolCall !== 'object') {
    return { ok: false, reason: 'Tool call must be an object.' };
  }

  const name = toolCall.name || toolCall.function?.name;
  const args = parseArguments(
    toolCall.arguments ?? toolCall.function?.arguments ?? {},
  );
  const tool = getToolByName(name);

  if (!tool) {
    return { ok: false, reason: `Unknown tool: ${name}` };
  }

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, reason: 'Tool arguments must be an object.' };
  }

  for (const requiredKey of tool.parameters.required || []) {
    if (
      args[requiredKey] === undefined
      || args[requiredKey] === null
      || args[requiredKey] === ''
    ) {
      return { ok: false, reason: `Missing required argument: ${requiredKey}` };
    }
  }

  for (const [key, schema] of Object.entries(tool.parameters.properties || {})) {
    if (args[key] === undefined) {
      continue;
    }

    if (schema.type === 'string' && typeof args[key] !== 'string') {
      return { ok: false, reason: `Argument ${key} must be a string.` };
    }

    if (
      schema.type === 'number'
      && (typeof args[key] !== 'number' || !Number.isFinite(args[key]))
    ) {
      return { ok: false, reason: `Argument ${key} must be a finite number.` };
    }
  }

  if (name === 'set_volume' && (args.level < 0 || args.level > 100)) {
    return { ok: false, reason: 'Volume level must be between 0 and 100.' };
  }

  if (name === 'find_files' && args.limit !== undefined && args.limit <= 0) {
    return { ok: false, reason: 'File search limit must be greater than zero.' };
  }

  if (name === 'run_powershell') {
    const command = String(args.command || '');
    for (const fragment of blockedPowerShellFragments) {
      if (command.toLowerCase().includes(fragment.toLowerCase())) {
        return {
          ok: false,
          reason: `Blocked dangerous PowerShell fragment: ${fragment}`,
        };
      }
    }
  }

  return { ok: true, tool, args };
}

function requiresConfirmation(tool) {
  return (
    tool.safety === SafetyLevel.RISKY
    || tool.safety === SafetyLevel.DANGEROUS
  );
}

module.exports = { validateToolCall, requiresConfirmation };
