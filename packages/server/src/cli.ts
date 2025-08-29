#!/usr/bin/env node
/**
 * Hatago MCP Hub Server - CLI Entry Point
 *
 * Usage:
 *   npx @hatago/server [options]
 *   npx @hatago/server init [options]
 *   hatago [options]
 *   hatago init [options]
 *
 * Commands:
 *   init                 Create a default hatago.config.json
 *
 * Options:
 *   --stdio              Run in STDIO mode (default, for Claude Code)
 *   --http               Run in HTTP mode (for development/debugging)
 *   --config <path>      Path to configuration file
 *   --host <string>      Host to bind (HTTP mode only, default: 127.0.0.1)
 *   --port <number>      Port to bind (HTTP mode only, default: 3929)
 *   --log-level <level>  Log level (silent|error|warn|info|debug|trace)
 *   --help               Show help
 *   --version            Show version
 */

import { existsSync, writeFileSync } from "fs";
import { loadConfig } from "./config.js";
import { startHttp } from "./http.js";
import { Logger } from "./logger.js";
import { startStdio } from "./stdio.js";
import { generateDefaultConfig, parseArgs, type ParsedArgs } from "./utils.js";

async function handleInitCommand(args: ParsedArgs) {
  const configPath = (args.flags.config as string) || "./hatago.config.json";
  const force = args.flags.force as boolean;

  // Check if config file already exists
  if (existsSync(configPath) && !force) {
    console.error(`❌ Configuration file already exists: ${configPath}`);
    console.error("   Use --force to overwrite");
    process.exit(1);
  }

  try {
    const defaultConfig = generateDefaultConfig();
    writeFileSync(configPath, defaultConfig);
    console.log(`✅ Created configuration file: ${configPath}`);
    console.log("");
    console.log("Next steps:");
    console.log(`1. Edit ${configPath} to configure your MCP servers`);
    console.log("2. Run the server:");
    console.log(`   npx @hatago/server --config ${configPath}`);
    console.log("");
    console.log("For Claude Code integration, add to your .mcp.json:");
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            hatago: {
              command: "npx",
              args: ["@hatago/server", "--stdio", "--config", configPath],
            },
          },
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      `❌ Failed to create configuration file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }

  // Exit after successful init
  process.exit(0);
}

function showHelp() {
  console.error(`
Hatago MCP Hub Server

Usage:
  npx @hatago/server [command] [options]
  hatago [command] [options]

Commands:
  init                 Create a default hatago.config.json file

Options:
  --stdio              Run in STDIO mode (default, for Claude Code)
  --http               Run in HTTP mode (for development/debugging)
  --config <path>      Path to configuration file
  --host <string>      Host to bind (HTTP mode only, default: 127.0.0.1)
  --port <number>      Port to bind (HTTP mode only, default: 3929)
  --log-level <level>  Log level (silent|error|warn|info|debug|trace)
  --help               Show help
  --version            Show version

Init Options:
  --force              Overwrite existing configuration file

Environment Variables:
  HATAGO_CONFIG        Configuration file path
  HATAGO_HOST          HTTP server host
  HATAGO_PORT          HTTP server port
  HATAGO_LOG_LEVEL     Log level

Examples:
  # Create default configuration
  npx @hatago/server init

  # Create configuration in custom location
  npx @hatago/server init --config ./my-config.json

  # STDIO mode for Claude Code
  npx @hatago/server --stdio

  # HTTP mode for development
  npx @hatago/server --http --port 8080

  # With custom config
  npx @hatago/server --config ./my-config.json
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Handle commands
  if (args.command === "init") {
    await handleInitCommand(args);
    return;
  }

  // Help
  if (args.flags.help) {
    showHelp();
    process.exit(0);
  }

  // Version
  if (args.flags.version) {
    // Version will be injected during build or read from package.json
    console.error("0.1.0"); // TODO: Replace with actual version during build
    process.exit(0);
  }

  // Setup logger
  const logLevel =
    (args.flags["log-level"] as string) ??
    process.env.HATAGO_LOG_LEVEL ??
    "info";
  const logger = new Logger(logLevel);

  try {
    // Load configuration
    const configPath =
      (args.flags.config as string) ??
      process.env.HATAGO_CONFIG ??
      "./hatago.config.json";
    const config = await loadConfig(configPath, logger);

    // Determine mode (default: stdio for Claude Code compatibility)
    const mode = args.flags.stdio
      ? "stdio"
      : args.flags.http
        ? "http"
        : "stdio";

    if (mode === "stdio") {
      logger.debug("Starting in STDIO mode");
      await startStdio(config, logger);
    } else {
      const host =
        (args.flags.host as string) ?? process.env.HATAGO_HOST ?? "127.0.0.1";
      const port = Number(args.flags.port ?? process.env.HATAGO_PORT ?? 3929);

      logger.debug(`Starting in HTTP mode on ${host}:${port}`);
      await startHttp({
        config,
        host,
        port,
        logger,
      });
    }
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
