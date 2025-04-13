import { FastMCP, UserError } from "fastmcp";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);
const accessAsync = promisify(fs.access);

// Create an MCP server
const server = new FastMCP({
  name: "RipgrepMCP",
  version: "1.0.0",
});

// Check if ripgrep is installed
server.addTool({
  name: "check-ripgrep",
  description: "Check if ripgrep is installed on your system",
  parameters: z.object({}),
  execute: async () => {
    try {
      const { stdout } = await execAsync("rg --version");
      return `Ripgrep is installed: ${stdout.split("\n")[0]}`;
    } catch (error) {
      throw new UserError(
        "Ripgrep is not installed. Please install it using package manager (brew, choco, scoop) or download from GitHub."
      );
    }
  },
});

// Basic search with common options
server.addTool({
  name: "search",
  description: "Search file contents using ripgrep",
  parameters: z.object({
    pattern: z.string().describe("The pattern to search for"),
    directory: z.string().describe("Directory to search in"),
    ignoreCase: z.boolean().optional().describe("Case insensitive search (-i)"),
    smartCase: z
      .boolean()
      .optional()
      .describe(
        "Smart case search - case insensitive unless pattern contains uppercase (-S)"
      ),
    wordMatch: z.boolean().optional().describe("Only match whole words (-w)"),
    fixedStrings: z
      .boolean()
      .optional()
      .describe("Treat pattern as literal string, not regex (-F)"),
    context: z
      .number()
      .optional()
      .describe("Show N lines before and after each match (-C)"),
    count: z
      .boolean()
      .optional()
      .describe("Only show count of matching lines (-c)"),
    maxColumns: z
      .number()
      .optional()
      .describe("Don't print lines longer than this limit (-M)"),
    hidden: z
      .boolean()
      .optional()
      .describe("Search hidden files and directories (-.)"),
    followLinks: z.boolean().optional().describe("Follow symbolic links (-L)"),
    multiline: z
      .boolean()
      .optional()
      .describe("Allow matches to span multiple lines (-U)"),
    noIgnore: z
      .boolean()
      .optional()
      .describe("Don't respect ignore files like .gitignore"),
  }),
  execute: async (args, { log }) => {
    const {
      pattern,
      directory,
      ignoreCase,
      smartCase,
      wordMatch,
      fixedStrings,
      context,
      count,
      maxColumns,
      hidden,
      followLinks,
      multiline,
      noIgnore,
    } = args;

    // Build command with options
    let cmd = "rg";

    // Core flags
    if (ignoreCase) cmd += " -i";
    if (smartCase) cmd += " -S";
    if (wordMatch) cmd += " -w";
    if (fixedStrings) cmd += " -F";
    if (count) cmd += " -c";
    if (hidden) cmd += " --hidden";
    if (followLinks) cmd += " -L";
    if (multiline) cmd += " -U";
    if (noIgnore) cmd += " --no-ignore";

    // Optional parameters
    if (context !== undefined) cmd += ` -C ${context}`;
    if (maxColumns !== undefined) cmd += ` -M ${maxColumns}`;

    // Add pattern and directory
    cmd += ` "${pattern}" "${directory}"`;

    log.info(`Executing: ${cmd}`);

    try {
      const { stdout } = await execAsync(cmd);
      return stdout || "No matches found.";
    } catch (error) {
      // Exit code 1 means "no matches" in ripgrep
      if (error.code === 1) {
        return "No matches found.";
      }
      throw new UserError(`Search failed: ${error.message}`);
    }
  },
});

// Find files by name using ripgrep's glob filtering
server.addTool({
  name: "find-files",
  description: "Find files by name pattern without searching content",
  parameters: z.object({
    pattern: z
      .string()
      .describe("The filename pattern to search for (e.g., '*.txt')"),
    directory: z.string().describe("Directory to search in"),
    fileType: z
      .string()
      .optional()
      .describe("Limit to specific file type (e.g., 'js', 'rust', 'py')"),
    hidden: z
      .boolean()
      .optional()
      .describe("Include hidden files/dirs in search"),
    followLinks: z.boolean().optional().describe("Follow symbolic links"),
    maxDepth: z
      .number()
      .optional()
      .describe("Maximum directory depth to recurse"),
  }),
  execute: async (args, { log }) => {
    const { pattern, directory, fileType, hidden, followLinks, maxDepth } =
      args;

    // Use ripgrep's glob pattern feature instead of regex filtering
    let cmd = "rg --files";

    // Add options
    if (hidden) cmd += " --hidden";
    if (followLinks) cmd += " -L";
    if (maxDepth !== undefined) cmd += ` --max-depth ${maxDepth}`;
    if (fileType) cmd += ` -t ${fileType}`;

    // Use proper glob filtering
    cmd += ` --glob "${pattern}"`;

    // Add directory
    cmd += ` "${directory}"`;

    log.info(`Executing: ${cmd}`);

    try {
      const { stdout } = await execAsync(cmd);
      return stdout || "No matching files found.";
    } catch (error) {
      if (error.code === 1) {
        return "No matching files found.";
      }
      throw new UserError(`File search failed: ${error.message}`);
    }
  },
});

// List available file types
server.addTool({
  name: "list-file-types",
  description: "List all file types supported by ripgrep",
  parameters: z.object({
    filter: z
      .string()
      .optional()
      .describe("Filter type list to show only types containing this string"),
  }),
  execute: async (args) => {
    const { filter } = args;

    let cmd = "rg --type-list";
    if (filter) {
      cmd += ` | rg "${filter}"`;
    }

    try {
      const { stdout } = await execAsync(cmd);
      return stdout || "No file types found matching your filter.";
    } catch (error) {
      throw new UserError(`Failed to list file types: ${error.message}`);
    }
  },
});

// Get file content using Node.js
server.addTool({
  name: "get-file-content",
  description: "Get the content of a file",
  parameters: z.object({
    filePath: z.string().describe("Path to the file to read"),
  }),
  execute: async (args) => {
    const { filePath } = args;

    try {
      // Check if the file exists and is readable
      await accessAsync(filePath, fs.constants.R_OK);

      // Read the file
      const content = await readFileAsync(filePath, "utf-8");
      return content;
    } catch (error) {
      throw new UserError(`Failed to read file: ${error.message}`);
    }
  },
});

// Get file snippet
server.addTool({
  name: "get-file-snippet",
  description: "Get a snippet from a file (specific lines)",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    startLine: z.number().describe("Start line number (1-based)"),
    lineCount: z
      .number()
      .optional()
      .describe("Number of lines to show (default: 10)"),
  }),
  execute: async (args) => {
    const { filePath, startLine, lineCount = 10 } = args;

    try {
      // Check if the file exists and is readable
      await accessAsync(filePath, fs.constants.R_OK);

      // Read the file
      const content = await readFileAsync(filePath, "utf-8");

      // Split by lines and extract snippet
      const lines = content.split(/\r?\n/);
      const endLine = Math.min(startLine + lineCount - 1, lines.length);

      if (startLine > lines.length) {
        return `No content found at line ${startLine} (file only has ${lines.length} lines).`;
      }

      // Extract the requested lines (adjusting for 0-based array indexing)
      const snippet = lines.slice(startLine - 1, endLine).join("\n");
      return snippet || `No content found at specified lines.`;
    } catch (error) {
      throw new UserError(`Failed to get snippet: ${error.message}`);
    }
  },
});

// Replace functionality preview (doesn't modify files)
server.addTool({
  name: "replace-preview",
  description: "Preview text replacements (doesn't modify files)",
  parameters: z.object({
    pattern: z.string().describe("The pattern to search for"),
    replacement: z.string().describe("The replacement text"),
    directory: z.string().describe("Directory to search in"),
    fileType: z
      .string()
      .optional()
      .describe("Limit search to specific file types"),
  }),
  execute: async (args, { log }) => {
    const { pattern, replacement, directory, fileType } = args;

    let cmd = `rg "${pattern}" --replace "${replacement}"`;

    if (fileType) cmd += ` -t ${fileType}`;
    cmd += ` "${directory}"`;

    log.info(`Executing: ${cmd}`);

    try {
      const { stdout } = await execAsync(cmd);
      return stdout || "No matches found for replacement.";
    } catch (error) {
      if (error.code === 1) {
        return "No matches found for replacement.";
      }
      throw new UserError(`Replacement preview failed: ${error.message}`);
    }
  },
});

// Add a quick reference guide as a resource
server.addResource({
  uri: "file:///help/ripgrep.md",
  name: "Ripgrep Quick Reference",
  mimeType: "text/markdown",
  async load() {
    return {
      text: `# Ripgrep Quick Reference

## Basic Usage
\`\`\`
rg pattern              # Search for pattern in current directory
rg pattern directory    # Search in specific directory
rg -i pattern           # Case-insensitive search
rg -S pattern           # Smart case search (case-insensitive unless pattern has uppercase)
rg -F pattern           # Fixed strings search (no regex)
rg -w pattern           # Only match whole words
\`\`\`

## File Type Filtering
\`\`\`
rg pattern -t html      # Search only in HTML files
rg pattern -T html      # Exclude HTML files from search
rg pattern -g "*.txt"   # Search only in .txt files
rg pattern -g "!*.log"  # Exclude .log files
\`\`\`

## Output Control
\`\`\`
rg --count pattern      # Show count of matches per file
rg -c pattern           # Same as --count
rg --files              # Only show files that would be searched
rg --files | rg pattern # Search filenames only
rg -l pattern           # Only show filenames with matches
\`\`\`

## Context Control
\`\`\`
rg -A 2 pattern         # Show 2 lines after match
rg -B 2 pattern         # Show 2 lines before match
rg -C 2 pattern         # Show 2 lines before and after match
\`\`\`

## Special Options
\`\`\`
rg -m 10 pattern        # Stop after 10 matches per file
rg --max-depth 3        # Only search 3 directories deep
rg -U pattern           # Enable multiline search
rg --replace "new"      # Replace matches with "new" (preview only)
rg --hidden             # Include hidden files and directories
\`\`\``,
    };
  },
});

// Start the server
server.start({
  transportType: "stdio",
});
