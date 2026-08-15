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
    const selection = { eq: vi.fn(() => false) };
    const currentDoc = {};
    const previousDoc = { eq: vi.fn(() => false) };
    pluginView!.update!(
      { state: { doc: currentDoc, selection } } as never,
      { doc: previousDoc, selection } as never,
    );
    expect(interaction.update).toHaveBeenCalledTimes(2);
    expect(interaction.update).toHaveBeenLastCalledWith({ docChanged: true });
    expect(interaction.refreshGeometry).toHaveBeenCalledTimes(2);
    pluginView!.destroy!();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(interaction.detach).toHaveBeenCalledOnce();
  });

  it("does not publish a no-op plugin view update", () => {
    const interaction = {
      update: vi.fn(),
      refreshGeometry: vi.fn(),
      detach: vi.fn(),
      setComposing: vi.fn(),
    };
    const plugin = createSelectionBridgePlugin(interaction as never);
    const doc = {};
    const selection = { eq: vi.fn(() => true) };
    const pluginView = plugin.spec.view?.({
      dom: document.createElement("div"),
      state: { doc, selection },
    } as never);

    pluginView!.update!({ state: { doc, selection } } as never, { doc, selection } as never);

    expect(interaction.update).not.toHaveBeenCalled();
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
    expect(interaction.refreshGeometry).toHaveBeenCalledTimes(2);
    expect(interaction.update).not.toHaveBeenCalled();
    expect(interaction.setComposing).toHaveBeenNthCalledWith(1, true);
    expect(interaction.setComposing).toHaveBeenNthCalledWith(2, false);
  });
});
