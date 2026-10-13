import { after, NextRequest } from 'next/server';
import { getUserByAccessTokenHash, hitRateLimit, type DbUser } from '@/server/db';
import { runTool, toolSpecs, type ToolContext } from '@/server/tools';
import { sha256 } from '@/server/tokens';

// SABA Anywhere — MCP server (Model Context Protocol, Streamable HTTP transport, JSON responses).
// Lets Claude Desktop, Cursor, VS Code and other MCP clients read and write your SABA memory.
// Auth: `Authorization: Bearer saba_…` (Settings → Connections → MCP access tokens).
// The tools are the same implementations the chat uses (src/server/tools.ts).

export const maxDuration = 60;

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const EXPOSED = ['search_memory', 'remember', 'forget', 'list_tasks', 'create_reminder', 'complete_task', 'log_goal'];

type Rpc = { jsonrpc?: unknown; id?: string | number | null; method?: unknown; params?: any };

const rpcError = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handleRpc(msg: Rpc, user: DbUser): Promise<object | null> {
  const isNotification = !msg || typeof msg !== 'object' || !('id' in msg);
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return isNotification ? null : rpcError(msg?.id, -32600, 'Invalid Request');
  }
  if (isNotification) return null; // e.g. notifications/initialized — nothing to answer
  const ok = (result: object) => ({ jsonrpc: '2.0', id: msg.id, result });

  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'saba', version: '1.0.0' },
        instructions: `SABA is ${user.name}'s personal assistant memory. Search it before answering questions about the user, remember durable facts they share, and use create_reminder for reminders.`,
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({
        tools: toolSpecs({ calendar: false })
          .filter((t) => EXPOSED.includes(t.name))
          .map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })),
      });
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string' || !EXPOSED.includes(name)) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      const ctx: ToolContext = {
        userId: user.id,
        timezone: user.timezone ?? 'UTC',
        sources: [],
        actions: [],
        tasks: [],
        taskRefs: new Map(),
        learned: [],
        forgotten: [],
        defer: (work) => after(() => work.catch(() => {})),
        calendar: false,
        incognito: false,
        memorySearch: true,
        userMessage: '',
        channel: 'mcp',
      };
      const args = msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {};
      const result = await runTool({ id: 'mcp', name, args }, ctx);
      return ok({ content: [{ type: 'text', text: result.content }], isError: !result.ok });
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const user = token.startsWith('saba_') ? await getUserByAccessTokenHash(sha256(token)) : null;
  if (!user) {
    return Response.json(rpcError(null, -32001, 'Missing or invalid SABA access token'), {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer realm="saba"' },
    });
  }
  if ((await hitRateLimit(`mcp:${user.id}`, 600)) > 120) {
    return Response.json(rpcError(null, -32002, 'Rate limit exceeded — try again in a few minutes'), { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as Rpc[];
  const replies = (await Promise.all(messages.map((m) => handleRpc(m, user)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(batch ? replies : replies[0]);
}

/** No server-initiated SSE stream; per the spec, GET is answered with 405. */
export function GET(): Response {
  return new Response('Method Not Allowed — POST JSON-RPC to this endpoint.', { status: 405, headers: { Allow: 'POST' } });
}
