/**
 * Simple async mutex to serialize async read-modify-write operations.
 * Prevents TOCTOU race conditions when multiple callers run concurrently.
 *
 * 非同期の読み書き操作を直列化するシンプルな非同期ミューテックス。
 * 複数の呼び出しが同時に実行される際のTOCTOUレースコンディションを防止する。
 */
export class AsyncMutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}
