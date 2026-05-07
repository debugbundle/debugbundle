import { debugbundle } from "@debugbundle/sdk-node";

debugbundle.init({
  projectToken: process.env.DEBUGBUNDLE_PROJECT_TOKEN,
  apiUrl: process.env.DEBUGBUNDLE_API_URL,
  environment: process.env.DEBUGBUNDLE_ENVIRONMENT ?? "development",
  service: process.env.DEBUGBUNDLE_SERVICE ?? "nextjs-basic"
});

export { debugbundle };