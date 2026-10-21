Frontend build fix v2

Fixes:
- exactOptionalPropertyTypes error in VoicePanel citations handling.
- Next.js 15 typedRoutes config warning.

Apply from the project root:
  unzip -o egypt-traffic-rag-frontend-buildfix-v2.zip -d .
  docker compose build frontend
  docker compose up -d
  docker compose ps
