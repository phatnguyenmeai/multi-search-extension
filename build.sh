#!/usr/bin/env bash
# Assembles a loadable extension folder for each browser by combining the
# shared code in core/ with that browser's manifest.json.
#
# Usage:
#   ./build.sh            # build chrome, edge and firefox
#   ./build.sh firefox    # build only the named browser(s)
#
# Output goes to dist/<browser>/ — point your browser's "load unpacked"
# (or "load temporary add-on") at that folder.
set -euo pipefail

cd "$(dirname "$0")"

BROWSERS=("$@")
if [ ${#BROWSERS[@]} -eq 0 ]; then
  BROWSERS=(chrome edge firefox)
fi

for browser in "${BROWSERS[@]}"; do
  manifest="$browser/manifest.json"
  if [ ! -f "$manifest" ]; then
    echo "error: unknown browser '$browser' (no $manifest)" >&2
    exit 1
  fi

  out="dist/$browser"
  rm -rf "$out"
  mkdir -p "$out"

  # Shared code (everything in core/ except the icon generator).
  cp core/background.js core/content.js core/content.css \
     core/popup.html core/popup.js "$out/"
  cp -r core/icons "$out/icons"

  # Browser-specific manifest.
  cp "$manifest" "$out/manifest.json"

  echo "built $out"
done
