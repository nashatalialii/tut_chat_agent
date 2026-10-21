FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --filter @egypt-traffic/frontend... --prod=false --no-frozen-lockfile

COPY backend ./backend
COPY frontend ./frontend
RUN pnpm --filter @egypt-traffic/frontend build

FROM build AS runtime
ENV NODE_ENV=production
WORKDIR /app/frontend
EXPOSE 3000
CMD ["pnpm", "start"]
