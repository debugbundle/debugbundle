import type { DetectedService } from "./setup-service-discovery.js";

/** Presentation of the qualified SDK APIs; setup never rewrites Rust source. */
export function rustSetupInstructions(services: DetectedService[], selected: string[]): string[] {
  return services
    .filter((service) => service.runtime === "Rust" && selected.includes(service.name))
    .flatMap((service) => {
      const feature =
        service.framework === "Axum"
          ? "axum, tracing"
          : service.framework === "Actix Web"
            ? "actix-web, tracing"
            : "tracing";
      const steps = [
        `Rust ${service.name}: add debugbundle = { version = "1.0.0", features = ${JSON.stringify(feature.split(", "))} } to Cargo.toml.`,
        `Initialise one Client::new(Config::from_env()) for ${service.name}; set DEBUGBUNDLE_SERVICE=${service.name} and keep DEBUGBUNDLE_PROJECT_TOKEN server-side. Config::local with the local feature selects local-only files.`,
        "Compose client.tracing_layer() into the existing tracing_subscriber pipeline. With the log feature, client.logger().tee(existing_sink) preserves the application's current sink."
      ];
      if (service.framework === "Axum")
        steps.push(
          "Instrument the Axum Router with .layer(debugbundle::axum::DebugBundleLayer::new(client.clone())); mount .merge(debugbundle::axum::browser_relay(relay)) when a browser relay is needed."
        );
      if (service.framework === "Actix Web")
        steps.push(
          "Instrument the Actix App with .wrap(debugbundle::actix_web::DebugBundleMiddleware::new(client.clone())); mount .service(debugbundle::actix_web::browser_relay(relay)) when a browser relay is needed."
        );
      if (["Axum", "Actix Web"].includes(service.framework))
        steps.push(
          "Create relay with debugbundle::relay::Relay::new(client.clone(), debugbundle::relay::RelayOptions::default()); configure allowed_origins for split hosts."
        );
      steps.push(
        "Capture a synthetic ExceptionSnapshot, perform a bounded client.flush_async timeout, then verify local files with debugbundle process or the selected cloud project through debugbundle verify cloud."
      );
      return steps;
    });
}
