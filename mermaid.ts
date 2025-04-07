import { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

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
      .enum(["default", "forest", "dark", "neutral", "base"])
      .optional()
      .default("dark")
      .describe("Diagram theme (default, forest, dark, neutral, or base)"),
    backgroundColor: z
      .string()
      .optional()
      .default("#121212")
      .describe("Background color (e.g., #FF0000 or transparent)"),
    width: z
      .number()
      .optional()
      .default(2400)
      .describe("Image width in pixels"),
    height: z
      .number()
      .optional()
      .default(1600)
      .describe("Image height in pixels"),
    scale: z
      .number()
      .min(1)
      .max(5)
      .optional()
      .default(3)
      .describe("Image scale factor (1-5)"),
  }),
  execute: async (args, context) => {
    try {
      // Create temporary directory for input/output files
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mermaid-"));
      const inputFile = path.join(tempDir, "input.mmd");
      const outputFile = path.join(tempDir, "output.png");

      // Clean the diagram input - remove any instances of "::dark" syntax
      let cleanedDiagram = args.diagram.trim().replace(/::dark/g, "");

      // Write the cleaned diagram to input file
      await fs.writeFile(inputFile, cleanedDiagram);

      // Build the mmdc command with proper arguments
      const command = `npx mmdc -i "${inputFile}" -o "${outputFile}" -t ${args.theme} -b "${args.backgroundColor}" -w ${args.width} -H ${args.height} -s ${args.scale}`;

      // Log the command being executed
      context.log.info(`Executing command: ${command}`);

      // Execute the mmdc command
      const { stdout, stderr } = await execPromise(command);

      if (stderr && !stderr.includes("Puppeteer is downloading")) {
        context.log.warn(`Command stderr: ${stderr}`);
      }

      // Read the generated PNG file
      const pngBuffer = await fs.readFile(outputFile);
      const imageData = pngBuffer.toString("base64");

      // Clean up temporary files
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors
      });

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
      if (error.stderr) {
        context.log.error(`Error stderr: ${error.stderr}`);
      }
      throw new Error(`Failed to generate diagram: ${error.message}`);
    }
  },
});

server.start({
  transportType: "stdio",
});
