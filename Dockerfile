# 51 Mimi Games as a container: one Node process serving the hub, its API and the /mp multiplayer relay on one port.
#
#   docker build -t owen-minigames .
#   docker run -d --name mimi-games -p 1764:1764 -v mimi-data:/var/lib/mimi owen-minigames
#
# (docker compose up -d --build does the same; see docker-compose.yml and "Running with Docker" in the README.)
#
# Why it looks like this:
#  - There is no build step in this project, so the image is just "production dependencies + the files the server serves".
#    What goes in is decided by .dockerignore (no Electron builds, Wii port, downloads, local data or certificates).
#  - Accounts, leaderboards and the rest are JSON files under MIMI_DATA_DIR/data. That is the one volume to keep and back up.
#  - It listens on plain HTTP. TLS belongs on a reverse proxy in front (passkeys and voice chat need HTTPS); if you mount
#    certs/cert.pem + certs/key.pem into /app/certs the server switches to HTTPS itself, but then also opens a second plain
#    HTTP port that serves everything, so don't do that on a network you don't trust.
#  - tini is PID 1 because Node as PID 1 ignores SIGTERM, which would make `docker stop` wait ten seconds and then kill it.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Production dependencies only (ws, @simplewebauthn/server, electron-updater); Electron itself is a devDependency.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:${NODE_VERSION}-alpine
LABEL org.opencontainers.image.title="51 Mimi Games" \
      org.opencontainers.image.description="A hub of mini-games with accounts, leaderboards and multiplayer rooms" \
      org.opencontainers.image.source="https://github.com/asherwin86/owen-minigames" \
      org.opencontainers.image.licenses="ISC"

RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=1764 \
    MIMI_DATA_DIR=/var/lib/mimi

WORKDIR /app

# The data directory is created and handed to the unprivileged "node" user before VOLUME is declared, so a fresh named
# volume inherits that ownership. (A bind mount keeps the host's ownership: chown it to uid 1000, see the README.)
RUN mkdir -p /var/lib/mimi && chown node:node /var/lib/mimi

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js index.html sw.js manifest.webmanifest robots.txt LICENSE ./
COPY --chown=node:node .well-known ./.well-known
COPY --chown=node:node icons ./icons
COPY --chown=node:node css ./css
COPY --chown=node:node games ./games
COPY --chown=node:node js ./js

USER node
VOLUME /var/lib/mimi
EXPOSE 1764

# Plain Node, so the image needs no curl/wget. 200 on / means the static files and the request handler are both alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||1764,path:'/'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
