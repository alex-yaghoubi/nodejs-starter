FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production
ENV HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json
USER node
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
