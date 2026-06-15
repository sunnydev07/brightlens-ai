const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const {
  isTrustedRendererUrl,
} = require('../electron/rendererSecurity.cjs');

test('trusts only the configured development origin', () => {
  const options = {
    devOrigin: 'http://127.0.0.1:5173',
    productionFile: 'C:\\brightlens\\dist\\index.html',
  };

  assert.equal(
    isTrustedRendererUrl('http://127.0.0.1:5173/', options),
    true,
  );
  assert.equal(
    isTrustedRendererUrl('http://127.0.0.1:5173/settings', options),
    true,
  );
  assert.equal(
    isTrustedRendererUrl('http://localhost:5173/', options),
    false,
  );
  assert.equal(
    isTrustedRendererUrl('https://example.com/', options),
    false,
  );
});

test('trusts only the configured production file', () => {
  const productionFile = path.resolve('C:\\brightlens\\dist\\index.html');
  const options = {
    devOrigin: 'http://127.0.0.1:5173',
    productionFile,
  };

  assert.equal(
    isTrustedRendererUrl(pathToFileURL(productionFile).href, options),
    true,
  );
  assert.equal(
    isTrustedRendererUrl(
      pathToFileURL(path.join(path.dirname(productionFile), 'other.html')).href,
      options,
    ),
    false,
  );
});
