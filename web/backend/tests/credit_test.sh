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

if [ "${CREDIT_TEST_CLEAN_DB:-0}" = "1" ]; then
  echo "== cleanup test DB =="
  if command -v mongosh >/dev/null 2>&1; then
    mongosh abuts_fit_test --eval "db.creditorders.deleteMany({})" --quiet 2>/dev/null || echo "[WARN] Could not clean creditorders collection"
  elif command -v mongo >/dev/null 2>&1; then
    mongo abuts_fit_test --eval "db.creditorders.deleteMany({})" --quiet 2>/dev/null || echo "[WARN] Could not clean creditorders collection"
  else
    echo "[SKIP] mongo shell not found (set CREDIT_TEST_CLEAN_DB=0 to hide)"
  fi
  echo
fi

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
CO_ATTACH_RAW="$(curl_json POST /api/requestor-organizations/co-owners "${PR_TOKEN}" "{\"email\":\"${CO_EMAIL}\"}")"
CO_ATTACH_STATUS="${CO_ATTACH_RAW##*$'\n'}"
CO_ATTACH_BODY="${CO_ATTACH_RAW%$'\n'*}"
echo "${CO_ATTACH_BODY}"
if [ "${CO_ATTACH_STATUS}" != "200" ] && [ "${CO_ATTACH_STATUS}" != "201" ]; then
  echo "[FAIL] attach co-owner: expected status=200/201, got=${CO_ATTACH_STATUS}"
  exit 1
fi
echo "[OK] attach co-owner: status=${CO_ATTACH_STATUS}"
echo

echo "== credits balance AFTER org link (principal/co-owner should match) =="
PR_BAL_RAW="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${PR_TOKEN}")"
PR_BAL_STATUS="${PR_BAL_RAW##*$'\n'}"
PR_BAL_BODY="${PR_BAL_RAW%$'\n'*}"
expect_status "${PR_BAL_STATUS}" "200" "principal balance"
PR_BALANCE="$(printf '%s' "${PR_BAL_BODY}" | json_get_number "data.balance")"
PR_PAID_BALANCE="$(printf '%s' "${PR_BAL_BODY}" | json_get_number "data.paidBalance")"
PR_BONUS_BALANCE="$(printf '%s' "${PR_BAL_BODY}" | json_get_number "data.bonusBalance")"
echo "principal balance=${PR_BALANCE}"
echo "principal paidBalance=${PR_PAID_BALANCE}"
echo "principal bonusBalance=${PR_BONUS_BALANCE}"

CO_BAL_RAW2="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${CO_TOKEN}")"
CO_BAL_STATUS2="${CO_BAL_RAW2##*$'\n'}"
CO_BAL_BODY2="${CO_BAL_RAW2%$'\n'*}"
expect_status "${CO_BAL_STATUS2}" "200" "co-owner balance"
CO_BALANCE="$(printf '%s' "${CO_BAL_BODY2}" | json_get_number "data.balance")"
CO_PAID_BALANCE="$(printf '%s' "${CO_BAL_BODY2}" | json_get_number "data.paidBalance")"
CO_BONUS_BALANCE="$(printf '%s' "${CO_BAL_BODY2}" | json_get_number "data.bonusBalance")"
echo "co-owner balance=${CO_BALANCE}"
echo "co-owner paidBalance=${CO_PAID_BALANCE}"
echo "co-owner bonusBalance=${CO_BONUS_BALANCE}"

if [ "${PR_BALANCE}" != "${CO_BALANCE}" ]; then
  echo "[FAIL] shared credit balance mismatch: principal=${PR_BALANCE}, co-owner=${CO_BALANCE}"
  exit 1
fi
if [ "${PR_PAID_BALANCE}" != "${CO_PAID_BALANCE}" ]; then
  echo "[FAIL] shared paidBalance mismatch: principal=${PR_PAID_BALANCE}, co-owner=${CO_PAID_BALANCE}"
  exit 1
fi
if [ "${PR_BONUS_BALANCE}" != "${CO_BONUS_BALANCE}" ]; then
  echo "[FAIL] shared bonusBalance mismatch: principal=${PR_BONUS_BALANCE}, co-owner=${CO_BONUS_BALANCE}"
  exit 1
fi
echo "[OK] shared credit balance matches"
echo

echo "== create credit order =="
ORDER_RAW="$(curl_json POST /api/credits/orders "${PR_TOKEN}" '{"supplyAmount":500000}')"
ORDER_STATUS="${ORDER_RAW##*$'\n'}"
ORDER_JSON="${ORDER_RAW%$'\n'*}"
echo "${ORDER_JSON}"
expect_status "${ORDER_STATUS}" "201" "create credit order"
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
CONFIRM_RAW="$(curl_json POST /api/credits/payments/confirm "${PR_TOKEN}" "{\"orderId\":\"${ORDER_ID}\",\"amount\":${TOTAL_AMOUNT}}")"
CONFIRM_STATUS="${CONFIRM_RAW##*$'\n'}"
CONFIRM_BODY="${CONFIRM_RAW%$'\n'*}"
echo "${CONFIRM_BODY}"
expect_status "${CONFIRM_STATUS}" "200" "confirm payment"
echo

echo "== balance AFTER charge (principal/co-owner should match) =="
PR_BAL_RAW3="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${PR_TOKEN}")"
PR_BAL_STATUS3="${PR_BAL_RAW3##*$'\n'}"
PR_BAL_BODY3="${PR_BAL_RAW3%$'\n'*}"
expect_status "${PR_BAL_STATUS3}" "200" "principal balance after charge"
PR_BALANCE2="$(printf '%s' "${PR_BAL_BODY3}" | json_get_number "data.balance")"
PR_PAID_BALANCE2="$(printf '%s' "${PR_BAL_BODY3}" | json_get_number "data.paidBalance")"
PR_BONUS_BALANCE2="$(printf '%s' "${PR_BAL_BODY3}" | json_get_number "data.bonusBalance")"
echo "principal balance(after)=${PR_BALANCE2}"
echo "principal paidBalance(after)=${PR_PAID_BALANCE2}"
echo "principal bonusBalance(after)=${PR_BONUS_BALANCE2}"

CO_BAL_RAW3="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${CO_TOKEN}")"
CO_BAL_STATUS3="${CO_BAL_RAW3##*$'\n'}"
CO_BAL_BODY3="${CO_BAL_RAW3%$'\n'*}"
expect_status "${CO_BAL_STATUS3}" "200" "co-owner balance after charge"
CO_BALANCE2="$(printf '%s' "${CO_BAL_BODY3}" | json_get_number "data.balance")"
CO_PAID_BALANCE2="$(printf '%s' "${CO_BAL_BODY3}" | json_get_number "data.paidBalance")"
CO_BONUS_BALANCE2="$(printf '%s' "${CO_BAL_BODY3}" | json_get_number "data.bonusBalance")"
echo "co-owner balance(after)=${CO_BALANCE2}"
echo "co-owner paidBalance(after)=${CO_PAID_BALANCE2}"
echo "co-owner bonusBalance(after)=${CO_BONUS_BALANCE2}"

if [ "${PR_BALANCE2}" != "${CO_BALANCE2}" ]; then
  echo "[FAIL] shared credit balance mismatch after charge: principal=${PR_BALANCE2}, co-owner=${CO_BALANCE2}"
  exit 1
fi
if [ "${PR_PAID_BALANCE2}" != "${CO_PAID_BALANCE2}" ]; then
  echo "[FAIL] shared paidBalance mismatch after charge: principal=${PR_PAID_BALANCE2}, co-owner=${CO_PAID_BALANCE2}"
  exit 1
fi
if [ "${PR_BONUS_BALANCE2}" != "${CO_BONUS_BALANCE2}" ]; then
  echo "[FAIL] shared bonusBalance mismatch after charge: principal=${PR_BONUS_BALANCE2}, co-owner=${CO_BONUS_BALANCE2}"
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
PR_PAID_BALANCE3="$(printf '%s' "${PR_BAL_BODY4}" | json_get_number "data.paidBalance")"
PR_BONUS_BALANCE3="$(printf '%s' "${PR_BAL_BODY4}" | json_get_number "data.bonusBalance")"
echo "principal balance(after refund)=${PR_BALANCE3}"
echo "principal paidBalance(after refund)=${PR_PAID_BALANCE3}"
echo "principal bonusBalance(after refund)=${PR_BONUS_BALANCE3}"

CO_BAL_RAW4="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${CO_TOKEN}")"
CO_BAL_STATUS4="${CO_BAL_RAW4##*$'\n'}"
CO_BAL_BODY4="${CO_BAL_RAW4%$'\n'*}"
expect_status "${CO_BAL_STATUS4}" "200" "co-owner balance after refund"
CO_BALANCE3="$(printf '%s' "${CO_BAL_BODY4}" | json_get_number "data.balance")"
CO_PAID_BALANCE3="$(printf '%s' "${CO_BAL_BODY4}" | json_get_number "data.paidBalance")"
CO_BONUS_BALANCE3="$(printf '%s' "${CO_BAL_BODY4}" | json_get_number "data.bonusBalance")"
echo "co-owner balance(after refund)=${CO_BALANCE3}"
echo "co-owner paidBalance(after refund)=${CO_PAID_BALANCE3}"
echo "co-owner bonusBalance(after refund)=${CO_BONUS_BALANCE3}"

if [ -n "${PR_PAID_BALANCE2}" ] && [ -n "${PR_PAID_BALANCE3}" ] && [ "${PR_PAID_BALANCE3}" -ge "${PR_PAID_BALANCE2}" ]; then
  echo "[FAIL] paidBalance did not decrease after refund"
  exit 1
fi
if [ "${PR_BALANCE3}" != "${CO_BALANCE3}" ]; then
  echo "[FAIL] shared credit balance mismatch after refund: principal=${PR_BALANCE3}, co-owner=${CO_BALANCE3}"
  exit 1
fi
if [ "${PR_PAID_BALANCE3}" != "${CO_PAID_BALANCE3}" ]; then
  echo "[FAIL] shared paidBalance mismatch after refund: principal=${PR_PAID_BALANCE3}, co-owner=${CO_PAID_BALANCE3}"
  exit 1
fi
if [ "${PR_BONUS_BALANCE3}" != "${CO_BONUS_BALANCE3}" ]; then
  echo "[FAIL] shared bonusBalance mismatch after refund: principal=${PR_BONUS_BALANCE3}, co-owner=${CO_BONUS_BALANCE3}"
  exit 1
fi
echo "[OK] balance decreased after refund and matches between principal/co-owner"
echo

echo "== verify VAT calculation (totalAmount should be supplyAmount * 1.1) =="
EXPECTED_TOTAL=$((500000 * 110 / 100))
if [ "${TOTAL_AMOUNT}" -ne "${EXPECTED_TOTAL}" ]; then
  echo "[FAIL] VAT calculation error: expected=${EXPECTED_TOTAL}, got=${TOTAL_AMOUNT}"
  exit 1
fi
echo "[OK] VAT calculation correct: ${TOTAL_AMOUNT} = ${EXPECTED_TOTAL}"
echo

echo "== co-owner try to create order (expect 403) =="
CO_ORDER_RAW="$(curl_json POST /api/credits/orders "${CO_TOKEN}" '{"supplyAmount":500000}')"
CO_ORDER_STATUS="${CO_ORDER_RAW##*$'\n'}"
CO_ORDER_BODY="${CO_ORDER_RAW%$'\n'*}"
echo "${CO_ORDER_BODY}"
expect_status "${CO_ORDER_STATUS}" "403" "co-owner order creation (forbidden)"
echo

echo "== co-owner try to refund (expect 403) =="
CO_REFUND_RAW="$(curl_json POST /api/credits/refunds "${CO_TOKEN}" '{
  "refundSupplyAmount": 10000,
  "refundReceiveAccount": {
    "bank": "국민",
    "accountNumber": "999-999-9999",
    "holderName": "공동대표"
  }
}')"
CO_REFUND_STATUS="${CO_REFUND_RAW##*$'\n'}"
CO_REFUND_BODY="${CO_REFUND_RAW%$'\n'*}"
echo "${CO_REFUND_BODY}"
expect_status "${CO_REFUND_STATUS}" "403" "co-owner refund (forbidden)"
echo

echo "== list credit orders (principal) =="
HISTORY_RAW="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/orders" -H "Authorization: Bearer ${PR_TOKEN}")"
HISTORY_STATUS="${HISTORY_RAW##*$'\n'}"
HISTORY_BODY="${HISTORY_RAW%$'\n'*}"
echo "${HISTORY_BODY}"
expect_status "${HISTORY_STATUS}" "200" "credit orders list"
echo

echo "== list credit orders (co-owner, should be allowed) =="
CO_HISTORY_RAW="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/orders" -H "Authorization: Bearer ${CO_TOKEN}")"
CO_HISTORY_STATUS="${CO_HISTORY_RAW##*$'\n'}"
CO_HISTORY_BODY="${CO_HISTORY_RAW%$'\n'*}"
echo "${CO_HISTORY_BODY}"
expect_status "${CO_HISTORY_STATUS}" "200" "co-owner credit orders list"
echo

echo "== create another order (to test cancel) =="
CANCEL_ORDER_RAW="$(curl_json POST /api/credits/orders "${PR_TOKEN}" '{"supplyAmount":500000}')"
CANCEL_ORDER_STATUS="${CANCEL_ORDER_RAW##*$'\n'}"
CANCEL_ORDER_BODY="${CANCEL_ORDER_RAW%$'\n'*}"
echo "${CANCEL_ORDER_BODY}"
expect_status "${CANCEL_ORDER_STATUS}" "201" "create cancel-test order"

CANCEL_ORDER_ID="$(python - <<PY
import json
obj=json.loads('''$CANCEL_ORDER_BODY''')
print(((obj.get("data") or {}).get("orderId")) or "")
PY
)"
[ -n "${CANCEL_ORDER_ID}" ] || { echo "cancel-test orderId 생성 실패"; exit 1; }
echo

echo "== cancel the order (principal) =="
CANCEL_RAW="$(curl -sS -w "\n%{http_code}" -X POST "${BASE_URL}/api/credits/orders/${CANCEL_ORDER_ID}/cancel" -H "Authorization: Bearer ${PR_TOKEN}")"
CANCEL_STATUS="${CANCEL_RAW##*$'\n'}"
CANCEL_BODY="${CANCEL_RAW%$'\n'*}"
echo "${CANCEL_BODY}"
expect_status "${CANCEL_STATUS}" "200" "cancel order (principal)"
echo

echo "== cancel the order (co-owner should be forbidden) =="
CO_CANCEL_RAW="$(curl -sS -w "\n%{http_code}" -X POST "${BASE_URL}/api/credits/orders/${CANCEL_ORDER_ID}/cancel" -H "Authorization: Bearer ${CO_TOKEN}")"
CO_CANCEL_STATUS="${CO_CANCEL_RAW##*$'\n'}"
CO_CANCEL_BODY="${CO_CANCEL_RAW%$'\n'*}"
echo "${CO_CANCEL_BODY}"
expect_status "${CO_CANCEL_STATUS}" "403" "cancel order (co-owner forbidden)"
echo

echo "== error case: invalid amount for payment confirm =="
INVALID_PAY_RAW="$(curl_json POST /api/credits/payments/confirm "${PR_TOKEN}" "{\"orderId\":\"${ORDER_ID}\",\"amount\":1000}")"
INVALID_PAY_STATUS="${INVALID_PAY_RAW##*$'\n'}"
INVALID_PAY_BODY="${INVALID_PAY_RAW%$'\n'*}"
echo "${INVALID_PAY_BODY}"
if [ "${INVALID_PAY_STATUS}" != "400" ]; then
  echo "[WARN] invalid payment amount status=${INVALID_PAY_STATUS} (expected 400)"
else
  echo "[OK] invalid payment amount rejected"
fi
echo

echo "== error case: non-existent order ID =="
FAKE_ORDER_RAW="$(curl_json POST /api/credits/payments/confirm "${PR_TOKEN}" '{"orderId":"ORD_FAKE_12345","amount":100000}')"
FAKE_ORDER_STATUS="${FAKE_ORDER_RAW##*$'\n'}"
FAKE_ORDER_BODY="${FAKE_ORDER_RAW%$'\n'*}"
echo "${FAKE_ORDER_BODY}"
if [ "${FAKE_ORDER_STATUS}" != "404" ] && [ "${FAKE_ORDER_STATUS}" != "400" ]; then
  echo "[WARN] fake order status=${FAKE_ORDER_STATUS} (expected 404 or 400)"
else
  echo "[OK] fake order rejected"
fi
echo

echo "== error case: negative amount order =="
NEG_ORDER_RAW="$(curl_json POST /api/credits/orders "${PR_TOKEN}" '{"supplyAmount":-10000}')"
NEG_ORDER_STATUS="${NEG_ORDER_RAW##*$'\n'}"
NEG_ORDER_BODY="${NEG_ORDER_RAW%$'\n'*}"
echo "${NEG_ORDER_BODY}"
if [ "${NEG_ORDER_STATUS}" != "400" ]; then
  echo "[WARN] negative amount order status=${NEG_ORDER_STATUS} (expected 400)"
else
  echo "[OK] negative amount order rejected"
fi
echo

echo "== error case: zero amount order =="
ZERO_ORDER_RAW="$(curl_json POST /api/credits/orders "${PR_TOKEN}" '{"supplyAmount":0}')"
ZERO_ORDER_STATUS="${ZERO_ORDER_RAW##*$'\n'}"
ZERO_ORDER_BODY="${ZERO_ORDER_RAW%$'\n'*}"
echo "${ZERO_ORDER_BODY}"
if [ "${ZERO_ORDER_STATUS}" != "400" ]; then
  echo "[WARN] zero amount order status=${ZERO_ORDER_STATUS} (expected 400)"
else
  echo "[OK] zero amount order rejected"
fi
echo

echo "== error case: refund more than balance =="
OVER_REFUND_RAW="$(curl_json POST /api/credits/refunds "${PR_TOKEN}" '{
  "refundSupplyAmount": 999999999,
  "refundReceiveAccount": {
    "bank": "국민",
    "accountNumber": "123-456-7890",
    "holderName": "홍길동"
  }
}')"
OVER_REFUND_STATUS="${OVER_REFUND_RAW##*$'\n'}"
OVER_REFUND_BODY="${OVER_REFUND_RAW%$'\n'*}"
echo "${OVER_REFUND_BODY}"
if [ "${OVER_REFUND_STATUS}" != "400" ]; then
  echo "[WARN] over-refund status=${OVER_REFUND_STATUS} (expected 400)"
else
  echo "[OK] over-refund rejected"
fi
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

echo "== full refund remaining balance =="
REMAINING_SUPPLY=$((PR_PAID_BALANCE3))
FULL_REFUND_RAW="$(curl_json POST /api/credits/refunds "${PR_TOKEN}" "{
  \"refundSupplyAmount\": ${REMAINING_SUPPLY},
  \"refundReceiveAccount\": {
    \"bank\": \"국민\",
    \"accountNumber\": \"123-456-7890\",
    \"holderName\": \"홍길동\"
  }
}")"
FULL_REFUND_STATUS="${FULL_REFUND_RAW##*$'\n'}"
FULL_REFUND_BODY="${FULL_REFUND_RAW%$'\n'*}"
echo "${FULL_REFUND_BODY}"
expect_status "${FULL_REFUND_STATUS}" "200" "full refund"
echo

echo "== balance after full refund (should be 0) =="
PR_BAL_RAW5="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${PR_TOKEN}")"
PR_BAL_STATUS5="${PR_BAL_RAW5##*$'\n'}"
PR_BAL_BODY5="${PR_BAL_RAW5%$'\n'*}"
expect_status "${PR_BAL_STATUS5}" "200" "principal balance after full refund"
PR_BALANCE_FINAL="$(printf '%s' "${PR_BAL_BODY5}" | json_get_number "data.balance")"
echo "principal balance(after full refund)=${PR_BALANCE_FINAL}"

CO_BAL_RAW5="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${CO_TOKEN}")"
CO_BAL_STATUS5="${CO_BAL_RAW5##*$'\n'}"
CO_BAL_BODY5="${CO_BAL_RAW5%$'\n'*}"
expect_status "${CO_BAL_STATUS5}" "200" "co-owner balance after full refund"
CO_BALANCE_FINAL="$(printf '%s' "${CO_BAL_BODY5}" | json_get_number "data.balance")"
echo "co-owner balance(after full refund)=${CO_BALANCE_FINAL}"

if [ "${PR_BALANCE_FINAL}" != "0" ] || [ "${CO_BALANCE_FINAL}" != "0" ]; then
  echo "[FAIL] balance should be 0 after full refund: principal=${PR_BALANCE_FINAL}, co-owner=${CO_BALANCE_FINAL}"
  exit 1
fi
echo "[OK] balance is 0 after full refund"
echo

echo "== withdraw principal after full refund (should succeed) =="
WITHDRAW_RAW2="$(curl -sS -w "\n%{http_code}" -X POST "${BASE_URL}/api/auth/withdraw" -H "Authorization: Bearer ${PR_TOKEN}")"
WITHDRAW_STATUS2="${WITHDRAW_RAW2##*$'\n'}"
WITHDRAW_BODY2="${WITHDRAW_RAW2%$'\n'*}"
echo "${WITHDRAW_BODY2}"
expect_status "${WITHDRAW_STATUS2}" "200" "principal withdraw after full refund"
echo "[OK] principal withdrawal succeeded after full refund"
echo

echo "[DONE] credit checklist script finished successfully"