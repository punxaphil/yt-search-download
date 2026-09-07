FROM ghcr.io/home-assistant/base:latest

RUN apk add --no-cache \
    wget \
    ffmpeg \
    curl \
    nodejs \
    npm

RUN wget -q \
    https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -O /usr/bin/yt-dlp \
    && chmod a+x /usr/bin/yt-dlp

WORKDIR /app

COPY . .
RUN npm install

ENV YTDLP_COOKIES_FILE=/app/cookie.txt

CMD npm run start
