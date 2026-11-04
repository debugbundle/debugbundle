ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE}
# Tooling only; source and existing locked node_modules are mounted at execution.
RUN apk add --no-cache git && corepack enable && corepack prepare pnpm@11.3.0 --activate
