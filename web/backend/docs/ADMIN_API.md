# 관리자 API

## 모든 사용자 목록 조회

모든 사용자 목록을 조회합니다.

- **URL**: `/api/admin/users`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `admin`

### 쿼리 파라미터

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `role`: 역할로 필터링 (`requestor`, `manufacturer`, `admin`)
- `active`: 활성화 상태로 필터링 (`true` 또는 `false`)
- `search`: 이름, 이메일, 조직으로 검색
- `sortBy`: 정렬 기준 필드
- `sortOrder`: 정렬 방향 (`asc` 또는 `desc`)

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "홍길동",
        "email": "user@example.com",
        "role": "requestor",
        "phoneNumber": "010-1234-5678",
        "organization": "회사명",
        "active": true,
        "lastLogin": "2023-08-05T10:00:00.000Z",
        "createdAt": "2023-08-01T00:00:00.000Z",
        "updatedAt": "2023-08-05T10:00:00.000Z"
      }
      // 추가 사용자 목록...
    ],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 10,
      "pages": 5
    }
  }
}
```

## 사용자 상세 조회

특정 사용자의 상세 정보를 조회합니다.

- **URL**: `/api/admin/users/:id`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `admin`

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
    "lastLogin": "2023-08-05T10:00:00.000Z",
    "createdAt": "2023-08-01T00:00:00.000Z",
    "updatedAt": "2023-08-05T10:00:00.000Z"
  }
}
```

#### 오류 (404 Not Found)

```json
{
  "success": false,
  "message": "사용자를 찾을 수 없습니다."
}
```

## 사용자 정보 수정

특정 사용자의 정보를 수정합니다.

- **URL**: `/api/admin/users/:id`
- **Method**: `PUT`
- **인증 필요**: 예
- **권한**: `admin`

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
  "message": "사용자 정보가 성공적으로 수정되었습니다.",
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "name": "김길동",
    "email": "user@example.com",
    "role": "requestor",
    "phoneNumber": "010-9876-5432",
    "organization": "수정된 회사명",
    "active": true,
    "lastLogin": "2023-08-05T10:00:00.000Z",
    "createdAt": "2023-08-01T00:00:00.000Z",
    "updatedAt": "2023-08-05T15:00:00.000Z"
  }
}
```

#### 오류 (404 Not Found)

```json
{
  "success": false,
  "message": "사용자를 찾을 수 없습니다."
}
```

## 사용자 활성화/비활성화

특정 사용자의 활성화 상태를 토글합니다.

- **URL**: `/api/admin/users/:id/toggle-active`
- **Method**: `PATCH`
- **인증 필요**: 예
- **권한**: `admin`

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "사용자가 비활성화되었습니다.",
  "data": {
    "userId": "60d21b4667d0d8992e610c85",
    "active": false
  }
}
```

#### 오류 (400 Bad Request)

```json
{
  "success": false,
  "message": "자기 자신을 비활성화할 수 없습니다."
}
```

## 사용자 역할 변경

특정 사용자의 역할을 변경합니다.

- **URL**: `/api/admin/users/:id/change-role`
- **Method**: `PATCH`
- **인증 필요**: 예
- **권한**: `admin`

### 요청 본문

```json
{
  "role": "manufacturer"
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "사용자 역할이 성공적으로 변경되었습니다.",
  "data": {
    "userId": "60d21b4667d0d8992e610c85",
    "role": "manufacturer"
  }
}
```

#### 오류 (400 Bad Request)

```json
{
  "success": false,
  "message": "유효하지 않은 역할입니다."
}
```

## 대시보드 통계 조회

시스템 대시보드 통계를 조회합니다.

- **URL**: `/api/admin/dashboard`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `admin`

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "users": {
      "total": 100,
      "active": 85,
      "inactive": 15,
      "byRole": {
        "requestor": 70,
        "manufacturer": 25,
        "admin": 5
      }
    },
    "requests": {
      "total": 200,
      "byStatus": {
        "의뢰접수": 50,
        "가공전": 30,
        "가공후": 80,
        "완료": 40
      },
      "recent": [
        {
          "_id": "60d21b4667d0d8992e610c85",
          "requestId": "REQ-001",
          "title": "임플란트 의뢰 제목",
          "requestor": {
            "_id": "60d21b4667d0d8992e610c86",
            "name": "홍길동",
            "email": "user@example.com"
          },
          "manufacturer": {
            "_id": "60d21b4667d0d8992e610c87",
            "name": "제조사명",
            "email": "manufacturer@example.com"
          },
          "status": "진행중",
          "createdAt": "2023-08-05T11:30:00.000Z"
        }
        // 추가 최근 의뢰 목록...
      ]
    },
    "files": {
      "total": 500,
      "totalSize": 1500000000 // 바이트 단위
    }
  }
}
```

## 시스템 로그 조회

시스템 로그를 조회합니다.

- **URL**: `/api/admin/logs`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `admin`

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "시스템 로그 조회 기능은 아직 구현되지 않았습니다.",
  "data": []
}
```

## 시스템 설정 조회

시스템 설정을 조회합니다.

- **URL**: `/api/admin/settings`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `admin`

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "fileUpload": {
      "maxFileSize": 52428800, // 50MB
      "allowedTypes": [
        "image/jpeg",
        "image/png",
        "image/gif",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "model/stl",
        "application/octet-stream"
      ]
    },
    "security": {
      "rateLimit": {
        "windowMs": 900000, // 15분
        "max": 100 // 15분 동안 최대 100개 요청
      },
      "jwtExpiration": "1d", // 1일
      "refreshTokenExpiration": "7d" // 7일
    }
  }
}
```
