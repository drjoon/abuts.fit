#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5001}"

TS="$(date +%s)"
RAND="$RANDOM"

PR_EMAIL="principal.${TS}.${RAND}@abuts.fit"
CO_EMAIL="coowner.${TS}.${RAND}@abuts.fit"

PR_PW="Password1234!"
CO_PW="Password1234!"

PR_NAME="테스트주대표"
CO_NAME="테스트공동대표"

PHONE_SUFFIX="$(printf '%08d' $(((TS + RAND) % 100000000)))"
PHONE_SUFFIX2="$(printf '%08d' $(((TS + RAND + 1) % 100000000)))"
PR_PHONE="010${PHONE_SUFFIX}"
CO_PHONE="010${PHONE_SUFFIX2}"

PR_ORG="테스트기공소_${TS}_${RAND}"

json_token() {
  python -c 'import sys, json
try:
  obj = json.load(sys.stdin)
  print(((obj.get("data") or {}).get("token")) or "")
except Exception:
  print("")'
}

curl_json() {
  # usage: curl_json METHOD PATH TOKEN BODY
  # token can be empty string
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

json_get_number() {
  # usage: echo "$json" | json_get_number "data.balance"
  local expr="$1"
  python -c "import sys, json
obj=json.load(sys.stdin)
cur=obj
for part in '${expr}'.split('.'):
  cur = (cur or {}).get(part) if isinstance(cur, dict) else None
print(int(cur) if isinstance(cur, (int,float)) else '')"
}

json_get_string() {
  # usage: echo "$json" | json_get_string "data.orderId"
  local expr="$1"
  python -c "import sys, json
obj=json.load(sys.stdin)
cur=obj
for part in '${expr}'.split('.'):
  cur = (cur or {}).get(part) if isinstance(cur, dict) else None
print(str(cur) if cur is not None else '')"
}

echo "BASE_URL=${BASE_URL}"
echo "PR_EMAIL=${PR_EMAIL}"
echo "CO_EMAIL=${CO_EMAIL}"
echo

echo "== register principal =="
curl -sS "${BASE_URL}/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\":\"${PR_NAME}\",
    \"email\":\"${PR_EMAIL}\",
    \"password\":\"${PR_PW}\",
    \"role\":\"requestor\",
    \"phoneNumber\":\"${PR_PHONE}\",
    \"organization\":\"${PR_ORG}\"
  }"
echo; echo

echo "== register co-owner =="
curl -sS "${BASE_URL}/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\":\"${CO_NAME}\",
    \"email\":\"${CO_EMAIL}\",
    \"password\":\"${CO_PW}\",
    \"role\":\"requestor\",
    \"requestorType\":\"co_owner\",
    \"phoneNumber\":\"${CO_PHONE}\"
  }"
echo; echo

echo "== login principal =="
PR_LOGIN_JSON="$(curl -sS "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${PR_EMAIL}\",\"password\":\"${PR_PW}\"}")"
echo "${PR_LOGIN_JSON}"
PR_TOKEN="$(printf '%s' "${PR_LOGIN_JSON}" | json_token)"
[ -n "${PR_TOKEN}" ] || { echo "주대표 로그인 실패"; exit 1; }
echo "PR_TOKEN=${PR_TOKEN:0:20}..."
echo

echo "== login co-owner =="
CO_LOGIN_JSON="$(curl -sS "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${CO_EMAIL}\",\"password\":\"${CO_PW}\"}")"
echo "${CO_LOGIN_JSON}"
CO_TOKEN="$(printf '%s' "${CO_LOGIN_JSON}" | json_token)"
[ -n "${CO_TOKEN}" ] || { echo "공동대표 로그인 실패"; exit 1; }
echo "CO_TOKEN=${CO_TOKEN:0:20}..."
echo

echo "== credits balance with co-owner BEFORE org link (expect 403) =="
CO_BAL_RAW="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${CO_TOKEN}")"
CO_BAL_STATUS="${CO_BAL_RAW##*$'\n'}"
CO_BAL_BODY="${CO_BAL_RAW%$'\n'*}"
echo "${CO_BAL_BODY}"
expect_status "${CO_BAL_STATUS}" "403" "co-owner balance without organizationId"
echo

echo "== attach co-owner to principal organization =="
curl -sS "${BASE_URL}/api/requestor-organizations/co-owners" \
  -H "Authorization: Bearer ${PR_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${CO_EMAIL}\"}"
echo; echo

echo "== credits balance AFTER org link (principal/co-owner should match) =="
PR_BAL_RAW="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${PR_TOKEN}")"
PR_BAL_STATUS="${PR_BAL_RAW##*$'\n'}"
PR_BAL_BODY="${PR_BAL_RAW%$'\n'*}"
expect_status "${PR_BAL_STATUS}" "200" "principal balance"
PR_BALANCE="$(printf '%s' "${PR_BAL_BODY}" | json_get_number "data.balance")"
echo "principal balance=${PR_BALANCE}"

CO_BAL_RAW2="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${CO_TOKEN}")"
CO_BAL_STATUS2="${CO_BAL_RAW2##*$'\n'}"
CO_BAL_BODY2="${CO_BAL_RAW2%$'\n'*}"
expect_status "${CO_BAL_STATUS2}" "200" "co-owner balance"
CO_BALANCE="$(printf '%s' "${CO_BAL_BODY2}" | json_get_number "data.balance")"
echo "co-owner balance=${CO_BALANCE}"

if [ "${PR_BALANCE}" != "${CO_BALANCE}" ]; then
  echo "[FAIL] shared credit balance mismatch: principal=${PR_BALANCE}, co-owner=${CO_BALANCE}"
  exit 1
fi
echo "[OK] shared credit balance matches"
echo

echo "== create credit order =="
ORDER_JSON="$(curl -sS "${BASE_URL}/api/credits/orders" \
  -H "Authorization: Bearer ${PR_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"supplyAmount":500000}')"
echo "${ORDER_JSON}"
echo

ORDER_ID="$(python - <<PY
import json
obj=json.loads('''$ORDER_JSON''')
print(((obj.get("data") or {}).get("orderId")) or "")
PY
)"
[ -n "${ORDER_ID}" ] || { echo "orderId 생성 실패"; exit 1; }

TOTAL_AMOUNT="$(printf '%s' "${ORDER_JSON}" | json_get_number "data.totalAmount")"
if [ -z "${TOTAL_AMOUNT}" ]; then
  TOTAL_AMOUNT=550000
fi

echo "== confirm payment (mock) =="
curl -sS "${BASE_URL}/api/credits/payments/confirm" \
  -H "Authorization: Bearer ${PR_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"orderId\":\"${ORDER_ID}\",\"amount\":${TOTAL_AMOUNT}}"
echo; echo

echo "== balance AFTER charge (principal/co-owner should match) =="
PR_BAL_RAW3="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${PR_TOKEN}")"
PR_BAL_STATUS3="${PR_BAL_RAW3##*$'\n'}"
PR_BAL_BODY3="${PR_BAL_RAW3%$'\n'*}"
expect_status "${PR_BAL_STATUS3}" "200" "principal balance after charge"
PR_BALANCE2="$(printf '%s' "${PR_BAL_BODY3}" | json_get_number "data.balance")"
echo "principal balance(after)=${PR_BALANCE2}"

CO_BAL_RAW3="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${CO_TOKEN}")"
CO_BAL_STATUS3="${CO_BAL_RAW3##*$'\n'}"
CO_BAL_BODY3="${CO_BAL_RAW3%$'\n'*}"
expect_status "${CO_BAL_STATUS3}" "200" "co-owner balance after charge"
CO_BALANCE2="$(printf '%s' "${CO_BAL_BODY3}" | json_get_number "data.balance")"
echo "co-owner balance(after)=${CO_BALANCE2}"

if [ "${PR_BALANCE2}" != "${CO_BALANCE2}" ]; then
  echo "[FAIL] shared credit balance mismatch after charge: principal=${PR_BALANCE2}, co-owner=${CO_BALANCE2}"
  exit 1
fi
echo "[OK] shared credit balance matches after charge"
echo

echo "== refund partial (supply=100000) =="
REFUND_RAW="$(curl_json POST /api/credits/refunds "${PR_TOKEN}" '{
  "refundSupplyAmount": 100000,
  "refundReceiveAccount": {
    "bank": "국민",
    "accountNumber": "123-456-7890",
    "holderName": "홍길동"
  }
}')"
REFUND_STATUS="${REFUND_RAW##*$'\n'}"
REFUND_BODY="${REFUND_RAW%$'\n'*}"
echo "${REFUND_BODY}"
expect_status "${REFUND_STATUS}" "200" "credit refund"
echo

echo "== balance AFTER refund (should decrease) =="
PR_BAL_RAW4="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${PR_TOKEN}")"
PR_BAL_STATUS4="${PR_BAL_RAW4##*$'\n'}"
PR_BAL_BODY4="${PR_BAL_RAW4%$'\n'*}"
expect_status "${PR_BAL_STATUS4}" "200" "principal balance after refund"
PR_BALANCE3="$(printf '%s' "${PR_BAL_BODY4}" | json_get_number "data.balance")"
echo "principal balance(after refund)=${PR_BALANCE3}"

if [ -n "${PR_BALANCE2}" ] && [ -n "${PR_BALANCE3}" ] && [ "${PR_BALANCE3}" -ge "${PR_BALANCE2}" ]; then
  echo "[FAIL] balance did not decrease after refund"
  exit 1
fi
echo "[OK] balance decreased after refund"
echo

echo "== withdraw principal (expect 400 if paidBalance remains) =="
WITHDRAW_RAW="$(curl -sS -w "\n%{http_code}" -X POST "${BASE_URL}/api/auth/withdraw" -H "Authorization: Bearer ${PR_TOKEN}")"
WITHDRAW_STATUS="${WITHDRAW_RAW##*$'\n'}"
WITHDRAW_BODY="${WITHDRAW_RAW%$'\n'*}"
echo "${WITHDRAW_BODY}"
if [ "${WITHDRAW_STATUS}" != "400" ]; then
  echo "[WARN] withdraw status=${WITHDRAW_STATUS} (expected 400 when paidBalance > 0)."
else
  echo "[OK] withdraw blocked while paidBalance > 0"
fi
echo

echo "[DONE] credit checklist script finished"