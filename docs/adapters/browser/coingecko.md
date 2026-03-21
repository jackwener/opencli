# CoinGecko

**Mode**: 🌐 Public · **Domain**: `coingecko.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli coingecko top` | Top cryptocurrencies by market cap |
| `opencli coingecko trending` | Trending coins |
| `opencli coingecko search` | Search for cryptocurrencies |
| `opencli coingecko coin` | Detailed info for a specific coin |
| `opencli coingecko price` | Quick price check for multiple coins |
| `opencli coingecko global` | Global market overview (top 10) |
| `opencli coingecko categories` | Coin categories ranked by market cap |
| `opencli coingecko exchanges` | Top exchanges by trading volume |
| `opencli coingecko gainers` | Top gainers by 24h price change |
| `opencli coingecko losers` | Top losers by 24h price change |

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

# Quick price check for multiple coins
opencli coingecko price --ids "bitcoin,ethereum,solana"

# Global market overview
opencli coingecko global

# Coin categories (DeFi, Layer 1, etc.)
opencli coingecko categories --limit 10

# Top exchanges
opencli coingecko exchanges --limit 10

# Top gainers and losers
opencli coingecko gainers --limit 10
opencli coingecko losers --limit 10

# JSON output
opencli coingecko top --limit 5 -f json
```

## Prerequisites

None — all commands use the public CoinGecko API, no browser or login required.
