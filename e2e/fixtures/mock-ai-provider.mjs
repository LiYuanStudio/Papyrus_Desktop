import http from 'node:http';

const port = Number(process.env.PAPYRUS_E2E_MOCK_PROVIDER_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PAPYRUS_E2E_MOCK_PROVIDER_PORT must be a valid port');
}

let requestCount = 0;
let toolTurnCount = 0;
let finalTurnCount = 0;

/**
 * 读取并解析单个 JSON 请求体。
 * 原因：假 Provider 必须验证 Papyrus 发出的真实模型消息，而不是盲目返回成功。
 * 未使用 Express：Node HTTP 足以提供三个确定端点，不增加测试依赖。
 */
async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * 返回 JSON 或 Ollama NDJSON 响应。
 * 原因：控制响应格式可让测试同时查询状态并驱动生产流解析器。
 * 未返回宽松文本：错误状态必须让调用方明确失败。
 */
function send(response, status, body, contentType = 'application/json') {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, JSON.stringify({ ok: true }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/state') {
    send(response, 200, JSON.stringify({ requestCount, toolTurnCount, finalTurnCount }));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/reset') {
    requestCount = 0;
    toolTurnCount = 0;
    finalTurnCount = 0;
    send(response, 200, JSON.stringify({ ok: true }));
    return;
  }
  if (request.method !== 'POST' || url.pathname !== '/api/chat') {
    send(response, 404, JSON.stringify({ error: 'not found' }));
    return;
  }

  try {
    const body = await readJsonBody(request);
    requestCount += 1;
    if (body.model !== 'e2e-automation-model') {
      send(response, 422, JSON.stringify({ error: 'unexpected model' }));
      return;
    }

    const toolNames = Array.isArray(body.tools)
      ? body.tools.map((tool) => tool?.function?.name).filter((name) => typeof name === 'string')
      : [];
    if (!toolNames.includes('read_data_stats') || toolNames.includes('create_card')) {
      send(response, 422, JSON.stringify({ error: 'unsafe or missing tool catalog' }));
      return;
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const toolMessage = messages.find((message) => message?.role === 'tool');
    if (!toolMessage) {
      toolTurnCount += 1;
      const toolCall = {
        id: 'e2e-read-stats',
        type: 'function',
        function: { name: 'read_data_stats', arguments: {} },
      };
      send(
        response,
        200,
        JSON.stringify({ message: { content: '', tool_calls: [toolCall] }, done: false }) + '\n'
          + JSON.stringify({ done: true }) + '\n',
        'application/x-ndjson',
      );
      return;
    }

    const toolResult = JSON.parse(typeof toolMessage.content === 'string' ? toolMessage.content : '{}');
    if (toolResult.success === false || typeof toolResult !== 'object') {
      send(response, 422, JSON.stringify({ error: 'missing successful tool result' }));
      return;
    }

    finalTurnCount += 1;
    send(
      response,
      200,
      JSON.stringify({
        message: { content: 'E2E automation completed with verified tool data' },
        done: false,
      }) + '\n' + JSON.stringify({ done: true }) + '\n',
      'application/x-ndjson',
    );
  } catch (error) {
    send(response, 400, JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
});

server.listen(port, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}