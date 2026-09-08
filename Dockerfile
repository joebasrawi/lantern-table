FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:railway
ENV NODE_ENV=production LANTERN_DATA_DIR=/data
EXPOSE 3000
CMD ["pnpm", "start:railway"]
