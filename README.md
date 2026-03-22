# vultiagent-cli

Agent-friendly Vultisig CLI with keyring auth. Enables AI agents to perform crypto operations (balance, send, swap) through Vultisig vaults without interactive prompts.

## Install

```bash
npm install -g vultiagent-cli
```

Requires Node.js >= 20.

## Quick Start

```bash
# 1. Authenticate (interactive, run once by human)
vasig auth --vault-file ~/path/to/vault.vult

# 2. Agent commands (non-interactive)
vasig balance --output json
vasig send --chain Ethereum --to 0xRecipient --amount 1.0 --yes --output json
vasig swap --from Ethereum --to Bitcoin --amount 1.0 --yes --output json
```

## Commands

### Authentication
- `vasig auth` — Set up vault credentials in system keyring
- `vasig auth status` — Show authenticated vaults
- `vasig auth logout` — Clear stored credentials

### Wallet
- `vasig balance` — Show vault balances
- `vasig addresses` — Show derived addresses

### Trading
- `vasig send` — Send tokens
- `vasig swap` — Execute a swap
- `vasig swap-quote` — Get a quote without executing
- `vasig swap-chains` — List supported swap chains

### Vault Management
- `vasig vaults` — List authenticated vaults
- `vasig vault-info` — Show active vault details

## Output Formats

All commands support `--output json` for structured JSON output:

```json
{ "ok": true, "data": { ... } }
```

Errors:
```json
{ "ok": false, "error": { "code": "AUTH_REQUIRED", "message": "...", "hint": "Run: vasig auth" } }
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Bad arguments / usage error |
| 2 | Authentication required |
| 3 | Network / server error |

## Environment Variables

For CI/testing, credentials can be provided via env vars:
- `VAULT_PASSWORD` — VultiServer password
- `VAULT_DECRYPT_PASSWORD` — Vault decryption password
