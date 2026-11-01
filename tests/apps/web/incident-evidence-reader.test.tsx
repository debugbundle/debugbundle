// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, it } from "vitest";
import { IncidentEvidenceReader } from "../../../apps/web/src/components/system/incident-evidence-reader.js";
import bundle from "../../fixtures/build-bundle.deploy-metadata.golden.json" with { type: "json" };
import legacy from "../../fixtures/build-bundle.legacy.deploy-metadata.golden.json" with { type: "json" };
it("shows primary failure and capture/artifact age before optional details", () => {
  render(<IncidentEvidenceReader bundle={bundle} primaryDescription="Checkout failed" />);
  expect(screen.getByRole("heading", { name: "Checkout failed" })).toBeTruthy();
  expect(screen.getByText("Captured")).toBeTruthy();
  expect(screen.getByText("Artifact generated")).toBeTruthy();
  expect(screen.getByText("Recovery: unknown")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Show cause and trace details" })
      .getAttribute("aria-expanded")
  ).toBe("false");
});
it("provides keyboard-operable disclosure and honest missing trace/probe guidance", async () => {
  const user = userEvent.setup();
  render(<IncidentEvidenceReader bundle={bundle} primaryDescription="Failed" />);
  const disclosure = screen.getByRole("button", { name: "Show cause and trace details" });
  disclosure.focus();
  await user.keyboard("{Enter}");
  expect(
    screen
      .getByRole("button", { name: "Hide cause and trace details" })
      .getAttribute("aria-expanded")
  ).toBe("true");
  expect(screen.getByText("Trace origin: unavailable")).toBeTruthy();
  expect(screen.getByText(/No matching retained probe/)).toBeTruthy();
});
it("keeps a legacy artifact useful and labels missing coverage unknown", () => {
  render(<IncidentEvidenceReader bundle={legacy} primaryDescription="Legacy failure" />);
  expect(screen.getByText("Evidence: legacy")).toBeTruthy();
  expect(screen.getByText("Retained inputs: unknown")).toBeTruthy();
});
