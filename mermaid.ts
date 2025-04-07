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
      .default("default")
      .describe("Diagram theme (default, forest, dark, neutral, or base)"),
    themeVariables: z
      .record(z.union([z.string(), z.boolean(), z.number()]))
      .optional()
      .describe(
        "Theme variables for customization (e.g., primaryColor, lineColor)"
      ),
    backgroundColor: z
      .string()
      .optional()
      .describe("Background color (e.g., #FF0000 or transparent)"),
    width: z.number().optional().describe("Image width in pixels"),
    height: z.number().optional().describe("Image height in pixels"),
    scale: z
      .number()
      .min(1)
      .max(5)
      .optional()
      .describe("Image scale factor (1-5)"),
    darkMode: z
      .boolean()
      .optional()
      .describe("Enable dark mode for the diagram"),
  }),
  execute: async (args, context) => {
    try {
      // Create temporary directory for input/output files
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mermaid-"));
      const inputFile = path.join(tempDir, "input.mmd");
      const cssFile = path.join(tempDir, "custom.css");
      const outputFile = path.join(tempDir, "output.png");

      // Determine background color - use a dark gray by default for dark mode
      const backgroundColor = args.backgroundColor || "#121212"; // Very dark gray background

      // Clean the diagram input - remove any instances of "::dark" syntax
      let cleanedDiagram = args.diagram.trim();
      cleanedDiagram = cleanedDiagram.replace(/::dark/g, "");

      // Write the cleaned diagram to input file
      await fs.writeFile(inputFile, cleanedDiagram);

      // Create a custom CSS file to override styles while preserving diagram structure
      const customCSS = `
        /* Base styles for dark theme with good contrast */
        .label {
          color: white !important;
          font-weight: 500 !important;
        }
        .node rect, .node circle, .node ellipse, .node polygon, .node path {
          stroke-width: 2px !important;
        }
        .node.default rect, .node.default circle, .node.default ellipse {
          fill: #333333 !important;
          stroke: #BBBBBB !important;
        }
        .edge {
          stroke: #CCCCCC !important;
          stroke-width: 1.5px !important;
        }
        .edgeLabel {
          color: white !important;
          background-color: rgba(18, 18, 18, 0.7) !important;
        }
        .cluster rect, .cluster polygon {
          fill: #2D2D2D !important;
          stroke: #666666 !important;
        }
        /* Ensure text is always readable regardless of node color */
        .node text {
          fill: white !important;
          stroke: none !important;
          font-size: 14px !important;
        }
        /* Add a slight gradient/shadow to improve readability */
        .node rect, .node circle, .node ellipse, .node polygon {
          filter: drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.4)) !important;
        }
        /* Make main node stand out */
        #flowchart-main text, #mindmap-root text {
          font-weight: bold !important;
          font-size: 16px !important;
          fill: white !important;
        }
        /* Better colors for green nodes while preserving structure */
        .node.green rect, .node.green circle, .node.green ellipse {
          fill: #2E7D32 !important;
          stroke: #81C784 !important;
        }
        
        /* Different colors for different levels of mindmap connections */
        .mindmap-level1 .edge {
          stroke: #FF5252 !important; /* Red */
        }
        .mindmap-level2 .edge {
          stroke: #4CAF50 !important; /* Green */
        }
        .mindmap-level3 .edge {
          stroke: #2196F3 !important; /* Blue */
        }
        .mindmap-level4 .edge {
          stroke: #FFC107 !important; /* Amber */
        }
        .mindmap-level5 .edge {
          stroke: #9C27B0 !important; /* Purple */
        }
        
        /* Different colors for flowchart links based on their types */
        .flowchart-link.stroke1 {
          stroke: #FF5252 !important; /* Red */
        }
        .flowchart-link.stroke2 {
          stroke: #4CAF50 !important; /* Green */
        }
        .flowchart-link.stroke3 {
          stroke: #2196F3 !important; /* Blue */
        }
        
        /* For class diagrams */
        .relation.stroke1 {
          stroke: #FF5252 !important; /* Red */
        }
        .relation.stroke2 {
          stroke: #4CAF50 !important; /* Green */
        }
        .relation.stroke3 {
          stroke: #2196F3 !important; /* Blue */
        }
        
        /* Make arrowheads match their line colors */
        .arrowheadPath {
          fill: inherit !important;
          stroke: inherit !important;
        }
      `;

      // Write CSS to file
      await fs.writeFile(cssFile, customCSS);

      // Set dimensions and scale factor
      const width = args.width || 2400;
      const height = args.height || 1600;
      const scale = args.scale || 3;

      // Build the mmdc command with proper arguments
      let command = `npx mmdc -i "${inputFile}" -o "${outputFile}" -t dark -b "${backgroundColor}" -w ${width} -H ${height} -s ${scale} --cssFile "${cssFile}"`;

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
