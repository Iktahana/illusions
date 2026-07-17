const TRANSIENT_IO_ERROR_CODES = new Set(["EPERM", "EBUSY", "ENOTEMPTY", "EACCES"]);

function isTransientIoError(error) {
  return TRANSIENT_IO_ERROR_CODES.has(String(error?.code ?? ""));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTransientIoRetry(operation, options = {}) {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 50;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientIoError(error) || attempt >= retries) {
        throw error;
      }
      await delay(baseDelayMs * (attempt + 1));
    }
  }
}

function sleepSync(ms) {
  if (ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function withTransientIoRetrySync(operation, options = {}) {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 50;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!isTransientIoError(error) || attempt >= retries) {
        throw error;
      }
      sleepSync(baseDelayMs * (attempt + 1));
    }
  }
}

module.exports = { isTransientIoError, withTransientIoRetry, withTransientIoRetrySync };
