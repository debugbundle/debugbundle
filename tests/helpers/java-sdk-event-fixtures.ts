export function createLegacyJavaBackendException(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema_version: "2026-03-01",
    event_id: "77777777-7777-4777-8777-777777777777",
    event_type: "backend_exception",
    sdk_name: "@debugbundle/sdk-java",
    sdk_version: "1.1.1",
    service: {
      name: "healthbrain-wildfly",
      environment: "staging",
      runtime: "java",
      framework: null
    },
    occurred_at: "2026-08-25T00:00:00.000Z",
    payload: {
      name: "IllegalStateException",
      message: "healthbrain request failed",
      stack: "java.lang.IllegalStateException: healthbrain request failed",
      handled: true,
      request: {
        method: "GET",
        path: "/patient",
        query: {},
        headers: {}
      },
      response: {
        status_code: 500
      },
      runtime: {
        version: "17.0.15",
        platform: "Linux",
        arch: "amd64",
        pid: 42,
        cwd: "/opt/jboss",
        uptime_sec: 120.5,
        hostname: "healthbrain-hcp-1",
        thread_id: 19,
        memory: {
          max_bytes: 1_073_741_824,
          total_bytes: 536_870_912,
          free_bytes: 134_217_728
        },
        framework_version: null,
        framework_extras: null,
        jvm_name: "OpenJDK 64-Bit Server VM"
      }
    },
    ...overrides
  };
}
