#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

TS="$(date +%s)"
RAND="$RANDOM"

PR_EMAIL="toss.test@abuts.fit"
PR_PW="Password1234!"
PR_NAME="테스트주대표"

PHONE_SUFFIX="$(printf '%08d' $(((TS + RAND) % 100000000)))"
PR_PHONE="010${PHONE_SUFFIX}"

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
  # usage: echo "$json" | json_get_number "data.paidBalance"
  local expr="$1"
  python -c "import sys, json
obj=json.load(sys.stdin)
cur=obj
for part in '${expr}'.split('.'):
  cur = (cur or {}).get(part) if isinstance(cur, dict) else None
print(int(cur) if isinstance(cur, (int,float)) else '')"
}

echo "BASE_URL=${BASE_URL}"
echo "PR_EMAIL=${PR_EMAIL}"
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

echo "== login principal =="
PR_LOGIN_JSON="$(curl -sS "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${PR_EMAIL}\",\"password\":\"${PR_PW}\"}")"
PR_TOKEN="$(printf '%s' "${PR_LOGIN_JSON}" | json_token)"
[ -n "${PR_TOKEN}" ] || { echo "주대표 로그인 실패"; exit 1; }
echo "PR_TOKEN=${PR_TOKEN:0:20}..."
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
print(((obj.get('data') or {}).get('orderId')) or '')
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

echo "== verify paidBalance > 0 =="
BAL_RAW="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${PR_TOKEN}")"
BAL_STATUS="${BAL_RAW##*$'\n'}"
BAL_BODY="${BAL_RAW%$'\n'*}"
echo "${BAL_BODY}"
expect_status "${BAL_STATUS}" "200" "balance before withdraw"
PAID_BALANCE="$(printf '%s' "${BAL_BODY}" | json_get_number "data.paidBalance")"
[ -n "${PAID_BALANCE}" ] || PAID_BALANCE=0
if [ "${PAID_BALANCE}" -le 0 ]; then
  echo "[FAIL] expected paidBalance > 0, got=${PAID_BALANCE}"
  exit 1
fi
echo "[OK] paidBalance=${PAID_BALANCE}"
echo

echo "== refunds API should be blocked (expect 403) =="
REFUND_RAW="$(curl_json POST /api/credits/refunds "${PR_TOKEN}" '{"refundReceiveAccount":{"bank":"국민","accountNumber":"1234567890","holderName":"홍길동"}}')"
REFUND_STATUS="${REFUND_RAW##*$'\n'}"
REFUND_BODY="${REFUND_RAW%$'\n'*}"
echo "${REFUND_BODY}"
expect_status "${REFUND_STATUS}" "403" "credits refunds blocked"
echo

echo "== withdraw without refundReceiveAccount should fail (expect 400) =="
W1_RAW="$(curl_json POST /api/auth/withdraw "${PR_TOKEN}" '{}')"
W1_STATUS="${W1_RAW##*$'\n'}"
W1_BODY="${W1_RAW%$'\n'*}"
echo "${W1_BODY}"
expect_status "${W1_STATUS}" "400" "withdraw requires refundReceiveAccount"
echo

echo "== withdraw with refundReceiveAccount should succeed (expect 200) =="
W2_RAW="$(curl_json POST /api/auth/withdraw "${PR_TOKEN}" '{"refundReceiveAccount":{"bank":"국민","accountNumber":"1234567890","holderName":"홍길동"}}')"
W2_STATUS="${W2_RAW##*$'\n'}"
W2_BODY="${W2_RAW%$'\n'*}"
echo "${W2_BODY}"
expect_status "${W2_STATUS}" "200" "withdraw with refundReceiveAccount"
echo

echo "== balance after withdraw refund (expect 401 because account deactivated OR paidBalance=0 if still accessible) =="
BAL2_RAW="$(curl -sS -w "\n%{http_code}" "${BASE_URL}/api/credits/balance" -H "Authorization: Bearer ${PR_TOKEN}" || true)"
BAL2_STATUS="${BAL2_RAW##*$'\n'}"
BAL2_BODY="${BAL2_RAW%$'\n'*}"

echo "${BAL2_BODY}"
if [ "${BAL2_STATUS}" = "401" ]; then
  echo "[OK] balance after withdraw: status=401 (account deactivated)"
else
  if [ "${BAL2_STATUS}" != "200" ]; then
    echo "[WARN] unexpected status after withdraw: ${BAL2_STATUS}"
  else
    PAID2="$(printf '%s' "${BAL2_BODY}" | json_get_number "data.paidBalance")"
    [ -n "${PAID2}" ] || PAID2=0
    if [ "${PAID2}" -ne 0 ]; then
      echo "[FAIL] expected paidBalance=0 after withdraw refund, got=${PAID2}"
      exit 1
    fi
    echo "[OK] paidBalance after withdraw=${PAID2}"
  fi
fi

echo
echo "[DONE] withdraw refund policy test passed"
