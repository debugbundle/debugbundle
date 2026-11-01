import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseStackFrames,
  selectUsefulFrame
} from "../../../packages/bundle-engine/src/stack-frames.js";
const corpus = JSON.parse(
  readFileSync(new URL("../../fixtures/evidence/stack-formats.json", import.meta.url), "utf8")
) as Array<{
  runtime: string;
  stack: string;
  file: string;
  line: number;
  column: number | null;
  function: string;
}>;
describe("bounded runtime stack locations", () => {
  it.each(corpus)("parses $runtime application locations without V8 assumptions", (sample) => {
    const result = parseStackFrames(sample.stack, sample.runtime);
    expect(selectUsefulFrame(result.frames)).toMatchObject({
      file: sample.file,
      line: sample.line,
      column: sample.column,
      function: sample.function
    });
    expect(result.status).toBe("parsed");
  });
  it("skips known capture/framework locations without claiming vendor ownership for minified code", () => {
    const stack =
      "Error: failed\n at capture (/srv/node_modules/@debugbundle/sdk-node/index.js:1:1)\n at dispatch (/srv/node_modules/framework/index.js:2:2)\n at run (/srv/app.js:12:3)";
    const result = parseStackFrames(stack, "node");
    expect(result.frames.map((frame) => frame.classification)).toEqual([
      "sdk",
      "framework",
      "application"
    ]);
    expect(selectUsefulFrame(result.frames)?.function).toBe("run");
    expect(
      parseStackFrames("a@https://cdn.example.test/x.min.js:1:2", "browser").frames[0]
        ?.classification
    ).toBe("unknown");
  });
  it("keeps unknown and partial formats honest, with bounded parsing work", () => {
    expect(parseStackFrames("Opaque native stack", "unknown")).toMatchObject({
      frames: [],
      status: "unparsed",
      truncated: false
    });
    expect(parseStackFrames("at invalid\n at run (/srv/app.js:12:3)", "node").status).toBe(
      "partial"
    );
    const large = parseStackFrames(
      Array.from({ length: 1000 }, (_, i) => `at run (/srv/app.js:${i + 1}:1)`).join("\n"),
      "node"
    );
    expect(large.frames).toHaveLength(32);
    expect(large.truncated).toBe(true);
    expect(parseStackFrames("x".repeat(1_000_000), "unknown").truncated).toBe(true);
  });
  it("does not invent coordinates for JVM or Apple native symbols", () => {
    expect(parseStackFrames("at example.Run.go(Native Method)", "jvm").frames[0]).toMatchObject({
      file: null,
      line: null,
      column: null
    });
    const native = parseStackFrames("0 Example 0x0000000100010000 example_run + 12", "swift");
    expect(native.frames[0]).toMatchObject({
      function: "example_run",
      file: null,
      line: null,
      column: null
    });
    expect(
      selectUsefulFrame(
        parseStackFrames("at capture (/srv/node_modules/@debugbundle/sdk-node/a.js:1:1)", "node")
          .frames
      )
    ).toBeNull();
  });
  it("sanitises full URL locations and retains coordinates without source lookup", () => {
    const frames = parseStackFrames(
      "run@https://user:secret@static.example.test/a.js?ordinary=secret:12:3",
      "browser"
    ).frames;
    expect(JSON.stringify(frames)).not.toContain("secret");
    expect(frames[0]).toMatchObject({
      file: "https://static.example.test/a.js",
      line: 12,
      column: 3
    });
  });
});
