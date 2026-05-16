#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://abuts.fit/api"
INPUT_FILE=""
OUT_DIR="./tmp/recalc-l1"
DELAY_SECONDS="0.7"
POLL_ATTEMPTS="20"
POLL_INTERVAL_SECONDS="2"
RETRY_MAX="2"
AUTH_TOKEN="${AUTH_TOKEN:-}"

usage() {
  cat <<'EOF'
Usage:
  recalc-l1-batch.sh --input <requestIds.txt> --token <jwt> [options]

Required:
  --input <path>       Request ID list file (one requestId per line)
  --token <jwt>        JWT token value (without Bearer prefix)

Options:
  --base-url <url>     API base URL (default: https://abuts.fit/api)
  --out-dir <path>     Output directory (default: ./tmp/recalc-l1)
  --delay <sec>        Delay between trigger calls (default: 0.7)
  --poll-attempts <n>  Poll attempts for metadata check (default: 20)
  --poll-interval <s>  Poll interval seconds (default: 2)
  --retry-max <n>      Retry trigger count when l1 still missing (default: 2)

Outputs:
  <out-dir>/ok.csv
  <out-dir>/miss.csv
  <out-dir>/trigger-errors.csv
  <out-dir>/run.log
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"; shift 2 ;;
    --input)
      INPUT_FILE="$2"; shift 2 ;;
    --out-dir)
      OUT_DIR="$2"; shift 2 ;;
    --delay)
      DELAY_SECONDS="$2"; shift 2 ;;
    --poll-attempts)
      POLL_ATTEMPTS="$2"; shift 2 ;;
    --poll-interval)
      POLL_INTERVAL_SECONDS="$2"; shift 2 ;;
    --retry-max)
      RETRY_MAX="$2"; shift 2 ;;
    --token)
      AUTH_TOKEN="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1 ;;
  esac
done

if [[ -z "$INPUT_FILE" || -z "$AUTH_TOKEN" ]]; then
  echo "--input and --token are required" >&2
  usage
  exit 1
fi

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Input file not found: $INPUT_FILE" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
OK_CSV="$OUT_DIR/ok.csv"
MISS_CSV="$OUT_DIR/miss.csv"
TRIGGER_ERR_CSV="$OUT_DIR/trigger-errors.csv"
RUN_LOG="$OUT_DIR/run.log"

printf "requestId,l1\n" > "$OK_CSV"
printf "requestId,lastL1,attempts\n" > "$MISS_CSV"
printf "requestId,httpStatus,error\n" > "$TRIGGER_ERR_CSV"
: > "$RUN_LOG"

AUTH_HEADER="Authorization: Bearer $AUTH_TOKEN"

trim() {
  local s="$1"
  s="${s#${s%%[![:space:]]*}}"
  s="${s%${s##*[![:space:]]}}"
  printf '%s' "$s"
}

trigger_recalc() {
  local rid="$1"
  local http_code
  local body_file
  body_file="$(mktemp)"

  http_code="$(curl -sS -o "$body_file" -w "%{http_code}" \
    -X POST \
    -H "$AUTH_HEADER" \
    "$BASE_URL/bg/recalculate-stl-metadata/$rid" || true)"

  if [[ "$http_code" != "200" ]]; then
    local err
    err="$(jq -r '.message // .error // .detail // "trigger failed"' "$body_file" 2>/dev/null || echo "trigger failed")"
    printf "%s,%s,%s\n" "$rid" "$http_code" "${err//,/; }" >> "$TRIGGER_ERR_CSV"
    rm -f "$body_file"
    return 1
  fi

  rm -f "$body_file"
  return 0
}

fetch_l1() {
  local rid="$1"
  local body
  body="$(curl -sS -H "$AUTH_HEADER" "$BASE_URL/bg/stl-metadata/$rid" || true)"
  printf '%s' "$body" | jq -r '.data.metadata.l1 // empty' 2>/dev/null || true
}

poll_l1() {
  local rid="$1"
  local l1=""
  local i
  for ((i=1; i<=POLL_ATTEMPTS; i++)); do
    l1="$(fetch_l1 "$rid")"
    if [[ -n "$l1" && "$l1" != "null" ]]; then
      printf '%s' "$l1"
      return 0
    fi
    sleep "$POLL_INTERVAL_SECONDS"
  done
  return 1
}

total=0
ok=0
miss=0

while IFS= read -r line || [[ -n "$line" ]]; do
  rid="$(trim "$line")"
  if [[ -z "$rid" || "$rid" =~ ^# ]]; then
    continue
  fi

  total=$((total + 1))
  echo "[$(date '+%F %T')] start requestId=$rid" | tee -a "$RUN_LOG"

  attempt=0
  final_l1=""
  success="false"

  while (( attempt <= RETRY_MAX )); do
    attempt=$((attempt + 1))

    if ! trigger_recalc "$rid"; then
      echo "[$(date '+%F %T')] trigger failed requestId=$rid attempt=$attempt" | tee -a "$RUN_LOG"
      sleep "$DELAY_SECONDS"
      continue
    fi

    if final_l1="$(poll_l1 "$rid")"; then
      printf "%s,%s\n" "$rid" "$final_l1" >> "$OK_CSV"
      echo "[$(date '+%F %T')] ok requestId=$rid l1=$final_l1 attempt=$attempt" | tee -a "$RUN_LOG"
      success="true"
      break
    fi

    echo "[$(date '+%F %T')] l1 missing requestId=$rid attempt=$attempt" | tee -a "$RUN_LOG"
    sleep "$DELAY_SECONDS"
  done

  if [[ "$success" == "true" ]]; then
    ok=$((ok + 1))
  else
    printf "%s,%s,%s\n" "$rid" "${final_l1:-}" "$attempt" >> "$MISS_CSV"
    miss=$((miss + 1))
  fi

  sleep "$DELAY_SECONDS"
done < "$INPUT_FILE"

echo "done total=$total ok=$ok miss=$miss outDir=$OUT_DIR" | tee -a "$RUN_LOG"
