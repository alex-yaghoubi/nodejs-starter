# npm publishing and releases

This repository's package is `create-nodejs-standard-api` (version `0.3.0`).
The [manual publish workflow](.github/workflows/publish-npm.yml) does not run on pushes, pull requests, tags or deployments.

## Before publishing

- Confirm the latest manual validation run has **both** jobs successful: the generator build and PostgreSQL integration tests.
- Ensure the package name is available and your npm account is authorized to publish it.
- Inspect `npm pack --dry-run` for unexpected or sensitive files. Never publish credentials or generated `.env` files.
- Verify `main` is at the reviewed release commit.

## First npm release without using a local computer

A new npm package might not have a Trusted Publisher configuration yet. Bootstrap publishing with a **temporary npm granular token** that is authorized for new public packages and can publish with the required 2FA settings. Configure it as a GitHub **Actions repository secret** named `NPM_PUBLISH_TOKEN`. Do **not** paste the token into source code, chat, or a workflow file.

Then, in GitHub Actions, open **Publish npm package (manual)**, choose `main`, enter `0.3.0` as the confirmation value, and run it. The workflow checks the exact name and version, runs generator tests, inspects the package, and then attempts `npm publish --access public`. The publish step runs only from `main` after manual dispatch.

If your npm account cannot create a new package through that scoped token, use an authorized **interactive first publish** instead; do not weaken the registry's authentication requirements.

## After the first release

1. Check the actual package on npm: `npm view create-nodejs-standard-api@0.3.0 version`.
2. In npm package Settings, configure a GitHub Actions **Trusted Publisher** for user `alex-yaghoubi`, repository `nodejs-starter`, workflow filename `publish-npm.yml`, with permission to run `npm publish`. Review npm's current requirements.
3. **Revoke** the temporary npm token and **delete** the GitHub secret `NPM_PUBLISH_TOKEN`. Future manual releases can authenticate through OIDC rather than long-lived tokens.
4. Create a GitHub Release/tag from the published commit and update the README's pre-publication notice.

Never re-publish the same npm package version. Bump the package and generated template versions for future releases, update the confirmation guard, validate again, and only then release a new version.

See: https://docs.npmjs.com/trusted-publishers/ and https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/
