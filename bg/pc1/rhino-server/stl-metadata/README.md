# STL 메타데이터 계산 서비스

Three.js를 사용하여 STL 파일의 메타데이터를 계산하는 Node.js 서비스입니다.

## 설치

```bash
cd /path/to/bg/pc1/rhino-server/stl-metadata
npm install
```

## 사용법

### CLI 사용

```bash
# 기본 계산 (finish line 없이)
node index.js /path/to/file.stl

# Finish line 포인트와 함께 계산
node index.js /path/to/file.stl '[[1,2,3],[4,5,6],[7,8,9]]'
```

### 출력 예시

```json
{
  "maxDiameter": 12.5,
  "connectionDiameter": 4.2,
  "totalLength": 15.8,
  "taperAngle": 6.5,
  "tiltAxisVector": {
    "x": 0.707,
    "y": 0.707,
    "z": 0
  },
  "frontPoint": {
    "x": 0,
    "y": 0,
    "z": 5.2
  },
  "taperGuide": {
    "zStart": 5.2,
    "zEnd": 15.8,
    "multiDirectionGuides": [...]
  },
  "bbox": {
    "min": { "x": -6.25, "y": -6.25, "z": 0 },
    "max": { "x": 6.25, "y": 6.25, "z": 15.8 }
  }
}
```

## 계산되는 메타데이터

- **maxDiameter**: 최대 직경 (mm)
- **connectionDiameter**: 커넥션 직경 (z=0 단면)
- **totalLength**: 전체 길이 (Z축 범위)
- **taperAngle**: 테이퍼 각도 (도)
- **tiltAxisVector**: 기울기 축 벡터
- **frontPoint**: Front point 좌표 (finish line 중심)
- **taperGuide**: 다방향 테이퍼 가이드 정보

## 아키텍처

프론트엔드의 Three.js 계산 로직을 Node.js로 포팅하여 서버사이드에서 빠르게 실행합니다.

### 장점

1. **속도**: Python보다 훨씬 빠른 계산
2. **재사용**: 프론트엔드와 동일한 로직/라이브러리 사용
3. **독립성**: 별도 프로세스로 실행되어 메인 서버 부하 없음
