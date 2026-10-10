import type { AvailabilityCheckRecord, ProjectRecord } from "../lib/api.js";
import type {
  HealthStatusCheckSummary as CheckSummary,
  HealthStatusProjectSummary as ProjectSummary,
  ProjectHealthStatusInput as ProjectInput
} from "../../../../packages/shared-types/src/availability-health.js";
export * from "../../../../packages/shared-types/src/availability-health.js";
export type HealthStatusCheckSummary = CheckSummary<AvailabilityCheckRecord>;
export type HealthStatusProjectSummary = ProjectSummary<ProjectRecord, AvailabilityCheckRecord>;
export type ProjectHealthStatusInput = ProjectInput<ProjectRecord, AvailabilityCheckRecord>;
