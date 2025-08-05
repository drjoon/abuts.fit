# 파일 API

## 단일 파일 업로드

단일 파일을 업로드합니다.

- **URL**: `/api/files/upload`
- **Method**: `POST`
- **인증 필요**: 예
- **Content-Type**: `multipart/form-data`

### 요청 본문

```
file: [파일 데이터]
```

### 응답

#### 성공 (201 Created)

```json
{
  "success": true,
  "message": "파일이 성공적으로 업로드되었습니다.",
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "originalName": "example.stl",
    "encoding": "7bit",
    "mimetype": "model/stl",
    "size": 2500000,
    "bucket": "abuts-fit",
    "key": "uploads/users/60d21b4667d0d8992e610c86/abc123.stl",
    "location": "https://abuts-fit.s3.ap-northeast-2.amazonaws.com/uploads/users/60d21b4667d0d8992e610c86/abc123.stl",
    "fileType": "3d_model",
    "uploader": "60d21b4667d0d8992e610c86",
    "isPublic": false,
    "createdAt": "2023-08-05T11:30:00.000Z",
    "updatedAt": "2023-08-05T11:30:00.000Z"
  }
}
```

#### 오류 (400 Bad Request)

```json
{
  "success": false,
  "message": "업로드할 파일이 없습니다."
}
```

## 여러 파일 업로드

여러 파일을 한 번에 업로드합니다 (최대 5개).

- **URL**: `/api/files/upload-multiple`
- **Method**: `POST`
- **인증 필요**: 예
- **Content-Type**: `multipart/form-data`

### 요청 본문

```
files: [파일 데이터 배열]
```

### 응답

#### 성공 (201 Created)

```json
{
  "success": true,
  "message": "파일이 성공적으로 업로드되었습니다.",
  "data": [
    {
      "_id": "60d21b4667d0d8992e610c85",
      "originalName": "example1.stl",
      "encoding": "7bit",
      "mimetype": "model/stl",
      "size": 2500000,
      "bucket": "abuts-fit",
      "key": "uploads/users/60d21b4667d0d8992e610c86/abc123.stl",
      "location": "https://abuts-fit.s3.ap-northeast-2.amazonaws.com/uploads/users/60d21b4667d0d8992e610c86/abc123.stl",
      "fileType": "3d_model",
      "uploader": "60d21b4667d0d8992e610c86",
      "isPublic": false,
      "createdAt": "2023-08-05T11:30:00.000Z",
      "updatedAt": "2023-08-05T11:30:00.000Z"
    },
    {
      "_id": "60d21b4667d0d8992e610c86",
      "originalName": "example2.pdf",
      "encoding": "7bit",
      "mimetype": "application/pdf",
      "size": 1500000,
      "bucket": "abuts-fit",
      "key": "uploads/users/60d21b4667d0d8992e610c86/def456.pdf",
      "location": "https://abuts-fit.s3.ap-northeast-2.amazonaws.com/uploads/users/60d21b4667d0d8992e610c86/def456.pdf",
      "fileType": "document",
      "uploader": "60d21b4667d0d8992e610c86",
      "isPublic": false,
      "createdAt": "2023-08-05T11:30:00.000Z",
      "updatedAt": "2023-08-05T11:30:00.000Z"
    }
  ]
}
```

#### 오류 (400 Bad Request)

```json
{
  "success": false,
  "message": "업로드할 파일이 없습니다."
}
```

## 의뢰에 파일 업로드

특정 의뢰에 파일을 업로드합니다.

- **URL**: `/api/files/request/:requestId/upload`
- **Method**: `POST`
- **인증 필요**: 예
- **권한**: 의뢰자, 할당된 제조사, 관리자
- **Content-Type**: `multipart/form-data`

### 요청 본문

```
file: [파일 데이터]
```

### 응답

#### 성공 (201 Created)

```json
{
  "success": true,
  "message": "파일이 성공적으로 업로드되었습니다.",
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "originalName": "example.stl",
    "encoding": "7bit",
    "mimetype": "model/stl",
    "size": 2500000,
    "bucket": "abuts-fit",
    "key": "uploads/requests/60d21b4667d0d8992e610c87/abc123.stl",
    "location": "https://abuts-fit.s3.ap-northeast-2.amazonaws.com/uploads/requests/60d21b4667d0d8992e610c87/abc123.stl",
    "fileType": "3d_model",
    "uploader": "60d21b4667d0d8992e610c86",
    "request": "60d21b4667d0d8992e610c87",
    "isPublic": false,
    "createdAt": "2023-08-05T11:30:00.000Z",
    "updatedAt": "2023-08-05T11:30:00.000Z"
  }
}
```

#### 오류 (403 Forbidden)

```json
{
  "success": false,
  "message": "이 의뢰에 파일을 업로드할 권한이 없습니다."
}
```

## 파일 상세 조회

특정 파일의 상세 정보를 조회합니다.

- **URL**: `/api/files/:id`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: 파일 업로더, 관련 의뢰의 의뢰자/제조사, 관리자, 또는 공개 파일

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "originalName": "example.stl",
    "encoding": "7bit",
    "mimetype": "model/stl",
    "size": 2500000,
    "fileType": "3d_model",
    "uploader": {
      "_id": "60d21b4667d0d8992e610c86",
      "name": "홍길동",
      "email": "user@example.com"
    },
    "request": {
      "_id": "60d21b4667d0d8992e610c87",
      "requestId": "REQ-001",
      "title": "임플란트 의뢰 제목"
    },
    "isPublic": false,
    "signedUrl": "https://abuts-fit.s3.ap-northeast-2.amazonaws.com/uploads/requests/60d21b4667d0d8992e610c87/abc123.stl?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
    "createdAt": "2023-08-05T11:30:00.000Z",
    "updatedAt": "2023-08-05T11:30:00.000Z"
  }
}
```

#### 오류 (404 Not Found)

```json
{
  "success": false,
  "message": "파일을 찾을 수 없습니다."
}
```

#### 오류 (403 Forbidden)

```json
{
  "success": false,
  "message": "이 파일에 접근할 권한이 없습니다."
}
```

## 내 파일 목록 조회

로그인한 사용자가 업로드한 파일 목록을 조회합니다.

- **URL**: `/api/files/my`
- **Method**: `GET`
- **인증 필요**: 예

### 쿼리 파라미터

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `fileType`: 파일 유형으로 필터링
- `sortBy`: 정렬 기준 필드
- `sortOrder`: 정렬 방향 (`asc` 또는 `desc`)

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "files": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "originalName": "example.stl",
        "mimetype": "model/stl",
        "size": 2500000,
        "fileType": "3d_model",
        "request": {
          "_id": "60d21b4667d0d8992e610c87",
          "requestId": "REQ-001",
          "title": "임플란트 의뢰 제목"
        },
        "isPublic": false,
        "createdAt": "2023-08-05T11:30:00.000Z"
      }
      // 추가 파일 목록...
    ],
    "pagination": {
      "total": 30,
      "page": 1,
      "limit": 10,
      "pages": 3
    }
  }
}
```

## 의뢰 관련 파일 목록 조회

특정 의뢰와 관련된 파일 목록을 조회합니다.

- **URL**: `/api/files/request/:requestId`
- **Method**: `GET`
- **인증 필요**: 예
- **권한**: 의뢰자, 할당된 제조사, 관리자

### 쿼리 파라미터

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `fileType`: 파일 유형으로 필터링
- `sortBy`: 정렬 기준 필드
- `sortOrder`: 정렬 방향 (`asc` 또는 `desc`)

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "files": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "originalName": "example.stl",
        "mimetype": "model/stl",
        "size": 2500000,
        "fileType": "3d_model",
        "uploader": {
          "_id": "60d21b4667d0d8992e610c86",
          "name": "홍길동",
          "email": "user@example.com"
        },
        "isPublic": false,
        "createdAt": "2023-08-05T11:30:00.000Z"
      }
      // 추가 파일 목록...
    ],
    "pagination": {
      "total": 5,
      "page": 1,
      "limit": 10,
      "pages": 1
    }
  }
}
```

#### 오류 (403 Forbidden)

```json
{
  "success": false,
  "message": "이 의뢰의 파일을 조회할 권한이 없습니다."
}
```

## 파일 삭제

특정 파일을 삭제합니다.

- **URL**: `/api/files/:id`
- **Method**: `DELETE`
- **인증 필요**: 예
- **권한**: 파일 업로더, 관리자

### 응답

#### 성공 (200 OK)

```json
{
  "success": true,
  "message": "파일이 성공적으로 삭제되었습니다."
}
```

#### 오류 (403 Forbidden)

```json
{
  "success": false,
  "message": "이 파일을 삭제할 권한이 없습니다."
}
```
