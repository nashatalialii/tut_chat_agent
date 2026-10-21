FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --filter @egypt-traffic/backend... --prod=false --no-frozen-lockfile

COPY backend ./backend
COPY data ./data
RUN pnpm --filter @egypt-traffic/backend build

FROM build AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend
EXPOSE 4000
CMD ["pnpm", "start"]
