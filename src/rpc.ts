export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

export function parseRpcUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("RPC URL must be HTTP(S), without embedded credentials or a fragment");
  }
  return url;
}

export function displayRpcUrl(url: URL): string {
  const path = url.pathname === "/" ? "/" : "/<path-redacted>";
  return url.origin + path + (url.search ? "?<query-redacted>" : "");
}

export async function rpcRequest(
  url: URL,
  method: "getGenesisHash" | "getSlot" | "getMinimumBalanceForRentExemption",
  params: unknown[] = [],
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status} for ${method}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`Malformed RPC response for ${method}`);
  }
  const record = body as Record<string, unknown>;
  if (record.error !== undefined) {
    const error = record.error as { code?: unknown; message?: unknown };
    throw new Error(`RPC ${method} failed: ${String(error.code ?? "unknown")} ${String(error.message ?? "")}`.trim());
  }
  if (record.jsonrpc !== "2.0" || !Object.hasOwn(record, "result")) {
    throw new Error(`Malformed RPC response for ${method}`);
  }
  return record.result;
}

export function safeUnsignedInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${label} in RPC response`);
  }
  return value;
}
