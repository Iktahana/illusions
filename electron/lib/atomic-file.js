const path = require("path");
const fs = require("fs/promises");
const { withTransientIoRetry } = require("./transient-io-retry");

function makeTempPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  return path.join(dir, `.${base}.${suffix}.tmp`);
}

async function writeUtf8FileAtomically(filePath, content) {
  const tempPath = makeTempPath(filePath);
  const fileHandle = await fs.open(tempPath, "w");
  try {
    await fileHandle.writeFile(content, "utf-8");
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }

  try {
    await withTransientIoRetry(() => fs.rename(tempPath, filePath));
  } catch (error) {
    try {
      await withTransientIoRetry(() => fs.unlink(tempPath));
    } catch {}
    throw error;
  }
}

module.exports = { writeUtf8FileAtomically };
