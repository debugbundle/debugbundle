import express from "express";
import { debugbundle } from "@debugbundle/sdk-node";

debugbundle.init({
  projectToken: process.env.DEBUGBUNDLE_PROJECT_TOKEN,
  apiUrl: process.env.DEBUGBUNDLE_API_URL,
  environment: process.env.DEBUGBUNDLE_ENVIRONMENT ?? "development",
  service: process.env.DEBUGBUNDLE_SERVICE ?? "express-basic"
});

const app = express();

app.use(debugbundle.express());

app.get("/", (_request, response) => {
  response.json({ ok: true, message: "Express example is running." });
});

app.get("/boom", async (_request, _response) => {
  const error = new Error("Express example failure");
  await debugbundle.captureException(error, {
    tags: { example: "express-basic" }
  });
  throw error;
});

const port = Number(process.env.PORT ?? 3005);
app.listen(port, () => {
  console.log(`Express example listening on http://localhost:${port}`);
});