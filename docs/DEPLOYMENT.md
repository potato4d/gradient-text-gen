# Deployment

## Production contract

- Production URL: `https://gradient-text-gen.potato4d.me/`
- Production branch: `master`
- Hosting: ChatGPT Sites
- Project binding: [`.openai/hosting.json`](../.openai/hosting.json)
- Release source: a validated commit on `master`

The repository uses its existing Cloudflare Worker-compatible build and the Sites release workflow. A release is saved only after the exact source commit has been pushed to the Sites source repository and `npm run verify` has passed locally.

## Release flow

1. Merge reviewed changes into `master`.
2. Run the complete verification gate and production build from that exact commit.
3. Push the exact commit to the Sites source repository with a short-lived repository credential.
4. Package `dist/` and the hosting metadata, then save a Sites version against the pushed commit SHA.
5. Deploy the saved version and poll until Sites reports a successful production publication.
6. Verify both the Sites URL and the custom production URL in Chrome.

The Chrome/ImageMagick Sketch oracle remains part of `npm run verify`, so a release must retain the pinned Frame 2 visual threshold and Web/CLI byte equality before publication.

## Rollback

Redeploy the last known-good saved Sites version when an immediate rollback is required. Reverting the faulty commit on `master`, rebuilding, and publishing a new Sites version is preferred when repository history must describe the rollback.

## Legacy Amplify specification

The tracked `amplify.yml` is historical and is not the active production contract. Do not connect Amplify to the production hostname or deploy both providers to the custom domain.
