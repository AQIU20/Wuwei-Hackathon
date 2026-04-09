FROM oven/bun:1.3.11 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=8787
ENV AGENT_DATA_DIR=/data
ENV AI_NODE_PYTHON_BIN=/usr/bin/python3
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /data
EXPOSE 8787
CMD ["bun", "src/main/index.ts"]
