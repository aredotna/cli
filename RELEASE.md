# Release Checklist

Use this checklist to cut a new npm release for `@aredotna/cli`.

Publishing is automated by GitHub Actions when a PR with a release label is merged to `main`.
Use exactly one label on the PR: `major`, `minor`, or `patch`.
The workflow bumps the version, publishes to npm with trusted publishing (OIDC), pushes the release commit and tag, and creates a GitHub Release.

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

This triggers `.github/workflows/publish.yml`.

## 3) Confirm publish workflow success

- [ ] Wait for the "Publish" workflow on the pushed tag to complete successfully:

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

- Publish job fails with OIDC/trusted publishing error: verify trusted publisher settings on npm exactly match `aredotna/cli` and workflow file `publish.yml`.
- Workflow skips publishing: merged PR did not contain one of `major`, `minor`, or `patch` labels.
- Workflow fails with multiple release labels: keep exactly one of `major|minor|patch` on the PR.
