declare module "oidc-provider" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  export default class Provider {
    Grant: {
      new (input: { accountId: string; clientId: string }): {
        addOIDCScope(scope: string): void;
        addResourceScope(resource: string, scope: string): void;
        save(): Promise<string>;
      };
      find(id: string): Promise<
        | {
            addOIDCScope(scope: string): void;
            addResourceScope(resource: string, scope: string): void;
            save(): Promise<string>;
          }
        | undefined
      >;
    };
    constructor(issuer: string, configuration: Record<string, unknown>);
    callback(): (request: IncomingMessage, response: ServerResponse) => void;
    interactionDetails(
      request: IncomingMessage,
      response: ServerResponse
    ): Promise<Record<string, unknown>>;
    interactionFinished(
      request: IncomingMessage,
      response: ServerResponse,
      result: Record<string, unknown>,
      options?: { mergeWithLastSubmission?: boolean }
    ): Promise<void>;
    interactionResult(
      request: IncomingMessage,
      response: ServerResponse,
      result: Record<string, unknown>,
      options?: { mergeWithLastSubmission?: boolean }
    ): Promise<string>;
    proxy: boolean;
  }

  export const errors: {
    InvalidClientAuth: new (options?: unknown) => Error;
  };
}
