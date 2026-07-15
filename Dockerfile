FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache git git-lfs
COPY package.json package-lock.json ./
RUN npm ci

COPY .gitattributes ./
COPY . .
RUN git lfs install && git lfs pull || true
RUN npm run build

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/public/downloads ./public/downloads

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
