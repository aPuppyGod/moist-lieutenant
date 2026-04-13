# Use official Node.js LTS image
FROM node:22

# Install build tools and libraries needed by canvas and image/font generation
RUN apt-get update && \
    apt-get install -y \
      build-essential \
      pkg-config \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev \
      fontconfig \
      fonts-dejavu-core \
      fonts-freefont-ttf \
      ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Expose the port (change if your app uses a different port)
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
