# Barchart

**Mode**: 🌐 Public · **Domain**: `barchart.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli barchart quote` | Stock quote with price, volume, and key metrics |
| `opencli barchart options` | Options chain with greeks, IV, volume, and open interest |
| `opencli barchart greeks` | Options greeks overview (IV, delta, gamma, theta, vega) |
| `opencli barchart flow` | Unusual options activity / options flow |

## Usage Examples

```bash
# Get stock quote
opencli barchart quote --symbol AAPL

# View options chain
opencli barchart options --symbol TSLA

# Options greeks overview
opencli barchart greeks --symbol NVDA

# Unusual options flow
opencli barchart flow --limit 20 -f json
```

## Prerequisites

- No browser required — uses public API
