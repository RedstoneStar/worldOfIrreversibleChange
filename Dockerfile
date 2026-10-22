FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY shared ./shared
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chmod -R 777 /app/data

ENV PORT=7860
EXPOSE 7860

CMD ["node", "server/index.js"]
