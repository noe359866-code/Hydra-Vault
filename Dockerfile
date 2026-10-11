FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=7000
EXPOSE 7000
CMD ["node", "server.js"]
