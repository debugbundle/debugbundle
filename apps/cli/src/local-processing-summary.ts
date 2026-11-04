export type ProcessSummary =
  | {
      status: "ok";
      processed: false;
      files_processed: number;
      events_processed: number;
      incidents_processed: number;
      services: Array<{ service: string; incidents: number }>;
      last_processed_event_file: string | null;
      message: string;
    }
  | {
      status: "ok";
      processed: true;
      files_processed: number;
      events_processed: number;
      incidents_processed: number;
      services: Array<{ service: string; incidents: number }>;
      last_processed_event_file: string;
      message?: undefined;
    };

function formatServiceSummary(services: Array<{ service: string; incidents: number }>): string[] {
  return services.map(
    ({ service, incidents }) => `- ${incidents} incident${incidents === 1 ? "" : "s"} in ${service}`
  );
}

export function formatProcessOutput(summary: ProcessSummary): string {
  if (!summary.processed) {
    return summary.message;
  }

  return [
    `Processed ${summary.events_processed} events from ${summary.files_processed} files into ${summary.incidents_processed} incidents.`,
    ...formatServiceSummary(summary.services),
    `Last processed event file: ${summary.last_processed_event_file}`
  ].join("\n");
}

export function buildNoNewEventsSummary(lastProcessedEventFile: string | null): ProcessSummary {
  return {
    status: "ok",
    processed: false,
    files_processed: 0,
    events_processed: 0,
    incidents_processed: 0,
    services: [],
    last_processed_event_file: lastProcessedEventFile,
    message: "No new events to process."
  };
}

export function buildProcessedSummary(input: {
  filesProcessed: number;
  eventsProcessed: number;
  incidentsProcessed: number;
  services: Array<{ service: string; incidents: number }>;
  lastProcessedEventFile: string;
}): ProcessSummary {
  return {
    status: "ok",
    processed: true,
    files_processed: input.filesProcessed,
    events_processed: input.eventsProcessed,
    incidents_processed: input.incidentsProcessed,
    services: input.services,
    last_processed_event_file: input.lastProcessedEventFile
  };
}
