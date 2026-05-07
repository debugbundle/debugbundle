import Fastify from "fastify";
import { debugbundle } from "@debugbundle/sdk-node";

debugbundle.init({
  projectToken: process.env.DEBUGBUNDLE_PROJECT_TOKEN,
  apiUrl: process.env.DEBUGBUNDLE_API_URL,
  environment: process.env.DEBUGBUNDLE_ENVIRONMENT ?? "development",
  service: process.env.DEBUGBUNDLE_SERVICE ?? "fastify-basic"
});

const app = Fastify({ logger: true });

await app.register(debugbundle.fastify());

app.get("/", async () => ({ ok: true, message: "Fastify example is running." }));

app.get("/boom", async () => {
  const error = new Error("Fastify example failure");
  await debugbundle.captureException(error, {
    tags: { example: "fastify-basic" }
  });
  throw error;
});

await app.listen({
  port: Number(process.env.PORT ?? 3006),
  host: "0.0.0.0"
});