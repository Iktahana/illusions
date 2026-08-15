import { describe, expect, it, vi } from "vitest";

import {
  collectDescendantProcesses,
  collectTrackedProcesses,
  ensureOwnedProcessTreeExit,
  formatProcessTreeDiagnostics,
  parseUnixProcessTable,
  parseWindowsProcessTable,
  sortProcessesForTermination,
  type ProcessInfo,
} from "../e2e/fixtures/process-tree";

describe("E2E process tree helpers", () => {
  it("parses unix ps output and windows JSON output", () => {
    expect(
      parseUnixProcessTable(" 101 1 /usr/bin/electron\n 102 101 Electron Helper\nbroken line"),
    ).toEqual([
      { pid: 101, ppid: 1, command: "/usr/bin/electron" },
      { pid: 102, ppid: 101, command: "Electron Helper" },
    ]);

    expect(
      parseWindowsProcessTable(
        '[{"ProcessId":201,"ParentProcessId":1,"CommandLine":"electron.exe"},{"ProcessId":"202","ParentProcessId":"201","CommandLine":"helper.exe"}]',
      ),
    ).toEqual([
      { pid: 201, ppid: 1, command: "electron.exe" },
      { pid: 202, ppid: 201, command: "helper.exe" },
    ]);
  });

  it("tracks descendants, orphaned owned children, and kill order without touching unrelated Electron", () => {
    const processes: ProcessInfo[] = [
      { pid: 10, ppid: 1, command: "Electron root" },
      { pid: 11, ppid: 10, command: "Electron Helper" },
      { pid: 12, ppid: 11, command: "renderer" },
      { pid: 13, ppid: 1, command: "other Electron" },
      { pid: 14, ppid: 11, command: "utility" },
    ];

    expect(collectDescendantProcesses(10, processes).map((processInfo) => processInfo.pid)).toEqual(
      [11, 12, 14],
    );

    expect(
      collectTrackedProcesses(new Set([11]), [
        { pid: 11, ppid: 1, command: "orphaned helper" },
        { pid: 15, ppid: 11, command: "new descendant" },
        { pid: 16, ppid: 1, command: "unrelated" },
      ]).map((processInfo) => processInfo.pid),
    ).toEqual([11, 15]);

    expect(
      sortProcessesForTermination(
        processes.filter((processInfo) => processInfo.pid !== 13),
        10,
      ).map((processInfo) => processInfo.pid),
    ).toEqual([14, 12, 11, 10]);
  });

  it("force-cleans only the owned process tree and reports leftovers", async () => {
    const softSignals: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    const hardSignals: Array<{ pid: number; force: boolean }> = [];
    let now = 0;
    const listProcesses = vi.fn(async () => {
      if (softSignals.some((entry) => entry.signal === "SIGKILL")) {
        return [{ pid: 90, ppid: 1, command: "other Electron" }];
      }
      if (softSignals.some((entry) => entry.signal === "SIGTERM")) {
        return [
          { pid: 11, ppid: 1, command: "orphan helper" },
          { pid: 12, ppid: 11, command: "renderer" },
          { pid: 90, ppid: 1, command: "other Electron" },
        ];
      }
      return [
        { pid: 10, ppid: 1, command: "Electron root" },
        { pid: 11, ppid: 10, command: "helper" },
        { pid: 12, ppid: 11, command: "renderer" },
        { pid: 90, ppid: 1, command: "other Electron" },
      ];
    });
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    const result = await ensureOwnedProcessTreeExit(10, {
      platform: "linux",
      listProcesses,
      sendSignal: async (pid, signal) => {
        softSignals.push({ pid, signal });
      },
      taskkill: async (pid, force) => {
        hardSignals.push({ pid, force });
      },
      sleep: async (ms) => {
        now += ms;
      },
    });
    nowSpy.mockRestore();

    expect(result.success).toBe(true);
    expect(softSignals).toEqual([
      { pid: 12, signal: "SIGTERM" },
      { pid: 11, signal: "SIGTERM" },
      { pid: 10, signal: "SIGTERM" },
      { pid: 12, signal: "SIGKILL" },
      { pid: 11, signal: "SIGKILL" },
    ]);
    expect(hardSignals).toEqual([]);
    expect(result.after.ownedProcesses).toEqual([]);
    expect(formatProcessTreeDiagnostics(result)).toContain("Tracked PIDs: 10, 11, 12");
    expect(formatProcessTreeDiagnostics(result)).not.toContain("90 <- 1 other Electron");
  });
});
