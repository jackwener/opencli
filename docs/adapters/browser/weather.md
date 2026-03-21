# Weather (Open Meteo)

**Mode**: Public API + Browser · **Domain**: `api.open-meteo.com`

Free worldwide weather data powered by [Open Meteo](https://open-meteo.com). No API key required.

## Commands

| Command | Description |
|---------|-------------|
| `opencli weather current` | Current weather for a city |
| `opencli weather forecast` | 7-day daily forecast |
| `opencli weather hourly` | Hourly forecast (next 24h) |
| `opencli weather search` | Search for cities (geocoding) |
| `opencli weather air-quality` | Current air quality index |
| `opencli weather sunrise` | Sunrise/sunset times and UV index |
| `opencli weather wind` | Detailed wind forecast |
| `opencli weather precipitation` | Rain and snow forecast |
| `opencli weather compare` | Compare weather across cities |
| `opencli weather history` | Historical weather data |

## Usage Examples

```bash
# Current weather
opencli weather current Tokyo
opencli weather current "New York"
opencli weather current London -f json

# 7-day forecast
opencli weather forecast Paris
opencli weather forecast Berlin --days 14

# Hourly forecast
opencli weather hourly Sydney --hours 12

# Search for a city (no browser needed)
opencli weather search "San Francisco"
opencli weather search Mumbai --limit 10

# Air quality
opencli weather air-quality Beijing
opencli weather air-quality "Los Angeles"

# Sunrise and sunset times
opencli weather sunrise Tokyo --days 14

# Wind forecast
opencli weather wind Chicago --hours 48

# Precipitation forecast
opencli weather precipitation London --days 10

# Compare multiple cities
opencli weather compare "Tokyo,London,Paris,New York"

# Historical weather (past 30 days)
opencli weather history Berlin --days 30

# JSON output for scripting
opencli weather current Tokyo -f json
opencli weather forecast London -f json
```

## Notes

- The `search` command uses a simple fetch pipeline (no browser needed)
- All other commands use browser mode for the 2-step geocoding lookup (city name -> coordinates -> weather data)
- City names with spaces must be quoted: `"New York"`, `"San Francisco"`
- Temperature is in Celsius, wind in km/h, precipitation in mm
- Air quality uses US AQI scale (0-500)
- Historical data supports up to 92 past days
- Forecast supports up to 16 days ahead

## Prerequisites

- Chrome running with [Browser Bridge extension](/guide/browser-bridge) installed
- No API key or login required - Open Meteo is completely free
