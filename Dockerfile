FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY src ./src
COPY scripts/build.ts ./scripts/build.ts
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-fund --no-audit

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
COPY scripts/migrate.ts scripts/provision-account.ts scripts/set-video.ts scripts/onboarding-admin.ts scripts/mentor-admin.ts ./scripts/
USER node
CMD ["node", "src/server.ts"]
