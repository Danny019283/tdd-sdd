const cache = new Map<string, RegExp>();

function toRegExp(pattern: string): RegExp {
  let regex = cache.get(pattern);
  if (regex) return regex;
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*" && pattern[i + 1] === "*") {
      const slash = pattern[i + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  regex = new RegExp(`^${source}$`);
  cache.set(pattern, regex);
  return regex;
}

/** Glob mínimo sobre rutas relativas con `/`: `*`, `**` y `?`. */
export function matchesGlob(path: string, pattern: string): boolean {
  return toRegExp(pattern).test(path);
}
