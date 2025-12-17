2. ✅ 크레딧 공유 구조 확인 및 해지 시 주대표만 처리
   크레딧은 개인별로 관리되며 조직 공유가 아님을 확인
   해지 시 **주대표(principal)**만 유료 크레딧 확인 후 환불 절차 진행
   공동대표/직원은 크레딧 확인 없이 바로 해지 가능
3. ✅ 테스트용 크레딧 추가 스크립트
   backend/scripts/addTestCredit.js 생성
   주대표 계정에 500,000원 유료 크레딧 추가
   실행: node backend/scripts/addTestCredit.js
4. ✅ 회원가입 완료 후 첫 화면 변경
   회원가입 성공 시 토큰이 있으면 자동 로그인하고 /dashboard/new-request로 이동
   토큰이 없으면 기존처럼 로그인 페이지로 이동
5. ✅ 전화번호 중복 시 명시적 에러 메시지
   백엔드에서 회원가입 시 전화번호 중복 확인 추가
   중복 시 "이미 등록된 전화번호입니다." 메시지 반환
6. ✅ 신규의뢰 시 크레딧 부족 처리 개선
   주대표가 아닌 경우: "주대표님께 크레딧 충전을 요청해주세요." 토스트만 표시하고 페이지 이동 없음
   주대표인 경우:
   사업장정보 없음 → /dashboard/settings?tab=business
   직원정보 없음 → /dashboard/settings?tab=profile
   배송정보 없음 → /dashboard/settings?tab=shipping
   모두 있음 → /dashboard/settings?tab=payment

7. 테스트 필요 항목
   크레딧 충전 (주대표/공동대표 계정)
   크레딧 환불
   조직 멤버 간 크레딧 공유 확인
   organizationId 없는 사용자 접근 시 403 에러
   주대표 탈퇴 시 크레딧 잔액 체크
