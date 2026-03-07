FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/homefs-shared/package.json packages/homefs-shared/package.json
COPY services/homefs-telegram-bot/package.json services/homefs-telegram-bot/package.json
COPY tsconfig.base.json tsconfig.base.json

RUN npm ci --workspaces --include-workspace-root

COPY packages/homefs-shared packages/homefs-shared
COPY services/homefs-telegram-bot services/homefs-telegram-bot

RUN npm run -w packages/homefs-shared build
RUN npm run -w services/homefs-telegram-bot build

FROM node:20-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/homefs-shared/package.json packages/homefs-shared/package.json
COPY services/homefs-telegram-bot/package.json services/homefs-telegram-bot/package.json

RUN npm ci --omit=dev --workspaces --include-workspace-root

COPY --from=builder /app/packages/homefs-shared/dist packages/homefs-shared/dist
COPY --from=builder /app/services/homefs-telegram-bot/dist services/homefs-telegram-bot/dist

ENV NODE_ENV=production
WORKDIR /app/services/homefs-telegram-bot

CMD ["node", "dist/index.js"]
