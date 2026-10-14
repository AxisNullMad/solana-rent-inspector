#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RPC_URL, displayRpcUrl, parseRpcUrl, rpcRequest, safeUnsignedInteger } from "./rpc.js";

const usage = `Usage: solana-rent-inspector [--url <RPC_URL>] [--json] <BYTES> [BYTES...]

Examples:
  solana-rent-inspector 12
  solana-rent-inspector 148 256 4224
  solana-rent-inspector --url https://api.devnet.solana.com --json 12 148

Queries the current RPC rent-exemption minimum; no historical rent values are embedded.`;

export type Options = { url: URL; json: boolean; sizes: number[]; help: boolean };

export function parseArgs(args: string[]): Options {
  let url = DEFAULT_RPC_URL;
  let json = false;
  const sizes: number[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") return { url: parseRpcUrl(url), json, sizes, help: true };
    if (arg === "--json") { if (json) throw new Error("Duplicate --json"); json = true; continue; }
    if (arg === "--url") {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Missing --url value");
      url = args[++i];
      continue;
    }
    if (!/^(0|[1-9][0-9]*)$/.test(arg)) throw new Error(`Invalid account size: ${arg}`);
    const size = Number(arg);
    if (!Number.isSafeInteger(size)) throw new Error(`Account size exceeds safe integer range: ${arg}`);
    sizes.push(size);
  }
  if (sizes.length === 0) throw new Error("Provide at least one account size");
  if (sizes.length > 100) throw new Error("Limit one invocation to at most 100 account sizes");
  return { url: parseRpcUrl(url), json, sizes, help: false };
}

export function lamportsToSol(lamports: number): string {
  const value = BigInt(safeUnsignedInteger(lamports, "lamports"));
  return `${value / 1_000_000_000n}.${String(value % 1_000_000_000n).padStart(9, "0")}`;
}

export type RentReport = {
  rpcUrl: string;
  genesisHash: string;
  finalizedSlot: number;
  results: { bytes: number; lamports: number; sol: string }[];
};

export async function inspectRent(options: Options, fetcher: typeof fetch = fetch): Promise<RentReport> {
  const genesis = await rpcRequest(options.url, "getGenesisHash", [], fetcher);
  if (typeof genesis !== "string" || !genesis) throw new Error("Invalid genesis hash in RPC response");
  const slot = safeUnsignedInteger(
    await rpcRequest(options.url, "getSlot", [{ commitment: "finalized" }], fetcher),
    "finalized slot",
  );
  const results: RentReport["results"] = [];
  for (const bytes of options.sizes) {
    const lamports = safeUnsignedInteger(
      await rpcRequest(options.url, "getMinimumBalanceForRentExemption", [bytes, { commitment: "finalized" }], fetcher),
      "rent-exempt lamports",
    );
    results.push({ bytes, lamports, sol: lamportsToSol(lamports) });
  }
  return { rpcUrl: displayRpcUrl(options.url), genesisHash: genesis, finalizedSlot: slot, results };
}

type Io = { out: (line: string) => void; error: (line: string) => void };
export async function run(
  args: string[],
  io: Io = { out: console.log, error: console.error },
  fetcher: typeof fetch = fetch,
): Promise<number> {
  try {
    const options = parseArgs(args);
    if (options.help) { io.out(usage); return 0; }
    const report = await inspectRent(options, fetcher);
    if (options.json) io.out(JSON.stringify(report, null, 2));
    else {
      io.out(`RPC URL: ${report.rpcUrl}\nGenesis hash: ${report.genesisHash}\nFinalized slot: ${report.finalizedSlot}`);
      for (const row of report.results) io.out(`${row.bytes} bytes: ${row.lamports} lamports (${row.sol} SOL)`);
    }
    return 0;
  } catch (error) {
    io.error(`solana-rent-inspector: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await run(process.argv.slice(2));
}
