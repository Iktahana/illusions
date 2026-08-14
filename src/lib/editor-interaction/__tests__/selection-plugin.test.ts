import { describe, expect, it, vi } from "vitest";
import { createSelectionBridgePlugin } from "../selection-plugin";

describe("selection bridge plugin", () => {
  it("tracks editor and geometry events and removes every listener", () => {
    const interaction = {
      update: vi.fn(),
      refreshGeometry: vi.fn(),
      detach: vi.fn(),
      setComposing: vi.fn(),
    };
    const plugin = createSelectionBridgePlugin(interaction as never);
    const dom = document.createElement("div");
    const remove = vi.spyOn(dom, "removeEventListener");
    const pluginView = plugin.spec.view?.({ dom } as never);
    dom.dispatchEvent(new Event("pointerup"));
    dom.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    pluginView!.update!({} as never, {} as never);
    expect(interaction.update).toHaveBeenCalledTimes(2);
    expect(interaction.refreshGeometry).toHaveBeenCalledTimes(2);
    pluginView!.destroy!();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(interaction.detach).toHaveBeenCalledOnce();
  });

  it("forwards focus, blur and composition lifecycle", () => {
    const interaction = {
      update: vi.fn(),
      refreshGeometry: vi.fn(),
      detach: vi.fn(),
      setComposing: vi.fn(),
    };
    const plugin = createSelectionBridgePlugin(interaction as never);
    const handlers = plugin.spec.props!.handleDOMEvents!;
    expect(handlers.focus!.call(plugin, {} as never, {} as never)).toBe(false);
    expect(handlers.blur!.call(plugin, {} as never, {} as never)).toBe(false);
    expect(handlers.compositionstart!.call(plugin, {} as never, {} as never)).toBe(false);
    expect(handlers.compositionend!.call(plugin, {} as never, {} as never)).toBe(false);
    expect(interaction.update).toHaveBeenCalledTimes(2);
    expect(interaction.setComposing).toHaveBeenNthCalledWith(1, true);
    expect(interaction.setComposing).toHaveBeenNthCalledWith(2, false);
  });
});
