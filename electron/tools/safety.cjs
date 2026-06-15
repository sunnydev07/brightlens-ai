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

const protectedApps = new Set([
  'brightlens',
  'csrss',
  'dwm',
  'electron',
  'explorer',
  'lsass',
  'services',
  'smss',
  'system',
  'wininit',
  'winlogon',
]);

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

function normalizeAppName(app) {
  return String(app || '')
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, '');
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

    if (schema.type === 'boolean' && typeof args[key] !== 'boolean') {
      return { ok: false, reason: `Argument ${key} must be a boolean.` };
    }

    if (schema.enum && !schema.enum.includes(args[key])) {
      return {
        ok: false,
        reason: `Argument ${key} must be one of: ${schema.enum.join(', ')}.`,
      };
    }
  }

  if (name === 'set_volume' && (args.level < 0 || args.level > 100)) {
    return { ok: false, reason: 'Volume level must be between 0 and 100.' };
  }

  if (name === 'find_files' && args.limit !== undefined && args.limit <= 0) {
    return { ok: false, reason: 'File search limit must be greater than zero.' };
  }

  if (name === 'list_directory' && args.limit !== undefined && args.limit <= 0) {
    return { ok: false, reason: 'Directory list limit must be greater than zero.' };
  }

  if (name === 'rename_path' && /[\\/]/.test(args.new_name)) {
    return {
      ok: false,
      reason: 'The new name cannot contain directory separators.',
    };
  }

  if (
    name === 'set_reminder'
    && (args.delay_minutes < 0.05 || args.delay_minutes > 525600)
  ) {
    return {
      ok: false,
      reason: 'Reminder delay must be between 0.05 and 525600 minutes.',
    };
  }

  if (
    (name === 'shutdown_computer' || name === 'restart_computer')
    && (args.delay_seconds < 30 || args.delay_seconds > 3600)
  ) {
    return {
      ok: false,
      reason: 'Shutdown delay must be between 30 and 3600 seconds.',
    };
  }

  if (name === 'close_app' && protectedApps.has(normalizeAppName(args.app))) {
    return {
      ok: false,
      reason: `Closing protected application ${args.app} is not allowed.`,
    };
  }

  if (
    name === 'open_app'
    && /\s+(?:and\s+then|and|then)\s+/i.test(args.app)
  ) {
    return {
      ok: false,
      reason: 'The app name contains multiple actions. Use a multi-step plan.',
    };
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
