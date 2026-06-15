const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('screen capture subscriptions can be removed', () => {
  const listeners = new Map();
  let exposedApi;
  const ipcRenderer = {
    invoke() {},
    on(channel, callback) {
      listeners.set(channel, callback);
      return this;
    },
    removeListener(channel, callback) {
      if (listeners.get(channel) === callback) {
        listeners.delete(channel);
      }
    },
    send() {},
  };
  const contextBridge = {
    exposeInMainWorld(_name, api) {
      exposedApi = api;
    },
  };
  const preloadPath = path.join(__dirname, '..', 'electron', 'preload.cjs');
  const source = fs.readFileSync(preloadPath, 'utf8');

  vm.runInNewContext(source, {
    require(moduleName) {
      assert.equal(moduleName, 'electron');
      return { contextBridge, ipcRenderer };
    },
  });

  const callback = () => {};
  const unsubscribe = exposedApi.onScreenCapture(callback);

  assert.equal(typeof unsubscribe, 'function');
  assert.equal(listeners.get('SCREEN_CAPTURE'), callback);
  unsubscribe();
  assert.equal(listeners.has('SCREEN_CAPTURE'), false);
});
