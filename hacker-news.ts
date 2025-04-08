import { FastMCP, UserError } from "fastmcp";
import { z } from "zod";
import axios from "axios";

const server = new FastMCP({
  name: "Hacker News Search MCP",
  version: "1.0.0",
});

// Tool to get the latest stories (top, new, best, ask, show, job)
server.addTool({
  name: "getStories",
  description: "Get the latest stories from Hacker News by category",
  parameters: z.object({
    category: z
      .enum(["top", "new", "best", "ask", "show", "job"])
      .describe("Category of stories to retrieve"),
    limit: z
      .number()
      .optional()
      .default(30)
      .describe(
        "Maximum number of stories to return (max 500 for top/new/best, 200 for others)"
      ),
  }),
  execute: async (args, context) => {
    try {
      const { category, limit } = args;
      const endpoint = `https://hacker-news.firebaseio.com/v0/${category}stories.json`;

      context.log.info("Making request to Hacker News API", {
        endpoint,
        category,
        limit,
      });

      const response = await axios.get(endpoint, {
        timeout: 30000,
        headers: {
          "User-Agent": "HackerNews-MCP-Client/1.0.0",
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new UserError("Invalid response from Hacker News API");
      }

      // Limit the number of IDs
      const storyIds = response.data.slice(0, limit);

      // Now fetch details for each story
      const stories = await Promise.all(
        storyIds.map(async (id) => {
          context.log.info(`Fetching item ${id}`);
          const itemResponse = await axios.get(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            {
              timeout: 10000,
              headers: {
                "User-Agent": "HackerNews-MCP-Client/1.0.0",
              },
            }
          );
          return itemResponse.data;
        })
      );

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
                stories: stories.filter(Boolean), // Filter out any null responses
                count: stories.filter(Boolean).length,
                metadata: {
                  category,
                  limit,
                  timestamp: Date.now(),
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to get Hacker News stories", {
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(
        `Failed to get Hacker News stories: ${error.message}`
      );
    }
  },
});

// Tool to get item details (story, comment, job, poll, etc.)
server.addTool({
  name: "getItem",
  description: "Get details for a specific Hacker News item by ID",
  parameters: z.object({
    itemId: z.number().describe("The ID of the item to retrieve"),
  }),
  execute: async (args, context) => {
    try {
      const { itemId } = args;
      const endpoint = `https://hacker-news.firebaseio.com/v0/item/${itemId}.json`;

      context.log.info("Making request to Hacker News API for item", {
        endpoint,
        itemId,
      });

      const response = await axios.get(endpoint, {
        timeout: 10000,
        headers: {
          "User-Agent": "HackerNews-MCP-Client/1.0.0",
        },
      });

      if (!response.data) {
        throw new UserError(`Item with ID ${itemId} not found`);
      }

      context.reportProgress({
        progress: 100,
        total: 100,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to get Hacker News item", {
        error: error.message,
        stack: error.stack,
        itemId: args.itemId,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(`Failed to get Hacker News item: ${error.message}`);
    }
  },
});

// Tool to get user profile
server.addTool({
  name: "getUser",
  description: "Get a user profile from Hacker News",
  parameters: z.object({
    username: z.string().describe("The username of the user to retrieve"),
  }),
  execute: async (args, context) => {
    try {
      const { username } = args;
      const endpoint = `https://hacker-news.firebaseio.com/v0/user/${username}.json`;

      context.log.info("Making request to Hacker News API for user", {
        endpoint,
        username,
      });

      const response = await axios.get(endpoint, {
        timeout: 10000,
        headers: {
          "User-Agent": "HackerNews-MCP-Client/1.0.0",
        },
      });

      if (!response.data) {
        throw new UserError(`User ${username} not found`);
      }

      context.reportProgress({
        progress: 100,
        total: 100,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to get Hacker News user", {
        error: error.message,
        stack: error.stack,
        username: args.username,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(`Failed to get Hacker News user: ${error.message}`);
    }
  },
});

// Tool to get comments for a story
server.addTool({
  name: "getComments",
  description: "Get all comments for a specific Hacker News story",
  parameters: z.object({
    storyId: z.number().describe("The ID of the story to get comments for"),
  }),
  execute: async (args, context) => {
    try {
      const { storyId } = args;

      // First, fetch the story to get the comment IDs
      const storyEndpoint = `https://hacker-news.firebaseio.com/v0/item/${storyId}.json`;

      context.log.info("Fetching story to get comment IDs", {
        endpoint: storyEndpoint,
        storyId,
      });

      const storyResponse = await axios.get(storyEndpoint, {
        timeout: 10000,
        headers: {
          "User-Agent": "HackerNews-MCP-Client/1.0.0",
        },
      });

      if (!storyResponse.data) {
        throw new UserError(`Story with ID ${storyId} not found`);
      }

      const story = storyResponse.data;

      if (!story.kids || story.kids.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  story: {
                    id: story.id,
                    title: story.title,
                    by: story.by,
                    time: story.time,
                    url: story.url,
                    score: story.score,
                  },
                  comments: [],
                  count: 0,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Fetch all comments recursively
      async function fetchComment(id) {
        context.log.info(`Fetching comment ${id}`);
        const commentResponse = await axios.get(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          {
            timeout: 10000,
            headers: {
              "User-Agent": "HackerNews-MCP-Client/1.0.0",
            },
          }
        );

        const comment = commentResponse.data;
        if (!comment) return null;

        // Explicitly type the replies array
        let replies: any[] = [];
        if (comment.kids && comment.kids.length > 0) {
          replies = await Promise.all(comment.kids.map(fetchComment));
          replies = replies.filter(Boolean); // Remove nulls
        }

        return {
          id: comment.id,
          by: comment.by,
          text: comment.text,
          time: comment.time,
          replies: replies,
        };
      }

      // Fetch all top-level comments
      const comments = await Promise.all(story.kids.map(fetchComment));

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
                story: {
                  id: story.id,
                  title: story.title,
                  by: story.by,
                  time: story.time,
                  url: story.url,
                  score: story.score,
                },
                comments: comments.filter(Boolean),
                count: comments.filter(Boolean).length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to get Hacker News comments", {
        error: error.message,
        stack: error.stack,
        storyId: args.storyId,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(
        `Failed to get Hacker News comments: ${error.message}`
      );
    }
  },
});

// Tool to get the max item ID
server.addTool({
  name: "getMaxItemId",
  description: "Get the current largest item ID from Hacker News",
  parameters: z.object({}),
  execute: async (args, context) => {
    try {
      const endpoint = "https://hacker-news.firebaseio.com/v0/maxitem.json";

      context.log.info("Making request to Hacker News API for max item ID", {
        endpoint,
      });

      const response = await axios.get(endpoint, {
        timeout: 10000,
        headers: {
          "User-Agent": "HackerNews-MCP-Client/1.0.0",
        },
      });

      if (!response.data) {
        throw new UserError("Failed to get max item ID");
      }

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
                maxItemId: response.data,
                timestamp: Date.now(),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to get Hacker News max item ID", {
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(`Failed to get max item ID: ${error.message}`);
    }
  },
});

// Tool to get updates (changed items and profiles)
server.addTool({
  name: "getUpdates",
  description:
    "Get the latest updates (changed items and profiles) from Hacker News",
  parameters: z.object({}),
  execute: async (args, context) => {
    try {
      const endpoint = "https://hacker-news.firebaseio.com/v0/updates.json";

      context.log.info("Making request to Hacker News API for updates", {
        endpoint,
      });

      const response = await axios.get(endpoint, {
        timeout: 10000,
        headers: {
          "User-Agent": "HackerNews-MCP-Client/1.0.0",
        },
      });

      if (!response.data) {
        throw new UserError("Failed to get updates");
      }

      context.reportProgress({
        progress: 100,
        total: 100,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to get Hacker News updates", {
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(`Failed to get updates: ${error.message}`);
    }
  },
});

// Tool to search Hacker News stories by keyword
// Note: The official HN API doesn't have search functionality, so this is a basic implementation
server.addTool({
  name: "searchHackerNews",
  description:
    "Search for Hacker News stories by keyword (simple implementation)",
  parameters: z.object({
    query: z.string().describe("Search term"),
    limit: z
      .number()
      .optional()
      .default(30)
      .describe("Maximum number of stories to return"),
    searchIn: z
      .enum(["top", "new", "best", "ask", "show", "job"])
      .optional()
      .default("top")
      .describe("Category to search in"),
  }),
  execute: async (args, context) => {
    try {
      const { query, limit, searchIn } = args;
      const endpoint = `https://hacker-news.firebaseio.com/v0/${searchIn}stories.json`;

      context.log.info("Searching Hacker News", {
        query,
        limit,
        searchIn,
      });

      // Get the story IDs from the selected category
      const response = await axios.get(endpoint, {
        timeout: 30000,
        headers: {
          "User-Agent": "HackerNews-MCP-Client/1.0.0",
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new UserError("Invalid response from Hacker News API");
      }

      // Get up to 100 stories to search through
      const storyIds = response.data.slice(0, 100);

      // Fetch story details for each ID
      const stories = await Promise.all(
        storyIds.map(async (id) => {
          const itemResponse = await axios.get(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            {
              timeout: 10000,
              headers: {
                "User-Agent": "HackerNews-MCP-Client/1.0.0",
              },
            }
          );
          return itemResponse.data;
        })
      );

      // Filter stories that match the query
      const queryLowerCase = query.toLowerCase();
      const matchingStories = stories
        .filter(Boolean)
        .filter((story) => {
          if (!story.title) return false;

          // Search in title
          if (story.title.toLowerCase().includes(queryLowerCase)) return true;

          // Search in text if available
          if (story.text && story.text.toLowerCase().includes(queryLowerCase))
            return true;

          // Search in URL if available
          if (story.url && story.url.toLowerCase().includes(queryLowerCase))
            return true;

          return false;
        })
        .slice(0, limit);

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
                results: matchingStories,
                count: matchingStories.length,
                metadata: {
                  query,
                  searchIn,
                  limit,
                  timestamp: Date.now(),
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      context.log.error("Failed to search Hacker News", {
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof UserError) {
        throw error;
      }

      throw new UserError(`Failed to search Hacker News: ${error.message}`);
    }
  },
});

server.start({ transportType: "stdio" });
