# Upstream Sync Process

This fork intentionally tracks two repositories:

- `origin`: `https://github.com/g4mm4p4nd4/gstack.git`
- `upstream`: `https://github.com/garrytan/gstack.git`

Use merge-based updates from `upstream/main`. Do not rebase local fork commits onto upstream unless the fork is being intentionally rewritten.

## One-command start

```bash
bun run upstream:sync
```

The script:

1. Ensures both remotes exist and point at the expected repositories.
2. Refuses to start when tracked files are dirty.
3. Fetches `origin` and `upstream` with prune.
4. Creates a safety branch from the current branch.
5. Starts `git merge --no-ff --no-commit upstream/main`.

If there are no conflicts, review the staged merge, run verification, commit, fast-forward `main`, and push `origin/main`.

If there are conflicts, resolve them with this policy:

- Prefer upstream for generated core gstack content, framework code, and release metadata.
- Preserve local-only Portfolio OS files and package scripts unless upstream has shipped a complete replacement.
- Regenerate generated skill docs from templates instead of hand-editing generated output when possible.
- Keep `bin/gstack-global-discover` as a build artifact, not a tracked binary, when upstream deletes it.

## Verification

Run the local fork checks plus the upstream free test suite:

```bash
bun run gen:skill-docs --host all
bun run automation:pos-smoke
bun test
```

For large upstream jumps, also run `bun run build` before pushing.

## Landing

```bash
git status --short
git commit -m "Merge upstream gstack"
git checkout main
git merge --ff-only <sync-branch>
git push origin main
```

If `main` moved while resolving the merge, restart from `main` with `bun run upstream:sync` instead of force-pushing.
