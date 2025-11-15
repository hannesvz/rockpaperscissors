FROM node:18-bullseye

# Install system dependencies
RUN apt-get update && apt-get install -y \
  ffmpeg \
  libglib2.0-0 \
  libx11-6 \
  libxss1 \
  libappindicator1 \
  libindicator7 \
  fonts-liberation \
  xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV YOUTUBE_STREAM_KEY=""

CMD ["npm", "start"]
