# Release Checklist

Use this checklist to cut a new npm release for `@aredotna/cli`.

Publishing is automated by GitHub Actions when a PR with a release label is merged to `main`.
Use exactly one label on the PR: `major`, `minor`, or `patch`.
The `Release` workflow bumps the version and pushes the release commit and tag.
That tag then triggers the `Publish` workflow, which publishes to npm using the `NPM_TOKEN` GitHub secret and creates the GitHub Release.

## 1) Preflight

- [ ] Ensure release label is present on the PR:

```bash
gh pr view --json labels --jq '.labels[].name'
```

- [ ] Verify exactly one of `major|minor|patch` is set.

- [ ] (Optional) Run full checks locally before merge:

```bash
npm run check
```

## 2) Merge the PR to `main`

- [ ] Merge the labeled PR.

This triggers `.github/workflows/release.yml`.

## 3) Confirm publish workflow success

- [ ] Wait for the `Release` workflow to complete successfully:

```bash
gh run list --workflow release.yml --limit 5
```

- [ ] Wait for the `Publish` workflow on the created tag to complete successfully:

```bash
gh run list --workflow publish.yml --limit 5
```

## 4) Verify release

- [ ] Check published version:

```bash
npm view @aredotna/cli version
```

- [ ] Verify GitHub Release exists for the tag:

```bash
VERSION="$(npm view @aredotna/cli version)"
gh release view "v${VERSION}"
```

## 5) Optional post-release smoke test

- [ ] Install latest globally:

```bash
npm i -g @aredotna/cli@latest
```

- [ ] Verify CLI:

```bash
arena --help
arena whoami --json
```

## Troubleshooting

- Publish job fails with npm auth error (401/404): verify the `NPM_TOKEN` repository secret exists and has permission to publish `@aredotna/cli`.
- Workflow skips publishing: merged PR did not contain one of `major`, `minor`, or `patch` labels.
- Workflow fails with multiple release labels: keep exactly one of `major|minor|patch` on the PR.
- Release job says `main` advanced after the PR merged: re-run the `Release` workflow manually after reviewing current `main`.
- Publish job fails after the tag already exists: re-run the `Publish` workflow with the existing tag instead of creating a new version bump.
