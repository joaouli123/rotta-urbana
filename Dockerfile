FROM node:22-alpine
WORKDIR /app
COPY railway-admin/package*.json ./
RUN npm ci --only=production
COPY railway-admin/ ./
EXPOSE 4100
ENV PORT=4100
CMD ["node", "server.js"]
