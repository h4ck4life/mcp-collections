import { FastMCP, UserError } from "fastmcp";
import { z } from "zod";
import * as mysql from "mysql2/promise";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Constants for timeout handling
const DEFAULT_QUERY_TIMEOUT = 120; // seconds

// Initialize server
const server = new FastMCP({
  name: "mysql_mcp_server",
  version: "1.0.0",
});

// Configure logging to use stderr for diagnostic messages
const logger = {
  info: (message: string, data?: any) =>
    console.error(`INFO: ${message}${data ? " " + JSON.stringify(data) : ""}`),
  error: (message: string, data?: any) =>
    console.error(`ERROR: ${message}${data ? " " + JSON.stringify(data) : ""}`),
  warning: (message: string, data?: any) =>
    console.error(`WARN: ${message}${data ? " " + JSON.stringify(data) : ""}`),
};

function getDbConfig() {
  const config = {
    host: process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQL_USER || "",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "",
    port: parseInt(process.env.MYSQL_PORT || "3306"),
    queryTimeout: parseInt(
      process.env.MYSQL_QUERY_TIMEOUT || String(DEFAULT_QUERY_TIMEOUT)
    ),
  };

  if (!config.user || !config.password || !config.database) {
    logger.error(
      "Missing required database configuration. Please check environment variables:"
    );
    logger.error("MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE are required");
    throw new Error("Missing required database configuration");
  }

  return config;
}

function isWriteOperation(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();

  // List of SQL commands that modify data or structure
  const writeOperations = [
    "CREATE",
    "ALTER",
    "DROP",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "MERGE",
    "REPLACE",
    "GRANT",
    "REVOKE",
    "CALL",
  ];

  for (const operation of writeOperations) {
    if (
      normalizedQuery.startsWith(operation) ||
      normalizedQuery.includes(` ${operation} `)
    ) {
      return true;
    }
  }

  return false;
}

async function executeQuery(query: string, fetchResults = true): Promise<any> {
  const config = getDbConfig();

  // Create MySQL connection configuration
  const mysqlConfig = {
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    port: config.port,
    connectTimeout: 10000,
    connectionLimit: 10,
  };

  try {
    // Create a new connection for each query
    const connection = await mysql.createConnection(mysqlConfig);

    try {
      // Set timeout for the query
      await connection.query(
        `SET SESSION MAX_EXECUTION_TIME = ${config.queryTimeout * 1000}`
      );

      if (fetchResults) {
        const [rows, fields] = await connection.query(query);
        const columns = fields ? fields.map((field) => field.name) : [];
        return { columns, rows };
      } else {
        const [result] = await connection.query(query);
        return {
          columns: null,
          rowCount: "affectedRows" in result ? result.affectedRows : 0,
        };
      }
    } finally {
      await connection.end();
    }
  } catch (e) {
    logger.error(`Error executing query: ${e}`);
    throw e;
  }
}

// Add tools to the server
server.addTool({
  name: "execute_sql",
  description:
    "Execute a read-only SQL query on the MySQL server. Write operations (CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, etc.) are not permitted.",
  parameters: z.object({
    query: z
      .string()
      .describe("The SQL query to execute (read-only operations only)"),
  }),
  execute: async (args, { log }) => {
    const config = getDbConfig();
    logger.info(`Executing SQL query: ${args.query}`);

    if (!args.query) {
      throw new UserError("Query is required");
    }

    // Check if the query is a write operation
    if (isWriteOperation(args.query)) {
      const errorMessage =
        "Write operations (CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, etc.) are not permitted for security reasons.";
      logger.warning(
        `Attempted write operation denied: ${args.query.substring(0, 100)}...`
      );
      throw new UserError(errorMessage);
    }

    try {
      // Special handling for listing tables in MySQL
      if (args.query.trim().toUpperCase() === "SHOW TABLES") {
        const { columns, rows } = await executeQuery("SHOW TABLES;");

        const tableName = `Tables_in_${config.database}`;
        const result = [tableName]; // Header

        rows.forEach((row: any) => {
          result.push(row[tableName]);
        });

        return result.join("\n");
      }

      // For all other queries, treat them as SELECT queries and return the results
      // This is safe because we've already checked that it's not a write operation
      const { columns, rows } = await executeQuery(args.query);

      if (!rows || rows.length === 0) {
        return "No results found";
      }

      // Format the results in a tabular format
      const headerRow = columns.join(",");
      const dataRows = Array.isArray(rows)
        ? rows.map((row: any) => {
            return columns
              .map((col) => {
                const value = row[col];
                return value !== undefined && value !== null
                  ? String(value)
                  : "";
              })
              .join(",");
          })
        : [];

      return [headerRow, ...dataRows].join("\n");
    } catch (e: any) {
      const errorMessage = e.message || String(e);
      logger.error(`Error executing SQL '${args.query}': ${errorMessage}`);
      throw new UserError(`Error executing query: ${errorMessage}`);
    }
  },
});

// Start the server with proper initialization
logger.info("Starting MySQL MCP server...");
try {
  const config = getDbConfig();
  logger.info(
    `Database config: ${config.host}:${config.port}/${config.database} as ${config.user}`
  );

  // Start the server
  server.start({
    transportType: "stdio",
  });

  logger.info("MySQL MCP server started");
} catch (error) {
  logger.error(`Startup error: ${error}`);
  process.exit(1);
}
