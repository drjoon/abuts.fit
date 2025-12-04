export interface RequestUserSummary {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  organization?: string;
}

export interface RequestSpecifications {
  implantType?: string;
  implantCompany?: string;
  implantProduct?: string;
  implantSize?: string;
  diameter?: string;
  height?: string;
  angle?: string;
  material?: string;
}

// 프론트에서 공통으로 사용하는 의뢰 타입 (백엔드 Request 모델의 부분집합 + mock 호환)
export interface RequestBase {
  _id?: string; // Mongo ObjectId
  id?: string; // 프론트/테스트용 ID ("REQ-001" 등)
  title?: string;
  description?: string;
  status?: string;
  unreadCount?: number;

  // 날짜 계열
  requestDate?: string; // mock에서 사용하는 필드
  date?: string; // 일부 컴포넌트에서 사용하는 필드
  createdAt?: string;

  // 관계 정보 (간단 summary)
  requestor?: RequestUserSummary;
  manufacturer?: RequestUserSummary | string | null;

  // 표시용 필드들
  client?: string;
  dentistName?: string;
  patientName?: string;
  tooth?: string;

  specifications?: RequestSpecifications;

  // 그 외 추가 필드를 허용 (점진적 마이그레이션용)
  [key: string]: any;
}

// RequestBase에서 공통적으로 사용할 ID 추출 헬퍼
export const getRequestId = (request: RequestBase): string => {
  return (
    (request._id as string | undefined) ||
    (request.id as string | undefined) ||
    ""
  );
};
