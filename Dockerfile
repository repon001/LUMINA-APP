# ---- build ----
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.prod.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Generates src/generated/prisma, which tsc then compiles into dist/.
RUN npx prisma generate
RUN npm run build

# ---- runtime ----
FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Needed by `prisma migrate deploy` at release time.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

USER node
EXPOSE 4000

CMD ["node", "dist/server.js"]
