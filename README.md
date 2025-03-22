# MCP Collections
- Youtube
- Mermaid diagram
- Reddit
- Fetch web (headless browser - Please install `npx playwright install --with-deps`)

## Installation

Run the following command to install dependencies:

```bash
npm install
```

## Configuration for Claude

Below is an example configuration for Claude:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "npx",
      "args": ["tsx", "/Volumes/TRANSCEND/dev/mcp-collections/youtube.ts"],
      "env": {
        "YOUTUBE_API_KEY": "your-youtube-api-key"
      }
    },
    "mermaidjsdiagram": {
      "command": "npx",
      "args": ["tsx", "/Volumes/TRANSCEND/dev/mcp-collections/mermaid.ts"]
    },
    "reddit": {
      "command": "npx",
      "args": ["tsx", "/Volumes/TRANSCEND/dev/mcp-collections/reddit.ts"]
    },
    "fetch": {
      "command": "npx",
      "args": ["tsx", "/Volumes/TRANSCEND/dev/mcp-collections/fetch.ts"]
    }
  }
}
