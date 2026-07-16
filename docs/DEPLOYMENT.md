# Deployment

## Production contract

- Production URL: `https://gradient-text-gen.potato4d.me/`
- Production branch: `master`
- Hosting: AWS Amplify Hosting
- Trigger: every push to `master`, including pull-request merges
- Build specification: [`amplify.yml`](../amplify.yml)

AWS Amplify is connected directly to the GitHub repository. The branch build runs strict TypeScript checks and the unit suite before producing the static Vite application from `dist/client`. A failed check prevents publication.

## Release flow

1. Merge reviewed changes into `master`.
2. Amplify detects the new `master` commit and starts a deployment.
3. The build runs `npm ci`, TypeScript checks, tests, and the web production build.
4. Amplify publishes `dist/client` only after every build command succeeds.
5. Verify the production URL and confirm that its deployed revision matches the merged commit.

The Chrome/ImageMagick Sketch oracle remains a local merge-grade check through `npm run verify`; it is intentionally excluded from the hosted build because the managed build image does not provide the pinned renderer environment.

## Rollback

Use Amplify Hosting's deployment history to redeploy the last known-good `master` build. Reverting the faulty commit on `master` creates a new auditable deployment and is preferred when repository history must describe the rollback.

## Legacy Sites project

The repository retains `.openai/hosting.json` for the existing Sites project until the Amplify custom domain is verified. Do not deploy both providers to the production hostname at the same time. Remove the legacy custom-domain association only after Amplify reports that the hostname and certificate are active.
