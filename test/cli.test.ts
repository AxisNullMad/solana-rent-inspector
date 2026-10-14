import assert from "node:assert/strict";
import { test } from "node:test";
import { lamportsToSol, parseArgs, run } from "../src/cli.js";
import { displayRpcUrl, parseRpcUrl } from "../src/rpc.js";

function mockRpc(results: Record<string, unknown>): typeof fetch {
  return (async (_url: URL | RequestInfo, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
    const key = request.method === "getMinimumBalanceForRentExemption"
      ? `${request.method}:${request.params[0]}` : request.method;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: results[key] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("parses multiple sizes and validates decimal nonnegative integers", () => {
  const options = parseArgs(["--url", "https://example.com", "--json", "0", "12", "148"]);
  assert.deepEqual(options.sizes, [0, 12, 148]);
  assert.equal(options.json, true);
  assert.throws(() => parseArgs(["-1"]));
  assert.throws(() => parseArgs(["1e3"]));
  assert.throws(() => parseArgs(["9007199254740992"]));
  assert.throws(() => parseArgs([]));
});

test("formats lamports as exact nine-decimal SOL and redacts RPC credentials", () => {
  assert.equal(lamportsToSol(1), "0.000000001");
  assert.equal(lamportsToSol(1_234_567_890), "1.234567890");
  assert.equal(displayRpcUrl(parseRpcUrl("https://example.com/secret-route?token=hidden")), "https://example.com/<path-redacted>?<query-redacted>");
  assert.throws(() => parseRpcUrl("https://user:pass@example.com"));
});

test("mocked RPC returns multiple sizes and valid JSON output", async () => {
  const output: string[] = [], errors: string[] = [];
  const status = await run(
    ["--json", "12", "148"],
    { out: x => output.push(x), error: x => errors.push(x) },
    mockRpc({ getGenesisHash: "sample-genesis", getSlot: 123, "getMinimumBalanceForRentExemption:12": 1_000_000, "getMinimumBalanceForRentExemption:148": 2_345_678 }),
  );
  assert.equal(status, 0);
  assert.deepEqual(errors, []);
  const report = JSON.parse(output[0]) as { finalizedSlot: number; results: unknown[] };
  assert.equal(report.finalizedSlot, 123);
  assert.deepEqual(report.results, [
    { bytes: 12, lamports: 1_000_000, sol: "0.001000000" },
    { bytes: 148, lamports: 2_345_678, sol: "0.002345678" },
  ]);
});

test("RPC errors and malformed responses fail closed", async () => {
  const output: string[] = [], errors: string[] = [];
  const failed = await run(["12"], { out: x => output.push(x), error: x => errors.push(x) }, (async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "unavailable" } }), { status: 200 })) as typeof fetch);
  assert.equal(failed, 2);
  assert.match(errors[0], /RPC getGenesisHash failed/);
  errors.length = 0;
  const malformed = await run(["12"], { out: x => output.push(x), error: x => errors.push(x) }, (async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1 }), { status: 200 })) as typeof fetch);
  assert.equal(malformed, 2);
  assert.match(errors[0], /Malformed RPC response/);
});
