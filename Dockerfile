FROM node:24.14.1-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/emails/package.json packages/emails/package.json
RUN npm ci --ignore-scripts --no-fund

FROM dependencies AS builder
COPY . .
ARG NEXT_PUBLIC_DATA_MODE=demo
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY
ENV NEXT_PUBLIC_DATA_MODE=$NEXT_PUBLIC_DATA_MODE NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY=$NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY NEXT_STANDALONE=true NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24.14.1-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node","server.js"]
