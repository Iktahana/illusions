/**
 * Network utility helpers for the Electron main process.
 *
 * isMeteredConnection() — returns true when the active network connection is
 * likely metered (cellular, iPhone hotspot, or user-flagged as metered).
 * Used to gate auto-downloads that should not run on paid/limited connections.
 *
 * Platform support:
 *   macOS  — checks default route interface via `route get default` +
 *             `networksetup -listallhardwareports`
 *   Windows — checks PowerShell Get-NetConnectionProfile IsMetered property
 *             (Win 10 1803+; older versions fall through to fail-open)
 *   Linux  — detection not implemented; always returns false (fail-open)
 */

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

let _cachedResult = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Returns true if the current network connection is likely metered.
 * Result is cached for 1 minute to avoid repeated shell invocations.
 * Fails open (returns false) on any detection error or unsupported platform.
 */
async function isMeteredConnection() {
  const now = Date.now();
  if (_cachedResult !== null && now < _cacheExpiry) return _cachedResult;

  try {
    let metered = false;
    if (process.platform === "darwin") {
      metered = await _macIsMetered();
    } else if (process.platform === "win32") {
      metered = await _winIsMetered();
    }
    // Linux: detection not implemented — fail-open (allow download).
    _cachedResult = metered;
    _cacheExpiry = now + CACHE_TTL_MS;
    return metered;
  } catch (err) {
    console.warn("[network-utils] isMeteredConnection failed:", err.message);
    return false;
  }
}

/**
 * macOS: check if the default route interface is cellular or an iPhone hotspot.
 * Typical metered interfaces: pdp_ip* (carrier), iPhone USB tethering shows as
 * a "iPhone USB" hardware port in networksetup output.
 */
async function _macIsMetered() {
  const { stdout: routeOut } = await execFileAsync("route", ["get", "default"], { timeout: 3000 });
  const ifaceMatch = routeOut.match(/interface:\s*(\S+)/);
  if (!ifaceMatch) return false;
  const iface = ifaceMatch[1];

  // Direct cellular interface name patterns (carrier modems, MVNO dongles)
  if (/^pdp_ip|^rmnet/.test(iface)) return true;

  // Check hardware port description for the active interface
  const { stdout: hwOut } = await execFileAsync("networksetup", ["-listallhardwareports"], {
    timeout: 3000,
  });
  const blocks = hwOut.split(/\n\n+/);
  for (const block of blocks) {
    if (block.includes(iface)) {
      if (/iPhone|Cellular|Modem|Personal Hotspot/i.test(block)) return true;
    }
  }
  return false;
}

/**
 * Windows: query Get-NetConnectionProfile IsMetered property via PowerShell.
 * Available on Windows 10 1803+. On older versions or missing profiles the
 * command outputs nothing/false, and the outer catch degrades to fail-open.
 */
async function _winIsMetered() {
  const ps =
    "(Get-NetConnectionProfile | Select-Object -ExpandProperty IsMetered 2>$null) -contains 'Metered'";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", ps], {
    timeout: 5000,
  });
  return stdout.trim().toLowerCase() === "true";
}

module.exports = { isMeteredConnection };
