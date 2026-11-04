// @vitest-environment jsdom
import { useState } from "react";
import {
  MemoryRouter,
  Routes,
  Route,
  Link,
  useOutletContext
} from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  ProjectLayout,
  type ProjectContext
} from "../../../apps/web/src/components/system/project-layout.js";
import {
  ProjectRouteProvider,
  type ActiveProjectRoute
} from "../../../apps/web/src/components/system/project-route-context.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createProject, jsonResponse, requestUrl } from "./web-test-helpers.js";
const source = "10000000-0000-4000-8000-000000000001",
  target = "10000000-0000-4000-8000-000000000002";
function Selected(): JSX.Element {
  const { project } = useOutletContext<ProjectContext>();
  return <p data-testid="loaded-project">{project.name}</p>;
}
function Harness(): JSX.Element {
  const [activeProject, setActiveProject] = useState<ActiveProjectRoute | null>(null);
  return (
    <ProjectRouteProvider value={{ activeProject, setActiveProject }}>
      <MemoryRouter initialEntries={[`/projects/${source}`]}>
        <Link to={`/projects/${target}`}>Navigate B</Link>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<Selected />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ProjectRouteProvider>
  );
}
afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
it("finishes loading when the retained project request is rejected", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((request: RequestInfo | URL) => {
      const url = new URL(requestUrl(request), "http://localhost");
      if (url.searchParams.has("project_id")) return Promise.reject(new Error("request_failed"));
      return jsonResponse(200, { projects: [] });
    })
  );
  render(<Harness />);
  expect(await screen.findByText(/this project is not available/i)).toBeInTheDocument();
});
it("does not replace the current project with a late retained-view response", async () => {
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((request: RequestInfo | URL) => {
      const url = new URL(requestUrl(request), "http://localhost");
      if (url.searchParams.get("project_id") === source)
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return jsonResponse(200, {
        projects: [createProject({ project_id: target, name: "Canonical B" })]
      });
    })
  );
  render(<Harness />);
  await waitFor(() => expect(finish).toBeDefined());
  await userEvent.setup().click(screen.getByRole("link", { name: "Navigate B" }));
  expect(await screen.findByTestId("loaded-project")).toHaveTextContent("Canonical B");
  await act(async () => {
    finish!(
      jsonResponse(200, { projects: [createProject({ project_id: source, name: "Retained A" })] })
    );
  });
  expect(screen.getByTestId("loaded-project")).toHaveTextContent("Canonical B");
});
