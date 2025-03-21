import { FastMCP } from "fastmcp";
import { z } from "zod";
import axios from "axios";

const server = new FastMCP({
  name: "Mermaid MCP",
  version: "1.0.0",
});

server.addTool({
  name: "generateMermaidDiagram",
  description: "Generate a diagram image from Mermaid syntax",
  parameters: z.object({
    diagram: z.string().describe("Mermaid diagram syntax"),
    theme: z
      .enum(["default", "forest", "dark", "neutral"])
      .optional()
      .default("default")
      .describe("Diagram theme"),
    backgroundColor: z
      .string()
      .optional()
      .describe("Background color (e.g., FF0000 or !white)"),
    width: z.number().optional().describe("Image width in pixels"),
    height: z.number().optional().describe("Image height in pixels"),
    scale: z
      .number()
      .min(1)
      .max(3)
      .optional()
      .describe("Image scale factor (1-3)"),
  }),
  execute: async (args, context) => {
    try {
      const base64Diagram = Buffer.from(args.diagram.trim()).toString("base64");

      const url = new URL(`https://mermaid.ink/img/${base64Diagram}`);
      url.searchParams.set("type", "png");

      if (args.theme) url.searchParams.set("theme", args.theme);
      if (args.backgroundColor)
        url.searchParams.set("bgColor", args.backgroundColor);
      if (args.width) url.searchParams.set("width", args.width.toString());
      if (args.height) url.searchParams.set("height", args.height.toString());
      if (args.scale && (args.width || args.height))
        url.searchParams.set("scale", args.scale.toString());

      const response = await axios.get(url.toString(), {
        responseType: "arraybuffer",
      });

      const imageData = Buffer.from(response.data).toString("base64");

      return {
        content: [
          {
            type: "image",
            data: imageData,
            mimeType: "image/png",
          },
        ],
      };
    } catch (error) {
      context.log.error(`Error: ${error.message}`);
      throw new Error(`Failed to generate diagram: ${error.message}`);
    }
  },
});

server.start({
  transportType: "stdio",
});
