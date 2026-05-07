import { vi, type Mock } from "vitest";

export type MockedMethods<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Result ? Mock<(...args: Args) => Result> : T[K];
};

export function mockFn<T extends (...args: never[]) => unknown>(): Mock<T> {
  return vi.fn<T>();
}

export function mockedObject<T>(value: unknown): MockedMethods<T> {
  return value as MockedMethods<T>;
}