# Solana Rent Inspector

Query a Solana RPC for the **current** rent-exempt minimum of any requested account data size. The result is shown in bytes, lamports, and exact nine-decimal SOL. This helps size program-owned accounts without relying on rent constants copied from an old validator or SDK.

## Install

Requires Node.js 20 or newer. There are no runtime dependencies.

```sh
npm install
npm run build
npm link
```

`npm link` exposes `solana-rent-inspector` locally. You can also run `node dist/src/cli.js` after building.

## Usage

```sh
solana-rent-inspector 12
solana-rent-inspector 148 256 4224
solana-rent-inspector --url https://api.devnet.solana.com 0 12 148
solana-rent-inspector --json --url https://api.devnet.solana.com 12 148
```

The default endpoint is the public Solana devnet RPC. Sizes must be nonnegative decimal integers. One invocation accepts up to 100 sizes and queries `getMinimumBalanceForRentExemption` with finalized commitment for each. The reported finalized slot is read before the rent queries; they are separate RPC reads, not one atomic snapshot.

Output shape (values shown only as an illustration):

```text
RPC URL: https://api.devnet.solana.com/
Genesis hash: <live genesis hash>
Finalized slot: <live finalized slot>
12 bytes: 1000000 lamports (0.001000000 SOL)
```

`--json` produces an object with `rpcUrl`, `genesisHash`, `finalizedSlot`, and a `results` array of `bytes`, `lamports`, and `sol` fields. Exit status is 0 on success and 2 on input or RPC error.

## Security model

The utility is read-only and needs no wallet or keypair. Never paste private keys into CLI arguments. Public RPC endpoints may rate-limit requests. Verify the cluster/genesis before relying on rent results, especially with custom URLs. Credential-bearing URL paths and query strings are redacted in output, but your RPC provider still receives the full URL. No rent amount is hardcoded.

## Development

```sh
npm run typecheck
npm test
npm run build
```

Tests mock JSON-RPC; no public network is required.

## License

MIT. See [LICENSE](LICENSE).
