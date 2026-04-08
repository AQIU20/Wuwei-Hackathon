const DEFAULT_AGENT_SERVER_URL = "http://localhost:8787";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAgentServerUrl() {
  return trimTrailingSlash(
    process.env.NEXT_PUBLIC_AGENT_SERVER_URL || DEFAULT_AGENT_SERVER_URL,
  );
}

