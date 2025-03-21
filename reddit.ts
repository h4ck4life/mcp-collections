import { FastMCP, UserError } from "fastmcp";
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
    q: z.string().describe("Search term"),
    limit: z
      .number()
      .optional()
      .default(25)
      .describe("Maximum number of items to return (max 100)"),
    sort: z
      .enum(["relevance", "hot", "top", "new", "comments"])
      .optional()
      .default("relevance")
      .describe("Sort order"),
    t: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .optional()
      .default("all")
      .describe("Time period"),
    type: z
      .string()
      .optional()
      .describe("Comma-delimited list of result types (sr, link, user)"),
    category: z
      .string()
      .optional()
      .describe("Category string (max 5 characters)"),
    include_facets: z
      .boolean()
      .optional()
      .describe("Include facets in response"),
    restrict_sr: z
      .boolean()
      .optional()
      .describe("Restrict to specific subreddit"),
    after: z.string().optional().describe("Fullname of item to fetch after"),
    before: z.string().optional().describe("Fullname of item to fetch before"),
    count: z
      .number()
      .optional()
      .default(0)
      .describe("Count of items already seen"),
    show: z.string().optional().describe("(optional) the string 'all'"),
    sr_detail: z.string().optional().describe("(optional) expand subreddits"),
  }),
  execute: async (args, context) => {
    try {
      const baseUrl = "https://www.reddit.com/search.json";
      const url = new URL(baseUrl);

      // Add all provided parameters to the URL
      Object.entries(args).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, value.toString());
        }
      });

      context.log.info("Making request to Reddit API", {
        url: url.toString(),
      });

      // Add retry logic
      const maxRetries = 3;
      let retries = 0;
      let response;

      while (retries < maxRetries) {
        try {
          response = await axios.get(url.toString(), {
            timeout: 60000, // 60 second timeout
            validateStatus: null, // Don't throw on any status code
            headers: {
              "User-Agent": "FastMCP-Reddit-Search/1.0.0",
            },
          });

          context.log.info("API Response received", {
            status: response.status,
            statusText: response.statusText,
          });

          if (response.status >= 400) {
            throw new Error(
              `HTTP error ${response.status}: ${response.statusText}`
            );
          }

          break; // Successful response, exit retry loop
        } catch (error) {
          retries++;

          // Log error information
          if (error.response) {
            context.log.error("API Error details", {
              status: error.response.status,
              statusText: error.response.statusText,
            });
          } else if (error.request) {
            context.log.error("No response received", {
              request: error.request,
            });
          } else {
            context.log.error("Request setup error", {
              message: error.message,
            });
          }

          context.log.warn(
            `Request failed (attempt ${retries}/${maxRetries})`,
            {
              error: error.message,
            }
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

      if (!response.data.data || !response.data.data.children) {
        context.log.info("No results found in response");
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
        count: response.data.data.children.length,
      });

      const results = response.data.data.children.map((item) => {
        const data = item.data;
        return {
          id: data.id,
          title: data.title,
          author: data.author,
          subreddit: data.subreddit,
          subreddit_id: data.subreddit_id,
          score: data.score || data.ups,
          created_utc: data.created_utc,
          num_comments: data.num_comments,
          permalink: data.permalink
            ? `https://www.reddit.com${data.permalink}`
            : null,
          url: data.url,
          selftext: data.selftext
            ? data.selftext.length > 300
              ? data.selftext.substring(0, 300) + "..."
              : data.selftext
            : "",
          over_18: data.over_18,
          is_video: data.is_video,
          locked: data.locked,
          stickied: data.stickied,
          spoiler: data.spoiler,
        };
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
                metadata: {
                  after: response.data.data.after,
                  before: response.data.data.before,
                  total_results: results.length,
                  limit: args.limit || 25,
                  sort: args.sort || "relevance",
                  timeframe: args.t || "all",
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      // Error logging
      context.log.error("Failed to search Reddit", {
        error: error.message,
        stack: error.stack,
        request_params: args,
      });

      if (error instanceof UserError) {
        throw error;
      }

      // Specific error messages for different status codes
      if (error.response) {
        const status = error.response.status;
        if (status === 500) {
          throw new UserError(
            "Reddit API server error (500). Please try again later."
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

server.addTool({
  name: "getRedditComments",
  description: "Get comments for a specific Reddit post",
  parameters: z.object({
    postId: z.string().describe("The ID of the post to get comments for"),
    sort: z
      .enum([
        "confidence",
        "top",
        "new",
        "controversial",
        "old",
        "random",
        "qa",
        "live",
      ])
      .optional()
      .default("confidence")
      .describe("Sort order for comments"),
    limit: z
      .number()
      .optional()
      .default(100)
      .describe("Maximum number of comments to return"),
  }),
  execute: async (args, context) => {
    try {
      const baseUrl = `https://www.reddit.com/comments/${args.postId}.json`;
      const url = new URL(baseUrl);

      // Add parameters
      url.searchParams.set("sort", args.sort);
      url.searchParams.set("limit", args.limit.toString());

      context.log.info("Making request to Reddit API for comments", {
        url: url.toString(),
        postId: args.postId,
      });

      // Add retry logic
      const maxRetries = 3;
      let retries = 0;
      let response;

      while (retries < maxRetries) {
        try {
          response = await axios.get(url.toString(), {
            timeout: 60000,
            validateStatus: null,
            headers: {
              "User-Agent": "FastMCP-Reddit-Comments/1.0.0",
            },
          });

          context.log.info("API Response received", {
            status: response.status,
            statusText: response.statusText,
          });

          if (response.status >= 400) {
            throw new Error(
              `HTTP error ${response.status}: ${response.statusText}`
            );
          }

          break;
        } catch (error) {
          retries++;

          // Log error information
          if (error.response) {
            context.log.error("API Error details", {
              status: error.response.status,
              statusText: error.response.statusText,
            });
          } else {
            context.log.error("Request error", {
              message: error.message,
            });
          }

          if (retries >= maxRetries) {
            throw error;
          }

          const delay = 1000 * Math.pow(2, retries - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (
        !response ||
        !response.data ||
        !Array.isArray(response.data) ||
        response.data.length < 2
      ) {
        throw new UserError("Invalid response from Reddit API");
      }

      // First item in array is the post, second is the comments
      const post = response.data[0].data.children[0].data;
      const comments = response.data[1].data.children;

      // Process comments recursively
      function processComments(comments) {
        return comments.map((comment) => {
          if (comment.kind === "more") {
            return {
              type: "more",
              count: comment.data.count,
              children: comment.data.children,
            };
          }

          const data = comment.data;
          const result = {
            id: data.id,
            author: data.author,
            body: data.body,
            score: data.score,
            created_utc: data.created_utc,
            permalink: data.permalink
              ? `https://www.reddit.com${data.permalink}`
              : null,
            replies:
              data.replies && data.replies.data
                ? processComments(data.replies.data.children)
                : [],
          };

          return result;
        });
      }

      const processedComments = processComments(comments);

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
                post: {
                  id: post.id,
                  title: post.title,
                  author: post.author,
                  subreddit: post.subreddit,
                  score: post.score,
                  created_utc: post.created_utc,
                  permalink: post.permalink
                    ? `https://www.reddit.com${post.permalink}`
                    : null,
                  url: post.url,
                  selftext: post.selftext || "",
                  num_comments: post.num_comments,
                },
                comments: processedComments,
                metadata: {
                  postId: args.postId,
                  sort: args.sort,
                  limit: args.limit,
                  comment_count: processedComments.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to get Reddit comments", {
        error: error.message,
        stack: error.stack,
        postId: args.postId,
      });

      if (error instanceof UserError) {
        throw error;
      }

      if (error.response) {
        const status = error.response.status;
        if (status === 404) {
          throw new UserError(`Post with ID ${args.postId} not found`);
        } else {
          throw new UserError(`Failed to get comments: HTTP error ${status}`);
        }
      }

      throw new UserError(`Failed to get comments: ${error.message}`);
    }
  },
});

server.start({ transportType: "stdio" });
