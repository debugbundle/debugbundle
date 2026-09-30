import { useNavigate } from "react-router-dom";

import { Tabs, TabsList, TabsTrigger } from "../ui/tabs.js";

export function ProjectAnalyticsFunnelModes({
  projectId,
  value
}: {
  projectId: string;
  value: "legacy" | "ordered";
}): JSX.Element {
  const navigate = useNavigate();
  return (
    <Tabs
      value={value}
      onValueChange={(next) =>
        void navigate(
          `/projects/${projectId}/analytics/funnels${next === "ordered" ? "/ordered" : ""}`
        )
      }
    >
      <TabsList aria-label="Funnel analysis type">
        <TabsTrigger value="legacy">Legacy step counts</TabsTrigger>
        <TabsTrigger value="ordered">Ordered funnels</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
