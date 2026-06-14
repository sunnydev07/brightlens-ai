const { SafetyLevel } = require('./toolTypes.cjs');

const tools = [
  {
    name: 'open_app',
    description: 'Open a Windows application by common app name, executable name, or path.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description: 'Application name, e.g. chrome, notepad, vscode.',
        },
      },
      required: ['app'],
    },
  },
  {
    name: 'open_url',
    description: 'Open a URL in the default browser.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web using the default browser.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'youtube_search',
    description: 'Search YouTube in the default browser.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'YouTube search query.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'copy_to_clipboard',
    description: 'Copy text to the Windows clipboard.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to copy.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_clipboard',
    description: 'Read text from the Windows clipboard.',
    safety: SafetyLevel.SAFE,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_volume',
    description: 'Set Windows system volume percentage from 0 to 100.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        level: {
          type: 'number',
          description: 'Volume percentage from 0 to 100.',
        },
      },
      required: ['level'],
    },
  },
  {
    name: 'find_files',
    description: 'Search user folders for files matching a query.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_powershell',
    description: 'Run a PowerShell command after explicit confirmation.',
    safety: SafetyLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'PowerShell command to run.',
        },
      },
      required: ['command'],
    },
  },
];

function getTools() {
  return tools;
}

function getToolByName(name) {
  return tools.find((tool) => tool.name === name);
}

function getOllamaTools() {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

module.exports = { getTools, getToolByName, getOllamaTools };
