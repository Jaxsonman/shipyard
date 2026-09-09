#!/bin/bash
# eval.sh — run a plugin's `claude plugin eval` suite and print a one-line
# per-plugin summary.
#
# Usage: scripts/eval.sh <plugin|all> [--live]
#
#   <plugin>   One of: prd kanban planning dev qa ship pr   — or "all".
#   --live     Run the plugin's opt-in live case(s) (tag "live") instead of
#              the default, board-free cases (tag "default"). Live cases
#              talk to a real board and must never run unattended in CI.
#
# Every case in plugins/<x>/evals/ carries tags: ["default"] except exactly
# one opt-in "live" case per plugin, which carries tags: ["live"] only.
# `--tag` is how we select one set without the other — the CLI does not
# exclude tagged cases from a plain run, so the tag filter is load-bearing,
# not decorative.
#
# Runs with --runs 1 (one run per case; suite authors set case-level `runs`
# for multi-sample cases), --max-cost-usd 3 per plugin (hard ceiling — the
# CLI aborts and reports partial results rather than overrunning), --json to
# a report file, and --threshold 0.8 (exit 1 if any case scores below 0.8).
#
# Exit codes: 0 every invoked plugin met the threshold; 1 at least one did
# not (or errored); 2 usage error.
set -u

usage() {
  echo "Usage: scripts/eval.sh <plugin|kanban|planning|dev|qa|ship|pr|all> [--live]" >&2
  exit 2
}

ALL_PLUGINS="prd kanban planning dev qa ship pr"
MAX_COST_USD="${EVAL_MAX_COST_USD:-3}"
THRESHOLD="${EVAL_THRESHOLD:-0.8}"

[ "$#" -ge 1 ] || usage
TARGET="$1"; shift

LIVE=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --live) LIVE=true ;;
    -h|--help) usage ;;
    *) echo "eval.sh: unknown argument: $1" >&2; usage ;;
  esac
  shift
done

if [ "$TARGET" = "all" ]; then
  PLUGINS="$ALL_PLUGINS"
else
  case " $ALL_PLUGINS " in
    *" $TARGET "*) PLUGINS="$TARGET" ;;
    *) echo "eval.sh: unknown plugin '$TARGET' (expected one of: $ALL_PLUGINS, or all)" >&2; exit 2 ;;
  esac
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="${CLAUDE_SCRATCHPAD:-/tmp}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="$SCRATCH/shipyard-evals/$TS"
mkdir -p "$REPORT_DIR"

TAG="default"
$LIVE && TAG="live"

echo "eval.sh: running tag=$TAG runs=1 max-cost-usd=$MAX_COST_USD threshold=$THRESHOLD" >&2
echo "eval.sh: reports under $REPORT_DIR" >&2

overall_exit=0

for p in $PLUGINS; do
  dir="$REPO_ROOT/plugins/$p"
  eval_dir="$dir/evals"
  if [ ! -d "$eval_dir" ]; then
    echo "$p: SKIP (no evals/ directory)"
    continue
  fi

  json_out="$REPORT_DIR/$p.json"
  html_out="$REPORT_DIR/$p.html"

  claude plugin eval "$dir" \
    --tag "$TAG" \
    --runs 1 \
    --max-cost-usd "$MAX_COST_USD" \
    --threshold "$THRESHOLD" \
    --json "$json_out" \
    --report "$html_out" \
    --no-publish \
    --allow-tools Bash Write Edit
  code=$?

  score="n/a"
  if [ -f "$json_out" ]; then
    score="$(node -e '
      try {
        const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const s = r && r.aggregates && r.aggregates.overallScore;
        console.log(typeof s === "number" ? s.toFixed(2) : "n/a");
      } catch (e) { console.log("n/a"); }
    ' "$json_out" 2>/dev/null)"
    [ -z "$score" ] && score="n/a"
  fi

  case "$code" in
    0) echo "$p: PASS score=$score threshold=$THRESHOLD report=$json_out" ;;
    1) echo "$p: FAIL score=$score threshold=$THRESHOLD report=$json_out"; overall_exit=1 ;;
    2) echo "$p: PARTIAL (cost ceiling or setup error) score=$score report=$json_out"; overall_exit=1 ;;
    *) echo "$p: ERROR exit=$code report=$json_out"; overall_exit=1 ;;
  esac
done

exit $overall_exit
