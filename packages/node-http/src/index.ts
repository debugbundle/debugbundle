import { fetch as undiciFetch } from "undici";

// Use the fetch implementation paired with our pinned dispatcher. Mixing Node's
// built-in fetch with an imported Undici dispatcher can lose HTTP/2 response
// headers on Node 26.0.0 and leave compressed bytes undecoded.
// The cast bridges Undici's Node-specific DOM types; callers use standard fetch.
export const nodeFetch = undiciFetch as unknown as typeof globalThis.fetch;
