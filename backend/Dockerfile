FROM node:22-alpine AS build
RUN corepack enable
RUN apk add --no-cache python3 make g++ openssl
WORKDIR /app

ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV DIRECT_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile=false

COPY packages/shared packages/shared
COPY backend backend
RUN pnpm --filter @docs/backend prisma:generate && pnpm --filter @docs/backend build

FROM node:22-alpine AS runtime
RUN corepack enable
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/backend /app/backend
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/main.js"]
