#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

TS="$(date +%s)"
RAND="$RANDOM"

json_token() {
  python -c 'import sys, json
try:
  obj = json.load(sys.stdin)
  print(((obj.get("data") or {}).get("token")) or "")
except Exception:
  print("")'
}

json_get_string() {
  local expr="$1"
  python -c "import sys, json
obj=json.load(sys.stdin)
cur=obj
for part in '${expr}'.split('.'):
  cur = (cur or {}).get(part) if isinstance(cur, dict) else None
print(str(cur) if cur is not None else '')"
}

json_get_number() {
  local expr="$1"
  python -c "import sys, json
obj=json.load(sys.stdin)
cur=obj
for part in '${expr}'.split('.'):
  cur = (cur or {}).get(part) if isinstance(cur, dict) else None
print(int(cur) if isinstance(cur, (int,float)) else '')"
}

curl_json() {
  local method="$1"
  local path="$2"
  local token="$3"
  local body="$4"

  if [ -n "$token" ]; then
    curl -sS -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}" \
      -H "Authorization: Bearer ${token}" \
      -H 'Content-Type: application/json' \
      -d "$body"
  else
    curl -sS -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}" \
      -H 'Content-Type: application/json' \
      -d "$body"
  fi
}

expect_status() {
  local got="$1"
  local want="$2"
  local label="$3"
  if [ "$got" != "$want" ]; then
    echo "[FAIL] ${label}: expected status=${want}, got=${got}"
    exit 1
  fi
  echo "[OK] ${label}: status=${got}"
}

echo "BASE_URL=${BASE_URL}"

if [ "${CREDIT_BPLAN_TEST_RESET_AND_SEED:-0}" = "1" ]; then
  (
    cd "${BACKEND_ROOT}" || exit 1
    npm run db:reset-and-seed >/dev/null
  )
fi

REQUESTOR_EMAIL="${CREDIT_BPLAN_REQUESTOR_EMAIL:-requestor.principal@demo.abuts.fit}"
REQUESTOR_PW="${CREDIT_BPLAN_REQUESTOR_PW:-password123}"

ADMIN_EMAIL="${CREDIT_BPLAN_ADMIN_EMAIL:-admin.master@demo.abuts.fit}"
ADMIN_PW="${CREDIT_BPLAN_ADMIN_PW:-password123}"

echo "== login requestor(principal) =="
REQ_LOGIN_JSON="$(curl -sS "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${REQUESTOR_EMAIL}\",\"password\":\"${REQUESTOR_PW}\"}")"
REQ_TOKEN="$(printf '%s' "${REQ_LOGIN_JSON}" | json_token)"
[ -n "${REQ_TOKEN}" ] || { echo "[FAIL] requestor login failed"; exit 1; }

echo "== create charge order =="
ORDER_RAW="$(curl_json POST /api/credits/b-plan/orders "${REQ_TOKEN}" '{"supplyAmount":500000}')"
ORDER_STATUS="${ORDER_RAW##*$'\n'}"
ORDER_BODY="${ORDER_RAW%$'\n'*}"
echo "${ORDER_BODY}"
expect_status "${ORDER_STATUS}" "201" "create charge order"

CHARGE_ORDER_ID="$(printf '%s' "${ORDER_BODY}" | json_get_string "data.id")"
DEPOSIT_CODE="$(printf '%s' "${ORDER_BODY}" | json_get_string "data.depositCode")"
AMOUNT_TOTAL="$(printf '%s' "${ORDER_BODY}" | json_get_number "data.amountTotal")"
[ -n "${CHARGE_ORDER_ID}" ] || { echo "[FAIL] chargeOrderId missing"; exit 1; }
[ -n "${DEPOSIT_CODE}" ] || { echo "[FAIL] depositCode missing"; exit 1; }
[ -n "${AMOUNT_TOTAL}" ] || { echo "[FAIL] amountTotal missing"; exit 1; }

echo "== login admin(master) =="
ADMIN_LOGIN_JSON="$(curl -sS "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PW}\"}")"
ADMIN_TOKEN="$(printf '%s' "${ADMIN_LOGIN_JSON}" | json_token)"
[ -n "${ADMIN_TOKEN}" ] || { echo "[FAIL] admin login failed"; exit 1; }

echo "== upsert bank transaction =="
EXTERNAL_ID="BPLAN_TEST_${TS}_${RAND}"
TX_RAW="$(curl_json POST /api/admin/credits/b-plan/bank-transactions/upsert "${ADMIN_TOKEN}" "{\"externalId\":\"${EXTERNAL_ID}\",\"tranAmt\":${AMOUNT_TOTAL},\"printedContent\":\"입금 ${DEPOSIT_CODE}\",\"occurredAt\":\"$(date -Iseconds)\"}")"
TX_STATUS="${TX_RAW##*$'\n'}"
TX_BODY="${TX_RAW%$'\n'*}"
echo "${TX_BODY}"
expect_status "${TX_STATUS}" "200" "upsert bank transaction"
BANK_TX_ID="$(printf '%s' "${TX_BODY}" | json_get_string "data._id")"
[ -n "${BANK_TX_ID}" ] || { echo "[FAIL] bankTransactionId missing"; exit 1; }

echo "== manual match =="
MATCH_RAW="$(curl_json POST /api/admin/credits/b-plan/match "${ADMIN_TOKEN}" "{\"bankTransactionId\":\"${BANK_TX_ID}\",\"chargeOrderId\":\"${CHARGE_ORDER_ID}\",\"note\":\"test\"}")"
MATCH_STATUS="${MATCH_RAW##*$'\n'}"
MATCH_BODY="${MATCH_RAW%$'\n'*}"
echo "${MATCH_BODY}"
expect_status "${MATCH_STATUS}" "200" "manual match"

echo "== verify balance =="
BAL_RAW="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${REQ_TOKEN}")"
BAL_STATUS="${BAL_RAW##*$'\n'}"
BAL_BODY="${BAL_RAW%$'\n'*}"
echo "${BAL_BODY}"
expect_status "${BAL_STATUS}" "200" "balance"
PAID_BAL="$(printf '%s' "${BAL_BODY}" | json_get_number "data.paidBalance")"
if [ -z "${PAID_BAL}" ]; then
  echo "[FAIL] paidBalance missing"
  exit 1
fi
if [ "${PAID_BAL}" -lt 500000 ]; then
  echo "[FAIL] expected paidBalance>=500000, got=${PAID_BAL}"
  exit 1
fi

echo "== cancel pending charge order =="
ORDER2_RAW="$(curl_json POST /api/credits/b-plan/orders "${REQ_TOKEN}" '{"supplyAmount":500000}')"
ORDER2_STATUS="${ORDER2_RAW##*$'\n'}"
ORDER2_BODY="${ORDER2_RAW%$'\n'*}"
expect_status "${ORDER2_STATUS}" "201" "create second charge order"
CHARGE_ORDER_ID2="$(printf '%s' "${ORDER2_BODY}" | json_get_string "data.id")"
CANCEL_RAW="$(curl_json POST /api/credits/b-plan/orders/${CHARGE_ORDER_ID2}/cancel "${REQ_TOKEN}" '{}')"
CANCEL_STATUS="${CANCEL_RAW##*$'\n'}"
CANCEL_BODY="${CANCEL_RAW%$'\n'*}"
echo "${CANCEL_BODY}"
expect_status "${CANCEL_STATUS}" "200" "cancel charge order"

echo "== withdraw should be blocked when paidBalance > 0 =="
W_RAW="$(curl_json POST /api/auth/withdraw "${REQ_TOKEN}" '{}')"
W_STATUS="${W_RAW##*$'\n'}"
W_BODY="${W_RAW%$'\n'*}"
echo "${W_BODY}"
expect_status "${W_STATUS}" "400" "withdraw blocked"

echo "[DONE] credit b-plan test finished successfully"
