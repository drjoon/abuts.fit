# 인증 API

## 회원가입

새 사용자를 등록합니다.

- **URL**: `/api/auth/register`
- **Method**: `POST`
- **인증 필요**: 아니오

### 요청 본문

```json
{
  "name": "홍길동",
  "email": "user@example.com",
  "password": "password123",
  "role": "requestor",
  "phoneNumber": "010-1234-5678",
  "organization": "회사명"
}
```

### 응답

#### 성공 (201 Created)

```json
{
  "success": true,
  "message": "회원가입이 완료되었습니다.",
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "name": "홍길동",
    "email": "user@example.com",
    "role": "requestor",
    "phoneNumber": "010-1234-5678",
    "organization": "회사명",
    "active": true,
    "createdAt": "2023-08-05T11:30:00.000Z",
    "updatedAt": "2023-08-05T11:30:00.000Z"
  }
}
```

#### 오류 (400 Bad Request)

```json
{
  "success": false,
  "message": "이미 등록된 이메일입니다."
}
```

## 로그인

사용자 인증 및 토큰 발급.

- **URL**: `/api/auth/login`
- **Method**: `POST`
- **인증 필요**: 아니오

### 요청 본문

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "로그인 성공",
  "data": {
    "user": {
      "_id": "60d21b4667d0d8992e610c85",
      "name": "홍길동",
      "email": "user@example.com",
      "role": "requestor",
      "phoneNumber": "010-1234-5678",
      "organization": "회사명",
      "active": true,
      "createdAt": "2023-08-05T11:30:00.000Z",
      "updatedAt": "2023-08-05T11:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 오류 (401 Unauthorized)

```json
{
  "success": false,
  "message": "이메일 또는 비밀번호가 올바르지 않습니다."
}
```

## 토큰 갱신

액세스 토큰 갱신.

- **URL**: `/api/auth/refresh-token`
- **Method**: `POST`
- **인증 필요**: 아니오

### 요청 본문

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "토큰이 갱신되었습니다.",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 오류 (401 Unauthorized)

```json
{
  "success": false,
  "message": "유효하지 않은 토큰입니다."
}
```

## 현재 사용자 정보 조회

인증된 사용자의 정보를 조회합니다.

- **URL**: `/api/auth/me`
- **Method**: `GET`
- **인증 필요**: 예

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "name": "홍길동",
    "email": "user@example.com",
    "role": "requestor",
    "phoneNumber": "010-1234-5678",
    "organization": "회사명",
    "active": true,
    "createdAt": "2023-08-05T11:30:00.000Z",
    "updatedAt": "2023-08-05T11:30:00.000Z"
  }
}
```

#### 오류 (401 Unauthorized)

```json
{
  "success": false,
  "message": "인증에 실패했습니다."
}
```

## 비밀번호 변경

인증된 사용자의 비밀번호를 변경합니다.

- **URL**: `/api/auth/change-password`
- **Method**: `PUT`
- **인증 필요**: 예

### 요청 본문

```json
{
  "currentPassword": "password123",
  "newPassword": "newPassword123"
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "비밀번호가 성공적으로 변경되었습니다."
}
```

#### 오류 (401 Unauthorized)

```json
{
  "success": false,
  "message": "현재 비밀번호가 올바르지 않습니다."
}
```

## 비밀번호 재설정 요청

비밀번호 재설정 이메일 전송.

- **URL**: `/api/auth/forgot-password`
- **Method**: `POST`
- **인증 필요**: 아니오

### 요청 본문

```json
{
  "email": "user@example.com"
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "비밀번호 재설정 링크가 이메일로 전송되었습니다."
}
```

#### 오류 (404 Not Found)

```json
{
  "success": false,
  "message": "해당 이메일로 등록된 사용자가 없습니다."
}
```

## 비밀번호 재설정

토큰을 사용하여 비밀번호 재설정.

- **URL**: `/api/auth/reset-password`
- **Method**: `POST`
- **인증 필요**: 아니오

### 요청 본문

```json
{
  "token": "resetToken123",
  "newPassword": "newPassword123"
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "비밀번호가 성공적으로 재설정되었습니다."
}
```

#### 오류 (400 Bad Request)

```json
{
  "success": false,
  "message": "비밀번호 재설정 토큰이 유효하지 않거나 만료되었습니다."
}
```

## 로그아웃

사용자 로그아웃.

- **URL**: `/api/auth/logout`
- **Method**: `POST`
- **인증 필요**: 예

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "로그아웃 되었습니다."
}
```
