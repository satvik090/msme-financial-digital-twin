FROM node:22-alpine AS api-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS web-build
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=api-build /app/dist ./dist
COPY src/db/schema.sql ./dist/db/schema.sql
COPY --from=web-build /web/dist/dashboard/browser ./dist/public
EXPOSE 3000
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/server.js"]
