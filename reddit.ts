import { FastMCP } from "fastmcp";
import { z } from "zod";
import axios from "axios";

const server = new FastMCP({
  name: "Reddit Search MCP",
  version: "1.0.0",
});

server.addTool({
  name: "searchReddit",
  description: "Search for posts on Reddit by keyword",
  parameters: z.object({
    query: z.string().describe("Search keyword or phrase"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Number of results to return (max 100)"),
    sort: z
      .enum(["relevance", "hot", "new", "top", "comments"])
      .optional()
      .default("relevance")
      .describe("Sort method for results"),
    time: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .optional()
      .default("all")
      .describe("Time period for results"),
  }),
  execute: async (args, context) => {
    try {
      const url = new URL("https://www.reddit.com/search.json");
      url.searchParams.set("q", args.query);
      url.searchParams.set("limit", args.limit.toString());
      url.searchParams.set("sort", args.sort);
      url.searchParams.set("t", args.time);

      const response = await axios.get(url.toString(), {
        headers: {
          "User-Agent": "Reddit-Search-MCP/1.0.0",
        },
      });

      const results = response.data.data.children.map((child) => {
        const post = child.data;
        return {
          title: post.title,
          subreddit: post.subreddit_name_prefixed,
          author: post.author,
          created_utc: post.created_utc,
          url: post.url,
          permalink: `https://www.reddit.com${post.permalink}`,
          num_comments: post.num_comments,
          score: post.ups,
          is_self: post.is_self,
          selftext: post.selftext
            ? post.selftext.substring(0, 300) +
              (post.selftext.length > 300 ? "..." : "")
            : "",
        };
      });

      const formattedResults = JSON.stringify(
        {
          results: results,
          after: response.data.data.after,
          count: results.length,
        },
        null,
        2
      );

      return {
        content: [
          {
            type: "text",
            text: formattedResults,
          },
        ],
      };
    } catch (error) {
      context.log.error(`Error: ${error.message}`);
      throw new Error(`Failed to search Reddit: ${error.message}`);
    }
  },
});

server.start({
  transportType: "stdio",
});
