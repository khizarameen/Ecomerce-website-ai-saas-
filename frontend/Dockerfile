# Stage 1: Build React 19 + Vite bundle
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_STRIPE_PUBLIC_KEY=""

ENV VITE_API_URL="" \
    VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID}" \
    VITE_STRIPE_PUBLIC_KEY="${VITE_STRIPE_PUBLIC_KEY}"

RUN npm run build

# Stage 2: Serve SPA & reverse proxy API/media via Nginx
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

RUN mkdir -p /usr/share/nginx/media

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
