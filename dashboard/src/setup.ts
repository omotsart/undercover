import { vi } from "vitest";

// jsdom has no layout, so these browser APIs get inert stand-ins. Tests that
// need a narrow screen stub matchMedia themselves.
globalThis.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList;

Element.prototype.scrollIntoView = vi.fn();
