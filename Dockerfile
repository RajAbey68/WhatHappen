FROM node:20-slim

# System deps: libpst for PST parsing, ClamAV for virus scanning
RUN apt-get update && apt-get install -y \
    libpst-dev \
    pst-utils \
    clamav \
    clamav-freshclam \
    && freshclam --quiet \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Install ALL deps (including devDeps) so Next.js build has autoprefixer/postcss
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV NODE_ENV=production

RUN npm run build

# Prune devDependencies after build to keep image lean
RUN npm prune --omit=dev

EXPOSE 8080

CMD ["npm", "start"]
