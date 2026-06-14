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
    name: 'clear_clipboard',
    description: 'Clear all current Windows clipboard contents.',
    safety: SafetyLevel.SAFE,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'take_screenshot',
    description: 'Capture the primary Windows display and save it as a PNG file.',
    safety: SafetyLevel.SAFE,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_volume',
    description: 'Get the current Windows master volume and mute state.',
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
    name: 'set_mute',
    description: 'Mute or unmute the Windows master audio endpoint.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        muted: {
          type: 'boolean',
          description: 'True to mute, false to unmute.',
        },
      },
      required: ['muted'],
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
    name: 'list_directory',
    description: 'List files and folders in a directory inside the user profile.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path or user-folder name.' },
        limit: { type: 'number', description: 'Maximum number of entries.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_folder',
    description: 'Create a folder inside the user profile after confirmation.',
    safety: SafetyLevel.RISKY,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Folder path to create.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_text_file',
    description: 'Create a new text file without overwriting an existing file.',
    safety: SafetyLevel.RISKY,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'New file path inside the user profile.' },
        content: { type: 'string', description: 'Initial text content.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'rename_path',
    description: 'Rename a file or folder inside the user profile.',
    safety: SafetyLevel.RISKY,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Existing file or folder path.' },
        new_name: { type: 'string', description: 'New name without directory separators.' },
      },
      required: ['path', 'new_name'],
    },
  },
  {
    name: 'move_path',
    description: 'Move a file or folder to another user-profile location.',
    safety: SafetyLevel.RISKY,
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Existing source path.' },
        destination: { type: 'string', description: 'Destination path or directory.' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'delete_path',
    description: 'Move a user file or folder to the Windows Recycle Bin.',
    safety: SafetyLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Existing path to move to the Recycle Bin.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'close_app',
    description: 'Request a running Windows application to close.',
    safety: SafetyLevel.RISKY,
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Application name, e.g. notepad or calculator.' },
      },
      required: ['app'],
    },
  },
  {
    name: 'manage_window',
    description: 'Minimize, maximize, restore, or focus an application window.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Application name.' },
        action: {
          type: 'string',
          enum: ['minimize', 'maximize', 'restore', 'focus'],
        },
      },
      required: ['app', 'action'],
    },
  },
  {
    name: 'get_system_info',
    description: 'Return local Windows, CPU, memory, hostname, and uptime information.',
    safety: SafetyLevel.SAFE,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_reminder',
    description: 'Create a persistent local reminder after a delay in minutes.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Reminder text.' },
        delay_minutes: { type: 'number', description: 'Delay before notification.' },
      },
      required: ['message', 'delay_minutes'],
    },
  },
  {
    name: 'list_reminders',
    description: 'List pending local Brightlens reminders.',
    safety: SafetyLevel.SAFE,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a pending reminder by its ID.',
    safety: SafetyLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Reminder ID.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'shutdown_computer',
    description: 'Schedule a Windows shutdown after explicit native confirmation.',
    safety: SafetyLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        delay_seconds: { type: 'number', description: 'Delay from 30 to 3600 seconds.' },
      },
      required: ['delay_seconds'],
    },
  },
  {
    name: 'restart_computer',
    description: 'Schedule a Windows restart after explicit native confirmation.',
    safety: SafetyLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        delay_seconds: { type: 'number', description: 'Delay from 30 to 3600 seconds.' },
      },
      required: ['delay_seconds'],
    },
  },
  {
    name: 'abort_shutdown',
    description: 'Cancel a pending Windows shutdown or restart.',
    safety: SafetyLevel.SAFE,
    parameters: { type: 'object', properties: {}, required: [] },
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
