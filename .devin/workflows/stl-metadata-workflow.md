---
description: STL 메타데이터 자동 계산 워크플로우
---

# STL 메타데이터 자동 계산 워크플로우

## 개요

STL 파일 업로드 시 Rhino-server가 자동으로 finish line과 메타데이터를 계산하여 백엔드에 등록합니다.

## 자동 계산 흐름

```
1. STL 업로드 → Rhino 처리 (FillMeshHoles)
   ↓
2. Rhino-server에서 자동으로:
   - Finish line 계산 (Python)
   - 메타데이터 계산 (Node.js subprocess)
   ↓
3. 모든 결과를 백엔드에 한 번에 등록
   ↓
4. 프론트엔드 → 백엔드 조회 (캐시 사용)
```

## 구현 위치

### 1. Rhino-server 자동 계산
- **파일**: `bg/pc1/rhino-server/compute/core/processing.py`
- **함수**: `process_single_stl()`
- **동작**: 
  - STL 처리 완료 후 finish line 파싱
  - Finish line이 있으면 Node.js 메타데이터 계산 호출
  - 모든 결과를 `upload_via_presign()`로 백엔드에 전송

### 2. Node.js 메타데이터 계산 서비스
- **파일**: `bg/pc1/rhino-server/stl-metadata/index.js`
- **실행**: Python subprocess로 호출
- **입력**: STL 파일 경로, finish line points (JSON)
- **출력**: 메타데이터 JSON (stdout)

### 3. 백엔드 API
- **등록**: `POST /api/bg/register-stl-metadata`
- **조회**: `GET /api/bg/stl-metadata/:requestId`
- **재계산**: `POST /api/bg/recalculate-stl-metadata/:requestId`

### 4. 프론트엔드
- **훅**: `useStlMetadata(requestId)`
- **UI**: PreviewModal "메타데이터 재계산" 버튼

## 수동 재계산

프론트엔드에서 "메타데이터 재계산" 버튼 클릭 시:

```
1. 프론트 → 백엔드: POST /api/bg/recalculate-stl-metadata/:requestId
   ↓
2. 백엔드 → Rhino-server: POST /recalculate-metadata
   ↓
3. Rhino-server → Node.js 계산 → 백엔드 등록
   ↓
4. 프론트 2초 후 자동 재조회
```

## 계산되는 메타데이터

- `maxDiameter`: 최대 직경 (mm)
- `connectionDiameter`: 커넥션 직경 (z=0 단면)
- `totalLength`: 전체 길이 (Z축 범위)
- `taperAngle`: 테이퍼 각도 (도)
- `tiltAxisVector`: 기울기 축 벡터 {x, y, z}
- `frontPoint`: Front point 좌표 {x, y, z}
- `taperGuide`: 다방향 테이퍼 가이드 정보

## 환경변수 설정

### 백엔드 (.env)
```bash
RHINO_COMPUTE_BASE_URL=http://1.217.31.227:8000
BRIDGE_SHARED_SECRET=Brg_2026_Abf!9qL7mP2xR4tV6kN8sD3yH5cJ
```

### Rhino-server (.env)
```bash
BACKEND_URL=https://abuts.fit/api
RHINO_SHARED_SECRET=Rhn_2026_Abf!3vK8qM2xT7nL4pD9sH6cJ1rW
BRIDGE_SHARED_SECRET=Brg_2026_Abf!9qL7mP2xR4tV6kN8sD3yH5cJ
```

## 설치 및 실행

### Node.js 의존성 설치
```bash
cd bg/pc1/rhino-server/stl-metadata
npm install
```

### Rhino-server 재시작
```bash
cd bg/pc1/rhino-server/compute
python app.py
```

## 테스트

1. STL 파일 업로드
2. Rhino 처리 완료 대기
3. 백엔드 로그에서 확인:
   ```
   [process_single_stl] Calculating STL metadata for 20260312-XXXXX
   [stl_metadata] Registered metadata for 20260312-XXXXX
   ```
4. 프론트에서 프리뷰 모달 열기 → 메타데이터 자동 표시
5. "메타데이터 재계산" 버튼 클릭 → 2초 후 업데이트 확인

## 장점

✅ **자동화**: STL 처리 시 자동으로 모든 계산 수행  
✅ **효율성**: 한 번의 백엔드 등록으로 모든 데이터 저장  
✅ **속도**: Node.js + Three.js로 빠른 계산  
✅ **캐싱**: DB 저장으로 프론트 즉시 표시  
✅ **유연성**: 필요 시 수동 재계산 가능
