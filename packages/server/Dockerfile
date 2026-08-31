FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/mcp/package.json packages/mcp/package.json
COPY packages/level-ui/package.json packages/level-ui/package.json
COPY packages/server/package.json packages/server/package.json
RUN pnpm install --frozen-lockfile

COPY packages/level-ui packages/level-ui
COPY packages/server packages/server
RUN pnpm --filter @spec-quest/server build
RUN pnpm --filter @spec-quest/server deploy --prod --legacy /app

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV SUPERSAVE_CONNECTION=sqlite:///data/spec-quest.db
WORKDIR /app
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
