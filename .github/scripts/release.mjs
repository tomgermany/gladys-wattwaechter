// -----------------------------------------------------------------------------
// The release helper, called by .github/workflows/release.yml.
//
// WHY THIS IS A SCRIPT AND NOT SHELL
// It edits two JSON files and one Markdown file, and a mistake in any of them is
// published to every Gladys user as an update. JSON.parse / JSON.stringify keep
// the manifest valid by construction; a `sed` would not.
//
// WHAT IT TOUCHES, AND NOTHING ELSE
//   package.json                        `version`
//   gladys-assistant-integration.json   `version` and the tag in `docker_image`
//   CHANGELOG.md                        moves `## [Unreleased]` under the new
//                                       version and writes the release notes
//
// It prints `version` and `notes_file` as GitHub Actions outputs. The workflow
// commits the three files, tags `vX.Y.Z`, then publishes the release notes.
//
// RUNNING IT BY HAND
//   node .github/scripts/release.mjs patch
// It writes to the working tree and prints what it did. Nothing is committed:
// that is the workflow's job, so a local run is safe to inspect and discard.
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';

/** The version parts, bumped the way npm does it. */
function nextVersion(current, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`Not a plain semver version: ${current}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump: ${bump} (expected patch, minor or major)`);
}

const bump = process.argv[2];
if (!bump) throw new Error('Usage: release.mjs <patch|minor|major>');

// --- package.json ----------------------------------------------------------
const pkgPath = 'package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = nextVersion(pkg.version, bump);
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

// --- the manifest ----------------------------------------------------------
// Both `version` and the tag inside `docker_image`, because Gladys pulls
// `docker_image` and the indexer serves `version`. They have to agree, or
// Gladys offers an old image as if it were the new version.
const manifestPath = 'gladys-assistant-integration.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = version;
if (manifest.docker_image) {
  // Keep the repository, replace the tag: ghcr.io/owner/repo:1.0.0 -> :1.1.0
  manifest.docker_image = manifest.docker_image.replace(/:[^/:]+$/, `:${version}`);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// --- CHANGELOG.md ----------------------------------------------------------
// `## [Unreleased]` becomes `## [X.Y.Z] - YYYY-MM-DD`, and a fresh empty
// `## [Unreleased]` goes on top so the next release has somewhere to write.
const changelogPath = 'CHANGELOG.md';
const changelog = readFileSync(changelogPath, 'utf8');
const today = new Date().toISOString().slice(0, 10);
const marker = /^## \[Unreleased\]\s*$/m;

if (!marker.test(changelog)) {
  throw new Error('CHANGELOG.md has no "## [Unreleased]" heading to release');
}

const released = changelog.replace(marker, `## [Unreleased]\n\n## [${version}] - ${today}`);

// The release notes are the section that was just released, and nothing else.
const section = released.split(`## [${version}] - ${today}`)[1] ?? '';
const notes = section.split(/\n## \[/)[0].trim();
const notesFile = 'release-notes.md';
writeFileSync(notesFile, `${notes}\n`);
writeFileSync(changelogPath, released);

// --- report back to the workflow -------------------------------------------
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\nnotes_file=${notesFile}\n`,
    { flag: 'a' },
  );
}
console.log(`Released ${version}. Notes written to ${notesFile}.`);
