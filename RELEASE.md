# Release Checklist

Use this checklist to cut a new npm release for `@aredotna/cli`.

## 1) Preflight

- [ ] Ensure you are on the intended release branch:

```bash
git branch --show-current
```

- [ ] Ensure working tree is clean:

```bash
git status --short
```

- [ ] Run full checks:

```bash
npm run check
```

## 2) Confirm npm auth

- [ ] Verify npm login:

```bash
npm whoami
```

If this fails with `401 Unauthorized`, authenticate first:

```bash
npm login
```

## 3) Bump version

- [ ] Choose version type (`patch`, `minor`, `major`) and bump:

```bash
npm version patch
```

This updates `package.json`, creates a release commit, and creates a git tag.

## 4) Publish package

- [ ] Publish to npm:

```bash
npm publish
```

## 5) Push commit + tag

- [ ] Push branch and tags:

```bash
git push origin "$(git branch --show-current)" --follow-tags
```

## 6) Verify release

- [ ] Check published version:

```bash
npm view @aredotna/cli version
```

- [ ] Confirm tag exists remotely:

```bash
git ls-remote --tags origin | tail
```

## 7) Optional post-release smoke test

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

- `npm whoami` fails with 401: run `npm login` and retry.
- `npm publish` says version exists: bump again (`npm version patch`) and republish.
- Push fails due to remote changes: rebase/merge branch, rerun checks, then push again.
