[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/brightdata-browserai-mcp-badge.png)](https://mseep.ai/app/brightdata-browserai-mcp)

<h1 align="center">Browserai MCP</h1>
<h3 align="center">Empower AI Agents with Real-Time Web Data</h3>

## 🌟 Overview

Welcome to the Browserai Model Context Protocol (MCP) server, designed to enable LLMs, AI agents, and applications to access, discover, and extract web data in real-time. This server empowers MCP clients—such as Claude Desktop, VS Code, Cursor, and WindSurf—to seamlessly search the web, navigate websites, perform actions, and retrieve data efficiently, even from sites with anti-scraping measures.

![MCP](https://github.com/user-attachments/assets/b949cb3e-c80a-4a43-b6a5-e0d6cec619a7)

## ⚙️ How it Works

The Browserai MCP server functions as an intermediary between your AI agent (the MCP client) and the internet:
1.  Your AI agent (e.g., Claude Desktop, a VSCode extension) dispatches a request to the Browserai MCP server via the Model Context Protocol.
2.  The MCP server, utilizing your Browserai API token and project configurations, executes the requested web action (e.g., search, navigate, extract data).
3.  It leverages Browserai's robust infrastructure to manage complexities such as bypassing geo-restrictions and bot detection mechanisms.
4.  The server then delivers the structured data or action outcome back to your AI agent.

This architecture allows your agent to access real-time web information and capabilities without the need to directly manage browser instances or anti-blocking technologies.

## ✨ Features

- **Real-Time Web Access**: Retrieve up-to-date information directly from the web.
- **Bypass Geo-restrictions**: Access content without geographical limitations.
- **Web Unlocker**: Navigate websites protected by bot detection systems.
- **Browser Control**: Utilize optional remote browser automation capabilities.
- **Seamless Integration**: Compatible with all MCP-compliant AI assistants.

## 🔧 Account Setup

To begin using the Browserai MCP server, a Browserai account and API key are required.

1. Ensure you have an account on [browser.ai](https://browser.ai). New users receive free credits for testing, with pay-as-you-go options available.
2. Obtain your API key from the [user dashboard](https://browser.ai/dashboard/page/projects).
3. Create a new project in your [dashboard](https://browser.ai/dashboard/page/overview).
   - This project name can be overridden in your MCP server configuration using the `PROJECT_NAME` environment variable.

## 🚀 Quickstart

This guide assists in setting up the Browserai MCP server with common AI clients.

1.  **Install Node.js**:
    The `npx` command is required. If Node.js is not already installed, download and install it from the [node.js website](https://nodejs.org/en/download). `npx` is a Node.js package runner that simplifies the execution of CLI tools like `@brightdata/browserai-mcp`.

### Claude Desktop

1.  Navigate to Claude > Settings > Developer > Edit Config > `claude_desktop_config.json` and add the following configuration:

```json
{
  "mcpServers": {
    "Browserai": {
      "command": "npx",
      "args": ["@brightdata/browserai-mcp"],
      "env": {
        "API_TOKEN": "<your-browserai-api-token>",
        "PROJECT_NAME": "<your-browserai-project-name (optional)>"
      }
    }
  }
}
```

### VSCode Agent

1.  Configure your VSCode Agent. This usually involves modifying a settings file. For instance, create a `.vscode/mcp.json` file in your project with the following content:

```json
{
  "servers": {
    "browserai-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["@brightdata/browserai-mcp"],
      "env": {
        "API_TOKEN": "<your-browserai-api-token>",
        "PROJECT_NAME": "<your-browserai-project-name (optional)>"
      }
    }
  }
}
```

**Note for VSCode Agent:** The specific path and structure for the MCP server configuration (e.g., the filename `.vscode/mcp.json` or the JSON key like `"servers"`) may differ based on the VSCode Agent extension in use. Consult your VSCode Agent's documentation for precise instructions.

## 🔌 Other MCP Clients

To integrate this MCP server with other AI agents or applications supporting the Model Context Protocol:

1.  **Command**: Initiate the server using the command `npx @brightdata/browserai-mcp`.
2.  **Environment Variables**:
    *   `API_TOKEN`: Your Browserai API token (mandatory).
    *   `PROJECT_NAME`: The name of your Browserai project (optional; defaults to a pre-configured project if omitted).
    Ensure these variables are accessible in the environment where the command is executed. Refer to your client's documentation for guidance on configuring external MCP servers and setting environment variables.

## ⚠️ Security Best Practices

**Important:** Treat all scraped web content as potentially untrusted data. To mitigate prompt injection risks, avoid using raw scraped content directly in LLM prompts.
Instead, adopt these practices:
- Filter and validate all web data prior to processing.
- Prefer structured data extraction (using `web_data` tools) over raw text.

## ⚠️ Troubleshooting

### Timeouts with Certain Tools

Some tools require significant time to read web data, as page load times can vary considerably.

To ensure your agent can successfully consume the data, configure a sufficiently high timeout in your agent's settings. A value of `180s` (3 minutes) is generally adequate for most requests, but adjust this based on the performance of the target sites.

### `spawn npx ENOENT` Error

This error indicates that the `npx` command cannot be found by your system. To resolve this:

#### Locating Your Node.js/npm Path

**macOS:**
Execute `which node` in your terminal. The output will resemble `/usr/local/bin/node`.

**Windows:**
Execute `where node` in your command prompt. The output will be similar to `C:\Program Files\nodejs\node.exe`.

#### Updating Your MCP Configuration

In your client's MCP server configuration, replace `"npx"` with the full path to your Node.js executable. For example, on macOS, it might look like this:

```json
"command": "/usr/local/bin/node"
```
(Ensure the `args` still include `["@brightdata/browserai-mcp"]` or the path to the `npx` script if using `node` directly with `npx`'s underlying script.)

## 📞 Support

Should you encounter any issues or have questions, please contact the Browserai support team or submit an issue in this repository.
