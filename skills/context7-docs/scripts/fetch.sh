#!/usr/bin/env bash
# Fetch topic-scoped docs for a library from Context7.
#
# Usage: fetch.sh <library> <version|latest> <query>
#
#   <library>  Human name of the library, e.g. "next.js", "django", "pydantic".
#   <version>  Context7 tag (matches upstream, e.g. "v15.1.8") or "latest".
#   <query>    The question to scope the returned snippets, e.g.
#              "app router server actions".
#
# Exits 0 on success and prints Context7's response to stdout.
# Exits non-zero on failure; prints a short diagnostic to stderr.
#
# Requires: curl, jq, and CONTEXT7_API_KEY in the environment.
# Get a key at https://context7.com/dashboard.

set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: fetch.sh <library> <version|latest> <query>" >&2
  exit 2
fi

library="$1"
version="$2"
query="$3"

if [[ -z "${CONTEXT7_API_KEY:-}" ]]; then
  echo "context7-docs: CONTEXT7_API_KEY is not set (get one at https://context7.com/dashboard)" >&2
  exit 1
fi

for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "context7-docs: '$bin' is required but not installed" >&2
    exit 1
  fi
done

: "${CONTEXT7_BASE_URL:=https://context7.com/api/v2}"
auth=(-H "Authorization: Bearer ${CONTEXT7_API_KEY}")

# 1. Resolve the human library name into a Context7 libraryId (e.g. /vercel/next.js).
if ! resolve=$(curl --fail --silent --show-error --max-time 20 "${auth[@]}" \
    --get --data-urlencode "libraryName=${library}" \
    "${CONTEXT7_BASE_URL}/libs/search"); then
  echo "context7-docs: search request failed for '${library}'" >&2
  exit 1
fi

# Response shape isn't pinned in Context7's public docs; try the common keys
# and take the top hit. On miss, dump the raw body to stderr so the student
# can inspect and tighten this filter.
library_id=$(printf '%s' "$resolve" | jq -r '
  ([.results, .libraries, .data, .] | map(select(type == "array")) | first // [])[0]?
  | (.libraryId // .id // .slug // empty)
')

if [[ -z "$library_id" || "$library_id" == "null" ]]; then
  echo "context7-docs: could not resolve '${library}' to a libraryId" >&2
  echo "context7-docs: raw search response follows --" >&2
  printf '%s\n' "$resolve" >&2
  exit 1
fi

# 2. Append the version to the libraryId path (Context7 uses /<owner>/<repo>/<tag>).
# Pass the version through as-is — the caller is expected to supply the tag
# Context7 uses upstream (e.g. "v15.1.8"), not a normalised semver.
path="$library_id"
if [[ "$version" != "latest" && -n "$version" ]]; then
  path="${library_id}/${version}"
fi

if ! body=$(curl --fail --silent --show-error --max-time 30 "${auth[@]}" \
    --get \
    --data-urlencode "libraryId=${path}" \
    --data-urlencode "query=${query}" \
    "${CONTEXT7_BASE_URL}/context"); then
  echo "context7-docs: context request failed for ${path}" >&2
  exit 1
fi

printf '%s\n' "$body"
