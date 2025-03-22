import { FastMCP } from "fastmcp";
import { z } from "zod";
import axios from "axios";
import { YoutubeTranscript } from "youtube-transcript";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const server = new FastMCP({
  name: "Youtube MCP",
  version: "1.0.0",
});

// Helper function to add video URLs
const addVideoUrl = (item) => {
  if (item && item.id) {
    const videoId = typeof item.id === "object" ? item.id.videoId : item.id;
    item.url = `https://www.youtube.com/watch?v=${videoId}`;
  }
  return item;
};

// Helper function to add channel URLs
const addChannelUrl = (item) => {
  if (item && item.id) {
    item.url = `https://www.youtube.com/channel/${item.id}`;
  }
  return item;
};

server.addTool({
  name: "youtubeTranscript",
  description: "Get transcript for a YouTube video",
  parameters: z.object({
    videoUrl: z.string().describe("YouTube video URL"),
    text: z
      .boolean()
      .optional()
      .default(false)
      .describe("Return plain text instead of timestamped list"),
  }),
  execute: async (args) => {
    try {
      // Custom HTML entity decoder function
      function decodeHtmlEntities(text) {
        const entities = {
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&#39;": "'",
          "&amp;#39;": "'", // This handles the double-encoded version
        };

        // Replace all HTML entities with their decoded values
        return text.replace(
          /&amp;#39;|&#39;|&quot;|&lt;|&gt;|&amp;/g,
          (match) => entities[match] || match
        );
      }

      // Function to extract video ID from various YouTube URL formats
      function extractYoutubeVideoId(url) {
        // Handle different YouTube URL formats
        const regexPatterns = [
          /youtu\.be\/([^?&]+)/, // youtu.be/XXXX
          /youtube\.com\/watch\?v=([^&]+)/, // youtube.com/watch?v=XXXX
          /youtube\.com\/embed\/([^?&]+)/, // youtube.com/embed/XXXX
          /youtube\.com\/v\/([^?&]+)/, // youtube.com/v/XXXX
          /youtube\.com\/live\/([^?&]+)/, // youtube.com/live/XXXX
          /youtu\.be\/([^?&]+)/, // youtu.be/XXXX?si=abc
          /youtube\.com\/shorts\/([^?&]+)/, // youtube.com/shorts/XXXX
        ];

        for (const pattern of regexPatterns) {
          const match = url.match(pattern);
          if (match && match[1]) {
            return match[1];
          }
        }

        return null; // Return null if no pattern matches
      }

      // Extract video ID from URL
      const videoId = extractYoutubeVideoId(args.videoUrl);

      if (!videoId) {
        return JSON.stringify({
          error: "Invalid YouTube URL",
          message: "Could not extract video ID from the provided URL",
        });
      }

      // Fetch transcript
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);

      // Process transcript based on text parameter
      if (args.text) {
        // Return plain text version
        let fullText = transcript.map((segment) => segment.text).join(" ");
        // Decode HTML entities
        fullText = decodeHtmlEntities(fullText);

        return JSON.stringify({
          success: true,
          transcript: fullText,
        });
      } else {
        // Return timestamped list but still decode HTML entities in each segment
        const decodedTranscript = transcript.map((segment) => ({
          ...segment,
          text: decodeHtmlEntities(segment.text),
        }));

        return JSON.stringify({
          success: true,
          transcript: decodedTranscript,
        });
      }
    } catch (error) {
      return JSON.stringify({
        error: "Transcript retrieval error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeVideoInfo",
  description:
    "Get details about a YouTube video including title, description, statistics, etc.",
  parameters: z.object({
    videoId: z.string().describe("YouTube video ID"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/videos",
        {
          params: {
            key: YOUTUBE_API_KEY,
            id: args.videoId,
            part: "snippet,contentDetails,statistics",
          },
        }
      );

      // Add video URLs to items
      if (response.data.items) {
        response.data.items = response.data.items.map(addVideoUrl);
      }

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeVideoComments",
  description: "Get comments for a YouTube video",
  parameters: z.object({
    videoId: z.string().describe("YouTube video ID"),
    maxResults: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of comments to return"),
    pageToken: z.string().optional().describe("Page token for pagination"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/commentThreads",
        {
          params: {
            key: YOUTUBE_API_KEY,
            videoId: args.videoId,
            part: "snippet",
            maxResults: args.maxResults,
            pageToken: args.pageToken,
            order: "relevance",
          },
        }
      );

      // Add comment permalink URLs
      if (response.data.items) {
        response.data.items.forEach((item) => {
          if (item.id) {
            item.url = `https://www.youtube.com/watch?v=${args.videoId}&lc=${item.id}`;
          }
        });
      }

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeSearch",
  description: "Search for YouTube videos by keywords",
  parameters: z.object({
    query: z.string().describe("Search query"),
    maxResults: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results to return"),
    pageToken: z.string().optional().describe("Page token for pagination"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/search",
        {
          params: {
            key: YOUTUBE_API_KEY,
            q: args.query,
            part: "snippet",
            maxResults: args.maxResults,
            pageToken: args.pageToken,
            type: "video",
          },
        }
      );

      // Add video URLs to search results
      if (response.data.items) {
        response.data.items.forEach((item) => {
          if (item.id && item.id.videoId) {
            item.url = `https://www.youtube.com/watch?v=${item.id.videoId}`;
          }
        });
      }

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeChannelInfo",
  description: "Get information about a YouTube channel",
  parameters: z.object({
    channelId: z.string().describe("YouTube channel ID"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/channels",
        {
          params: {
            key: YOUTUBE_API_KEY,
            id: args.channelId,
            part: "snippet,statistics,contentDetails",
          },
        }
      );

      // Add channel URLs
      if (response.data.items) {
        response.data.items.forEach((item) => {
          item.url = `https://www.youtube.com/channel/${item.id}`;
        });
      }

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeChannelVideos",
  description: "Get videos from a YouTube channel",
  parameters: z.object({
    channelId: z.string().describe("YouTube channel ID"),
    maxResults: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of videos to return"),
    pageToken: z.string().optional().describe("Page token for pagination"),
    order: z
      .enum(["date", "rating", "relevance", "title", "viewCount"])
      .optional()
      .default("date")
      .describe("Order of the videos"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/search",
        {
          params: {
            key: YOUTUBE_API_KEY,
            channelId: args.channelId,
            part: "snippet",
            maxResults: args.maxResults,
            pageToken: args.pageToken,
            order: args.order,
            type: "video",
          },
        }
      );

      // Add video URLs to channel videos
      if (response.data.items) {
        response.data.items.forEach((item) => {
          if (item.id && item.id.videoId) {
            item.url = `https://www.youtube.com/watch?v=${item.id.videoId}`;
          }
        });
      }

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeCommentReplies",
  description: "Get replies to a specific YouTube comment",
  parameters: z.object({
    commentId: z.string().describe("YouTube comment ID to get replies for"),
    maxResults: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of replies to return"),
    pageToken: z.string().optional().describe("Page token for pagination"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/comments",
        {
          params: {
            key: YOUTUBE_API_KEY,
            parentId: args.commentId,
            part: "snippet",
            maxResults: args.maxResults,
            pageToken: args.pageToken,
          },
        }
      );

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeVideoCategories",
  description: "Get list of video categories available in YouTube",
  parameters: z.object({
    regionCode: z
      .string()
      .optional()
      .default("US")
      .describe("ISO 3166-1 alpha-2 country code"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/videoCategories",
        {
          params: {
            key: YOUTUBE_API_KEY,
            part: "snippet",
            regionCode: args.regionCode,
          },
        }
      );
      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeCaptionsList",
  description: "Get available captions for a YouTube video",
  parameters: z.object({
    videoId: z.string().describe("YouTube video ID"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/captions",
        {
          params: {
            key: YOUTUBE_API_KEY,
            videoId: args.videoId,
            part: "snippet",
          },
        }
      );
      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubePopularVideos",
  description: "Get most popular videos by region",
  parameters: z.object({
    regionCode: z
      .string()
      .optional()
      .default("US")
      .describe("ISO 3166-1 alpha-2 country code"),
    categoryId: z.string().optional().describe("YouTube video category ID"),
    maxResults: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results to return"),
    pageToken: z.string().optional().describe("Page token for pagination"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const params = {
        key: YOUTUBE_API_KEY,
        chart: "mostPopular",
        regionCode: args.regionCode,
        part: "snippet,contentDetails,statistics",
        maxResults: args.maxResults,
        pageToken: args.pageToken,
      } as any;

      if (args.categoryId) {
        params.videoCategoryId = args.categoryId;
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/videos",
        { params }
      );

      // Add video URLs
      if (response.data.items) {
        response.data.items = response.data.items.map(addVideoUrl);
      }

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeGetChannelByUsername",
  description: "Get channel information by username",
  parameters: z.object({
    username: z.string().describe("YouTube username"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/channels",
        {
          params: {
            key: YOUTUBE_API_KEY,
            forUsername: args.username,
            part: "snippet,contentDetails,statistics",
          },
        }
      );

      // Add channel URLs
      if (response.data.items) {
        response.data.items.forEach(addChannelUrl);
      }

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeSearchChannels",
  description: "Search for YouTube channels by keywords",
  parameters: z.object({
    query: z.string().describe("Search query"),
    maxResults: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results to return"),
    pageToken: z.string().optional().describe("Page token for pagination"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/search",
        {
          params: {
            key: YOUTUBE_API_KEY,
            q: args.query,
            part: "snippet",
            maxResults: args.maxResults,
            pageToken: args.pageToken,
            type: "channel",
          },
        }
      );

      // Add channel URLs
      if (response.data.items) {
        response.data.items.forEach((item) => {
          if (item.id && item.id.channelId) {
            item.url = `https://www.youtube.com/channel/${item.id.channelId}`;
          }
        });
      }

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.addTool({
  name: "youtubeVideoStats",
  description: "Get detailed statistics for a YouTube video",
  parameters: z.object({
    videoId: z.string().describe("YouTube video ID"),
  }),
  execute: async (args) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return JSON.stringify({
          error: "YouTube API key not found in environment variables",
        });
      }

      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/videos",
        {
          params: {
            key: YOUTUBE_API_KEY,
            id: args.videoId,
            part: "statistics",
          },
        }
      );

      // Add video URL
      if (response.data.items) {
        response.data.items = response.data.items.map(addVideoUrl);
      }

      return JSON.stringify(response.data);
    } catch (error) {
      return JSON.stringify({
        error: "YouTube API error",
        message: error.message,
      });
    }
  },
});

server.start({
  transportType: "stdio",
});
