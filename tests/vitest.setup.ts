import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom-only stubs for browser component tests (sidebar, tooltip, etc.)
if (typeof window !== "undefined") {
	// jsdom does not implement matchMedia
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}),
	});

	if (typeof window.localStorage === "undefined") {
		const store = new Map<string, string>();
		Object.defineProperty(window, "localStorage", {
			writable: true,
			value: {
				getItem: (key: string) => store.get(key) ?? null,
				setItem: (key: string, value: string) => {
					store.set(key, value);
				},
				removeItem: (key: string) => {
					store.delete(key);
				},
				clear: () => {
					store.clear();
				},
				key: (index: number) => [...store.keys()][index] ?? null,
				get length() {
					return store.size;
				},
			},
		});
	}
}

// jsdom does not implement ResizeObserver; stub it for Radix UI primitives
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class ResizeObserver {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
}

if (typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.scrollIntoView !== "function") {
	HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(() => {
	cleanup();
});
