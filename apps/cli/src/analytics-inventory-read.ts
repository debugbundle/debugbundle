interface InventoryResponse {
  status: number;
  body: unknown;
}

/** Read-only totals are optional; a strict older server can still serve the inventory. */
export async function readAnalyticsInventoryPage(
  client: {
    request(input: {
      method: "GET";
      path: string;
      bearerToken: string;
    }): Promise<InventoryResponse>;
  },
  input: { path: string; params: URLSearchParams; bearerToken: string }
): Promise<InventoryResponse> {
  const params = new URLSearchParams(input.params);
  const includeCount = !params.has("cursor");
  if (includeCount) params.set("include_total_count", "true");
  const read = (): Promise<InventoryResponse> =>
    client.request({
      method: "GET",
      path: `${input.path}?${params.toString()}`,
      bearerToken: input.bearerToken
    });
  const response = await read();
  if (
    includeCount &&
    response.status === 400 &&
    typeof response.body === "object" &&
    response.body !== null &&
    "error" in response.body &&
    response.body.error === "invalid_query"
  ) {
    params.delete("include_total_count");
    return read();
  }
  return response;
}
