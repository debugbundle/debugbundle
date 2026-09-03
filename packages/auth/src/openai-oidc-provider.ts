import Provider from "oidc-provider";

import { OPENAI_MCP_ISSUER } from "./openai-oauth-constants.js";
import {
  buildOpenAiOidcConfiguration,
  type OpenAiOidcConfigurationDependencies
} from "./openai-oidc-configuration.js";

export function createOpenAiOidcProvider(
  dependencies: OpenAiOidcConfigurationDependencies
): Provider {
  if (dependencies.cookieKeys.length < 2) {
    throw new Error("openai_oauth_cookie_key_rotation_required");
  }
  const provider = new Provider(
    OPENAI_MCP_ISSUER,
    buildOpenAiOidcConfiguration(dependencies) as unknown as Record<string, unknown>
  );
  provider.proxy = true;
  return provider;
}
