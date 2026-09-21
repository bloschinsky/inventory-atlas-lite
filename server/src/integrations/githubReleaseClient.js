import { httpError } from '../httpError.js';
import { parseVersion } from '../update/semver.js';

const API = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 10 * 1000;

/*
  The only place that talks to GitHub. It answers one question - "what is the latest stable release
  of this repository?" - for one repository that is fixed at construction time. The rest of the
  backend depends on this small interface instead of on the shape of the GitHub API, and the
  response is cached so that opening the About dialog repeatedly does not spend the anonymous rate
  limit. Authentication is never used: the repository is public.
*/
export class GitHubReleaseClient {
  #cache = null;
  #pending = null;

  constructor({ owner, repository, cacheTtlMs = 10 * 60 * 1000, fetchImpl = fetch, now = () => Date.now() }) {
    this.owner = owner;
    this.repository = repository;
    this.cacheTtlMs = cacheTtlMs;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  // Resolves to { version, tag, url, publishedAt }, or null when the repository has no stable release.
  async latestStable() {
    if (this.#cache && this.#cache.expiresAt > this.now()) return this.#cache.value;
    // A burst of requests while the first one is still open shares that one call.
    this.#pending ??= this.#load().finally(() => { this.#pending = null; });
    return this.#pending;
  }

  async #load() {
    const releases = await this.#request(`/repos/${this.owner}/${this.repository}/releases?per_page=20`);
    if (!Array.isArray(releases)) throw httpError('GitHub returned an unexpected response.', 502);
    const value = this.#newestStable(releases);
    this.#cache = { value, expiresAt: this.now() + this.cacheTtlMs };
    return value;
  }

  // Drafts and prereleases are never offered as an update, and neither is a tag we cannot compare.
  #newestStable(releases) {
    for (const release of releases) {
      if (release?.draft || release?.prerelease) continue;
      const version = String(release?.tag_name ?? '').replace(/^v/, '');
      if (!parseVersion(version) || parseVersion(version).prerelease.length > 0) continue;
      return {
        version,
        tag: release.tag_name,
        url: typeof release.html_url === 'string' ? release.html_url : null,
        publishedAt: typeof release.published_at === 'string' ? release.published_at : null
      };
    }
    return null;
  }

  async #request(pathname) {
    let response;
    try {
      response = await this.fetchImpl(`${API}${pathname}`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'inventory-atlas-lite' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      console.error(error);
      throw httpError('Could not reach GitHub to check for updates.', 502);
    }
    if (response.status === 403 || response.status === 429) {
      throw httpError('GitHub is rate limiting update checks. Try again later.', 503);
    }
    if (!response.ok) {
      console.error(`GitHub answered ${response.status} for ${pathname}.`);
      throw httpError('GitHub could not be queried for the latest release.', 502);
    }
    try {
      return await response.json();
    } catch (error) {
      console.error(error);
      throw httpError('GitHub returned an unexpected response.', 502);
    }
  }
}
