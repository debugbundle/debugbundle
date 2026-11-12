import { stdin, stdout } from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isInteractiveTerminal,
  promptForInteractiveLoginSelection
} from "../../../apps/cli/src/interactive-auth.js";

const readline = vi.hoisted(() => ({ question: vi.fn(), close: vi.fn() }));
vi.mock("node:readline/promises", () => ({ createInterface: () => readline }));

const stdinTty = Object.getOwnPropertyDescriptor(stdin, "isTTY");
const stdoutTty = Object.getOwnPropertyDescriptor(stdout, "isTTY");

describe("interactive CLI authentication", () => {
  beforeEach(() => {
    readline.question.mockReset();
    readline.close.mockReset();
    vi.spyOn(stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (stdinTty) Object.defineProperty(stdin, "isTTY", stdinTty);
    else Reflect.deleteProperty(stdin, "isTTY");
    if (stdoutTty) Object.defineProperty(stdout, "isTTY", stdoutTty);
    else Reflect.deleteProperty(stdout, "isTTY");
  });

  it.each([
    ["1", "github"],
    ["2", "github-device"],
    ["4", "cancel"]
  ])("returns selection %s and closes the prompt", async (selection, kind) => {
    readline.question.mockResolvedValueOnce(` ${selection} `);
    await expect(promptForInteractiveLoginSelection()).resolves.toEqual({ kind });
    expect(readline.close).toHaveBeenCalledOnce();
  });

  it("retries invalid selections and empty access tokens without printing credentials", async () => {
    readline.question
      .mockResolvedValueOnce("invalid")
      .mockResolvedValueOnce("3")
      .mockResolvedValueOnce("   ")
      .mockResolvedValueOnce("3")
      .mockResolvedValueOnce("  dbundle_mem_synthetic  ");

    await expect(promptForInteractiveLoginSelection()).resolves.toEqual({
      kind: "member-token",
      bearerToken: "dbundle_mem_synthetic"
    });
    expect(readline.question).toHaveBeenCalledWith("Paste your access token: ");
    const output = vi
      .mocked(stdout.write)
      .mock.calls.map(([text]) => text)
      .join("");
    expect(output).toContain("Existing access token");
    expect(output).toContain("Access token cannot be empty.");
    expect(output).toContain("Enter 1, 2, 3, or 4.");
    expect(output).not.toContain("dbundle_mem_synthetic");
    expect(readline.close).toHaveBeenCalledOnce();
  });

  it("closes the prompt when input fails", async () => {
    readline.question.mockRejectedValueOnce(new Error("input_closed"));
    await expect(promptForInteractiveLoginSelection()).rejects.toThrow("input_closed");
    expect(readline.close).toHaveBeenCalledOnce();
  });

  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false]
  ])("requires both terminal streams (%s, %s)", (input, output, expected) => {
    Object.defineProperty(stdin, "isTTY", { configurable: true, value: input });
    Object.defineProperty(stdout, "isTTY", { configurable: true, value: output });
    expect(isInteractiveTerminal()).toBe(expected);
  });
});
