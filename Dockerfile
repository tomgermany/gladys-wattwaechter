FROM node:24-alpine

# dumb-init is PID 1 so a SIGTERM from the Gladys supervisor reaches node
# instead of being swallowed, and the integration can close its Modbus socket
# instead of leaving the device holding a dead connection for five minutes.
RUN apk add --no-cache dumb-init

WORKDIR /app

# DEPENDENCIES: npm install, AND NO LOCKFILE
# `npm ci` needs a lockfile and refuses to run without one; it also refuses when
# the lockfile and package.json disagree by a byte, and it fails with a non-zero
# exit code — which a Docker RUN treats as a failed layer even when a
# `|| npm install` follows. That is what turned the CI Docker job red while the
# integration itself was fine.
#
# `npm install --omit=dev` resolves the runtime dependencies from package.json,
# which is the only thing the image needs: the dev dependencies are the lint and
# formatting tools, and they have no place in a container. There is no lockfile
# in the repository on purpose — it is generated here, in the build, and thrown
# away with the layer.
COPY package.json ./
RUN npm install --omit=dev

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
