# Abuts.fit API 문서

## 개요

이 문서는 Abuts.fit 백엔드 API의 사용법을 설명합니다. 모든 API는 RESTful 원칙을 따르며, JSON 형식으로 데이터를 주고받습니다.

## 기본 URL

```
http://localhost:5000/api
```

## 인증

대부분의 API는 인증이 필요합니다. 인증은 JWT(JSON Web Token)를 사용하며, 토큰은 HTTP 요청의 Authorization 헤더에 Bearer 스키마를 사용하여 전달합니다.

```
Authorization: Bearer <your_token>
```

## 응답 형식

모든 API 응답은 다음과 같은 형식을 따릅니다:

### 성공 응답

```json
{
  "success": true,
  "message": "작업이 성공적으로 완료되었습니다.",
  "data": {
    // 응답 데이터
  }
}
```

### 오류 응답

```json
{
  "success": false,
  "message": "오류 메시지",
  "error": "상세 오류 정보"
}
```

## 상태 코드

- `200 OK`: 요청이 성공적으로 처리됨
- `201 Created`: 리소스가 성공적으로 생성됨
- `400 Bad Request`: 잘못된 요청
- `401 Unauthorized`: 인증 실패
- `403 Forbidden`: 권한 없음
- `404 Not Found`: 리소스를 찾을 수 없음
- `500 Internal Server Error`: 서버 오류

## API 목록

1. [인증 API](./AUTH_API.md)
2. [사용자 API](./USER_API.md)
3. [의뢰 API](./REQUEST_API.md)
4. [파일 API](./FILE_API.md)
5. [관리자 API](./ADMIN_API.md)

## 환경 변수

백엔드 서버 실행을 위해 다음 환경 변수를 설정해야 합니다:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/abuts-fit
JWT_SECRET=your_jwt_secret_key
REFRESH_TOKEN_SECRET=your_refresh_token_secret
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-northeast-2
AWS_S3_BUCKET_NAME=abuts-fit
```

## 개발 환경 설정

1. 의존성 설치:
```bash
cd backend
npm install
```

2. 환경 변수 설정:
```bash
cp .env.example .env
# .env 파일을 편집하여 필요한 값을 설정
```

3. 서버 실행:
```bash
npm run dev
```
