# 의뢰 API

## 새 의뢰 생성

새로운 의뢰를 등록합니다.

- **URL**: `/api/requests`
- **Method**: `POST`
- **인증 필요**: 예
- **권한**: `requestor`, `admin`

### 요청 본문

```json
{
  "title": "임플란트 의뢰 제목",
  "description": "상세한 의뢰 내용을 입력합니다.",
  "implantType": "straumann",
  "implantSpec": "BLX Roxolid SLActive",
  "priority": "보통"
}
```

### 응답

#### 성공 (201 Created)

```json
{
  "success": true,
  "message": "의뢰가 성공적으로 등록되었습니다.",
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "requestId": "REQ-001",
    "title": "임플란트 의뢰 제목",
    "description": "상세한 의뢰 내용을 입력합니다.",
    "requestor": "60d21b4667d0d8992e610c86",
    "implantType": "straumann",
    "implantSpec": "BLX Roxolid SLActive",
    "priority": "보통",
    "status": "검토중",
    "createdAt": "2023-08-05T11:30:00.000Z",
    "updatedAt": "2023-08-05T11:30:00.000Z"
  }
}
```

#### 오류 (400 Bad Request)

```json
{
  "success": false,
  "message": "필수 항목이 누락되었습니다."
}
```

## 모든 의뢰 목록 조회 (관리자용)

모든 의뢰 목록을 조회합니다.

- **URL**: `/api/requests/all`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `admin`

### 쿼리 파라미터

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `status`: 의뢰 상태로 필터링
- `implantType`: 임플란트 유형으로 필터링
- `sortBy`: 정렬 기준 필드
- `sortOrder`: 정렬 방향 (`asc` 또는 `desc`)

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "requestId": "REQ-001",
        "title": "임플란트 의뢰 제목",
        "description": "상세한 의뢰 내용을 입력합니다.",
        "requestor": {
          "_id": "60d21b4667d0d8992e610c86",
          "name": "홍길동",
          "email": "user@example.com",
          "organization": "회사명"
        },
        "manufacturer": null,
        "implantType": "straumann",
        "implantSpec": "BLX Roxolid SLActive",
        "priority": "보통",
        "status": "검토중",
        "createdAt": "2023-08-05T11:30:00.000Z",
        "updatedAt": "2023-08-05T11:30:00.000Z"
      }
      // 추가 의뢰 목록...
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

## 내 의뢰 목록 조회 (의뢰자용)

로그인한 의뢰자의 의뢰 목록을 조회합니다.

- **URL**: `/api/requests/my`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `requestor`, `admin`

### 쿼리 파라미터

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `status`: 의뢰 상태로 필터링
- `implantType`: 임플란트 유형으로 필터링
- `sortBy`: 정렬 기준 필드
- `sortOrder`: 정렬 방향 (`asc` 또는 `desc`)

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "requestId": "REQ-001",
        "title": "임플란트 의뢰 제목",
        "description": "상세한 의뢰 내용을 입력합니다.",
        "manufacturer": {
          "_id": "60d21b4667d0d8992e610c87",
          "name": "제조사명",
          "email": "manufacturer@example.com",
          "organization": "제조사 회사명"
        },
        "implantType": "straumann",
        "implantSpec": "BLX Roxolid SLActive",
        "priority": "보통",
        "status": "검토중",
        "createdAt": "2023-08-05T11:30:00.000Z",
        "updatedAt": "2023-08-05T11:30:00.000Z"
      }
      // 추가 의뢰 목록...
    ],
    "pagination": {
      "total": 20,
      "page": 1,
      "limit": 10,
      "pages": 2
    }
  }
}
```

## 할당된 의뢰 목록 조회 (제조사용)

로그인한 제조사에게 할당된 의뢰 목록을 조회합니다.

- **URL**: `/api/requests/assigned`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: `manufacturer`, `admin`

### 쿼리 파라미터

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `status`: 의뢰 상태로 필터링
- `implantType`: 임플란트 유형으로 필터링
- `sortBy`: 정렬 기준 필드
- `sortOrder`: 정렬 방향 (`asc` 또는 `desc`)

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "requestId": "REQ-001",
        "title": "임플란트 의뢰 제목",
        "description": "상세한 의뢰 내용을 입력합니다.",
        "requestor": {
          "_id": "60d21b4667d0d8992e610c86",
          "name": "홍길동",
          "email": "user@example.com",
          "organization": "회사명"
        },
        "implantType": "straumann",
        "implantSpec": "BLX Roxolid SLActive",
        "priority": "보통",
        "status": "견적 대기",
        "createdAt": "2023-08-05T11:30:00.000Z",
        "updatedAt": "2023-08-05T11:30:00.000Z"
      }
      // 추가 의뢰 목록...
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 10,
      "pages": 2
    }
  }
}
```

## 의뢰 상세 조회

특정 의뢰의 상세 정보를 조회합니다.

- **URL**: `/api/requests/:id`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: 의뢰자, 할당된 제조사, 관리자

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "requestId": "REQ-001",
    "title": "임플란트 의뢰 제목",
    "description": "상세한 의뢰 내용을 입력합니다.",
    "requestor": {
      "_id": "60d21b4667d0d8992e610c86",
      "name": "홍길동",
      "email": "user@example.com",
      "phoneNumber": "010-1234-5678",
      "organization": "회사명"
    },
    "manufacturer": {
      "_id": "60d21b4667d0d8992e610c87",
      "name": "제조사명",
      "email": "manufacturer@example.com",
      "phoneNumber": "010-9876-5432",
      "organization": "제조사 회사명"
    },
    "implantType": "straumann",
    "implantSpec": "BLX Roxolid SLActive",
    "priority": "보통",
    "status": "견적 대기",
    "files": [
      {
        "fileName": "임플란트_설계도.stl",
        "fileType": "3d_model",
        "fileSize": 2500000,
        "filePath": "uploads/requests/60d21b4667d0d8992e610c85/abc123.stl",
        "s3Key": "uploads/requests/60d21b4667d0d8992e610c85/abc123.stl",
        "s3Url": "https://abuts-fit.s3.ap-northeast-2.amazonaws.com/uploads/requests/60d21b4667d0d8992e610c85/abc123.stl",
        "uploadedAt": "2023-08-05T11:35:00.000Z"
      }
    ],
    "messages": [
      {
        "sender": "60d21b4667d0d8992e610c86",
        "content": "의뢰 관련 문의사항입니다.",
        "createdAt": "2023-08-05T11:40:00.000Z",
        "isRead": true
      },
      {
        "sender": "60d21b4667d0d8992e610c87",
        "content": "답변 드립니다.",
        "createdAt": "2023-08-05T11:45:00.000Z",
        "isRead": false
      }
    ],
    "price": {
      "amount": 150000,
      "currency": "KRW",
      "quotedAt": "2023-08-05T12:00:00.000Z"
    },
    "timeline": {
      "estimatedCompletion": "2023-08-15T00:00:00.000Z"
    },
    "createdAt": "2023-08-05T11:30:00.000Z",
    "updatedAt": "2023-08-05T12:00:00.000Z"
  }
}
```

#### 오류 (404 Not Found)

```json
{
  "success": false,
  "message": "의뢰를 찾을 수 없습니다."
}
```

## 의뢰 수정

특정 의뢰의 정보를 수정합니다.

- **URL**: `/api/requests/:id`
- **Method**: `PUT`
- **인증 필요**: 예
- **권한**: 의뢰자, 관리자

### 요청 본문

```json
{
  "title": "수정된 의뢰 제목",
  "description": "수정된 의뢰 내용",
  "implantType": "nobel",
  "implantSpec": "수정된 임플란트 사양",
  "priority": "높음"
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "의뢰가 성공적으로 수정되었습니다.",
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "requestId": "REQ-001",
    "title": "수정된 의뢰 제목",
    "description": "수정된 의뢰 내용",
    "requestor": "60d21b4667d0d8992e610c86",
    "implantType": "nobel",
    "implantSpec": "수정된 임플란트 사양",
    "priority": "높음",
    "status": "검토중",
    "createdAt": "2023-08-05T11:30:00.000Z",
    "updatedAt": "2023-08-05T13:00:00.000Z"
  }
}
```

#### 오류 (403 Forbidden)

```json
{
  "success": false,
  "message": "이 의뢰를 수정할 권한이 없습니다."
}
```

## 의뢰 상태 변경

특정 의뢰의 상태를 변경합니다.

- **URL**: `/api/requests/:id/status`
- **Method**: `PATCH`
- **인증 필요**: 예
- **권한**: 의뢰자, 할당된 제조사, 관리자 (각 역할별 권한 제한 있음)

### 요청 본문

```json
{
  "status": "진행중"
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "의뢰 상태가 성공적으로 변경되었습니다.",
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "requestId": "REQ-001",
    "status": "진행중",
    "updatedAt": "2023-08-05T14:00:00.000Z"
  }
}
```

#### 오류 (403 Forbidden)

```json
{
  "success": false,
  "message": "제조사 또는 관리자만 이 상태로 변경할 수 있습니다."
}
```

## 의뢰에 메시지 추가

특정 의뢰에 메시지를 추가합니다.

- **URL**: `/api/requests/:id/messages`
- **Method**: `POST`
- **인증 필요**: 예
- **권한**: 의뢰자, 할당된 제조사, 관리자

### 요청 본문

```json
{
  "content": "의뢰 관련 문의사항입니다."
}
```

### 응답

#### 성공 (201 Created)

```json
{
  "success": true,
  "message": "메시지가 성공적으로 추가되었습니다.",
  "data": {
    "sender": "60d21b4667d0d8992e610c86",
    "content": "의뢰 관련 문의사항입니다.",
    "createdAt": "2023-08-05T15:00:00.000Z",
    "isRead": false
  }
}
```

#### 오류 (403 Forbidden)

```json
{
  "success": false,
  "message": "이 의뢰에 메시지를 추가할 권한이 없습니다."
}
```

## 의뢰 삭제 (관리자용)

특정 의뢰를 삭제합니다.

- **URL**: `/api/requests/:id`
- **Method**: `DELETE`
- **인증 필요**: 예
- **권한**: `admin`

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "의뢰가 성공적으로 삭제되었습니다."
}
```

#### 오류 (403 Forbidden)

```json
{
  "success": false,
  "message": "관리자만 의뢰를 삭제할 수 있습니다."
}
```

## 의뢰에 제조사 할당 (관리자용)

특정 의뢰에 제조사를 할당합니다.

- **URL**: `/api/requests/:id/assign`
- **Method**: `PATCH`
- **인증 필요**: 예
- **권한**: `admin`

### 요청 본문

```json
{
  "manufacturerId": "60d21b4667d0d8992e610c87"
}
```

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "제조사가 성공적으로 할당되었습니다.",
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "requestId": "REQ-001",
    "manufacturer": "60d21b4667d0d8992e610c87",
    "updatedAt": "2023-08-05T16:00:00.000Z"
  }
}
```

#### 오류 (403 Forbidden)

```json
{
  "success": false,
  "message": "관리자만 제조사를 할당할 수 있습니다."
}
```
