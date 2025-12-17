# 사용자 API

## 사용자 프로필 조회

로그인한 사용자의 프로필 정보를 조회합니다.

- **URL**: `/api/users/profile`
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
    "createdAt": "2023-08-01T00:00:00.000Z",
    "updatedAt": "2023-08-05T10:00:00.000Z"
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

## 사용자 프로필 수정

로그인한 사용자의 프로필 정보를 수정합니다.

- **URL**: `/api/users/profile`
- **Method**: `PUT`
- **인증 필요**: 예

### 요청 본문

```json
{
  "name": "김길동",
  "phoneNumber": "010-9876-5432",
  "organization": "수정된 회사명"
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "프로필이 성공적으로 수정되었습니다.",
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "name": "김길동",
    "email": "user@example.com",
    "role": "requestor",
    "phoneNumber": "010-9876-5432",
    "organization": "수정된 회사명",
    "active": true,
    "createdAt": "2023-08-01T00:00:00.000Z",
    "updatedAt": "2023-08-05T15:00:00.000Z"
  }
}
```

#### 오류 (400 Bad Request)

```json
{
  "success": false,
  "message": "유효하지 않은 데이터입니다."
}
```

## 제조사 목록 조회

활성화된 제조사 목록을 조회합니다.

- **URL**: `/api/users/manufacturers`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `requestor`, `admin`

### 쿼리 파라미터

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `search`: 이름, 이메일, 조직으로 검색
- `sortBy`: 정렬 기준 필드
- `sortOrder`: 정렬 방향 (`asc` 또는 `desc`)

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "manufacturers": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "제조사명",
        "email": "manufacturer@example.com",
        "organization": "제조사 회사명",
        "phoneNumber": "010-1234-5678"
      }
      // 추가 제조사 목록...
    ],
    "pagination": {
      "total": 25,
      "page": 1,
      "limit": 10,
      "pages": 3
    }
  }
}
```

## 의뢰자 목록 조회

활성화된 의뢰자 목록을 조회합니다.

- **URL**: `/api/users/requestors`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `manufacturer`, `admin`

### 쿼리 파라미터

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `search`: 이름, 이메일, 조직으로 검색
- `sortBy`: 정렬 기준 필드
- `sortOrder`: 정렬 방향 (`asc` 또는 `desc`)

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "requestors": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "홍길동",
        "email": "user@example.com",
        "organization": "회사명",
        "phoneNumber": "010-1234-5678"
      }
      // 추가 의뢰자 목록...
    ],
    "pagination": {
      "total": 70,
      "page": 1,
      "limit": 10,
      "pages": 7
    }
  }
}
```

## 알림 설정 조회

사용자의 알림 설정을 조회합니다.

- **URL**: `/api/users/notification-settings`
- **Method**: `GET`
- **인증 필요**: 예

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "email": {
      "newRequest": true,
      "statusUpdate": true,
      "newMessage": true,
      "fileUpload": false
    },
    "push": {
      "newRequest": true,
      "statusUpdate": true,
      "newMessage": true,
      "fileUpload": true
    }
  }
}
```

## 알림 설정 수정

사용자의 알림 설정을 수정합니다.

- **URL**: `/api/users/notification-settings`
- **Method**: `PUT`
- **인증 필요**: 예

### 요청 본문

```json
{
  "email": {
    "newRequest": true,
    "statusUpdate": true,
    "newMessage": false,
    "fileUpload": false
  },
  "push": {
    "newRequest": true,
    "statusUpdate": true,
    "newMessage": true,
    "fileUpload": false
  }
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "알림 설정이 성공적으로 수정되었습니다.",
  "data": {
    "email": {
      "newRequest": true,
      "statusUpdate": true,
      "newMessage": false,
      "fileUpload": false
    },
    "push": {
      "newRequest": true,
      "statusUpdate": true,
      "newMessage": true,
      "fileUpload": false
    }
  }
}
```

## 사용자 통계 조회

로그인한 사용자의 활동 통계를 조회합니다.

- **URL**: `/api/users/stats`
- **Method**: `GET`
- **인증 필요**: 예

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "requestor": {
      "totalRequests": 15,
      "activeRequests": 8,
      "completedRequests": 7,
      "totalFiles": 45,
      "totalFileSize": 150000000
    },
    "manufacturer": {
      "assignedRequests": 20,
      "activeRequests": 12,
      "completedRequests": 8,
      "totalFiles": 60,
      "totalFileSize": 200000000
    }
  }
}
```

## 사용자 활동 로그 조회

로그인한 사용자의 활동 로그를 조회합니다.

- **URL**: `/api/users/activity-logs`
- **Method**: `GET`
- **인증 필요**: 예

### 쿼리 파라미터

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `type`: 활동 유형으로 필터링
- `sortBy`: 정렬 기준 필드
- `sortOrder`: 정렬 방향 (`asc` 또는 `desc`)

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "type": "login",
        "description": "로그인",
        "timestamp": "2023-08-05T10:00:00.000Z",
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      },
      {
        "_id": "60d21b4667d0d8992e610c86",
        "type": "request_create",
        "description": "새 의뢰 생성: REQ-001",
        "timestamp": "2023-08-05T11:30:00.000Z",
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
      // 추가 활동 로그...
    ],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 10,
      "pages": 10
    }
  }
}
```
