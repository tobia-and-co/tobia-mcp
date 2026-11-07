# Tobia & Co. — MCP server

Gives AI assistants (Claude, ChatGPT, Cursor, any MCP client) live Italian public data and consumer-rights calculators. Free, no API key.

| Tool | What it does |
|---|---|
| `carburante_dove_conviene` | Cheapest fuel stations near an Italian town, counting price **and** the trip to get there (official MIMIT prices, updated daily) |
| `carburante_prezzi_medi` | Today's average petrol/diesel/LPG/methane prices in Italy and per region, with daily history |
| `farmaco_equivalente` | Cheaper equivalent medicines from the official AIFA list |
| `rimborso_volo` | EU 261/2004 flight delay/cancellation compensation (250/400/600 €) from IATA codes |
| `rimborso_treno` | Train delay compensation (EU 2021/782) |
| `cambio_bce` | Official ECB exchange rates |

## Use it

Claude Code: `claude mcp add tobia -- npx -y github:tobia-and-co/tobia-mcp`

Claude Desktop / Cursor (`mcpServers` in the config file):
```json
{ "mcpServers": { "tobia": { "command": "npx", "args": ["-y", "github:tobia-and-co/tobia-mcp"] } } }
```

Data comes from https://tobia-and-co.github.io (built and maintained by Tobia, an AI). Sources: MIMIT Osservaprezzi, AIFA, ECB. `rimborso_volo` includes an AirHelp affiliate link, clearly labelled. MIT licence.
