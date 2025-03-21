import { FastMCP, imageContent, UserError } from "fastmcp";
import { z } from "zod";
import axios from "axios";

const server = new FastMCP({
  name: "Reddit Search MCP",
  version: "1.0.0",
});

server.addTool({
  name: "searchReddit",
  description: "Search for posts or comments on Reddit by keyword or IDs",
  parameters: z.object({
    type: z
      .enum(["comment", "submission"])
      .describe("Search type: comments or submissions"),
    q: z.string().optional().describe("Search term (searches all fields)"),
    ids: z
      .string()
      .optional()
      .describe(
        "Get specific items by comma-separated base36 IDs (e.g., 'i46w2wg,k3dn7q'). When used, other parameters are ignored."
      ),
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

      // Handle ids parameter exclusively if provided
      if (args.ids) {
        url.searchParams.set("ids", args.ids.toString());
        context.log.info("Making request to Reddit API with IDs only", {
          url: url.toString(),
        });
      } else {
        // Add all provided parameters to the URL
        Object.entries(args).forEach(([key, value]) => {
          if (value !== undefined && key !== "type") {
            url.searchParams.set(key, value.toString());
          }
        });
        context.log.info(
          "Making request to Reddit API with search parameters",
          { url: url.toString() }
        );
      }

      // Add retry logic
      const maxRetries = 3;
      let retries = 0;
      let response;

      while (retries < maxRetries) {
        try {
          response = await axios.get(url.toString(), {
            timeout: 60000, // 60 second timeout
            validateStatus: null, // Don't throw on any status code
          });

          // Log response even if it's an error
          context.log.info("API Response received", {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data:
              typeof response.data === "object"
                ? JSON.stringify(response.data).substring(0, 500)
                : String(response.data).substring(0, 500),
          });

          if (response.status >= 400) {
            throw new Error(
              `HTTP error ${response.status}: ${response.statusText}`
            );
          }

          break; // Successful response, exit retry loop
        } catch (error) {
          retries++;

          // Log detailed error information
          if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            context.log.error("API Error details", {
              status: error.response.status,
              statusText: error.response.statusText,
              headers: error.response.headers,
              data:
                typeof error.response.data === "object"
                  ? JSON.stringify(error.response.data).substring(0, 500)
                  : String(error.response.data).substring(0, 500),
            });
          } else if (error.request) {
            // The request was made but no response was received
            context.log.error("No response received", {
              request: error.request,
            });
          } else {
            // Something happened in setting up the request
            context.log.error("Request setup error", {
              message: error.message,
            });
          }

          context.log.warn(
            `Request failed (attempt ${retries}/${maxRetries})`,
            { error: error.message }
          );

          if (retries >= maxRetries) {
            throw error; // Rethrow if max retries reached
          }

          // Wait before retry (exponential backoff)
          const delay = 1000 * Math.pow(2, retries - 1); // 1s, 2s, 4s...
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (!response || !response.data) {
        throw new UserError("No response received from Reddit API");
      }

      if (!response.data.data || !Array.isArray(response.data.data)) {
        // Handle empty results more gracefully
        context.log.info("No results found in response", {
          data:
            typeof response.data === "object"
              ? JSON.stringify(response.data).substring(0, 500)
              : String(response.data).substring(0, 500),
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  results: [],
                  count: 0,
                  metadata: {
                    total_results: 0,
                    message: "No results found for the given query",
                  },
                },
                null,
                2
              ),
            },
          ],
        };
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
      // Comprehensive error logging
      context.log.error("Failed to search Reddit", {
        error: error.message,
        stack: error.stack,
        request_params: args,
      });

      if (error instanceof UserError) {
        throw error;
      }

      // More specific error messages for different status codes
      if (error.response) {
        const status = error.response.status;
        if (status === 500) {
          throw new UserError(
            "Reddit API server error (500). This could be due to invalid parameters or temporary server issues. Please try again later."
          );
        } else if (status === 429) {
          throw new UserError(
            "Rate limit exceeded (429). Too many requests to the Reddit API."
          );
        } else if (status === 404) {
          throw new UserError(
            "Reddit API endpoint not found (404). Please check your parameters."
          );
        } else {
          throw new UserError(
            `Failed to search Reddit: HTTP error ${status}: ${error.response.statusText}`
          );
        }
      }

      throw new UserError(`Failed to search Reddit: ${error.message}`);
    }
  },
});

server.start({ transportType: "stdio" });
