/**
 * Render a human-readable project name.
 *
 * Claude encodes a project's absolute path into a slug by replacing every
 * non-alphanumeric char with `-`, which is lossy: `marcello.barile` and
 * `camunda-hub` both collapse to dashes, so the slug alone can't recover the
 * real path. When the true `cwd` (read from the session transcript) is known we
 * use it, shortening the home dir to `~`. Otherwise we fall back to a cosmetic
 * dot-separated form of the slug.
 */

function tildify(path: string): string {
  const home = path.match(/^\/(?:Users|home)\/[^/]+(?=\/|$)/);
  return home ? "~" + path.slice(home[0].length) : path;
}

function cosmeticSlug(slug: string): string {
  return slug.replace(/^-+/, "").replace(/-/g, " · ");
}

export function prettyProjectName(cwd: string | undefined, slug: string): string {
  return cwd ? tildify(cwd) : cosmeticSlug(slug);
}
