import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function getArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

function toEnvRecord(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function toText(result: any): string {
  const parts = result?.content;
  if (!Array.isArray(parts)) return JSON.stringify(result, null, 2);
  return parts
    .map((p: any) => {
      if (p?.type === "text") return String(p.text || "");
      return JSON.stringify(p);
    })
    .filter(Boolean)
    .join("\n");
}

async function main() {
  const baseUrl = (process.env.YAPI_BASE_URL || getArgValue("yapi-base-url") || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Missing YAPI_BASE_URL (or --yapi-base-url)");
  const email = process.env.YAPI_EMAIL || getArgValue("yapi-email") || "";
  const password = process.env.YAPI_PASSWORD || getArgValue("yapi-password") || "";
  if (!email) throw new Error("Missing YAPI_EMAIL (or --yapi-email)");
  if (!password) throw new Error("Missing YAPI_PASSWORD (or --yapi-password)");

  const projectId = getArgValue("project-id") || process.env.YAPI_SMOKE_PROJECT_ID || "";
  const forceLogin = (getArgValue("force-login") || "").toLowerCase() === "true";
  const searchProjectKeyword = getArgValue("search-project-keyword") || "";
  const searchNameKeyword = getArgValue("search-name-keyword") || "";
  const searchPathKeyword = getArgValue("search-path-keyword") || "";

  const env = {
    ...toEnvRecord(process.env),
    YAPI_BASE_URL: baseUrl,
    YAPI_AUTH_MODE: "global",
    YAPI_EMAIL: email,
    YAPI_PASSWORD: password,
    YAPI_LOG_LEVEL: process.env.YAPI_LOG_LEVEL || "debug",
  };

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js", "--stdio"],
    env,
    stderr: "inherit",
  });

  const client = new Client(
    { name: "yapi-mcp-smoke", version: "0.0.0" },
    { capabilities: { tools: {}, prompts: {}, resources: {} } },
  );

  await client.connect(transport);
  try {
    const tools = await client.listTools();
    console.log(`[smoke] tools: ${tools.tools?.length ?? 0}`);

    const update = await client.callTool({
      name: "yapi_update_token",
      arguments: { forceLogin },
    });
    console.log("[smoke] yapi_update_token:\n" + toText(update));

    const list = await client.callTool({ name: "yapi_list_projects", arguments: {} });
    console.log("[smoke] yapi_list_projects:\n" + toText(list));

    if (searchProjectKeyword || searchNameKeyword || searchPathKeyword) {
      const search = await client.callTool({
        name: "yapi_search_apis",
        arguments: {
          projectKeyword: searchProjectKeyword || undefined,
          nameKeyword: searchNameKeyword || undefined,
          pathKeyword: searchPathKeyword || undefined,
          limit: 50,
        },
      });
      console.log("[smoke] yapi_search_apis:\n" + toText(search));
    }

    if (projectId) {
      const proj = await client.callTool({ name: "yapi_project_get", arguments: { projectId } });
      console.log(`[smoke] yapi_project_get(${projectId}):\n` + toText(proj));
    }
  } finally {
    await transport.close().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error("[smoke] failed:", e?.message || e);
  process.exit(1);
});
