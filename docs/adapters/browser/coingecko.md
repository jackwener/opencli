# CoinGecko

**Mode**: 🌐 Public · **Domain**: `coingecko.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli coingecko top` | Top cryptocurrencies by market cap |
| `opencli coingecko trending` | Trending coins |
| `opencli coingecko search` | Search for cryptocurrencies |
| `opencli coingecko coin` | Detailed info for a specific coin |

## Usage Examples

```bash
# Top 10 coins by market cap
opencli coingecko top --limit 10

# Top coins priced in EUR
opencli coingecko top --currency eur

# Trending coins
opencli coingecko trending

# Search for a coin
opencli coingecko search --query solana

# Detailed Bitcoin info (price, 24h/7d/30d change, ATH)
opencli coingecko coin --id bitcoin

# JSON output
opencli coingecko top --limit 5 -f json
```

## Prerequisites

None — all commands use the public CoinGecko API, no browser or login required.
