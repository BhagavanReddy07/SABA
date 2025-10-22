# Automated deployment instructions

This repository includes GitHub Actions workflows to deploy the frontend to Vercel and to build/push a backend container image to GitHub Container Registry.

Required repository secrets (set in GitHub -> Settings -> Secrets -> Actions):

- VERCEL_TOKEN
- VERCEL_ORG_ID
- VERCEL_PROJECT_ID
- (Optional) GITHUB_TOKEN is automatically provided; if you use a PAT for GHCR write permissions, set GHCR_PAT.

How it works:
- `frontend-deploy.yml` builds the Next.js app and triggers the `amondnet/vercel-action` to deploy to Vercel.
- `backend-build-and-push.yml` builds your backend Docker image from `backend/Dockerfile` and pushes it to GHCR as `ghcr.io/<owner>/saba-backend:latest`.

To trigger: push to `main`.
