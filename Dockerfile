FROM node:22-bookworm-slim AS build

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      pkg-config \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev \
      ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libcairo2 \
      libpango-1.0-0 \
      libjpeg62-turbo \
      libgif7 \
      librsvg2-2 \
      fontconfig \
      fonts-dejavu-core \
      fonts-freefont-ttf \
      ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/assets ./assets
COPY --from=build /app/guild_page_new.html ./guild_page_new.html

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["npm", "start"]
