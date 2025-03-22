import { FastMCP } from "fastmcp";
import { z } from "zod";
import { chromium } from "playwright";

const server = new FastMCP({
  name: "Web Content MCP",
  version: "1.0.0",
});

server.addTool({
  name: "fetchWebContent",
  description: "Fetch text content from a webpage using Playwright",
  parameters: z.object({
    url: z.string().url().describe("The URL to fetch content from"),
    waitTime: z
      .number()
      .optional()
      .default(2000)
      .describe("Additional wait time in milliseconds after page load"),
    userAgent: z.string().optional().describe("Custom user agent string"),
    headless: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to run browser in headless mode"),
    slowMo: z
      .number()
      .optional()
      .default(50)
      .describe("Slow down operations by specified milliseconds"),
  }),
  execute: async (args, context) => {
    const browser = await chromium.launch({
      headless: args.headless,
      slowMo: args.slowMo,
    });

    try {
      const browserContext = await browser.newContext({
        userAgent:
          args.userAgent ||
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
        hasTouch: false,
        isMobile: false,
        deviceScaleFactor: 1,
      });

      const page = await browserContext.newPage();

      // Add a delay before navigation
      await new Promise((r) => setTimeout(r, 1000));

      await page.goto(args.url, {
        waitUntil: "networkidle",
        timeout: 60000, // Longer timeout
      });

      // Wait additional time to ensure content is loaded
      await new Promise((r) => setTimeout(r, args.waitTime));

      const textContent = await page.evaluate(() => {
        return document.body.innerText;
      });

      return {
        content: [
          {
            type: "text",
            text: textContent,
          },
        ],
      };
    } catch (error) {
      context.log.error(`Error fetching web content: ${error.message}`);
      throw new Error(`Failed to fetch web content: ${error.message}`);
    } finally {
      await browser.close();
    }
  },
});

server.start({
  transportType: "stdio",
});
