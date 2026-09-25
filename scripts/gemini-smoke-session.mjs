import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// Pinned Gemini's own fake-response mode drives its real tool scheduler/client.
// Only these fixture calls execute; no model API or Google credential is used.
export async function callGeminiTools(run, scratch, calls) {
  const response = (parts) => ({
    candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }]
  });
  const recordings = calls.map(({ name, args }) => ({
    method: "generateContentStream",
    response: [response([{ functionCall: { name, args } }])]
  }));
  recordings.push({
    method: "generateContentStream",
    response: [response([{ text: "Synthetic check complete." }])]
  });
  // Auxiliary token counting/title generation varies across client releases.
  for (let index = 0; index < 20; index++) {
    recordings.push({ method: "countTokens", response: { totalTokens: 100 } });
    recordings.push({
      method: "generateContent",
      response: response([{ text: "Synthetic check." }])
    });
  }
  const path = join(scratch, "gemini-responses.jsonl");
  await writeFile(path, recordings.map((recording) => JSON.stringify(recording)).join("\n"));
  const output = await run(
    "--fake-responses-non-strict",
    path,
    "--model",
    "gemini-2.5-flash",
    "--prompt",
    "Run the supplied synthetic tool checks.",
    "--output-format",
    "stream-json",
    "--approval-mode",
    "yolo"
  );
  const events = output
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('{"type":'))
    .map((line) => JSON.parse(line));
  const used = events.filter((event) => event.type === "tool_use");
  const results = events.filter((event) => event.type === "tool_result");
  assert.equal(used.length, calls.length, output);
  assert.equal(results.length, calls.length, output);
  const final = events.find((event) => event.type === "result");
  assert.equal(final?.status, "success", output);
  assert.equal(final.stats.total_tokens, 0, "The smoke must use only recorded responses");
  return calls.map((call, index) => {
    assert.equal(used[index].tool_name, call.name, output);
    return results.find((result) => result.tool_id === used[index].tool_id);
  });
}
