FROM oven/bun:1.3.5 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=8787
ENV AGENT_DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 8787
CMD ["bun", "src/main/index.ts"]
