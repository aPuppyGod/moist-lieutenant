# Use official Node.js LTS image
FROM node:22

# Install fontconfig and some common fonts
RUN apt-get update && \
    apt-get install -y fontconfig fonts-dejavu-core fonts-freefont-ttf ffmpeg && \
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
