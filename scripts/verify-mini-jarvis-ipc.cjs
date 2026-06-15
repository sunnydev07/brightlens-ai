const fs = require('fs');

const DEBUG_TARGETS_URL = process.env.BRIGHTLENS_DEBUG_TARGETS_URL
  || 'http://127.0.0.1:9222/json';
const RENDERER_ORIGIN = new URL(
  process.env.BRIGHTLENS_RENDERER_URL || 'http://127.0.0.1:5173',
).origin;
const REQUEST_TIMEOUT_MS = 90000;

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) {
        return;
      }

      const { resolve, reject, timer } = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    };
  }

  async connect() {
    if (this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out connecting to Electron DevTools.')),
        10000,
      );
      this.socket.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      this.socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Could not connect to Electron DevTools.'));
      };
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description
        || response.exceptionDetails.text,
      );
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function findRendererTarget() {
  const response = await fetch(DEBUG_TARGETS_URL);
  if (!response.ok) {
    throw new Error(`DevTools target lookup failed: ${response.status}`);
  }

  const targets = await response.json();
  const target = targets.find(
    (entry) => (
      entry.type === 'page'
      && new URL(entry.url).origin === RENDERER_ORIGIN
    ),
  );
  if (!target) {
    throw new Error('Could not find the Brightlens Electron renderer target.');
  }
  return target;
}

function getFirstResult(response) {
  return response?.results?.[0]?.result;
}

async function main() {
  const target = await findRendererTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  const evaluateCommand = (command) => client.evaluate(
    `window.electronAPI.miniJarvisRunCommand(${JSON.stringify(command)})`,
  );
  const results = [];
  const run = async (command) => {
    const response = await evaluateCommand(command);
    results.push({ command, response });
    console.log(`\n> ${command}\n${JSON.stringify(response, null, 2)}`);
    if (!response?.ok) {
      throw new Error(`IPC command failed: ${command}`);
    }
    return response;
  };

  try {
    const bridgeType = await client.evaluate(
      'typeof window.electronAPI?.miniJarvisRunCommand',
    );
    if (bridgeType !== 'function') {
      throw new Error(`Preload bridge is not callable: ${bridgeType}`);
    }
    console.log('Preload bridge: callable');

    if (process.env.BRIGHTLENS_SINGLE_COMMAND) {
      await run(process.env.BRIGHTLENS_SINGLE_COMMAND);
      return;
    }

    if (process.env.BRIGHTLENS_CONFIRMATION_PROBE) {
      const probeResponse = await client.evaluate(
        "window.electronAPI.miniJarvisRunCommand('run powershell Get-Process | Select-Object -First 3')",
        process.env.BRIGHTLENS_CONFIRMATION_PROBE === 'await',
      );
      console.log(
        `Dangerous PowerShell confirmation probe: ${JSON.stringify(probeResponse)}`,
      );
      return;
    }

    await run('open calculator');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await run('get system information');
    const volumeResponse = await run('get volume');
    const volume = getFirstResult(volumeResponse);
    await run(`set volume to ${volume.level}`);
    await run('list files in Downloads');

    const clipboardRoundTrip = await client.evaluate(`(async () => {
      const originalResponse = await window.electronAPI.miniJarvisRunCommand(
        'get clipboard'
      );
      const original = originalResponse.results?.[0]?.result?.text ?? '';
      const copyResponse = await window.electronAPI.miniJarvisRunCommand(
        'copy Brightlens IPC verification to clipboard'
      );
      const readResponse = await window.electronAPI.miniJarvisRunCommand(
        'get clipboard'
      );
      const copied = readResponse.results?.[0]?.result?.text
        === 'Brightlens IPC verification';
      if (original) {
        await window.electronAPI.miniJarvisRunCommand(
          'copy ' + original + ' to clipboard'
        );
      } else {
        await window.electronAPI.miniJarvisRunCommand('clear clipboard');
      }
      return { copyOk: copyResponse.ok, copied };
    })()`);
    console.log(
      `\n> clipboard round trip\n${JSON.stringify(clipboardRoundTrip, null, 2)}`,
    );
    if (!clipboardRoundTrip.copyOk || !clipboardRoundTrip.copied) {
      throw new Error('Clipboard round trip did not return the expected text.');
    }

    const screenshot = getFirstResult(await run('take screenshot'));
    if (!screenshot.path || !fs.existsSync(screenshot.path)) {
      throw new Error('Screenshot output file was not created.');
    }

    const reminderResult = getFirstResult(
      await run('remind me in 5 minutes to verify Mini Jarvis IPC'),
    );
    await run('list reminders');
    await run(`cancel reminder ${reminderResult.reminder.id}`);

    await run('minimize calculator');
    await new Promise((resolve) => setTimeout(resolve, 500));
    await run('restore calculator');
    await run('search the web for Ollama FunctionGemma');

    console.log(`\nVerified ${results.length} IPC commands successfully.`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
