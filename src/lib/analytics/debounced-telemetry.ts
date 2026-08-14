import { trackUsageEvent, type UsageEventName, type UsageEventPropsMap } from "./usage-events";

const emitUsageEvent = trackUsageEvent as <K extends UsageEventName>(
  eventName: K,
  props: UsageEventPropsMap[K],
) => void;

export interface DebouncedTelemetry {
  schedule<K extends UsageEventName>(key: string, eventName: K, props: UsageEventPropsMap[K]): void;
  flush(): void;
  cancel(): void;
}

/**
 * Coalesces high-frequency, content-free telemetry such as sliders and colour
 * pickers. Each key owns one timer and only its latest approved enum props are
 * emitted.
 */
export function createDebouncedTelemetry(delayMs = 1_000): DebouncedTelemetry {
  type PendingEvent = {
    timer: ReturnType<typeof setTimeout>;
    send: () => void;
  };
  const pending = new Map<string, PendingEvent>();

  const send = (key: string): void => {
    const item = pending.get(key);
    if (!item) return;
    pending.delete(key);
    item.send();
  };

  return {
    schedule(eventKey, eventName, props) {
      const previous = pending.get(eventKey);
      if (previous) clearTimeout(previous.timer);
      const item: PendingEvent = {
        timer: setTimeout(() => send(eventKey), delayMs),
        send: () => emitUsageEvent(eventName, props),
      };
      pending.set(eventKey, item);
    },
    flush() {
      for (const key of [...pending.keys()]) {
        const item = pending.get(key);
        if (item) clearTimeout(item.timer);
        send(key);
      }
    },
    cancel() {
      for (const item of pending.values()) clearTimeout(item.timer);
      pending.clear();
    },
  };
}
