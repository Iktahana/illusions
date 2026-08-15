import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export interface ProcessInfo {
  pid: number;
  ppid: number;
  command: string;
}

export interface ProcessTreeState {
  snapshot: ProcessInfo[];
  ownedProcesses: ProcessInfo[];
  trackedPids: number[];
  rootAlive: boolean;
}

export interface ProcessTreeTerminationResult {
  success: boolean;
  actions: string[];
  before: ProcessTreeState;
  after: ProcessTreeState;
}

interface ProcessTreeDependencies {
  platform?: NodeJS.Platform;
  listProcesses?: (platform?: NodeJS.Platform) => Promise<ProcessInfo[]>;
  sendSignal?: (pid: number, signal: NodeJS.Signals) => Promise<void>;
  taskkill?: (pid: number, force: boolean) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_POLL_INTERVAL_MS = 200;
const DEFAULT_SOFT_TIMEOUT_MS = 1_500;
const DEFAULT_FORCE_TIMEOUT_MS = 5_000;

function normalizeCommand(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseUnixProcessTable(stdout: string): ProcessInfo[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) return [];
      const pid = Number.parseInt(match[1], 10);
      const ppid = Number.parseInt(match[2], 10);
      if (!Number.isInteger(pid) || !Number.isInteger(ppid)) return [];
      return [{ pid, ppid, command: match[3].trim() }];
    });
}

export function parseWindowsProcessTable(stdout: string): ProcessInfo[] {
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout) as
    | {
        ProcessId?: unknown;
        ParentProcessId?: unknown;
        CommandLine?: unknown;
      }
    | Array<{
        ProcessId?: unknown;
        ParentProcessId?: unknown;
        CommandLine?: unknown;
      }>;
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records.flatMap((record) => {
    const pid = normalizePositiveInteger(record.ProcessId);
    const ppid = normalizePositiveInteger(record.ParentProcessId);
    if (pid == null || ppid == null) return [];
    return [{ pid, ppid, command: normalizeCommand(record.CommandLine) }];
  });
}

export async function listProcesses(
  platform: NodeJS.Platform = process.platform,
): Promise<ProcessInfo[]> {
  if (platform === "win32") {
    const { stdout } = await execFile("powershell", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
    ]);
    return parseWindowsProcessTable(stdout);
  }

  const { stdout } = await execFile("ps", ["-Ao", "pid=,ppid=,command="]);
  return parseUnixProcessTable(stdout);
}

export function collectTrackedProcesses(
  trackedPids: ReadonlySet<number>,
  processes: readonly ProcessInfo[],
): ProcessInfo[] {
  const owned = new Map<number, ProcessInfo>();
  const queue = [...trackedPids];
  const childrenByParent = new Map<number, ProcessInfo[]>();

  for (const processInfo of processes) {
    const siblings = childrenByParent.get(processInfo.ppid) ?? [];
    siblings.push(processInfo);
    childrenByParent.set(processInfo.ppid, siblings);
    if (trackedPids.has(processInfo.pid)) owned.set(processInfo.pid, processInfo);
  }

  const visited = new Set<number>(queue);
  while (queue.length > 0) {
    const parentPid = queue.shift();
    if (parentPid == null) continue;
    for (const child of childrenByParent.get(parentPid) ?? []) {
      if (!visited.has(child.pid)) {
        visited.add(child.pid);
        queue.push(child.pid);
      }
      owned.set(child.pid, child);
    }
  }

  return [...owned.values()].sort((left, right) => left.pid - right.pid);
}

export function collectDescendantProcesses(
  rootPid: number,
  processes: readonly ProcessInfo[],
): ProcessInfo[] {
  return collectTrackedProcesses(new Set([rootPid]), processes).filter(
    (processInfo) => processInfo.pid !== rootPid,
  );
}

function depthForPid(
  pid: number,
  processesByPid: ReadonlyMap<number, ProcessInfo>,
  memo = new Map<number, number>(),
): number {
  const cached = memo.get(pid);
  if (cached != null) return cached;
  const current = processesByPid.get(pid);
  if (!current) {
    memo.set(pid, 0);
    return 0;
  }
  const parent = processesByPid.get(current.ppid);
  const depth = parent ? depthForPid(parent.pid, processesByPid, memo) + 1 : 1;
  memo.set(pid, depth);
  return depth;
}

export function sortProcessesForTermination(
  processes: readonly ProcessInfo[],
  rootPid: number,
): ProcessInfo[] {
  const processesByPid = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));
  const memo = new Map<number, number>();
  return [...processes].sort((left, right) => {
    const depthDiff =
      depthForPid(right.pid, processesByPid, memo) - depthForPid(left.pid, processesByPid, memo);
    if (depthDiff !== 0) return depthDiff;
    if (left.pid === rootPid) return 1;
    if (right.pid === rootPid) return -1;
    return right.pid - left.pid;
  });
}

async function defaultSendSignal(pid: number, signal: NodeJS.Signals): Promise<void> {
  try {
    process.kill(pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return;
    throw error;
  }
}

async function defaultTaskkill(pid: number, force: boolean): Promise<void> {
  try {
    await execFile("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])]);
  } catch (error) {
    const stderr = (error as Error & { stderr?: string }).stderr ?? "";
    if (/not found|There is no running instance|指定されたプロセスはありません/i.test(stderr))
      return;
    throw error;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureProcessTreeState(
  rootPid: number,
  trackedPids: Set<number>,
  listProcessesImpl: NonNullable<ProcessTreeDependencies["listProcesses"]>,
  platform: NodeJS.Platform,
): Promise<ProcessTreeState> {
  const snapshot = await listProcessesImpl(platform);
  const currentDescendants = collectDescendantProcesses(rootPid, snapshot);
  for (const processInfo of currentDescendants) trackedPids.add(processInfo.pid);
  const ownedProcesses = collectTrackedProcesses(trackedPids, snapshot);
  for (const processInfo of ownedProcesses) trackedPids.add(processInfo.pid);
  return {
    snapshot,
    ownedProcesses,
    trackedPids: [...trackedPids].sort((left, right) => left - right),
    rootAlive: ownedProcesses.some((processInfo) => processInfo.pid === rootPid),
  };
}

async function waitForOwnedProcessesToExit(
  rootPid: number,
  trackedPids: Set<number>,
  listProcessesImpl: NonNullable<ProcessTreeDependencies["listProcesses"]>,
  sleepImpl: NonNullable<ProcessTreeDependencies["sleep"]>,
  platform: NodeJS.Platform,
  timeoutMs: number,
): Promise<ProcessTreeState> {
  const deadline = Date.now() + timeoutMs;
  let state = await captureProcessTreeState(rootPid, trackedPids, listProcessesImpl, platform);
  while (state.ownedProcesses.length > 0 && Date.now() < deadline) {
    await sleepImpl(DEFAULT_POLL_INTERVAL_MS);
    state = await captureProcessTreeState(rootPid, trackedPids, listProcessesImpl, platform);
  }
  return state;
}

export async function ensureOwnedProcessTreeExit(
  rootPid: number,
  {
    platform = process.platform,
    listProcesses: listProcessesImpl = listProcesses,
    sendSignal = defaultSendSignal,
    taskkill = defaultTaskkill,
    sleep = delay,
  }: ProcessTreeDependencies = {},
): Promise<ProcessTreeTerminationResult> {
  const actions: string[] = [];
  const trackedPids = new Set<number>([rootPid]);
  const before = await captureProcessTreeState(rootPid, trackedPids, listProcessesImpl, platform);
  if (before.ownedProcesses.length === 0) {
    return { success: true, actions, before, after: before };
  }

  let current = await waitForOwnedProcessesToExit(
    rootPid,
    trackedPids,
    listProcessesImpl,
    sleep,
    platform,
    DEFAULT_SOFT_TIMEOUT_MS,
  );
  if (current.ownedProcesses.length === 0) {
    return { success: true, actions, before, after: current };
  }

  if (platform === "win32") {
    for (const processInfo of current.ownedProcesses) {
      actions.push(`taskkill /PID ${processInfo.pid} /T`);
      await taskkill(processInfo.pid, false);
    }
  } else {
    for (const processInfo of sortProcessesForTermination(current.ownedProcesses, rootPid)) {
      actions.push(`kill -TERM ${processInfo.pid}`);
      await sendSignal(processInfo.pid, "SIGTERM");
    }
  }

  current = await waitForOwnedProcessesToExit(
    rootPid,
    trackedPids,
    listProcessesImpl,
    sleep,
    platform,
    DEFAULT_FORCE_TIMEOUT_MS,
  );
  if (current.ownedProcesses.length === 0) {
    return { success: true, actions, before, after: current };
  }

  if (platform === "win32") {
    for (const processInfo of current.ownedProcesses) {
      actions.push(`taskkill /PID ${processInfo.pid} /T /F`);
      await taskkill(processInfo.pid, true);
    }
  } else {
    for (const processInfo of sortProcessesForTermination(current.ownedProcesses, rootPid)) {
      actions.push(`kill -KILL ${processInfo.pid}`);
      await sendSignal(processInfo.pid, "SIGKILL");
    }
  }

  const after = await waitForOwnedProcessesToExit(
    rootPid,
    trackedPids,
    listProcessesImpl,
    sleep,
    platform,
    DEFAULT_FORCE_TIMEOUT_MS,
  );
  return {
    success: after.ownedProcesses.length === 0,
    actions,
    before,
    after,
  };
}

export function formatProcessTreeDiagnostics(result: ProcessTreeTerminationResult): string {
  const formatProcessInfo = (processInfo: ProcessInfo) =>
    `${processInfo.pid} <- ${processInfo.ppid}${processInfo.command ? ` ${processInfo.command}` : ""}`;
  return [
    `Tracked PIDs: ${result.after.trackedPids.join(", ") || "none"}`,
    `Actions: ${result.actions.join(" | ") || "none"}`,
    `Owned before: ${result.before.ownedProcesses.map(formatProcessInfo).join("\n") || "none"}`,
    `Owned after: ${result.after.ownedProcesses.map(formatProcessInfo).join("\n") || "none"}`,
  ].join("\n");
}
