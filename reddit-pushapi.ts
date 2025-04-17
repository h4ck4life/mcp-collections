import { FastMCP, UserError } from "fastmcp";
import { z } from "zod";
import axios from "axios";
import https from "https";

const server = new FastMCP({
  name: "Reddit Search MCP via PullPush",
  version: "1.0.0",
});

// Define interfaces for our data structures
interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  created_utc: number;
  permalink: string;
  parent_id: string;
  replies: RedditComment[];
}

interface RedditPost {
  id: string;
  title: string;
  author?: string;
  subreddit?: string;
  subreddit_id?: string;
  score?: number;
  upvote_ratio?: number;
  created_utc?: number;
  num_comments?: number;
  permalink?: string;
  url?: string;
  domain?: string;
  selftext: string;
  over_18?: boolean;
  is_video?: boolean;
  thumbnail?: string;
  locked?: boolean;
  stickied?: boolean;
  spoiler?: boolean;
  gilded?: number;
  contest_mode?: boolean;
}

// Configure axios with a longer timeout and custom agent
const axiosInstance = axios.create({
  timeout: 60000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
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
      .enum(["desc", "asc"])
      .optional()
      .default("desc")
      .describe("Sort order by date (desc = newest first)"),
    sort_type: z
      .enum(["created_utc", "score", "num_comments"])
      .optional()
      .default("created_utc")
      .describe("Sort results by specific attribute"),
    subreddit: z
      .string()
      .optional()
      .describe("Limit results to this subreddit"),
    after: z
      .string()
      .optional()
      .describe("Return results after this time (epoch or '30d', '24h', etc)"),
    before: z
      .string()
      .optional()
      .describe("Return results before this time (epoch or '30d', '24h', etc)"),
    score: z
      .string()
      .optional()
      .describe("Filter by score (e.g., '>10' for scores greater than 10)"),
    num_comments: z
      .string()
      .optional()
      .describe("Filter by number of comments (e.g., '>10')"),
    author: z.string().optional().describe("Filter by author"),
    over_18: z.boolean().optional().describe("Filter NSFW content"),
  }),
  execute: async (args, context) => {
    try {
      // Use PullPush API
      const baseUrl = "https://api.pullpush.io/reddit/search/submission";
      const url = new URL(baseUrl);

      // Map parameters
      if (args.q) url.searchParams.set("q", args.q);
      if (args.subreddit) url.searchParams.set("subreddit", args.subreddit);
      if (args.author) url.searchParams.set("author", args.author);
      if (args.after) url.searchParams.set("after", args.after.toString());
      if (args.before) url.searchParams.set("before", args.before.toString());
      if (args.score) url.searchParams.set("score", args.score);
      if (args.num_comments)
        url.searchParams.set("num_comments", args.num_comments);
      if (args.over_18 !== undefined)
        url.searchParams.set("over_18", args.over_18.toString());

      // Set size parameter
      url.searchParams.set("size", args.limit.toString());

      // Set sort parameters
      url.searchParams.set("sort", args.sort);
      url.searchParams.set("sort_type", args.sort_type || "created_utc");

      context.log.info("Making request to PullPush API", {
        url: url.toString(),
      });

      // Add retry logic
      const maxRetries = 3;
      let retries = 0;
      let response;

      while (retries < maxRetries) {
        try {
          response = await axiosInstance.get(url.toString(), {
            headers: {
              "User-Agent": "FastMCP-Reddit-Search/1.0.0",
            },
            validateStatus: null,
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
              data: error.response.data,
            });
          } else if (error.request) {
            context.log.error("No response received", {
              request: error.request.toString(),
            });
          } else {
            context.log.error("Request setup error", {
              message: error.message,
              stack: error.stack,
            });
          }

          if (retries >= maxRetries) {
            throw error;
          }

          const delay = 1000 * Math.pow(2, retries - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (!response || !response.data) {
        throw new UserError("No response received from PullPush API");
      }

      if (!response.data.data || !Array.isArray(response.data.data)) {
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

      const metadata = response.data.metadata || {};
      context.log.info("Retrieved results", {
        count: response.data.data.length,
        total: metadata.total_results || 0,
      });

      // Transform PullPush data
      const results = response.data.data.map((data: any) => {
        return {
          id: data.id,
          title: data.title || "",
          author: data.author,
          subreddit: data.subreddit,
          subreddit_id: data.subreddit_id,
          score: data.score,
          created_utc: data.created_utc,
          num_comments: data.num_comments,
          permalink: data.permalink
            ? `https://www.reddit.com${data.permalink}`
            : `https://www.reddit.com/r/${data.subreddit}/comments/${data.id}/`,
          url: data.url,
          selftext: data.selftext
            ? data.selftext.length > 300
              ? data.selftext.substring(0, 300) + "..."
              : data.selftext
            : "",
          over_18: data.over_18,
          is_video: data.is_video || false,
          locked: data.locked || false,
          stickied: data.stickied || false,
          spoiler: data.spoiler || false,
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
                  after: metadata.after,
                  before: metadata.before,
                  total_results: metadata.total_results || results.length,
                  limit: args.limit || 25,
                  sort: args.sort || "desc",
                  sort_type: args.sort_type || "created_utc",
                  execution_time_ms: metadata.execution_time_milliseconds,
                  source: "PullPush API",
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      // Error handling
      context.log.error("Failed to search Reddit via PullPush", {
        error: error.message,
        stack: error.stack,
        request_params: args,
      });

      if (error instanceof UserError) {
        throw error;
      }

      if (error.response) {
        const status = error.response.status;
        if (status === 500) {
          throw new UserError(
            "PullPush API server error (500). Please try again later."
          );
        } else if (status === 429) {
          throw new UserError(
            "Rate limit exceeded (429). Too many requests to the PullPush API."
          );
        } else if (status === 404) {
          throw new UserError(
            "PullPush API endpoint not found (404). Please check your parameters."
          );
        } else {
          throw new UserError(
            `Failed to search Reddit via PullPush: HTTP error ${status}: ${error.response.statusText}`
          );
        }
      }

      throw new UserError(
        `Failed to search Reddit via PullPush: ${error.message}`
      );
    }
  },
});

server.addTool({
  name: "getRedditComments",
  description: "Get comments for a specific Reddit post",
  parameters: z.object({
    postId: z.string().describe("The ID of the post to get comments for"),
    limit: z
      .number()
      .optional()
      .default(100)
      .describe("Maximum number of comments to return"),
    sort: z
      .enum(["desc", "asc"])
      .optional()
      .default("desc")
      .describe("Sort order by date"),
    sort_type: z
      .enum(["created_utc", "score"])
      .optional()
      .default("created_utc")
      .describe("Sort comments by attribute"),
  }),
  execute: async (args, context) => {
    try {
      const baseUrl = `https://api.pullpush.io/reddit/search/comment`;
      const url = new URL(baseUrl);

      // Format parameters according to PullPush API
      url.searchParams.set("link_id", `t3_${args.postId}`);
      url.searchParams.set("size", args.limit.toString());
      url.searchParams.set("sort", args.sort || "desc");
      url.searchParams.set("sort_type", args.sort_type || "created_utc");

      context.log.info("Making request to PullPush API for comments", {
        url: url.toString(),
        postId: args.postId,
      });

      const maxRetries = 3;
      let retries = 0;
      let response;

      while (retries < maxRetries) {
        try {
          response = await axiosInstance.get(url.toString(), {
            headers: {
              "User-Agent": "FastMCP-Reddit-Comments/1.0.0",
            },
            validateStatus: null,
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

          if (error.response) {
            context.log.error("API Error details", {
              status: error.response.status,
              statusText: error.response.statusText,
              data: error.response.data,
            });
          } else {
            context.log.error("Request error", {
              message: error.message,
              stack: error.stack,
            });
          }

          if (retries >= maxRetries) {
            throw error;
          }

          const delay = 1000 * Math.pow(2, retries - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (!response || !response.data || !Array.isArray(response.data.data)) {
        throw new UserError(
          "Invalid response from PullPush API or no comments found"
        );
      }

      const comments = response.data.data;

      // Fetch post information
      const postUrl = new URL(
        `https://api.pullpush.io/reddit/search/submission`
      );
      postUrl.searchParams.set("ids", args.postId);

      let postResponse;
      let post: RedditPost = {
        id: args.postId,
        title: "Unknown",
        selftext: "",
        num_comments: comments.length,
      };

      try {
        postResponse = await axiosInstance.get(postUrl.toString(), {
          headers: {
            "User-Agent": "FastMCP-Reddit-Post/1.0.0",
          },
          validateStatus: null,
        });

        if (
          postResponse.status === 200 &&
          postResponse.data &&
          postResponse.data.data &&
          postResponse.data.data.length > 0
        ) {
          const postData = postResponse.data.data[0];
          post = {
            id: postData.id,
            title: postData.title || "Unknown",
            author: postData.author,
            subreddit: postData.subreddit,
            score: postData.score,
            created_utc: postData.created_utc,
            permalink: postData.permalink
              ? `https://www.reddit.com${postData.permalink}`
              : `https://www.reddit.com/r/${postData.subreddit}/comments/${postData.id}/`,
            url: postData.url,
            selftext: postData.selftext || "",
            num_comments: postData.num_comments || comments.length,
          };
        }
      } catch (error) {
        context.log.error("Failed to get post details", {
          error: error.message,
          postId: args.postId,
        });
        // Continue with default post info
      }

      // Build comment tree
      const commentsById: Record<string, RedditComment> = {};
      const topLevelComments: RedditComment[] = [];

      // First pass: create lookup table
      comments.forEach((comment: any) => {
        commentsById[comment.id] = {
          id: comment.id,
          author: comment.author,
          body: comment.body,
          score: comment.score,
          created_utc: comment.created_utc,
          permalink: comment.permalink
            ? `https://www.reddit.com${comment.permalink}`
            : `https://www.reddit.com/r/${comment.subreddit}/comments/${args.postId}/comment/${comment.id}/`,
          parent_id: comment.parent_id,
          replies: [],
        };
      });

      // Second pass: build tree
      comments.forEach((comment: any) => {
        const commentObj = commentsById[comment.id];
        if (comment.parent_id === `t3_${args.postId}`) {
          // This is a top-level comment (direct reply to post)
          topLevelComments.push(commentObj);
        } else if (comment.parent_id && comment.parent_id.startsWith("t1_")) {
          // This is a reply to another comment
          const parentId = comment.parent_id.substring(3); // Remove t1_ prefix
          if (commentsById[parentId]) {
            commentsById[parentId].replies.push(commentObj);
          } else {
            // Parent comment not in our dataset, add to top level
            topLevelComments.push(commentObj);
          }
        }
      });

      const metadata = response.data.metadata || {};

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
                post,
                comments: topLevelComments,
                metadata: {
                  postId: args.postId,
                  source: "PullPush API",
                  comment_count: comments.length,
                  total_results: metadata.total_results || comments.length,
                  execution_time_ms: metadata.execution_time_milliseconds,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to get Reddit comments via PullPush", {
        error: error.message,
        stack: error.stack,
        postId: args.postId,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(
        `Failed to get comments via PullPush: ${error.message}`
      );
    }
  },
});

server.addTool({
  name: "getRedditPost",
  description: "Get details for a specific Reddit post by ID",
  parameters: z.object({
    postId: z.string().describe("The ID of the post to get details for"),
  }),
  execute: async (args, context) => {
    try {
      const baseUrl = `https://api.pullpush.io/reddit/search/submission`;
      const url = new URL(baseUrl);
      url.searchParams.set("ids", args.postId);

      context.log.info("Making request to PullPush API for post details", {
        url: url.toString(),
        postId: args.postId,
      });

      const maxRetries = 3;
      let retries = 0;
      let response;

      while (retries < maxRetries) {
        try {
          response = await axiosInstance.get(url.toString(), {
            headers: {
              "User-Agent": "FastMCP-Reddit-Post/1.0.0",
            },
            validateStatus: null,
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

          if (error.response) {
            context.log.error("API Error details", {
              status: error.response.status,
              statusText: error.response.statusText,
              data: error.response.data,
            });
          } else {
            context.log.error("Request error", {
              message: error.message,
              stack: error.stack,
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
        !response.data.data ||
        response.data.data.length === 0
      ) {
        throw new UserError(
          `Post with ID ${args.postId} not found in PullPush API`
        );
      }

      const post = response.data.data[0];
      const metadata = response.data.metadata || {};

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
                  title: post.title || "",
                  author: post.author,
                  subreddit: post.subreddit,
                  subreddit_id: post.subreddit_id,
                  score: post.score,
                  upvote_ratio: post.upvote_ratio,
                  created_utc: post.created_utc,
                  num_comments: post.num_comments || 0,
                  permalink: post.permalink
                    ? `https://www.reddit.com${post.permalink}`
                    : `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}/`,
                  url: post.url,
                  domain: post.domain,
                  selftext: post.selftext || "",
                  over_18: post.over_18 || false,
                  is_video: post.is_video || false,
                  thumbnail: post.thumbnail,
                  locked: post.locked || false,
                  stickied: post.stickied || false,
                  spoiler: post.spoiler || false,
                  gilded: post.gilded || 0,
                  contest_mode: post.contest_mode || false,
                },
                metadata: {
                  postId: args.postId,
                  source: "PullPush API",
                  retrieved_at: Math.floor(Date.now() / 1000),
                  execution_time_ms: metadata.execution_time_milliseconds,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to get Reddit post via PullPush", {
        error: error.message,
        stack: error.stack,
        postId: args.postId,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(`Failed to get post via PullPush: ${error.message}`);
    }
  },
});

server.start({ transportType: "stdio" });
