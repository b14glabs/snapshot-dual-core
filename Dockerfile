# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /home/node/app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /home/node/app

# Only copy necessary files from the build stage
COPY --from=builder /home/node/app/dist ./dist
COPY --from=builder /home/node/app/package*.json ./

RUN mkdir -p /home/node/app/volumes/
# Install only production dependencies
RUN npm install --only=production

EXPOSE 3000
CMD ["node", "./dist/main.js"]
