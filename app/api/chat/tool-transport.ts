const DEFAULT_TIMEOUT_MS = 1500;

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function buildRequest(tool: string, payload: unknown) {
  return {
    type: "tool.call" as const,
    tool,
    payload,
    requestId: `req-${tool}-${Date.now()}-${randomId()}`,
    timestamp: new Date().toISOString(),
  };
}

async function sendWebSocketToolCall<TPayload>(
  url: string,
  tool: string,
  payload: TPayload,
) {
  const request = buildRequest(tool, payload);

  return await new Promise<unknown>((resolve, reject) => {
    const ws = new WebSocket(url);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new Error(`websocket tool call timed out: ${tool}`));
      });
    }, DEFAULT_TIMEOUT_MS);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(request));
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          requestId?: string;
          ok?: boolean;
          payload?: unknown;
          error?: string;
        };

        if (message.requestId && message.requestId !== request.requestId) {
          return;
        }

        finish(() => {
          if (message.ok === false) {
            reject(new Error(message.error ?? `websocket tool call failed: ${tool}`));
            return;
          }

          resolve({
            ok: true,
            mock: false,
            tool,
            transport: "websocket",
            requestId: message.requestId ?? request.requestId,
            timestamp: new Date().toISOString(),
            payload: message.payload ?? message,
          });
        });
      } catch (error) {
        finish(() => {
          reject(error instanceof Error ? error : new Error("invalid websocket response"));
        });
      }
    });

    ws.addEventListener("error", () => {
      finish(() => {
        reject(new Error(`websocket connection failed: ${tool}`));
      });
    });

    ws.addEventListener("close", () => {
      finish(() => {
        reject(new Error(`websocket closed before response: ${tool}`));
      });
    });
  });
}

function attachFallbackMetadata<TResult>(
  result: TResult,
  meta: {
    attemptedUrl: string;
    reason: string;
  },
): TResult {
  if (!result || typeof result !== "object") {
    return result;
  }

  return {
    ...result,
    fallback: {
      attemptedTransport: "websocket",
      attemptedUrl: meta.attemptedUrl,
      reason: meta.reason,
    },
  };
}

export function createToolExecutor<TPayload, TResult>(
  tool: string,
  mockHandler: (payload: TPayload) => Promise<TResult>,
) {
  return async (payload: TPayload): Promise<TResult> => {
    const url = process.env.UNFORCE_HOST_WS_URL;

    if (!url) {
      return mockHandler(payload);
    }

    try {
      return (await sendWebSocketToolCall(url, tool, payload)) as TResult;
    } catch (error) {
      const mockResult = await mockHandler(payload);

      return attachFallbackMetadata(mockResult, {
        attemptedUrl: url,
        reason:
          error instanceof Error ? error.message : `websocket tool call failed: ${tool}`,
      });
    }
  };
}
