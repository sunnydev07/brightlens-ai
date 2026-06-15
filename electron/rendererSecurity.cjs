const path = require('path');
const { fileURLToPath } = require('url');

function isTrustedRendererUrl(value, options = {}) {
  if (typeof value !== 'string' || !value) {
    return false;
  }

  let rendererUrl;
  try {
    rendererUrl = new URL(value);
  } catch {
    return false;
  }

  if (options.devOrigin) {
    try {
      if (rendererUrl.origin === new URL(options.devOrigin).origin) {
        return true;
      }
    } catch {
      return false;
    }
  }

  if (rendererUrl.protocol !== 'file:' || !options.productionFile) {
    return false;
  }

  try {
    return path.resolve(fileURLToPath(rendererUrl))
      === path.resolve(options.productionFile);
  } catch {
    return false;
  }
}

module.exports = { isTrustedRendererUrl };
