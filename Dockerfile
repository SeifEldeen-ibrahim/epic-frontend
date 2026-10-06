# syntax=docker/dockerfile:1

ARG APP_UID=1000
ARG APP_GID=1000

# --- deps: install exactly what the lockfile pins ---------------------------
FROM node:22-alpine AS deps
ARG APP_UID
ARG APP_GID
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund \
 && chown -R ${APP_UID}:${APP_GID} /app/node_modules

# --- dev: Vite dev server behind the reverse proxy --------------------------
FROM deps AS dev
ARG APP_UID
ARG APP_GID
COPY . .
RUN chown -R ${APP_UID}:${APP_GID} /app
USER ${APP_UID}:${APP_GID}
# The runtime user has no writable HOME; keep npm's cache in /tmp.
ENV npm_config_cache=/tmp/.npm npm_config_update_notifier=false
EXPOSE 8080
# The bind mount hides the image node_modules; install from the lockfile on first start.
CMD ["sh", "-c", "[ -x node_modules/.bin/vite ] || npm ci --no-audit --no-fund; exec npm run dev"]

# --- build: type-check and produce static assets ----------------------------
FROM deps AS build
COPY . .
RUN npm run build

# --- static: final, default target (must stay last) -------------------------
FROM nginx:1.28-alpine AS static
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
