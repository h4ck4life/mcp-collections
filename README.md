# MCP Collections
- Youtube
- Mermaid diagram
- Reddit

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
    }
  }
}
