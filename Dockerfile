FROM node:24-alpine

# dumb-init is PID 1 so a SIGTERM from the Gladys supervisor reaches node
# instead of being swallowed, and the integration can close its Modbus socket
# instead of leaving the device holding a dead connection for five minutes.
RUN apk add --no-cache dumb-init

WORKDIR /app

# Dependencies first: this layer is cached and only rebuilt when the lockfile
# changes. `npm ci` is preferred, but falls back to `npm install` so the image
# still builds if the lockfile is out of step.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY index.js ./
COPY src ./src
COPY gladys-assistant-integration.json ./

ENV NODE_ENV=production

# The rootfs is read-only under the Gladys sandbox, so /data is the only place
# the process may write. It is created here and handed to the unprivileged user.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
