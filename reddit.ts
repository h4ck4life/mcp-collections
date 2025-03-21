import { FastMCP, imageContent, UserError } from "fastmcp";
import { z } from "zod";
import axios from "axios";

const server = new FastMCP({
  name: "Reddit Search MCP",
  version: "1.0.0",
});

server.addTool({
  name: "searchReddit",
  description: "Search for posts or comments on Reddit by keyword",
  parameters: z.object({
    type: z
      .enum(["comment", "submission"])
      .describe("Search type: comments or submissions"),
    q: z.string().optional().describe("Search term (searches all fields)"),
    ids: z
      .string()
      .optional()
      .describe("Get specific items by comma-separated base36 IDs"),
    size: z
      .number()
      .optional()
      .default(100)
      .describe("Number of results to return (max 100)"),
    sort: z
      .enum(["asc", "desc"])
      .optional()
      .default("desc")
      .describe("Sort order"),
    sort_type: z
      .enum(["score", "num_comments", "created_utc"])
      .optional()
      .default("created_utc")
      .describe("Field to sort by"),
    author: z.string().optional().describe("Restrict to a specific author"),
    subreddit: z
      .string()
      .optional()
      .describe("Restrict to a specific subreddit"),
    after: z
      .string()
      .optional()
      .describe("Return results after this date (epoch or Xd/Xh/Xm/Xs)"),
    before: z
      .string()
      .optional()
      .describe("Return results before this date (epoch or Xd/Xh/Xm/Xs)"),
    link_id: z
      .string()
      .optional()
      .describe(
        "Return comments from a specific submission (for comment search only)"
      ),

    // Submission-specific parameters
    title: z.string().optional().describe("Search in submission titles only"),
    selftext: z
      .string()
      .optional()
      .describe("Search in submission selftext only"),
    score: z
      .string()
      .optional()
      .describe("Filter by score (e.g., '>100', '<25')"),
    num_comments: z
      .string()
      .optional()
      .describe("Filter by number of comments (e.g., '>100')"),
    over_18: z.boolean().optional().describe("Filter NSFW content"),
    is_video: z.boolean().optional().describe("Filter video content"),
    locked: z.boolean().optional().describe("Filter locked threads"),
    stickied: z.boolean().optional().describe("Filter stickied content"),
    spoiler: z.boolean().optional().describe("Filter spoiler content"),
    contest_mode: z
      .boolean()
      .optional()
      .describe("Filter contest mode submissions"),
  }),
  execute: async (args, context) => {
    try {
      const baseUrl = "https://api.pullpush.io/reddit/search/";
      const endpoint = args.type + "/";
      const url = new URL(baseUrl + endpoint);

      // Add all provided parameters to the URL
      Object.entries(args).forEach(([key, value]) => {
        if (value !== undefined && key !== "type") {
          url.searchParams.set(key, value.toString());
        }
      });

      context.log.info("Making request to Reddit API", { url: url.toString() });

      const response = await axios.get(url.toString(), {
        timeout: 60000, // 60 second timeout
      });

      if (
        !response.data ||
        !response.data.data ||
        !Array.isArray(response.data.data)
      ) {
        throw new UserError("No results found or invalid response format");
      }

      context.log.info("Retrieved results", {
        count: response.data.data.length,
        type: args.type,
      });

      const results = response.data.data.map((item) => {
        if (args.type === "submission") {
          return {
            id: item.id,
            title: item.title,
            author: item.author,
            subreddit: item.subreddit,
            subreddit_id: item.subreddit_id,
            score: item.score || item.ups,
            created_utc: item.created_utc,
            num_comments: item.num_comments,
            permalink: item.permalink
              ? `https://www.reddit.com${item.permalink}`
              : null,
            url: item.url,
            selftext: item.selftext
              ? item.selftext.length > 300
                ? item.selftext.substring(0, 300) + "..."
                : item.selftext
              : "",
            over_18: item.over_18,
            is_video: item.is_video,
            locked: item.locked,
            stickied: item.stickied,
            spoiler: item.spoiler,
          };
        } else {
          return {
            id: item.id,
            author: item.author,
            subreddit: item.subreddit,
            subreddit_id: item.subreddit_id,
            score: item.score || item.ups,
            created_utc: item.created_utc,
            permalink: item.permalink
              ? `https://www.reddit.com${item.permalink}`
              : null,
            body: item.body
              ? item.body.length > 300
                ? item.body.substring(0, 300) + "..."
                : item.body
              : "",
            link_id: item.link_id,
            parent_id: item.parent_id,
          };
        }
      });

      context.reportProgress({
        progress: 100,
        total: 100,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                results,
                count: results.length,
                metadata: response.data.metadata || {
                  total_results: results.length,
                  size: args.size || 100,
                  sort: args.sort || "desc",
                  sort_type: args.sort_type || "created_utc",
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to search Reddit", {
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(`Failed to search Reddit: ${error.message}`);
    }
  },
});

server.start({ transportType: "stdio" });
