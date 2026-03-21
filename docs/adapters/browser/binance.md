# Binance

**Mode**: :globe_with_meridians: Public API · **Domain**: `data-api.binance.vision`

## Commands

| Command | Description |
|---------|-------------|
| `opencli binance top` | Top trading pairs by 24h volume |
| `opencli binance price` | Quick price check for a trading pair |
| `opencli binance prices` | Latest prices for all trading pairs |
| `opencli binance ticker` | 24h ticker statistics for top pairs by volume |
| `opencli binance gainers` | Top gaining pairs by 24h price change |
| `opencli binance losers` | Top losing pairs by 24h price change |
| `opencli binance trades` | Recent trades for a trading pair |
| `opencli binance depth` | Order book bid prices for a trading pair |
| `opencli binance asks` | Order book ask prices for a trading pair |
| `opencli binance klines` | Candlestick/kline data for a trading pair |
| `opencli binance pairs` | List active trading pairs on Binance |

## Usage Examples

```bash
# Top trading pairs by volume
opencli binance top --limit 10

# Check price for a specific pair
opencli binance price --symbol BTCUSDT
opencli binance price --symbol ETHUSDT

# All prices
opencli binance prices --limit 30

# 24h ticker stats
opencli binance ticker --limit 10

# Top gainers and losers
opencli binance gainers --limit 5
opencli binance losers --limit 5

# Recent trades for BTC
opencli binance trades --symbol BTCUSDT --limit 10

# Order book bid and ask prices
opencli binance depth --symbol BTCUSDT --limit 5
opencli binance asks --symbol BTCUSDT --limit 5

# Daily candlestick data
opencli binance klines --symbol BTCUSDT --interval 1d --limit 7

# Hourly candles
opencli binance klines --symbol ETHUSDT --interval 1h --limit 24

# List trading pairs
opencli binance pairs --limit 10

# JSON output
opencli binance top --limit 5 -f json
```

## Notes

- All endpoints use Binance's public data API (no authentication required)
- Symbols are uppercase (e.g., BTCUSDT, ETHUSDT, BNBUSDT)
- Kline intervals: 1m, 5m, 15m, 1h, 4h, 1d, 1w, 1M
