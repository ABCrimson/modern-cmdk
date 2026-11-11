# Release notes

Each GitHub release of a package gets a body that `scripts/compose-release-notes.ts` composes after
`changeset publish` has created the release. A person writes one part of it, the summary file, and
it ships in the released commit.

## The summary file

Add `.github/release-notes/<package>@<version>.md` for every package a release publishes, in a pull
request to `main` that merges before the version PR, or as a commit on the version PR itself. The
release workflow rebuilds the version PR branch from `main` on every push to `main`, which drops a
commit made on that branch, so a file committed there must be re-added after any later merge. The
name is the release tag: `modern-cmdk@1.7.0.md` for the release tagged `modern-cmdk@1.7.0`. A release without its summary file fails the `release-notes` job, and its
release keeps the changelog body that `changeset publish` gave it until someone composes the body by
hand (see Try it) and sets it with `gh release edit <tag> --notes-file <file>`. Re-running the job
does not help: it checks out the commit that was released, which lacks a file added later.

The file holds these parts and nothing else (the job adds the rest):

````markdown
**Upgrade:** `npm install <package>@<version>` · **Breaking:** <none | the changes> · **Deprecated:** <none | the names>

<One to three sentences: what someone upgrading will notice, in plain words.>

### Before you upgrade

- <each change a working app can notice, and what to do; "Nothing to do." when empty>

### Highlights

- <three to five user-facing changes, one sentence each, each linking its docs page>
````

The job refuses a file whose first paragraph is not the `**Upgrade:**` line with the exact install
command of that tag, or that lacks either heading.

## What the job adds

In this order, after the summary file:

1. For `modern-cmdk`, the size line, written from `benchmarks/size-history/<version>.json`: the gzip
   sizes of the core, of the core with React and of `styles.css`, linked to the record at the
   released commit. A version without a record gets no size line.
2. The package's `CHANGELOG.md` section for the version, inside `<details>`.
3. The footer: the full diff against the previous release of the same package, the npm page, the
   documentation and the changelog.

For `create-modern-cmdk`, a `**Scaffolds:** modern-cmdk <version>` line follows the Upgrade line. It
names the `modern-cmdk` version in the same checkout, the one the build bakes into the scaffolder.

Last, the job marks the highest `modern-cmdk` release as the repository's Latest release, so a
release of `create-modern-cmdk` or `modern-cmdk-codemod` in the same run does not keep it.

## Rules for the text

- Write what the code does in this version, in the present tense, in short plain sentences.
- No internal ids, no commit hashes in prose, no promises about future versions.
- No images and no alerts.
- Write `@crimson_dev/...` package names inside code spans only.

## Try it

From the repository root, with the release tags in a file:

```sh
gh release list --limit 1000 --json tagName,isDraft --jq '.[] | select(.isDraft | not) | .tagName' > tags.txt
node scripts/compose-release-notes.ts compose --tag <package>@<version> \
  --tags-file tags.txt --commit "$(git rev-parse HEAD)"
```

The body goes to standard output; `--out <file>` writes it to a file instead. The script reads
only files of the checkout.
