// 기공소 AI 보철 — 상악·하악·바이트를 저장된 좌표 그대로 겹쳐 본다.
// - 2026-09-26: 지대치는 불투명, 대합·바이트는 투명. 기본 뷰는 화면에 맞춘다.
// - 2026-09-26: 교합면·협측·설측, 대합 접촉 색, 삽입 방향 언더컷.
// - 2026-09-26: 열릴 때 의뢰 치아 교합면을 화면 중앙에 둔다. 치아번호 뱃지는 그 좌표에 붙는다.
// - 2026-09-26: 파싱 결과는 메모리에 두고, 교합·언더컷 거리는 켤 때만 계산한다.
// - 2026-09-26: 역할만 바뀌면 메시를 다시 읽지 않고 색·대합을 다시 계산한다.
// - 2026-09-26: 삽입축은 보철마다 화면과 수직으로 잡고, 화살표와 고리로 표시한다.
// - 2026-09-26: 삽입축 표시는 토글. 새로 잡으면 치아 위쪽에 두고 화살표 끝이 표면에 닿는다.
// - 2026-09-26: 삽입축은 화면 중앙 광선이다. 치아 추정 좌표가 아니라 그 광선이 닿는 면에 둔다.
// - 2026-09-26: 삽입축을 잡으면 그 보철의 치아 추정 좌표를 같은 점으로 옮긴다.
// - 2026-09-26: 정중앙 점선은 토글로 켠다. 가로·세로는 화면 한가운데를 지난다.
// - 2026-09-26: 삽입축은 치아에서 2mm 띄운다. 치아번호는 윗단 고리 중심에 둔다.
// - 2026-09-26: 처음 카메라는 지대치 교합면과 인접치 하나씩. 그 자세를 초기 뷰로 둔다.
// - 2026-09-26: 열릴 때 화면 중심은 모델 중심이다. 삽입축은 사용자가 맞춘 화면 중앙으로 잡는다.
// - 2026-09-26: 양악이면 악궁 사이가 교합면이고, 한쪽만 있으면 바운딩박스에서 아이보리색 치아가 몰린 축에 수직으로 본다.
// - 2026-09-26: 삽입축을 잡으면 치아·잇몸 색이 갈라지는 곳을 마진으로 잡는다.
// - 2026-09-26: 마진은 기본 원보다 바깥을, 삽입축으로 스캔 면에 붙여 잡는다.
// - 2026-09-26: 바이트와 상·하악이 어긋나면 바이트에 맞춰 움직이고, 교합면 중심에 원점을 둔다.
// - 2026-09-26: 수동 정렬은 고른 악과 바이트만 좌우로 두고, 점 3개씩으로 근처 대응점을 잡아 붙인다.
// - 2026-09-26: 수동 정렬의 두 모델은 화면 가운데에 좁은 간격으로 나란히 둔다.
// - 2026-09-26: 화면 오른쪽·앞쪽에 방향광을 더해 악궁 양쪽이 같이 밝다.
// - 2026-09-26: 바이트에 맞추는 중 취소하면 좌표를 바꾸지 않고 이전 위치로 둔다.
// - 2026-09-26: 바뀐 스캔의 짧은 지문을 좌표 사본 없이 낸다.
// - 2026-09-26: 카메라 각도·위치·줌이 바뀌면 알리고, 저장한 뷰를 다시 깐다.
// - 2026-09-26: 바이트 맞춤은 연 파일과 좌표가 다르면 작업 DCM이다. 작업 DCM은 맞춤을 다시 하지 않는다.
// - 2026-09-27: 정중앙은 모눈까지. 2mm는 옅은 점선, 10mm는 더 진하고, 가운데는 더 굵다.
// - 2026-09-27: 뷰를 줄이면 모델 배율은 처음 맞춘 그대로 두고 좌우를 자른다.
// - 2026-09-27: 마진을 교합면에서 0.75mm 넓혀 삽입축으로 내려 다이를 자른다. 다이 보기는 다이가 있는 악 스캔을 숨긴다.
// - 2026-09-27: 출력용 모델은 buildStoneModel로 만들어 들고 있다가 내보낸다. 보는 동안 스캔·다이는 가리고, 스캔 좌표가 바뀌면 버린다.
// - 2026-09-27: 숨긴 치아는 다이와 작업물을 그리지 않는다. 다이 보기는 보이는 치아의 다이만.
// - 2026-09-27: 삽입축을 잡으면 그 화면의 오른쪽·위·앞이 X·Y·Z가 되게 스캔을 돌린다.
// - 2026-09-27: 마진 점·펜·새로 찍기는 스캔 면에 붙인다. 선택 치아 마진 점이 언더컷 면이면 빨갛게 칠하고 알린다.
// - 2026-09-27: 스캔바디·심플어벗 실제 형상을 ICP로 맞춘다(fitScanbodyMesh). 후보가 여럿이면 가장 잘 맞는 것.
// - 2026-09-27: 화살표를 끄는 동안 언더컷을 바로 칠한다. 삽입축은 수동으로만 잡는다. 미리보기(preview)는 스캔을 돌리지 않고 축·언더컷만 화면을 따라온다.
// - 2026-09-28: 메시 편집(다듬기·구멍 메우기·조각). 모양이 바뀐 스캔은 새 지오메트리로 갈고, 정점마다 파일 좌표를 들고 작업 DCM으로 저장한다.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

import type { WorkSessionCenterGuide } from "@/shared/practice/labProsthesisWorkDraft";
import { ScreenSpaceOrbitControls } from "@/shared/three/screenSpaceOrbitControls";
import {
  disposeBackFaceShell,
  syncBackFaceShell,
  syncBackFaceShellGeometry,
} from "@/shared/three/backFaceShell";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  isScanColorPreview,
  parseModelPreview,
  SCAN_COLOR_PREVIEW_BACKGROUND,
} from "@/shared/files/modelPreviewFile";
import { linearColorsToSrgbBytes } from "@/shared/files/hpsDcmWrite";
import {
  isAbutsWorkScanFileName,
  type LabOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import type {
  WorkSessionAxis,
  WorkSessionView,
} from "@/shared/practice/labProsthesisWorkDraft";
import {
  contactColorRgb,
  createScanPointIndex,
  geometryUnitsToMm,
  isUndercutAlignment,
  UNDERCUT_RGB,
  type ContactPaintMode,
} from "@/shared/practice/oralScanDesignAnalysis";
import {
  applyBiteFitPoses,
  mergeArchToBiteByPoints,
  registerJawsToBiteResult,
} from "@/shared/practice/biteRegistration";
import {
  estimateDentalFrame,
  meanVec,
  reseatOcclusalOrigin,
  samplePositions,
  type DentalFrame,
} from "@/shared/practice/dentalFrame";
import {
  sculptStampWidth,
  STRETCH_RANGE,
  type RefineTransform,
  type DesignGesture,
  type MarginSample,
  type ModelSettings,
  type ProsthesisDesignEdit,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import { encodeBinaryStl } from "@/shared/files/stlBinaryWrite";
import { unionTriangleSoups } from "@/shared/practice/meshUnion";
import {
  fdiToothDigits,
  insertionAxisKey,
  insertionAxisTeeth,
} from "@/shared/practice/toothArchOrder";
import {
  COLOR_MARGIN_POINT_COUNT,
  detectProjectedColorMargin,
  PROJECTED_MARGIN_TRIANGLE_STRIDE,
} from "@/shared/practice/detectColorMargin";
import { detectCavityMargin } from "@/shared/practice/detectCavityMargin";
import {
  buildMarginDie,
  buildStoneModel,
  type StoneModelJaw,
  type StoneModelPart,
} from "@/shared/practice/labStoneModel";
import {
  basisQuaternion,
  buildProsthesisEditLayer,
  connectorFrame,
  implantPose,
  screwHoleLine,
  type ScrewHoleLine,
  marginWorldPoints,
  readEditHit,
  type CachedCrown,
  type CrownAdaptScan,
  type EditHit,
  type ScanDistanceProbe,
  type TransformBox,
  type TransformHandle,
} from "@/shared/components/practice/labProsthesisEditLayer";
import {
  createScanColumns,
  createScanGrid,
  downsampleCloud,
  type ScanCloud,
} from "@/shared/practice/crownAdapt";
import {
  bestRigid,
  meshExtent,
  registerScanbody,
  type ScanbodyMesh,
} from "@/shared/practice/scanbodyRegistration";
import {
  weldVertices,
  type ScanMeshEdit,
  type ScanMeshEditStatus,
} from "@/shared/practice/scanMeshEdit";
import {
  ScanMeshEditController,
  type MeshEditApplyResult,
  type ScanShapeEdit,
} from "@/shared/components/practice/scanMeshEditController";
import { cn } from "@/shared/ui/cn";

export type OralScanViewPreset = "fit" | "occlusal" | "buccal" | "lingual";

const EMPTY_TEETH: readonly string[] = [];

/** 스캔 면 광선 검사는 무겁다. 끄는 동안 이 간격으로만 쏜다. */
const SURFACE_PICK_MS = 24;
/** 삽입축을 끄는 동안 언더컷을 다시 칠하는 간격. */
const UNDERCUT_DRAG_MS = 60;

/** 석고 다이 색. */
const DIE_RGB = 0xe6d7ad;
/** CSS2D 버튼은 React 밖이라 lucide `Link2`를 문자열로 넣는다. */
const LINK_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>';
const STONE_PART_RGB: Record<StoneModelPart["kind"], number> = {
  arch: 0xd8c9a3,
  die: DIE_RGB,
  post: 0x9ca3af,
};

export type CavityMarginHit = {
  tooth: string;
  radii: number[];
  depths: number[];
  taperDeg: number[];
  depthMm: number;
  openSides: number;
};

export type OralScanOverlayHandle = {
  setView: (preset: OralScanViewPreset) => void;
  /** 의뢰 치아 교합면을 화면 중앙에 다시 맞춘다. */
  focusTooth: (toothNumber: string) => void;
  /**
   * 이 치아의 삽입축을 잡았던 카메라로 되돌린다.
   * 방향·각도·줌이 그때와 같다. 잡은 축이 없으면 false.
   */
  restoreInsertionView: (toothNumbers: readonly string[]) => boolean;
  /** 이 치아 스크류홀 축을 따라 내려다본다. 홀이 없으면 false. */
  viewHoleAxis: (toothNumber: string) => boolean;
  saveImage: () => void;
  /** 표시를 겹치기 위한 현재 프레임 캔버스. */
  captureCanvas: () => HTMLCanvasElement | null;
  /**
   * 화면 중앙을 지나는, 화면과 수직인 방향을 이 치아들의 삽입축으로 잡는다.
   * 화살표 끝은 그 광선이 닿는 면에서 2mm 띄우고, 치아 추정 좌표는 그 면에 둔다.
   * 같은 치아 묶음이면 방향을 다시 잡고, 다른 보철 축은 유지한다.
   * `preview`면 스캔 좌표를 화면 축으로 돌리지 않는다. 화면을 돌리는 동안 축·언더컷만 따라온다.
   */
  setInsertionFromView: (
    toothNumbers: readonly string[],
    options?: { preview?: boolean },
  ) => boolean;
  /**
   * 이 치아들의 스캔 칼라에서 마진을 고른다.
   * 기본 원보다 넓은 고리를 삽입축으로 스캔 면에 붙여 본다. 색 경계 또는 기하 능선으로 검출한다.
   */
  detectColorMargins: (
    toothNumbers: readonly string[],
    seedPoint?: { x: number; y: number; z: number } | null,
  ) => Array<{ tooth: string; radii: number[]; depths: number[] }>;
  /**
   * 인레이·온레이 와동 테두리를 마진으로 잡는다. 삽입축에서 교합면을 내려다본다.
   * 와동이 없어 보이면 그 치아는 빠진다.
   */
  detectCavityMargins: (toothNumbers: readonly string[]) => CavityMarginHit[];
  /** 모델을 분석하여 교합면 뷰로 화면을 정렬한다. */
  alignModelToOcclusalView: () => boolean;
  /** 모달을 열었을 때의 교합면 카메라로 되돌린다. */
  resetHomeView: () => void;
  /** 파일 좌표에서 상악·하악을 바이트에 다시 맞춘다. 붙으면 true. */
  alignToBiteAuto: () => Promise<boolean>;
  /** 진행 중인 바이트 맞춤을 멈춘다. 좌표는 시작 전에 둔다. */
  cancelAlign: () => void;
  /** 수동 정렬에서 찍은 점을 지운다. */
  clearAlignPicks: () => void;
  /** 수동 교합에 들어온 뒤 고른 악이 교합 축으로 벌어진 거리(mm). 다물면 음수. */
  occlusionVerticalMm: () => number;
  /** 교합 거리를 화면에서만 미리 옮긴다. 정점은 그대로다. */
  previewOcclusionVertical: (mm: number) => void;
  /** 교합 거리를 정점에 굽는다. */
  commitOcclusionVertical: (mm: number) => void;
  /** 수동 교합에 들어왔을 때 위치로 되돌린다. */
  resetOcclusion: () => void;
  /**
   * 파일을 열었을 때와 좌표가 다른 스캔.
   * 같은 역할의 스캔은 같이 낸다. 화면 배치(좌우 분리)는 포함하지 않는다.
   */
  exportChangedScans: () => WorkingScanMesh[];
  /** 바뀐 스캔이 없으면 빈 문자열. 좌표 사본은 만들지 않는다. */
  changedScanSignature: () => string;
  /** 상악·하악·바이트 정점과 메시 모양. 실행 취소용이며 화면 배치는 넣지 않는다. */
  captureJawPositions: () => JawSnapshot[];
  /** 저장해 둔 정점·메시 모양으로 되돌린다. 카메라는 그대로 둔다. */
  restoreJawPositions: (rows: ReadonlyArray<JawSnapshot>) => void;
  /** 메시 편집 — 다듬기는 고른 면을 지우고, 구멍 메우기는 고른 구멍을 메운다. */
  meshEditApply: () => MeshEditApplyResult;
  meshEditInvert: () => void;
  meshEditClear: () => void;
  /** 스캔마다 가장 큰 조각만 남기고 떨어진 조각을 고른다. 고른 게 없으면 false. */
  meshEditSelectLoose: () => boolean;
  meshEditPickAllHoles: (on: boolean) => void;
  /** 잡혀 있는 삽입축. 작업 문서에 넣는다. */
  exportInsertionAxes: () => WorkSessionAxis[];
  /** 저장했던 삽입축을 다시 켠다. */
  restoreInsertionAxes: (axes: readonly WorkSessionAxis[]) => void;
  /** 지금 카메라. 각도·위치·줌. */
  exportCamera: () => WorkSessionView | null;
  /** 저장한 카메라를 그대로 둔다. 뷰 저장은 부르지 않는다. */
  restoreCamera: (view: WorkSessionView) => void;
  /**
   * 커넥터 자리에서 양쪽 치아의 인접면을 본 단면 보기.
   * 커넥터 메시는 빼고 그린다. 치아 위치를 모르면 null.
   */
  captureConnectorSection: (
    link: { from: string; to: string },
    connector: ToothDesignEdit["connector"],
  ) => ConnectorSectionShot | null;
  /**
   * 생성한 보철(크라운·폰틱·커넥터·훅)과 고른 스캔을 STL로 낸다.
   * CAM 좌표면 스캔 파일 좌표·단위 그대로, 아니면 보철 중심을 원점으로 mm로 낸다.
   * union 그룹은 합집합 한 덩어리로 내고, 합칠 수 없으면 MeshUnionError로 거절한다.
   */
  exportDesignStl: (
    input: DesignStlExportInput,
  ) => Promise<Array<{ fileName: string; blob: Blob }>>;
  /**
   * 밀링 배치용 보철. 그룹 위치를 원점으로 mm 삼각형을 낸다.
   * axis는 그 보철 삽입축(교합 방향)이고, 잡지 않았으면 null.
   */
  restorationSolids: (
    groups: DesignStlExportInput["groups"],
  ) => Promise<RestorationSolid[]>;
  /**
   * 모델 설정으로 출력용 모델을 만든다. 파트는 뷰어가 들고 있다가 내보낸다.
   * 다이 절단 반지름은 마진 가장 바깥 반지름에 1.2mm를 더한다.
   */
  buildStoneModel: (input: {
    settings: ModelSettings;
    dies: ReadonlyArray<{ tooth: string; margin: ToothDesignEdit["margin"] }>;
  }) => StoneModelPartSummary[];
  clearStoneModel: () => void;
  /**
   * 라이브러리 스캔바디를 스캔에 맞춘다. 윗면 중심과 축을 스캔 면에서 찾는다.
   * 치아 위치나 주변 스캔이 없으면 null.
   */
  fitScanbody: (
    toothNumber: string,
    radiusMm: number,
  ) => { axis: [number, number, number]; offset: [number, number, number]; fitMm: number | null } | null;
  /**
   * 실제 스캔바디·심플어벗 형상 후보를 스캔에 ICP로 맞추고 가장 잘 맞는 것을 고른다.
   * 초기 위치는 이미 맞춘 자세, 없으면 원기둥 맞춤. 축·윗면·헥스 방향(rotDeg)을 돌려준다.
   */
  fitScanbodyMesh: (
    toothNumber: string,
    candidates: ReadonlyArray<{ key: string; mesh: ScanbodyMesh }>,
    current: ToothDesignEdit["implant"] | null,
  ) => {
    key: string;
    axis: [number, number, number];
    offset: [number, number, number];
    rotDeg: number;
    fitMm: number;
    topCoverage: number;
  } | null;
  /** 찍어 둔 스캔바디 점을 지운다. */
  clearScanbodyPicks: () => void;
};

export type DesignStlExportInput = {
  /** 파일 하나에 묶을 치아. 브리지는 스팬 전체. */
  groups: ReadonlyArray<{
    fileName: string;
    teeth: readonly string[];
    /** 조립된 브리지. 크라운·커넥터를 합집합으로 합친다. label은 실패 안내에 쓴다. */
    union?: { label: string };
  }>;
  scans: ReadonlyArray<{ fileName: string; role: WorkingScanMesh["role"] }>;
  /** 「모델 생성」으로 만든 파트. id는 StoneModelPart.id. */
  stoneParts?: ReadonlyArray<{ id: string; fileName: string }>;
  camCoordinates: boolean;
};

export type RestorationSolid = {
  fileName: string;
  positions: Float32Array;
  axis: [number, number, number] | null;
};

export type StoneModelPartSummary = Omit<StoneModelPart, "positions"> & {
  triangleCount: number;
};

export type ConnectorSectionShot = {
  /** 이미지 한 변의 절반(mm). 이미지 중심이 이동 전 커넥터 기준점이다. */
  halfMm: number;
  sides: Array<{
    tooth: string;
    /** PNG data URL. 위가 교합 방향. */
    image: string;
    /** 협설(+x)이 이미지 왼쪽이면 true. */
    mirrored: boolean;
  }>;
};

export type WorkingScanMesh = {
  role: Exclude<LabOralScanRole, "other">;
  positions: Float32Array;
  indices: Uint32Array;
  /** sRGB 0..255. 없으면 무색. */
  colors: Uint8Array | null;
};

/**
 * 실행 취소로 되돌릴 스캔 메시 모양. 편집은 배열을 고치지 않고 새로 만들기만 하므로 참조로 들고 있다.
 * fileCoords는 정점마다 연 파일 좌표(새로 만든 정점은 NaN). 편집하지 않았으면 null.
 */
export type ScanShapeSnapshot = {
  index: THREE.BufferAttribute | null;
  color: THREE.BufferAttribute | null;
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;
  fileCoords: Float32Array | null;
  filePositions: Float32Array;
};

export type JawSnapshot = {
  id: string;
  positions: Float32Array;
  shape?: ScanShapeSnapshot;
};

export type OralScanToothBadge = {
  toothNumber: string;
  /** 배지 글자. 없으면 치아 번호. 임플란트는 `16i`. */
  label?: string;
  active?: boolean;
  /** 조립된 브리지. 배지 하나를 이 치아들 가운데에 둔다. */
  span?: readonly string[];
};

/** 조립 전 브리지의 치아 사이 커넥터. 누르면 커넥터 편집을 연다. */
export type OralScanConnectorChip = {
  from: string;
  to: string;
  weak?: boolean;
  active?: boolean;
};

export type OralScanWorldTurn = {
  /** 원점을 지나는 회전. 방향·원점 기준 오프셋 모두에 쓴다. */
  vector: (value: readonly [number, number, number]) => [number, number, number];
  /** captureJawPositions로 받은 정점을 새 좌표로. */
  jaw: (id: string, positions: Float32Array) => Float32Array;
};

export type OralScanOcclusionAdjust = {
  arch: "upper" | "lower";
  /** vertical: 교합 축으로만. free: 끌어 옮기고, Shift는 화면 안 회전, Alt는 기울이기. */
  mode: "vertical" | "free";
};

export type OralScanOverlaySource = {
  id: string;
  fileName: string;
  role: LabOralScanRole;
  file: File;
  companionFiles?: File[] | null;
};

type Props = {
  items: OralScanOverlaySource[];
  visible: Record<string, boolean>;
  colorMapping: boolean;
  /** 0–1. 대합악·바이트에 적용. 지대치 악은 항상 불투명. */
  ghostOpacity: number;
  /** 주문 치아가 있는 악. 반대악이 대합. */
  prepArch?: "upper" | "lower" | "both" | null;
  /** 이 FDI 치아들을 교합면 화면 중앙에 확대해 연다. */
  focusToothNumbers?: readonly string[];
  /** 교합면 3D 좌표에 붙는 치아번호. 모델을 돌리면 같이 움직인다. */
  toothBadges?: readonly OralScanToothBadge[];
  onSelectTooth?: (toothNumber: string) => void;
  connectorChips?: readonly OralScanConnectorChip[];
  onSelectConnector?: (from: string) => void;
  /** 대합까지 거리를 색으로 칠한다. */
  contactMap?: boolean;
  /** 삽입 방향 언더컷을 붉게 칠한다. */
  undercutMap?: boolean;
  /** 교합 간격 목표(mm). */
  occlusalGapMm?: number;
  contactMode?: ContactPaintMode;
  /** 법선·삽입축 내적. 이 값보다 크면 언더컷. */
  undercutLimit?: number;
  busy?: boolean;
  busyLabel?: string;
  onScanColorChange?: (hasScanColor: boolean) => void;
  /** 삽입축 화살표가 켜지거나 꺼질 때. */
  onInsertionAxisChange?: (active: boolean) => void;
  /** 삽입축 방향을 손보고 손을 뗐을 때. 그 치아 번호. */
  onInsertionAxisAimed?: (toothNumbers: readonly string[]) => void;
  /** 잡은 삽입축을 작업 영역에 그릴지. */
  showInsertionAxis?: boolean;
  /** off, 가운데 점선, 2mm·10mm 모눈. 모눈일 때도 정중앙이 가장 굵다. */
  centerGuide?: WorkSessionCenterGuide;
  /** 마진·보철 수정. 없으면 그리지 않는다. */
  designEdit?: ProsthesisDesignEdit | null;
  onDesignGesture?: (gesture: DesignGesture) => void;
  /** 마진을 잡은 치아. 이 마진을 넓혀 삽입축으로 내려 다이를 자른다. */
  dieMargins?: Readonly<Record<string, ToothDesignEdit["margin"]>> | null;
  /** 다이를 보이고, 다이가 있는 악 스캔은 숨긴다. */
  showDies?: boolean;
  /** 이 치아들의 다이와 작업물은 그리지 않는다. */
  hiddenTeeth?: readonly string[];
  /**
   * 삽입축을 잡은 화면에 맞춰 월드를 돌렸을 때.
   * 뷰어 밖에 둔 월드 벡터와 정점 사본을 같은 회전으로 옮긴다.
   */
  onWorldTurned?: (turn: OralScanWorldTurn) => void;
  /** 다이를 만든 치아가 바뀔 때. */
  onDiesChange?: (teeth: readonly string[]) => void;
  /** 만든 모델을 보이고, 원래 스캔과 다이는 가린다. */
  showStoneModel?: boolean;
  /** 모델을 만들거나, 스캔 좌표가 바뀌어 모델을 버렸을 때. */
  onStoneModelChange?: (parts: StoneModelPartSummary[]) => void;
  /**
   * 수동 정렬. 이 악과 바이트만 좌우로 보여 점을 찍는다.
   * 없으면 평소 뷰.
   */
  manualAlignArch?: "upper" | "lower" | null;
  onAlignProgress?: (picks: { model: number; bite: number }) => void;
  onAlignMerged?: (arch: "upper" | "lower") => void;
  onAlignFailed?: () => void;
  /** 맞추는 중 취소. 점과 좌표는 그대로 둔다. */
  onAlignCancelled?: () => void;
  /** 바이트 맞춤(불러올 때·역할 변경·자동·반자동)이 도는 동안 true. 부모는 이동안 편집·저장을 막는다. */
  onAligningChange?: (aligning: boolean) => void;
  /** 수동 교합. 이 악만 움직인다. 없으면 평소 뷰. */
  occlusionAdjust?: OralScanOcclusionAdjust | null;
  /** 수동 교합으로 정점을 바꾸기 직전(start)과 굽고 난 뒤(end). */
  onOcclusionEdit?: (phase: "start" | "end") => void;
  /** 메시 편집. 켜면 보이는 상악·하악·바이트 스캔을 다듬고 메우고 조각한다. */
  meshEdit?: ScanMeshEdit | null;
  onMeshEditStatus?: (status: ScanMeshEditStatus) => void;
  /** 메시 편집으로 스캔을 바꾸기 직전(start)과 바꾼 뒤(end). */
  onMeshEdit?: (phase: "start" | "end") => void;
  /** 스캔을 화면에 올린 뒤. restore면 저장된 삽입축·카메라를 다시 깐다. */
  onMeshesReady?: (info: { deformed: boolean; restore: boolean }) => void;
  /** 돌리기·이동·줌·시점 전환이 멈추면. */
  onViewSettled?: () => void;
  /** 이 임플란트 치아의 스캔바디 윗면 가장자리에 점 3개를 찍는다. */
  scanbodyPickTooth?: string | null;
  onScanbodyPicks?: (count: number) => void;
  /** 이 치아의 마진 시작점을 스캔 위에서 한 번 찍는다. 그 자리부터 다시 검출한다. */
  marginSeedPickTooth?: string | null;
  onMarginSeedPick?: (tooth: string, point: { x: number; y: number; z: number }) => void;
  /** 선택 치아 마진 점 중 언더컷 면에 놓인 점 수. 마진을 안 그리면 null, 0. */
  onMarginUndercut?: (tooth: string | null, count: number) => void;
  /** 홀 검사에 걸린 치아와 이유. 레이어를 그릴 때마다 부른다. */
  onHoleIssues?: (issues: Record<string, string>) => void;
  /** 대합·인접 맞춤을 켠 생성 크라운마다 가장 얇은 외면(mm). 레이어를 그릴 때마다 부른다. */
  onCrownShells?: (shells: Record<string, number>) => void;
  /** 지운 마진을 새로 찍는 중인 점 수. 닫거나 그만두면 0. */
  onMarginTraceProgress?: (count: number) => void;
  className?: string;
};

type LoadedMesh = {
  id: string;
  role: LabOralScanRole;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
  hasColor: boolean;
  /** 로드 때 붙어 있던 스캔 칼라. 분석 색을 깔 때 치워 둔다. */
  scanColor: THREE.BufferAttribute | null;
  /** 기하 단위. 대합이 없으면 null. */
  dist: Float32Array | null;
  /** 법선·삽입축. 지대치가 아니면 null. */
  align: Float32Array | null;
  analysisColor: THREE.BufferAttribute | null;
  /** 스캔 파일 좌표. 역할을 바꾸면 여기로 되돌린 뒤 다시 맞춘다. */
  basePositions: Float32Array;
  /** 파일을 열었을 때의 좌표. 여기와 다르면 작업 DCM으로 저장한다. */
  filePositions: Float32Array;
  /**
   * 메시 편집 뒤 정점마다 연 파일 좌표(새로 만든 정점은 NaN). 있으면 항상 작업 DCM으로 저장한다.
   * 파일 좌표로 되돌릴 때는 이 대응점으로 강체 맞춤을 해 편집한 모양을 그대로 옮긴다.
   */
  editedFileCoords: Float32Array | null;
  /** 메시 편집·되돌리기마다 오른다. 표본 정점에 안 걸리는 조각 편집도 지문이 바뀌게 한다. */
  meshRevision: number;
};

type SnapAnim = {
  start: number;
  duration: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromUp: THREE.Vector3;
  toUp: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
  fromLeft?: number;
  toLeft?: number;
  fromRight?: number;
  toRight?: number;
  fromTop?: number;
  toTop?: number;
  fromBottom?: number;
  toBottom?: number;
  /** 애니메이션이 끝나면 뷰 저장을 알린다. */
  save?: boolean;
};

type SavedCameraView = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  zoom: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const alignPoseScale = new THREE.Vector3();

const ROLE_COLOR: Record<LabOralScanRole, number> = {
  upper: 0x3b82f6,
  lower: 0xe39a3c,
  bite: 0x14b8a6,
  other: 0x94a3b8,
};

const HOME_DIR = new THREE.Vector3(0.42, -1, 0.68);
const HOME_UP = new THREE.Vector3(0, 0, 1);
const FIT_MARGIN = 1.03;

type FitFrame = {
  width: number;
  height: number;
  frustumH: number;
};

/** 전체 모델이 들어가는 세로 프러스텀. 가로가 더 넓으면 높이를 키워 양옆까지 담는다. */
function containFrustumHeight(worldW: number, worldH: number, aspect: number) {
  return worldW / worldH > aspect ? worldW / aspect : worldH;
}
/** 삽입축 화살표·레전드. amber-500 */
const INSERTION_AXIS_COLOR = 0xf59e0b;
/** 화살표 끝과 치아 표면 사이. */
const INSERTION_CLEARANCE_MM = 2;

function disposeObject3D(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const row of mat) materials.add(row);
    } else if (mat) materials.add(mat);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function mmToGeometry(mm: number, unitToMm: number) {
  return mm / Math.max(unitToMm, 1e-9);
}

function strokeGuide(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  dash: number[],
) {
  ctx.beginPath();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** 화면 가운데 기준. 2mm는 옅고, 10mm는 더 진하며, 정중앙은 더 굵다. */
function drawViewGuides(
  canvas: HTMLCanvasElement,
  camera: THREE.OrthographicCamera,
  unitToMm: number,
  mode: WorkSessionCenterGuide,
) {
  const cssW = Math.max(canvas.clientWidth, 1);
  const cssH = Math.max(canvas.clientHeight, 1);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pxW = Math.round(cssW * dpr);
  const pxH = Math.round(cssH * dpr);
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (mode === "off") return;

  const cx = cssW / 2;
  const cy = cssH / 2;
  if (mode === "grid") {
    const geoH =
      Math.abs(camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6);
    const mmH = geoH * Math.max(unitToMm, 1e-9);
    const pxPerMm = cssH / Math.max(mmH, 1e-6);
    const faint = "rgba(15, 23, 42, 0.22)";
    const strong = "rgba(15, 23, 42, 0.5)";
    const drawStep = (stepMm: number, color: string, dash: number[]) => {
      const step = pxPerMm * stepMm;
      if (step < 4) return;
      for (let i = 1; ; i += 1) {
        const d = i * step;
        if (d > cssW / 2 + step && d > cssH / 2 + step) break;
        if (stepMm === 2 && i % 5 === 0) continue;
        if (d <= cssW / 2 + 1) {
          strokeGuide(ctx, cx - d, 0, cx - d, cssH, color, 1, dash);
          strokeGuide(ctx, cx + d, 0, cx + d, cssH, color, 1, dash);
        }
        if (d <= cssH / 2 + 1) {
          strokeGuide(ctx, 0, cy - d, cssW, cy - d, color, 1, dash);
          strokeGuide(ctx, 0, cy + d, cssW, cy + d, color, 1, dash);
        }
      }
    };
    drawStep(2, faint, [2, 3]);
    drawStep(10, strong, [5, 4]);
  }

  const centerWidth = mode === "grid" ? 2 : 1;
  const centerDash = mode === "grid" ? [7, 4] : [4, 3];
  strokeGuide(
    ctx,
    0,
    cy,
    cssW,
    cy,
    "rgba(15, 23, 42, 0.88)",
    centerWidth,
    centerDash,
  );
  strokeGuide(
    ctx,
    cx,
    0,
    cx,
    cssH,
    "rgba(15, 23, 42, 0.88)",
    centerWidth,
    centerDash,
  );
}

function insertionMarkerMetrics(radius: number) {
  const span = Math.max(radius, 1);
  const length = span * 2.15;
  const headLen = length * 0.34;
  return {
    span,
    length,
    headLen,
    shaftLen: length - headLen,
    shaftR: Math.max(span * 0.07, length * 0.02),
  };
}

/** 윗단 고리 중심. 화살표 끝은 표면에서 2mm, 고리는 그 위쪽이다. */
function insertionRingCenter(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  radius: number,
  unitToMm: number,
) {
  const direction = dir.clone().normalize();
  const { length } = insertionMarkerMetrics(radius);
  const clearance = mmToGeometry(INSERTION_CLEARANCE_MM, unitToMm);
  return origin.clone().addScaledVector(direction, -(clearance + length));
}

/**
 * 삽입 방향으로 화살표와, 그 축에 수직인 고리.
 * `contact`는 치아 표면. 화살표 끝은 거기서 화면 쪽으로 2mm 떨어진다.
 */
function buildInsertionMarker(
  contact: THREE.Vector3,
  radius: number,
  dir: THREE.Vector3,
  key: string,
  unitToMm: number,
) {
  const direction = dir.clone().normalize();
  const { span, length, headLen, shaftLen, shaftR } = insertionMarkerMetrics(radius);
  const tip = contact
    .clone()
    .addScaledVector(direction, -mmToGeometry(INSERTION_CLEARANCE_MM, unitToMm));
  const material = new THREE.MeshBasicMaterial({
    color: INSERTION_AXIS_COLOR,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.92,
    toneMapped: false,
  });
  const group = new THREE.Group();
  const align = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  );
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(shaftR * 2.4, headLen, 20),
    material,
  );
  head.quaternion.copy(align);
  head.position.copy(tip).addScaledVector(direction, -headLen / 2);
  head.userData.editHit = { kind: "insertion", key } satisfies EditHit;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 16),
    material,
  );
  shaft.quaternion.copy(align);
  shaft.position
    .copy(tip)
    .addScaledVector(direction, -(headLen + shaftLen / 2));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(span * 0.72, span * 0.98, 48),
    material,
  );
  ring.position.copy(tip).addScaledVector(direction, -length);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  for (const mesh of [shaft, head, ring]) {
    mesh.renderOrder = 20;
    mesh.frustumCulled = false;
  }
  group.add(shaft, head, ring);
  return group;
}

/** 화면 정중앙 광선. 방향은 카메라가 보는 쪽이고, 점은 처음 닿는 표면. */
function viewCenterHit(
  camera: THREE.Camera,
  meshes: THREE.Object3D[],
): { dir: THREE.Vector3; point: THREE.Vector3 | null } {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const dir = raycaster.ray.direction.clone();
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
  else dir.normalize();
  const point =
    meshes.length > 0
      ? (raycaster.intersectObjects(meshes, false)[0]?.point.clone() ?? null)
      : null;
  return { dir, point };
}

/** 화면 쪽에서 치아 중심으로 쏴, 카메라가 보는 표면점을 고른다. */
function rayToothContact(
  center: THREE.Vector3,
  dir: THREE.Vector3,
  radius: number,
  meshes: THREE.Object3D[],
): THREE.Vector3 | null {
  if (meshes.length === 0) return null;
  const direction = dir.clone().normalize();
  if (direction.lengthSq() < 1e-8) return null;
  const reach = Math.max(radius * 14, 48);
  const start = center.clone().addScaledVector(direction, -reach);
  const raycaster = new THREE.Raycaster(start, direction, 0, reach * 2);
  const hits = raycaster.intersectObjects(meshes, false);
  const limit = Math.max(radius * 0.7, 1.2);
  let best: THREE.Intersection | null = null;
  let bestDist = limit;
  for (const hit of hits) {
    const dist = hit.point.distanceTo(center);
    if (dist < bestDist) {
      best = hit;
      bestDist = dist;
    }
  }
  return best ? best.point.clone() : null;
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function applyDentalFrame(frame: DentalFrame) {
  const { up, anterior } = frame;
  HOME_DIR.copy(anterior).multiplyScalar(-1).addScaledVector(up, 0.62).normalize();
  HOME_UP.copy(up);
}

function captureBasePositions(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute("position");
  if (!pos) return new Float32Array(0);
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    out[i * 3] = pos.getX(i);
    out[i * 3 + 1] = pos.getY(i);
    out[i * 3 + 2] = pos.getZ(i);
  }
  return out;
}

function transformPositions(src: Float32Array, matrix: THREE.Matrix4) {
  const e = matrix.elements;
  const out = new Float32Array(src.length);
  for (let i = 0; i + 2 < src.length; i += 3) {
    const x = src[i] ?? 0;
    const y = src[i + 1] ?? 0;
    const z = src[i + 2] ?? 0;
    out[i] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    out[i + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
    out[i + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
  }
  return out;
}

function applyCapturedPositions(entry: LoadedMesh, captured: Float32Array) {
  const pos = entry.geometry.getAttribute("position");
  if (!pos || captured.length !== pos.count * 3) return;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, captured[i * 3] ?? 0, captured[i * 3 + 1] ?? 0, captured[i * 3 + 2] ?? 0);
  }
  pos.needsUpdate = true;
  entry.geometry.computeVertexNormals();
  entry.geometry.computeBoundingBox();
  entry.dist = null;
  entry.align = null;
  entry.analysisColor = null;
}

/** 편집한 메시를 대응점 강체 맞춤으로 파일 좌표에 둔다. 편집한 모양은 그대로 옮겨진다. */
function restoreEditedFilePositions(entry: LoadedMesh, file: Float32Array) {
  const pos = entry.geometry.getAttribute("position");
  if (!pos || file.length !== pos.count * 3) return;
  const step = Math.max(1, Math.floor(pos.count / 4000));
  const model: number[] = [];
  const target: number[] = [];
  for (let i = 0; i < pos.count; i += step) {
    const fx = file[i * 3]!;
    if (!Number.isFinite(fx)) continue;
    model.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    target.push(fx, file[i * 3 + 1]!, file[i * 3 + 2]!);
  }
  if (model.length < 9) return;
  const { r, t } = bestRigid(model, target);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(
      i,
      r[0] * x + r[1] * y + r[2] * z + t[0],
      r[3] * x + r[4] * y + r[5] * z + t[1],
      r[6] * x + r[7] * y + r[8] * z + t[2],
    );
  }
  pos.needsUpdate = true;
  entry.geometry.computeVertexNormals();
  entry.geometry.computeBoundingBox();
  entry.dist = null;
  entry.align = null;
  entry.analysisColor = null;
}

function restoreFilePositions(entry: LoadedMesh) {
  if (entry.editedFileCoords) {
    restoreEditedFilePositions(entry, entry.editedFileCoords);
    return;
  }
  const pos = entry.geometry.getAttribute("position");
  const file = entry.filePositions;
  if (!pos || file.length !== pos.count * 3) return;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, file[i * 3] ?? 0, file[i * 3 + 1] ?? 0, file[i * 3 + 2] ?? 0);
  }
  pos.needsUpdate = true;
  entry.geometry.computeVertexNormals();
  entry.geometry.computeBoundingBox();
  entry.dist = null;
  entry.align = null;
  entry.analysisColor = null;
}

/** 메시 모양(토폴로지)을 새 BufferGeometry로 바꾼다. 옛 지오메트리는 GPU 버퍼째 버린다. */
function swapScanGeometry(
  entry: LoadedMesh,
  next: {
    positions: Float32Array;
    index: THREE.BufferAttribute | null;
    color: THREE.BufferAttribute | null;
    uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;
  },
) {
  const prev = entry.geometry;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(next.positions, 3));
  if (next.index) geometry.setIndex(next.index);
  if (next.color) geometry.setAttribute("color", next.color);
  if (next.uv) geometry.setAttribute("uv", next.uv);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  entry.mesh.geometry = geometry;
  entry.geometry = geometry;
  syncBackFaceShellGeometry(entry.mesh);
  entry.scanColor = next.color;
  entry.dist = null;
  entry.align = null;
  entry.analysisColor = null;
  releaseSceneGeometry(prev);
}

function scanShapeOf(entry: LoadedMesh): ScanShapeSnapshot {
  const index = entry.geometry.getIndex();
  return {
    index,
    color: entry.scanColor,
    uv: entry.geometry.getAttribute("uv") ?? null,
    fileCoords: entry.editedFileCoords,
    filePositions: entry.filePositions,
  };
}

function readAttrTriples(attr: THREE.BufferAttribute | null) {
  if (!attr) return null;
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i += 1) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}

function gatherRows(src: Float32Array | null, rows: ArrayLike<number>, size: number, fill = 0) {
  if (!src) return null;
  const out = new Float32Array(rows.length * size);
  for (let i = 0; i < rows.length; i += 1) {
    const from = rows[i]!;
    for (let k = 0; k < size; k += 1) {
      out[i * size + k] = from < 0 ? fill : (src[from * size + k] ?? fill);
    }
  }
  return out;
}

function rememberPositions(entry: LoadedMesh) {
  entry.basePositions = captureBasePositions(entry.geometry);
}

function positionsDiffer(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  file: Float32Array,
) {
  if (file.length !== pos.count * 3) return true;
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.abs(pos.getX(i) - (file[i * 3] ?? 0)) > 1e-4) return true;
    if (Math.abs(pos.getY(i) - (file[i * 3 + 1] ?? 0)) > 1e-4) return true;
    if (Math.abs(pos.getZ(i) - (file[i * 3 + 2] ?? 0)) > 1e-4) return true;
  }
  return false;
}

/** 상악·하악·바이트가 모두 저장된 작업 DCM이면 맞춤이 이미 들어 있다. */
function jawsAlreadyStored(
  sources: readonly { role: string; fileName: string }[],
): boolean {
  let arch = false;
  let bite = false;
  for (const source of sources) {
    if (source.role !== "upper" && source.role !== "lower" && source.role !== "bite") {
      continue;
    }
    if (!isAbutsWorkScanFileName(source.fileName)) return false;
    if (source.role === "bite") bite = true;
    else arch = true;
  }
  return arch && bite;
}

function jawEntries(loaded: readonly LoadedMesh[]) {
  return loaded.filter(
    (entry): entry is LoadedMesh & { role: WorkingScanMesh["role"] } =>
      entry.role === "upper" || entry.role === "lower" || entry.role === "bite",
  );
}

function dirtyScanRoles(loaded: readonly LoadedMesh[]) {
  const dirty = new Set<WorkingScanMesh["role"]>();
  for (const entry of jawEntries(loaded)) {
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    if (entry.editedFileCoords || positionsDiffer(pos, entry.filePositions)) {
      dirty.add(entry.role);
    }
  }
  return dirty;
}

function changedScanStamp(loaded: readonly LoadedMesh[]): string {
  const dirty = dirtyScanRoles(loaded);
  if (dirty.size === 0) return "";
  const parts: string[] = [];
  for (const entry of jawEntries(loaded)) {
    if (!dirty.has(entry.role)) continue;
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    let acc = pos.count;
    const step = Math.max(1, Math.floor(pos.count / 64));
    for (let i = 0; i < pos.count; i += step) {
      acc = Math.imul(acc, 31) + Math.round(pos.getX(i) * 1000);
      acc = Math.imul(acc, 31) + Math.round(pos.getY(i) * 1000);
      acc = Math.imul(acc, 31) + Math.round(pos.getZ(i) * 1000);
    }
    parts.push(`${entry.role}:${acc}:${entry.meshRevision}`);
  }
  return parts.join("|");
}

function exportScanMeshes(
  loaded: readonly LoadedMesh[],
  onlyRoles: ReadonlySet<WorkingScanMesh["role"]> | null,
): WorkingScanMesh[] {
  const roles = onlyRoles ?? dirtyScanRoles(loaded);
  if (roles.size === 0) return [];
  const out: WorkingScanMesh[] = [];
  for (const entry of jawEntries(loaded)) {
    if (!roles.has(entry.role)) continue;
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    const positions = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      positions[i * 3] = pos.getX(i);
      positions[i * 3 + 1] = pos.getY(i);
      positions[i * 3 + 2] = pos.getZ(i);
    }
    const index = entry.geometry.getIndex();
    const indices = new Uint32Array(index ? index.count : pos.count);
    if (index) {
      for (let i = 0; i < index.count; i += 1) indices[i] = index.getX(i);
    } else {
      for (let i = 0; i < pos.count; i += 1) indices[i] = i;
    }
    const color = entry.scanColor;
    out.push({
      role: entry.role,
      positions,
      indices,
      colors:
        color && color.count === pos.count
          ? linearColorsToSrgbBytes(color)
          : null,
    });
  }
  return out;
}

function restoreBasePositions(entry: LoadedMesh) {
  const pos = entry.geometry.getAttribute("position");
  const base = entry.basePositions;
  if (!pos || base.length !== pos.count * 3) return;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, base[i * 3] ?? 0, base[i * 3 + 1] ?? 0, base[i * 3 + 2] ?? 0);
  }
  pos.needsUpdate = true;
  entry.geometry.computeVertexNormals();
  entry.geometry.computeBoundingBox();
  entry.dist = null;
  entry.align = null;
  entry.analysisColor = null;
}

type AnalysisLook = {
  contactMap: boolean;
  undercutMap: boolean;
  occlusalGapMm: number;
  contactMode: ContactPaintMode;
  undercutLimit: number;
};

function paintAnalysisColors(
  entry: LoadedMesh,
  look: AnalysisLook,
  unitToMm: number,
): boolean {
  const showContact = look.contactMap && entry.dist != null;
  const showUndercut = look.undercutMap && entry.align != null;
  if (!showContact && !showUndercut) {
    if (entry.scanColor) entry.geometry.setAttribute("color", entry.scanColor);
    else entry.geometry.deleteAttribute("color");
    return false;
  }
  const pos = entry.geometry.getAttribute("position");
  const count = pos?.count ?? 0;
  if (!count) return false;
  if (!entry.analysisColor || entry.analysisColor.count !== count) {
    entry.analysisColor = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  }
  const out = entry.analysisColor.array as Float32Array;
  const base = entry.scanColor;
  const roleHex = ROLE_COLOR[entry.role];
  const br = ((roleHex >> 16) & 255) / 255;
  const bg = ((roleHex >> 8) & 255) / 255;
  const bb = (roleHex & 255) / 255;
  for (let i = 0; i < count; i += 1) {
    let r = base ? base.getX(i) : br;
    let g = base ? base.getY(i) : bg;
    let b = base ? base.getZ(i) : bb;
    const align = entry.align?.[i] ?? 0;
    if (showUndercut && isUndercutAlignment(align, look.undercutLimit)) {
      r = UNDERCUT_RGB[0];
      g = UNDERCUT_RGB[1];
      b = UNDERCUT_RGB[2];
    } else if (showContact && entry.dist) {
      const painted = contactColorRgb(
        (entry.dist[i] ?? Infinity) * unitToMm,
        look.occlusalGapMm,
        look.contactMode,
      );
      if (painted) {
        r = painted[0];
        g = painted[1];
        b = painted[2];
      }
    }
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  entry.analysisColor.needsUpdate = true;
  entry.geometry.setAttribute("color", entry.analysisColor);
  return true;
}

function isGhostScanRole(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
) {
  if (role === "bite") return true;
  if (prepArch !== "upper" && prepArch !== "lower") return false;
  return (role === "upper" || role === "lower") && role !== prepArch;
}

function undercutApplies(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
) {
  return (
    (role === "upper" && (prepArch === "upper" || prepArch === "both")) ||
    (role === "lower" && (prepArch === "lower" || prepArch === "both"))
  );
}

function insertionForRole(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
  frame: DentalFrame | null,
  override: THREE.Vector3 | null = null,
): THREE.Vector3 | null {
  if (!undercutApplies(role, prepArch)) return null;
  if (override) return override.clone();
  if (!frame) return null;
  if (role === "upper") return frame.up.clone();
  return frame.up.clone().negate();
}

type InsertionAxis = {
  key: string;
  toothNumbers: string[];
  dir: THREE.Vector3;
  /** 화살표가 향한 치아 표면. 표시는 여기서 2mm 띄운다. */
  origin: THREE.Vector3;
  /** 치아 크기에 맞춘 화살표 크기. */
  radius: number;
  /** 축을 잡은 순간의 카메라. */
  view: SavedCameraView;
};

type InsertionAnchor = {
  arch: "upper" | "lower";
  x: number;
  y: number;
  z: number;
  dir: THREE.Vector3;
};

/** 월드 좌표 삼각형(비색인, 꼭짓점 3개씩). 행렬은 미리 갱신해 둔다. */
function worldTriangles(meshes: readonly THREE.Mesh[]): Float32Array {
  const chunks: Float32Array[] = [];
  let total = 0;
  const point = new THREE.Vector3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const pos = geometry.getAttribute("position");
    if (!pos) continue;
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;
    const out = new Float32Array(count * 3);
    const mirrored = mesh.matrixWorld.determinant() < 0;
    for (let i = 0; i < count; i += 1) {
      point
        .fromBufferAttribute(pos, index ? index.getX(i) : i)
        .applyMatrix4(mesh.matrixWorld);
      const corner = i % 3;
      const at = mirrored && corner > 0 ? i + (corner === 1 ? 1 : -1) : i;
      out[at * 3] = point.x;
      out[at * 3 + 1] = point.y;
      out[at * 3 + 2] = point.z;
    }
    chunks.push(out);
    total += out.length;
  }
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/** 이 점에서 reach 안에 꼭짓점이 하나라도 있는 월드 삼각형. 행렬은 미리 갱신해 둔다. */
function nearbyWorldTriangles(
  meshes: readonly THREE.Mesh[],
  center: THREE.Vector3,
  reach: number,
): Float32Array {
  const reach2 = reach * reach;
  const out: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const pos = geometry.getAttribute("position");
    if (!pos) continue;
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;
    const inverse = mesh.matrixWorld.clone().invert();
    const local = center.clone().applyMatrix4(inverse);
    const scale = mesh.matrixWorld.getMaxScaleOnAxis() || 1;
    const localReach2 = reach2 / (scale * scale);
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(i) : i);
      b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1);
      c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2);
      if (
        a.distanceToSquared(local) > localReach2 &&
        b.distanceToSquared(local) > localReach2 &&
        c.distanceToSquared(local) > localReach2
      ) {
        continue;
      }
      for (const v of [a, b, c]) {
        v.applyMatrix4(mesh.matrixWorld);
        out.push(v.x, v.y, v.z);
      }
    }
  }
  return new Float32Array(out);
}

/** 한 치아의 스크류홀 좌표 변환. 치아 프레임 mm ↔ 월드. */
type HoleTarget = {
  edit: ToothDesignEdit;
  toLocalMm: (world: THREE.Vector3) => [number, number, number];
  toLocalDir: (dir: THREE.Vector3) => [number, number, number];
  line: (hole?: Partial<ToothDesignEdit["hole"]>) => ScrewHoleLine;
};

function insertionDirByTooth(axes: readonly InsertionAxis[]) {
  const out = new Map<string, THREE.Vector3>();
  for (const axis of axes) {
    for (const tooth of axis.toothNumbers) out.set(tooth, axis.dir);
  }
  return out;
}

/** 삽입축이 닿은 점으로 그 보철 치아들의 추정 중심을 옮긴다. 상대 간격은 유지한다. */
function alignPlacementsToPoint(
  placements: ToothPlacement[],
  toothNumbers: readonly string[],
  point: THREE.Vector3,
  fallbackRadius: number,
): ToothPlacement[] {
  const wanted = toothNumbers.filter(Boolean);
  if (wanted.length === 0) return placements;
  const next = placements.map((row) => ({
    ...row,
    center: row.center.clone(),
  }));
  const matched = next.filter((row) => wanted.includes(row.toothNumber));
  const radius = Math.max(matched[0]?.radius ?? fallbackRadius, 1);
  if (matched.length === 0) {
    for (const tooth of wanted) {
      const parsed = parseFdi(tooth);
      if (!parsed) continue;
      next.push({
        toothNumber: tooth,
        center: point.clone(),
        radius,
        arch: parsed.arch,
      });
    }
    return next;
  }
  const centroid = new THREE.Vector3();
  for (const row of matched) centroid.add(row.center);
  centroid.multiplyScalar(1 / matched.length);
  const delta = point.clone().sub(centroid);
  for (const row of matched) row.center.add(delta);
  for (const tooth of wanted) {
    if (matched.some((row) => row.toothNumber === tooth)) continue;
    const parsed = parseFdi(tooth);
    if (!parsed) continue;
    next.push({
      toothNumber: tooth,
      center: point.clone(),
      radius,
      arch: parsed.arch,
    });
  }
  return next;
}

function marginFrameAxes(normal: THREE.Vector3, rightHint: THREE.Vector3) {
  const y = normal.clone().normalize();
  const x = rightHint.clone().addScaledVector(y, -rightHint.dot(y));
  if (x.lengthSq() < 1e-8) {
    const fallback =
      Math.abs(y.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    x.crossVectors(y, fallback);
  }
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return { x, y, z };
}

/**
 * 치아 주변 삼각형을 삽입축 프레임으로 옮긴다.
 * 칼라는 로드 때 스캔 색이다. 언더컷·접촉으로 칠한 색은 쓰지 않는다.
 */
function collectProjectedMarginTriangles(
  entries: LoadedMesh[],
  center: THREE.Vector3,
  normal: THREE.Vector3,
  right: THREE.Vector3,
  toothRadius: number,
) {
  const axes = marginFrameAxes(normal, right);
  const outer = toothRadius * 2.7;
  const outerSq = outer * outer;
  const yMin = -toothRadius * 1.6;
  const yMax = toothRadius * 2.8;
  const world = new THREE.Vector3();
  let packed = new Float32Array(2048 * PROJECTED_MARGIN_TRIANGLE_STRIDE);
  let count = 0;
  const push = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    ar: number,
    ag: number,
    ab: number,
    br: number,
    bg: number,
    bb: number,
    cr: number,
    cg: number,
    cb: number,
  ) => {
    if ((count + 1) * PROJECTED_MARGIN_TRIANGLE_STRIDE > packed.length) {
      const next = new Float32Array(packed.length * 2);
      next.set(packed);
      packed = next;
    }
    const offset = count * PROJECTED_MARGIN_TRIANGLE_STRIDE;
    packed[offset] = ax;
    packed[offset + 1] = ay;
    packed[offset + 2] = az;
    packed[offset + 3] = bx;
    packed[offset + 4] = by;
    packed[offset + 5] = bz;
    packed[offset + 6] = cx;
    packed[offset + 7] = cy;
    packed[offset + 8] = cz;
    packed[offset + 9] = ar;
    packed[offset + 10] = ag;
    packed[offset + 11] = ab;
    packed[offset + 12] = br;
    packed[offset + 13] = bg;
    packed[offset + 14] = bb;
    packed[offset + 15] = cr;
    packed[offset + 16] = cg;
    packed[offset + 17] = cb;
    count += 1;
  };

  for (const entry of entries) {
    const color = entry.scanColor;
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    const hasColor = color != null && color.count === pos.count;
    entry.mesh.updateWorldMatrix(true, false);
    const matrix = entry.mesh.matrixWorld;
    const fx = new Float32Array(pos.count);
    const fy = new Float32Array(pos.count);
    const fz = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) {
      world.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      const dx = world.x - center.x;
      const dy = world.y - center.y;
      const dz = world.z - center.z;
      fx[i] = dx * axes.x.x + dy * axes.x.y + dz * axes.x.z;
      fy[i] = dx * axes.y.x + dy * axes.y.y + dz * axes.y.z;
      fz[i] = dx * axes.z.x + dy * axes.z.y + dz * axes.z.z;
    }
    const index = entry.geometry.index;
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    for (let tri = 0; tri < triCount; tri += 1) {
      const ia = index ? index.getX(tri * 3) : tri * 3;
      const ib = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
      const ic = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
      const ax = fx[ia] ?? 0;
      const ay = fy[ia] ?? 0;
      const az = fz[ia] ?? 0;
      const bx = fx[ib] ?? 0;
      const by = fy[ib] ?? 0;
      const bz = fz[ib] ?? 0;
      const cx = fx[ic] ?? 0;
      const cy = fy[ic] ?? 0;
      const cz = fz[ic] ?? 0;
      if (ay < yMin && by < yMin && cy < yMin) continue;
      if (ay > yMax && by > yMax && cy > yMax) continue;
      if (
        ax * ax + az * az > outerSq &&
        bx * bx + bz * bz > outerSq &&
        cx * cx + cz * cz > outerSq
      ) {
        continue;
      }
      push(
        ax,
        ay,
        az,
        bx,
        by,
        bz,
        cx,
        cy,
        cz,
        hasColor ? color.getX(ia) : 0.88,
        hasColor ? color.getY(ia) : 0.84,
        hasColor ? color.getZ(ia) : 0.78,
        hasColor ? color.getX(ib) : 0.88,
        hasColor ? color.getY(ib) : 0.84,
        hasColor ? color.getZ(ib) : 0.78,
        hasColor ? color.getX(ic) : 0.88,
        hasColor ? color.getY(ic) : 0.84,
        hasColor ? color.getZ(ic) : 0.78,
      );
    }
  }
  return packed.subarray(0, count * PROJECTED_MARGIN_TRIANGLE_STRIDE);
}

function nearestInsertionDir(
  x: number,
  y: number,
  z: number,
  anchors: InsertionAnchor[],
  fallback: THREE.Vector3 | null,
): THREE.Vector3 | null {
  if (anchors.length === 0) return fallback;
  let best = Infinity;
  let dir = anchors[0]?.dir ?? fallback;
  for (const anchor of anchors) {
    const dx = anchor.x - x;
    const dy = anchor.y - y;
    const dz = anchor.z - z;
    const dist = dx * dx + dy * dy + dz * dz;
    if (dist < best) {
      best = dist;
      dir = anchor.dir;
    }
  }
  return dir;
}

/** 이 악 삽입축으로 정점 법선·축 내적을 바로 채운다. 축이 없으면 false. */
function fillUndercutAlign(entry: LoadedMesh, anchors: InsertionAnchor[]): boolean {
  const pos = entry.geometry.getAttribute("position");
  const nor = entry.geometry.getAttribute("normal");
  if (!pos || !nor || anchors.length === 0) return false;
  const align =
    entry.align && entry.align.length === pos.count ? entry.align : new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    const dir = nearestInsertionDir(pos.getX(i), pos.getY(i), pos.getZ(i), anchors, null);
    align[i] = dir ? nor.getX(i) * dir.x + nor.getY(i) * dir.y + nor.getZ(i) * dir.z : 0;
  }
  entry.align = align;
  return true;
}

function antagonistRole(
  role: LabOralScanRole,
  prepArch: "upper" | "lower" | "both" | null | undefined,
): LabOralScanRole | null {
  if (prepArch === "upper" && role === "upper") return "lower";
  if (prepArch === "lower" && role === "lower") return "upper";
  if (prepArch === "both" && role === "upper") return "lower";
  if (prepArch === "both" && role === "lower") return "upper";
  return null;
}

async function fillDesignAnalysis(
  loaded: LoadedMesh[],
  prepArch: "upper" | "lower" | "both" | null | undefined,
  frame: DentalFrame | null,
  unitToMm: number,
  cancelled: () => boolean,
  anchors: InsertionAnchor[] = [],
) {
  const indexes = new Map<
    LabOralScanRole,
    ReturnType<typeof createScanPointIndex>
  >();
  for (const role of ["upper", "lower"] as const) {
    const index = createScanPointIndex(unitToMm);
    let any = false;
    for (const entry of loaded) {
      if (entry.role !== role) continue;
      const pos = entry.geometry.getAttribute("position");
      if (!pos) continue;
      const stride = Math.max(1, Math.floor(pos.count / 70000));
      for (let i = 0; i < pos.count; i += stride) {
        index.add(pos.getX(i), pos.getY(i), pos.getZ(i));
        any = true;
      }
    }
    if (any) indexes.set(role, index);
  }

  for (const entry of loaded) {
    const against = antagonistRole(entry.role, prepArch);
    const mine = anchors.filter((anchor) => anchor.arch === entry.role);
    const insertion = insertionForRole(entry.role, prepArch, frame, null);
    const index = against ? indexes.get(against) : undefined;
    const pos = entry.geometry.getAttribute("position");
    const nor = entry.geometry.getAttribute("normal");
    if (!pos || (!index && !insertion && mine.length === 0)) {
      entry.dist = null;
      entry.align = null;
      continue;
    }
    const count = pos.count;
    const dist = index ? new Float32Array(count) : null;
    const align = (mine.length > 0 || insertion) && nor ? new Float32Array(count) : null;
    if (dist) dist.fill(Infinity);
    let budget = performance.now() + 6;
    for (let i = 0; i < count; i += 1) {
      if ((i & 511) === 0 && performance.now() > budget) {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
        if (cancelled()) return;
        budget = performance.now() + 6;
      }
      if (align && nor) {
        const dir = nearestInsertionDir(
          pos.getX(i),
          pos.getY(i),
          pos.getZ(i),
          mine,
          insertion,
        );
        if (dir) {
          align[i] =
            nor.getX(i) * dir.x + nor.getY(i) * dir.y + nor.getZ(i) * dir.z;
        }
      }
      if (dist && index) {
        dist[i] = index.nearest(pos.getX(i), pos.getY(i), pos.getZ(i));
      }
    }
    if (cancelled()) return;
    entry.dist = dist;
    entry.align = align;
  }
}

function viewBasis(viewDir: THREE.Vector3, viewUp: THREE.Vector3) {
  const dir = viewDir.clone().normalize();
  const up = viewUp.clone();
  if (Math.abs(up.dot(dir)) > 0.92) up.set(0, 0, 1);
  up.addScaledVector(dir, -up.dot(dir));
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const screenUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  return { dir, up, right, screenUp };
}

/** 정점 실루엣으로 화면에 맞춘다. 박스 모서리는 빈 공간을 포함한다. */
function measureMeshFit(
  meshes: LoadedMesh[],
  groupPosition: THREE.Vector3,
  viewDir: THREE.Vector3,
  viewUp: THREE.Vector3,
) {
  const { right, screenUp } = viewBasis(viewDir, viewUp);
  const xs: number[] = [];
  const ys: number[] = [];
  const point = new THREE.Vector3();
  for (const entry of meshes) {
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    const stride = pos.count > 250000 ? Math.ceil(pos.count / 250000) : 1;
    for (let i = 0; i < pos.count; i += stride) {
      point.set(
        pos.getX(i) + entry.mesh.position.x + groupPosition.x,
        pos.getY(i) + entry.mesh.position.y + groupPosition.y,
        pos.getZ(i) + entry.mesh.position.z + groupPosition.z,
      );
      xs.push(point.dot(right));
      ys.push(point.dot(screenUp));
    }
  }
  if (xs.length < 8) {
    return {
      halfW: 40,
      halfH: 40,
      target: new THREE.Vector3(),
    };
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  // 떨어진 스캔 파편은 빼고 치열에 맞춘다.
  const at = (sorted: number[], p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))] ?? 0;
  const minX = at(xs, 0.004);
  const maxX = at(xs, 0.996);
  const minY = at(ys, 0.004);
  const maxY = at(ys, 0.996);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    halfW: Math.max((maxX - minX) / 2, 0.5),
    halfH: Math.max((maxY - minY) / 2, 0.5),
    target: new THREE.Vector3()
      .addScaledVector(right, cx)
      .addScaledVector(screenUp, cy),
  };
}

/**
 * 정중선에서 치아 중심까지, 편측 치열 길이의 비율.
 * 근원심 폭(중절치→제3대구치)으로 나눈다. 제1대구치(6번)는 약 0.64.
 */
const TOOTH_SPAN_T = [0, 0.065, 0.181, 0.289, 0.401, 0.508, 0.639, 0.794, 0.935];

type ToothPlacement = {
  toothNumber: string;
  center: THREE.Vector3;
  radius: number;
  arch: "upper" | "lower";
};

type ParsedScanCache = {
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
};

const parsedScanCache = new Map<string, ParsedScanCache>();

function parsedScanCacheKey(source: OralScanOverlaySource) {
  return `${source.id}:${source.file.size}:${source.file.lastModified}`;
}

function releaseSceneGeometry(geometry: THREE.BufferGeometry) {
  for (const row of parsedScanCache.values()) {
    if (row.geometry === geometry) return;
  }
  geometry.dispose();
}

function releaseSceneTexture(texture: THREE.Texture | null) {
  if (!texture) return;
  for (const row of parsedScanCache.values()) {
    if (row.texture === texture) return;
  }
  texture.dispose();
}

async function loadCachedScanPreview(source: OralScanOverlaySource) {
  const key = parsedScanCacheKey(source);
  const hit = parsedScanCache.get(key);
  if (hit) {
    return {
      geometry: hit.geometry.clone(),
      texture: hit.texture,
    };
  }
  const parsed = await parseModelPreview(source.file, {
    companionFiles: source.companionFiles,
  });
  parsedScanCache.set(key, {
    geometry: parsed.geometry.clone(),
    texture: parsed.texture,
  });
  return {
    geometry: parsed.geometry,
    texture: parsed.texture,
  };
}

type WorkFraming = {
  dir: THREE.Vector3;
  up: THREE.Vector3;
  halfW: number;
  halfH: number;
  target: THREE.Vector3;
  placements: ToothPlacement[];
};

function quantile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[i] ?? 0;
}

function angleAbsDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function parseFdi(raw: string): {
  arch: "upper" | "lower";
  side: 1 | -1;
  pos: number;
} | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!/^[1-4][1-8]$/.test(digits)) return null;
  const quadrant = Number(digits[0]);
  const pos = Number(digits[1]);
  return {
    arch: quadrant <= 2 ? "upper" : "lower",
    side: quadrant === 1 || quadrant === 4 ? 1 : -1,
    pos,
  };
}

function sampleWorldPoints(
  entries: LoadedMesh[],
  groupPosition: THREE.Vector3,
  cap: number,
) {
  const out: Array<[number, number, number]> = [];
  const per = Math.max(800, Math.floor(cap / Math.max(entries.length, 1)));
  for (const entry of entries) {
    const pos = entry.geometry.getAttribute("position");
    if (!pos || pos.count === 0) continue;
    const stride = Math.max(1, Math.floor(pos.count / per));
    const ox = groupPosition.x;
    const oy = groupPosition.y;
    const oz = groupPosition.z;
    for (let i = 0; i < pos.count; i += stride) {
      out.push([pos.getX(i) + ox, pos.getY(i) + oy, pos.getZ(i) + oz]);
    }
  }
  return out;
}

type PlanePoint = {
  x: number;
  y: number;
  z: number;
  r: number;
  a: number;
};

function projectArch(
  points: Array<[number, number, number]>,
  frame: DentalFrame,
  origin: THREE.Vector3,
): PlanePoint[] {
  const out: PlanePoint[] = [];
  for (const p of points) {
    const dx = p[0] - origin.x;
    const dy = p[1] - origin.y;
    const dz = p[2] - origin.z;
    out.push({
      x: p[0],
      y: p[1],
      z: p[2],
      r: dx * frame.right.x + dy * frame.right.y + dz * frame.right.z,
      a:
        dx * frame.anterior.x +
        dy * frame.anterior.y +
        dz * frame.anterior.z,
    });
  }
  return out;
}

function archPole(plane: PlanePoint[]) {
  const rs = plane.map((p) => p.r).sort((a, b) => a - b);
  const as = plane.map((p) => p.a).sort((a, b) => a - b);
  const rLo = quantile(rs, 0.05);
  const rHi = quantile(rs, 0.95);
  const aLo = quantile(as, 0.05);
  const aHi = quantile(as, 0.95);
  const depth = Math.max(aHi - aLo, 1e-6);
  return {
    poleR: (rLo + rHi) / 2,
    poleA: aHi - depth * 0.38,
    depth,
  };
}

function horseshoeScore(
  points: Array<[number, number, number]>,
  frame: DentalFrame,
) {
  if (points.length < 30) return 0;
  const origin = meanVec(points);
  if (!origin) return 0;
  const { poleR, poleA } = archPole(projectArch(points, frame, origin));
  const dists = projectArch(points, frame, origin).map((p) =>
    Math.hypot(p.r - poleR, p.a - poleA),
  );
  const sorted = [...dists].sort((a, b) => a - b);
  const outer = quantile(sorted, 0.9);
  if (outer < 1e-6) return 0;
  let rim = 0;
  for (const dist of dists) if (dist > outer * 0.62) rim += 1;
  return rim / dists.length;
}

/** 교합면 쪽 정점. 구개·혀 쪽 덩어리면 반대 밴드를 고른다. */
function occlusalBand(
  points: Array<[number, number, number]>,
  frame: DentalFrame,
  arch: "upper" | "lower",
) {
  const heights = points.map(
    (p) => p[0] * frame.up.x + p[1] * frame.up.y + p[2] * frame.up.z,
  );
  const sorted = [...heights].sort((a, b) => a - b);
  const lo = quantile(sorted, 0.2);
  const hi = quantile(sorted, 0.8);
  const low = points.filter((_, i) => (heights[i] ?? 0) <= lo);
  const high = points.filter((_, i) => (heights[i] ?? 0) >= hi);
  const preferLow = arch === "upper";
  const first = preferLow ? low : high;
  const second = preferLow ? high : low;
  if (horseshoeScore(second, frame) > horseshoeScore(first, frame) + 0.08) {
    return second;
  }
  return first.length >= 40 ? first : second;
}

const fdiDigits = fdiToothDigits;

function anchorsFromAxes(
  axes: InsertionAxis[],
  placements: ToothPlacement[],
  groupPosition: THREE.Vector3,
): InsertionAnchor[] {
  const out: InsertionAnchor[] = [];
  for (const axis of axes) {
    for (const tooth of axis.toothNumbers) {
      const place = placements.find((row) => row.toothNumber === tooth);
      if (!place) continue;
      out.push({
        arch: place.arch,
        x: place.center.x - groupPosition.x,
        y: place.center.y - groupPosition.y,
        z: place.center.z - groupPosition.z,
        dir: axis.dir,
      });
    }
  }
  return out;
}

function locateToothPlacements(
  band: Array<[number, number, number]>,
  frame: DentalFrame,
  arch: "upper" | "lower",
  teeth: Array<{ toothNumber: string; side: 1 | -1; pos: number }>,
): ToothPlacement[] {
  if (band.length < 40 || teeth.length === 0) return [];
  const origin = meanVec(band);
  if (!origin) return [];
  const plane = projectArch(band, frame, origin);
  const { poleR, poleA, depth } = archPole(plane);
  const angled = plane.map((p) => {
    const dr = p.r - poleR;
    const da = p.a - poleA;
    return { ...p, ang: Math.atan2(dr, da), dist: Math.hypot(dr, da) };
  });
  const outer = angled.filter((p) => p.dist > depth * 0.22);
  const use = outer.length > 40 ? outer : angled;
  const rightAng = use
    .map((p) => p.ang)
    .filter((ang) => ang > 0.08)
    .sort((a, b) => a - b);
  const leftAng = use
    .map((p) => -p.ang)
    .filter((ang) => ang > 0.08)
    .sort((a, b) => a - b);
  let spanR = quantile(rightAng, 0.92);
  let spanL = quantile(leftAng, 0.92);
  if (spanR < 0.4) spanR = spanL;
  if (spanL < 0.4) spanL = spanR;
  if (spanR < 0.4) return [];
  const placements: ToothPlacement[] = [];
  for (const tooth of teeth) {
    const span = tooth.side > 0 ? spanR : spanL;
    const along = TOOTH_SPAN_T[tooth.pos] ?? 0.5;
    const ang = tooth.side * along * span;
    let wedge = Math.max(0.18, span * 0.1);
    let picked = use.filter((p) => angleAbsDiff(p.ang, ang) <= wedge);
    if (picked.length < 12) {
      wedge = Math.max(wedge, 0.48);
      picked = use.filter((p) => angleAbsDiff(p.ang, ang) <= wedge);
    }
    if (picked.length < 8) continue;
    const dists = picked.map((p) => p.dist).sort((a, b) => a - b);
    const inner = quantile(dists, 0.42);
    const outer = quantile(dists, 0.78);
    const crown = picked.filter((p) => p.dist >= inner && p.dist <= outer);
    const row = crown.length >= 8 ? crown : picked;
    const mesial = row.filter((p) => {
      const delta = Math.abs(p.ang) - Math.abs(ang);
      return delta <= 0.05 && delta >= -0.32;
    });
    const tableSrc = mesial.length >= 8 ? mesial : row;
    const heights = tableSrc.map(
      (p) => p.x * frame.up.x + p.y * frame.up.y + p.z * frame.up.z,
    );
    const heightOrder = [...heights].sort((a, b) => a - b);
    const low = quantile(heightOrder, arch === "upper" ? 0.08 : 0.52);
    const high = quantile(heightOrder, arch === "upper" ? 0.42 : 0.9);
    const table = tableSrc.filter((_, index) => {
      const h = heights[index] ?? 0;
      return h >= low && h <= high;
    });
    const used = table.length >= 6 ? table : tableSrc;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const p of used) {
      x += p.x;
      y += p.y;
      z += p.z;
    }
    const n = used.length;
    const center = new THREE.Vector3(x / n, y / n, z / n);
    let spread = 0;
    for (const p of used) {
      spread = Math.max(spread, Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z));
    }
    placements.push({
      toothNumber: tooth.toothNumber,
      center,
      radius: Math.max(spread, 1e-3),
      arch,
    });
  }
  return placements;
}

function occlusalCamera(frame: DentalFrame, arch: "upper" | "lower") {
  const dir = frame.up.clone();
  if (arch === "upper") dir.negate();
  const up = frame.anterior.clone();
  up.addScaledVector(dir, -up.dot(dir));
  if (up.lengthSq() < 1e-8) up.copy(frame.right);
  return { dir: dir.normalize(), up: up.normalize() };
}

function linearToSrgb(channel: number) {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** 치아는 양수, 잇몸은 음수. 아이보리는 밝고 붉은기가 약하다. */
function toothVsGingiva(r: number, g: number, b: number) {
  const sr = linearToSrgb(r);
  const sg = linearToSrgb(g);
  const sb = linearToSrgb(b);
  const pink = sr - 0.5 * (sg + sb);
  const luma = 0.299 * sr + 0.587 * sg + 0.114 * sb;
  return luma * 0.45 - pink;
}

type ColoredSample = { x: number; y: number; z: number; score: number };

function sampleArchColors(
  entries: LoadedMesh[],
  groupPosition: THREE.Vector3,
  cap: number,
) {
  const out: ColoredSample[] = [];
  const per = Math.max(600, Math.floor(cap / Math.max(entries.length, 1)));
  for (const entry of entries) {
    const pos = entry.geometry.getAttribute("position");
    const color = entry.scanColor;
    if (!pos || pos.count === 0) continue;
    const colored = color != null && color.count === pos.count;
    const stride = Math.max(1, Math.floor(pos.count / per));
    const ox = groupPosition.x;
    const oy = groupPosition.y;
    const oz = groupPosition.z;
    for (let i = 0; i < pos.count; i += stride) {
      out.push({
        x: pos.getX(i) + ox,
        y: pos.getY(i) + oy,
        z: pos.getZ(i) + oz,
        score: colored
          ? toothVsGingiva(color.getX(i), color.getY(i), color.getZ(i))
          : 0,
      });
    }
  }
  return out;
}

/** 점구름 공분산의 세 축. 악궁 바운딩박스의 모서리 방향이다. */
function cloudPrincipalAxes(
  points: Array<[number, number, number]>,
  mean: THREE.Vector3,
) {
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const p of points) {
    const x = p[0] - mean.x;
    const y = p[1] - mean.y;
    const z = p[2] - mean.z;
    xx += x * x;
    yy += y * y;
    zz += z * z;
    xy += x * y;
    xz += x * z;
    yz += y * z;
  }
  const a = [
    [xx, xy, xz],
    [xy, yy, yz],
    [xz, yz, zz],
  ];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iter = 0; iter < 12; iter += 1) {
    let p = 0;
    let q = 1;
    let max = Math.abs(a[0]?.[1] ?? 0);
    if (Math.abs(a[0]?.[2] ?? 0) > max) {
      max = Math.abs(a[0]?.[2] ?? 0);
      p = 0;
      q = 2;
    }
    if (Math.abs(a[1]?.[2] ?? 0) > max) {
      max = Math.abs(a[1]?.[2] ?? 0);
      p = 1;
      q = 2;
    }
    if (max < 1e-10) break;
    const app = a[p]?.[p] ?? 0;
    const aqq = a[q]?.[q] ?? 0;
    const apq = a[p]?.[q] ?? 0;
    if (Math.abs(apq) < 1e-15) break;
    const tau = (aqq - app) / (2 * apq);
    const tt = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + tt * tt);
    const s = tt * c;
    for (let k = 0; k < 3; k += 1) {
      if (k === p || k === q) continue;
      const aik = a[k]?.[p] ?? 0;
      const akq = a[k]?.[q] ?? 0;
      const nip = c * aik - s * akq;
      const niq = s * aik + c * akq;
      if (a[k]) {
        a[k][p] = nip;
        a[k][q] = niq;
      }
      if (a[p]) a[p][k] = nip;
      if (a[q]) a[q][k] = niq;
    }
    if (a[p]) a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    if (a[q]) a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    if (a[p]) a[p][q] = 0;
    if (a[q]) a[q][p] = 0;
    for (let k = 0; k < 3; k += 1) {
      const vip = v[k]?.[p] ?? 0;
      const viq = v[k]?.[q] ?? 0;
      if (!v[k]) continue;
      v[k][p] = c * vip - s * viq;
      v[k][q] = s * vip + c * viq;
    }
  }
  return [0, 1, 2].map((index) => ({
    value: a[index]?.[index] ?? 0,
    axis: new THREE.Vector3(
      v[0]?.[index] ?? 0,
      v[1]?.[index] ?? 0,
      v[2]?.[index] ?? 0,
    ),
  }));
}

/**
 * 교합면 법선. 카메라는 이 방향(교합면 쪽)에 둔다.
 * 악궁 바운딩박스의 세 축 가운데, 아이보리색 치아 점수가 한 끝에 몰리는 축을 고른다.
 */
function occlusalNormalFromColor(
  entries: LoadedMesh[],
  groupPosition: THREE.Vector3,
  fallback: THREE.Vector3,
) {
  const samples = sampleArchColors(entries, groupPosition, 9000);
  if (samples.length < 40) return null;
  const scored = samples.filter((sample) => sample.score !== 0 || entries.some((e) => e.scanColor));
  const usable = scored.length > 40 ? scored : samples;
  const points = usable.map(
    (sample) => [sample.x, sample.y, sample.z] as [number, number, number],
  );
  const mean = meanVec(points);
  if (!mean) return null;
  const axes = cloudPrincipalAxes(points, mean).filter(
    (row) => row.axis.lengthSq() > 1e-8,
  );
  if (axes.length === 0) return fallback.clone();
  let best: THREE.Vector3 | null = null;
  let bestGap = 0.015;
  for (const row of axes) {
    const axis = row.axis.clone().normalize();
    const heightOf = (sample: ColoredSample) =>
      (sample.x - mean.x) * axis.x +
      (sample.y - mean.y) * axis.y +
      (sample.z - mean.z) * axis.z;
    const heights = usable.map(heightOf).sort((a, b) => a - b);
    const lo = quantile(heights, 0.18);
    const hi = quantile(heights, 0.82);
    let hiSum = 0;
    let hiCount = 0;
    let loSum = 0;
    let loCount = 0;
    for (const sample of usable) {
      const height = heightOf(sample);
      if (height >= hi) {
        hiSum += sample.score;
        hiCount += 1;
      } else if (height <= lo) {
        loSum += sample.score;
        loCount += 1;
      }
    }
    const hiMean = hiCount > 0 ? hiSum / hiCount : 0;
    const loMean = loCount > 0 ? loSum / loCount : 0;
    const gap = hiMean - loMean;
    if (Math.abs(gap) <= bestGap) continue;
    bestGap = Math.abs(gap);
    best = gap < 0 ? axis.negate() : axis;
  }
  return best ?? fallback.clone();
}

function pickCameraArch(
  prepArch: "upper" | "lower" | "both" | null,
  teeth: Array<{ arch: "upper" | "lower" }>,
  loaded: LoadedMesh[],
): "upper" | "lower" | null {
  const has = (role: "upper" | "lower") =>
    loaded.some((entry) => entry.role === role);
  const preferred = teeth[0]?.arch ?? prepArch;
  if (preferred === "upper" || preferred === "lower") {
    if (has(preferred)) return preferred;
  }
  if (has("upper")) return "upper";
  if (has("lower")) return "lower";
  return null;
}

function toothWindowHalf(placements: ToothPlacement[], jawRadius: number) {
  let spread = 0;
  for (const place of placements) spread = Math.max(spread, place.radius);
  return Math.max(spread * 2.6, jawRadius * 0.2);
}

/** 같은 악에서 근심·원심으로 한 치아씩. 중절치는 반대편 중절치가 근심이다. */
function adjacentFdi(toothNumber: string): string[] {
  const digits = fdiDigits(toothNumber);
  const row = parseFdi(toothNumber);
  if (!digits || !row) return [];
  const quadrant = Number(digits[0]);
  const out: string[] = [];
  if (row.pos > 1) out.push(`${quadrant}${row.pos - 1}`);
  else {
    const across =
      quadrant === 1 ? 2 : quadrant === 2 ? 1 : quadrant === 3 ? 4 : 3;
    out.push(`${across}1`);
  }
  if (row.pos < 8) out.push(`${quadrant}${row.pos + 1}`);
  return out;
}

/** 화면 한가운데에 모델 중심을 두고 교합면에서 본다. 삽입축은 이 화면을 옮긴 뒤 잡는다. */
function frameWorkOcclusal(args: {
  loaded: LoadedMesh[];
  groupPosition: THREE.Vector3;
  frame: DentalFrame;
  prepArch: "upper" | "lower" | "both" | null;
  toothNumbers: readonly string[];
}): WorkFraming | null {
  const parsed = args.toothNumbers.flatMap((tooth) => {
    const row = parseFdi(tooth);
    const toothNumber = fdiDigits(tooth);
    if (!row || !toothNumber) return [];
    return [{ ...row, toothNumber }];
  });
  const prepKeys = new Set(parsed.map((row) => row.toothNumber));
  const seen = new Set(prepKeys);
  const withNeighbors = [...parsed];
  for (const tooth of parsed) {
    for (const neighbor of adjacentFdi(tooth.toothNumber)) {
      if (seen.has(neighbor)) continue;
      const row = parseFdi(neighbor);
      const toothNumber = fdiDigits(neighbor);
      if (!row || !toothNumber) continue;
      seen.add(neighbor);
      withNeighbors.push({ ...row, toothNumber });
    }
  }
  const arch = pickCameraArch(args.prepArch, parsed, args.loaded);
  if (!arch) return null;
  const meshes = args.loaded.filter((entry) => entry.role === arch);
  if (meshes.length === 0) return null;
  const world = sampleWorldPoints(meshes, args.groupPosition, 8000);
  if (world.length < 40) return null;
  const band = occlusalBand(world, args.frame, arch);
  const pose = occlusalCamera(args.frame, arch);
  const placements = locateToothPlacements(
    band,
    args.frame,
    arch,
    withNeighbors.filter((row) => row.arch === arch),
  );
  const colored = occlusalNormalFromColor(meshes, args.groupPosition, pose.dir);
  const hasPair =
    args.loaded.some((entry) => entry.role === "upper") &&
    args.loaded.some((entry) => entry.role === "lower");
  const dir = (() => {
    if (hasPair) {
      const jaw = pose.dir.clone();
      if (colored && colored.dot(jaw) < 0) jaw.negate();
      return jaw;
    }
    return colored ?? pose.dir.clone();
  })();
  const up = args.frame.anterior.clone();
  up.addScaledVector(dir, -up.dot(dir));
  if (up.lengthSq() < 1e-8) up.copy(pose.up);
  else up.normalize();
  const fit = measureMeshFit(meshes, args.groupPosition, dir, up);
  return {
    dir,
    up,
    halfW: fit.halfW,
    halfH: fit.halfH,
    target: fit.target,
    placements,
  };
}

function triggerPngDownload(dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "scan-overlay.png";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const OralScanOverlayViewer = forwardRef<OralScanOverlayHandle, Props>(
  function OralScanOverlayViewer(
    {
      items,
      visible,
      colorMapping,
      ghostOpacity,
      prepArch = null,
      focusToothNumbers = [],
      toothBadges = [],
      onSelectTooth,
      connectorChips = [],
      onSelectConnector,
      contactMap = false,
      undercutMap = false,
      occlusalGapMm = 0.1,
      contactMode = "cut",
      undercutLimit = 0.2,
      busy = false,
      busyLabel = "",
      onScanColorChange,
      onInsertionAxisChange,
      onInsertionAxisAimed,
      showInsertionAxis = false,
      centerGuide = "off",
      designEdit = null,
      onDesignGesture,
      dieMargins = null,
      showDies = false,
      hiddenTeeth = EMPTY_TEETH,
      onWorldTurned,
      onDiesChange,
      showStoneModel = false,
      onStoneModelChange,
      manualAlignArch = null,
      onAlignProgress,
      onAlignMerged,
      onAlignFailed,
      onAlignCancelled,
      onAligningChange,
      occlusionAdjust = null,
      onOcclusionEdit,
      meshEdit = null,
      onMeshEditStatus,
      onMeshEdit,
      onMeshesReady,
      onViewSettled,
      scanbodyPickTooth = null,
      onScanbodyPicks,
      marginSeedPickTooth = null,
      onMarginSeedPick,
      onMarginUndercut,
      onHoleIssues,
      onCrownShells,
      onMarginTraceProgress,
      className,
    },
    ref,
  ) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const guideCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const centerGuideRef = useRef(centerGuide);
  centerGuideRef.current = centerGuide;
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<ScreenSpaceOrbitControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const loadedRef = useRef<LoadedMesh[]>([]);
  const fitRadiusRef = useRef(40);
  const fitExtentRef = useRef({ halfW: 40, halfH: 40 });
  const fitFrameRef = useRef<FitFrame>({ width: 0, height: 0, frustumH: 0 });
  const fitTargetRef = useRef(new THREE.Vector3());
  const snapRef = useRef<SnapAnim | null>(null);
  const lookRef = useRef({
    colorMapping,
    ghostOpacity,
    prepArch,
    contactMap,
    undercutMap,
    occlusalGapMm,
    contactMode,
    undercutLimit,
    prepBackTransparent: Boolean(designEdit?.prepBackTransparent),
  });
  const visibleRef = useRef(visible);
  const focusTeethRef = useRef(focusToothNumbers);
  const badgesRef = useRef(toothBadges);
  const onSelectToothRef = useRef(onSelectTooth);
  const connectorChipsRef = useRef(connectorChips);
  const onSelectConnectorRef = useRef(onSelectConnector);
  const placementsRef = useRef<ToothPlacement[]>([]);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const badgeLayerRef = useRef<THREE.Group | null>(null);
  const focusToothRef = useRef<(toothNumber: string) => void>(() => {});
  const restoreInsertionViewRef = useRef<
    (toothNumbers: readonly string[]) => boolean
  >(() => false);
  const holeTargetRef = useRef<(tooth: string) => HoleTarget | null>(() => null);
  const viewHoleAxisRef = useRef<(toothNumber: string) => boolean>(() => false);
  const setInsertionFromViewRef = useRef<
    (toothNumbers: readonly string[], options?: { preview?: boolean }) => boolean
  >(() => false);
  const syncBadgesRef = useRef<() => void>(() => {});
  const onScanColorChangeRef = useRef(onScanColorChange);
  const onInsertionAxisChangeRef = useRef(onInsertionAxisChange);
  const onInsertionAxisAimedRef = useRef(onInsertionAxisAimed);
  const showInsertionRef = useRef(showInsertionAxis);
  const itemsRef = useRef(items);
  const frameRef = useRef<DentalFrame | null>(null);
  const insertionAxesRef = useRef<InsertionAxis[]>([]);
  const initialPoseRef = useRef<{
    dir: THREE.Vector3;
    up: THREE.Vector3;
    target: THREE.Vector3;
    halfW: number;
    halfH: number;
  } | null>(null);
  const resetHomeRef = useRef<() => void>(() => {});
  const insertionMarkerRef = useRef<THREE.Group | null>(null);
  const syncInsertionMarkerRef = useRef<() => void>(() => {});
  const unitToMmRef = useRef(1);
  const designEditRef = useRef<ProsthesisDesignEdit | null>(null);
  const onDesignGestureRef = useRef(onDesignGesture);
  const editLayerRef = useRef<THREE.Group | null>(null);
  const dieLayerRef = useRef<THREE.Group | null>(null);
  const dieCacheRef = useRef(
    new Map<string, { sig: string; arch: "upper" | "lower"; positions: Float32Array }>(),
  );
  const [dieReady, setDieReady] = useState<Array<{ tooth: string; arch: "upper" | "lower" }>>([]);
  const dieMarginsRef = useRef(dieMargins);
  dieMarginsRef.current = dieMargins;
  const onDiesChangeRef = useRef(onDiesChange);
  onDiesChangeRef.current = onDiesChange;
  const hiddenKey = hiddenTeeth.map((tooth) => fdiDigits(tooth)).filter(Boolean).join(",");
  const onWorldTurnedRef = useRef(onWorldTurned);
  onWorldTurnedRef.current = onWorldTurned;
  const dieReadyKey = dieReady.map((row) => `${row.tooth}:${row.arch}`).join(",");
  /** 다이 보기에서 숨길 스캔. 수동 정렬 중에는 쓰지 않는다. */
  const stoneLayerRef = useRef<THREE.Group | null>(null);
  const stonePartsRef = useRef<StoneModelPart[]>([]);
  const [stoneVersion, setStoneVersion] = useState(0);
  const onStoneModelChangeRef = useRef(onStoneModelChange);
  onStoneModelChangeRef.current = onStoneModelChange;
  const stoneShown = showStoneModel && manualAlignArch == null && stonePartsRef.current.length > 0;
  const dieHideRef = useRef<(role: LabOralScanRole) => boolean>(() => false);
  dieHideRef.current = (role) => {
    if (stoneShown) return true;
    if (!showDies) return false;
    return dieReady.some((row) => row.arch === role);
  };
  const dieShownRef = useRef<(tooth: string) => boolean>(() => false);
  dieShownRef.current = (tooth) => {
    if (manualAlignArch != null || stoneShown || !showDies) return false;
    return !(hiddenKey ? hiddenKey.split(",") : []).includes(tooth);
  };
  const manualRef = useRef<{
    arch: "upper" | "lower" | null;
    model: THREE.Vector3[];
    bite: THREE.Vector3[];
    merging: boolean;
    skipLayout: boolean;
  }>({
    arch: null,
    model: [],
    bite: [],
    merging: false,
    skipLayout: false,
  });
  const alignWatchRef = useRef<"upper" | "lower" | null>(null);
  const onAlignProgressRef = useRef(onAlignProgress);
  const onAlignMergedRef = useRef(onAlignMerged);
  const onAlignFailedRef = useRef(onAlignFailed);
  const onAlignCancelledRef = useRef(onAlignCancelled);
  const onMeshesReadyRef = useRef(onMeshesReady);
  const onViewSettledRef = useRef(onViewSettled);
  const viewTimerRef = useRef(0);
  const viewArmedRef = useRef(false);
  const layoutSplitRef = useRef<(arch: "upper" | "lower") => void>(() => {});
  const clearAlignMarksRef = useRef<() => void>(() => {});
  const exitAlignViewRef = useRef<() => void>(() => {});
  const alignApiRef = useRef<{ pick: (event: PointerEvent) => void }>({
    pick: () => {},
  });
  const alignAutoRef = useRef<() => Promise<boolean>>(async () => false);
  const clearPicksRef = useRef<() => void>(() => {});
  const occlusionRef = useRef(occlusionAdjust);
  occlusionRef.current = occlusionAdjust;
  const onOcclusionEditRef = useRef(onOcclusionEdit);
  onOcclusionEditRef.current = onOcclusionEdit;
  const meshEditRef = useRef(meshEdit);
  meshEditRef.current = meshEdit;
  const onMeshEditStatusRef = useRef(onMeshEditStatus);
  onMeshEditStatusRef.current = onMeshEditStatus;
  const onMeshEditRef = useRef(onMeshEdit);
  onMeshEditRef.current = onMeshEdit;
  const meshEditCtlRef = useRef<ScanMeshEditController | null>(null);
  const meshEditHostRef = useRef<{
    replaceShape: (id: string, shape: ScanShapeEdit) => void;
    ensureIndexed: (id: string) => void;
    sculpted: (ids: readonly string[]) => void;
    finish: () => void;
  }>({
    replaceShape: () => {},
    ensureIndexed: () => {},
    sculpted: () => {},
    finish: () => {},
  });
  /** 수동 교합에 들어왔을 때 정점. 원래대로와 교합 거리의 기준. */
  const occlusionBaseRef = useRef(new Map<string, Float32Array>());
  const occlusionLiveRef = useRef(false);
  const occlusionApiRef = useRef<{
    ensureBase: (arch: "upper" | "lower") => void;
    begin: () => void;
    preview: (arch: "upper" | "lower", matrix: THREE.Matrix4) => void;
    bake: (arch: "upper" | "lower", matrix: THREE.Matrix4) => void;
    pivot: (arch: "upper" | "lower") => THREE.Vector3 | null;
    measureMm: (arch: "upper" | "lower") => number;
    away: (arch: "upper" | "lower") => THREE.Vector3;
    reset: (arch: "upper" | "lower") => void;
  } | null>(null);
  const scanbodyPickRef = useRef<{ tooth: string | null; points: THREE.Vector3[] }>({
    tooth: null,
    points: [],
  });
  const scanbodyMarksRef = useRef<THREE.Group | null>(null);
  const onScanbodyPicksRef = useRef(onScanbodyPicks);
  onScanbodyPicksRef.current = onScanbodyPicks;
  const nearbyScanRef = useRef(
    new Map<string, { points: Float32Array; normals: Float32Array }>(),
  );
  const scanbodyPickApiRef = useRef<(raycaster: THREE.Raycaster) => void>(() => {});
  const marginSeedPickRef = useRef(marginSeedPickTooth);
  marginSeedPickRef.current = marginSeedPickTooth;
  const onMarginSeedPickRef = useRef(onMarginSeedPick);
  onMarginSeedPickRef.current = onMarginSeedPick;
  const onMarginUndercutRef = useRef(onMarginUndercut);
  onMarginUndercutRef.current = onMarginUndercut;
  const onHoleIssuesRef = useRef(onHoleIssues);
  onHoleIssuesRef.current = onHoleIssues;
  const onCrownShellsRef = useRef(onCrownShells);
  onCrownShellsRef.current = onCrownShells;
  /** 치아별 대합·인접·치조정 스캔과 맞춘 크라운. 스캔을 다시 읽으면 비운다. */
  const crownScanRef = useRef(new Map<string, CrownAdaptScan>());
  const crownRawScanRef = useRef(
    new Map<string, { own: ScanCloud; opposing: CrownAdaptScan["opposing"] }>(),
  );
  const crownAdaptCacheRef = useRef(new Map<string, CachedCrown>());
  const onMarginTraceProgressRef = useRef(onMarginTraceProgress);
  onMarginTraceProgressRef.current = onMarginTraceProgress;
  /** 마진을 지운 뒤 찍는 점(월드). 시작점을 다시 누르면 닫는다. */
  const marginTraceRef = useRef<{ tooth: string | null; points: THREE.Vector3[] }>({
    tooth: null,
    points: [],
  });
  const marginSketchRef = useRef<THREE.Group | null>(null);
  const marginTraceApiRef = useRef<{
    active: () => string | null;
    click: (raycaster: THREE.Raycaster) => void;
    undo: () => void;
    sync: () => void;
  }>({ active: () => null, click: () => {}, undo: () => {}, sync: () => {} });
  const scanSurfaceHitRef = useRef<
    (raycaster: THREE.Raycaster, tooth: string) => THREE.Vector3 | null
  >(() => null);
  const marginSampleAtRef = useRef<
    (tooth: string, point: THREE.Vector3) => MarginSample | null
  >(() => null);
  const drawMarginSketchRef = useRef<(points: THREE.Vector3[], closed: boolean) => void>(
    () => {},
  );
  const marginUndercutFlagsRef = useRef<
    (tooth: string, points: readonly THREE.Vector3[]) => boolean[]
  >((_, points) => points.map(() => false));
  designEditRef.current = designEdit;
  onDesignGestureRef.current = onDesignGesture;
  onAlignProgressRef.current = onAlignProgress;
  onAlignMergedRef.current = onAlignMerged;
  onAlignFailedRef.current = onAlignFailed;
  onAlignCancelledRef.current = onAlignCancelled;
  const onAligningChangeRef = useRef(onAligningChange);
  onAligningChangeRef.current = onAligningChange;
  onMeshesReadyRef.current = onMeshesReady;
  onViewSettledRef.current = onViewSettled;
  const scheduleViewSettledRef = useRef(() => {});
  scheduleViewSettledRef.current = () => {
    if (!viewArmedRef.current) return;
    window.clearTimeout(viewTimerRef.current);
    viewTimerRef.current = window.setTimeout(() => {
      if (!viewArmedRef.current) return;
      onViewSettledRef.current?.();
    }, 320);
  };
  const setViewRef = useRef<(preset: OralScanViewPreset) => void>(() => {});
  const saveImageRef = useRef<() => void>(() => {});
  const [parseNote, setParseNote] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [aligning, setAligning] = useState(false);
  useEffect(() => {
    onAligningChangeRef.current?.(aligning);
  }, [aligning]);
  const alignEpochRef = useRef(0);
  const alignCancelGenRef = useRef(0);
  const cancelAlignRef = useRef<() => void>(() => {});
  cancelAlignRef.current = () => {
    alignCancelGenRef.current += 1;
  };
  const layoutGenRef = useRef(0);

  /** 중단 후 「이 자세 유지 / 원래대로」를 기다리는 중. */
  const [alignStopAsk, setAlignStopAsk] = useState(false);
  const alignChoiceRef = useRef<((keep: boolean) => void) | null>(null);
  const resolveAlignChoice = (keep: boolean) => {
    const resolve = alignChoiceRef.current;
    alignChoiceRef.current = null;
    setAlignStopAsk(false);
    resolve?.(keep);
  };
  useEffect(() => () => alignChoiceRef.current?.(false), []);

  type AlignJob = { epoch: number; cancelGen: number };
  const startAlignJob = (): AlignJob => {
    if (alignChoiceRef.current) resolveAlignChoice(false);
    const epoch = (alignEpochRef.current += 1);
    return { epoch, cancelGen: alignCancelGenRef.current };
  };
  const alignStopped = (job: AlignJob) =>
    alignEpochRef.current !== job.epoch || alignCancelGenRef.current !== job.cancelGen;
  const alignUserStopped = (job: AlignJob) =>
    alignEpochRef.current === job.epoch && alignCancelGenRef.current !== job.cancelGen;

  /** 찾는 중인 자세는 메시 변환으로만 보여 준다. 기하는 끝나거나 「유지」를 고를 때만 바뀐다. */
  const showAlignPose = (
    loaded: readonly LoadedMesh[],
    geometry: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
  ) => {
    const entry = loaded.find((row) => row.geometry === geometry);
    if (!entry) return;
    matrix.decompose(entry.mesh.position, entry.mesh.quaternion, alignPoseScale);
    entry.mesh.scale.set(1, 1, 1);
  };
  const clearAlignPoses = (loaded: readonly LoadedMesh[]) => {
    for (const entry of loaded) {
      entry.mesh.position.set(0, 0, 0);
      entry.mesh.quaternion.identity();
    }
  };

  type BiteAlignOutcome = { seated: boolean; stop: null | "keep" | "revert" };
  /**
   * 바이트 맞춤을 화면에 보이며 돌린다. 사용자가 중단하면 멈춘 순간 자세를 보여 주고
   * 유지할지 되돌릴지 묻는다. 되돌리면 기하는 그대로다.
   */
  const runBiteAlign = async (
    loaded: LoadedMesh[],
    job: AlignJob,
    dead: () => boolean,
  ): Promise<BiteAlignOutcome> => {
    const result = await registerJawsToBiteResult(loaded, {
      sweepPoses: true,
      cancelled: () => dead() || alignStopped(job),
      onPose: (geometry, matrix) => showAlignPose(loaded, geometry, matrix),
    });
    clearAlignPoses(loaded);
    if (!result.stopped) return { seated: result.seated, stop: null };
    if (dead() || !alignUserStopped(job) || result.partial.length === 0) {
      return { seated: false, stop: "revert" };
    }
    for (const pose of result.partial) showAlignPose(loaded, pose.geometry, pose.matrix);
    const keep = await new Promise<boolean>((resolve) => {
      alignChoiceRef.current = resolve;
      setAlignStopAsk(true);
    });
    clearAlignPoses(loaded);
    if (!keep || dead()) return { seated: false, stop: "revert" };
    applyBiteFitPoses(result.partial);
    return { seated: true, stop: "keep" };
  };
  const placeLoadedRef = useRef<(reseated: boolean) => void>(() => {});

  lookRef.current = {
    colorMapping,
    ghostOpacity,
    prepArch,
    contactMap,
    undercutMap,
    occlusalGapMm,
    contactMode,
    undercutLimit,
    prepBackTransparent: Boolean(designEdit?.prepBackTransparent),
  };
  visibleRef.current = visible;
  focusTeethRef.current = focusToothNumbers;
  badgesRef.current = toothBadges;
  onSelectToothRef.current = onSelectTooth;
  connectorChipsRef.current = connectorChips;
  onSelectConnectorRef.current = onSelectConnector;
  onScanColorChangeRef.current = onScanColorChange;
  onInsertionAxisChangeRef.current = onInsertionAxisChange;
  onInsertionAxisAimedRef.current = onInsertionAxisAimed;
  showInsertionRef.current = showInsertionAxis;
  itemsRef.current = items;

  const itemsKey = items
    .map((item) => `${item.id}:${item.file.size}:${item.file.lastModified}`)
    .join("|");
  const roleKey = items.map((item) => `${item.id}:${item.role}`).join("|");

  const frameCamera = (
    dir: THREE.Vector3,
    up: THREE.Vector3,
    animate: boolean,
    save = false,
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const radius = Math.max(fitRadiusRef.current, 1);
    const dist = radius * 4;
    const toTarget = fitTargetRef.current.clone();
    const toPos = dir.clone().normalize().multiplyScalar(dist).add(toTarget);
    const toUp = up.clone();
    if (Math.abs(toUp.dot(dir.clone().normalize())) > 0.92) {
      toUp.set(0, 0, 1);
    }
    toUp.normalize();
    if (!animate) {
      snapRef.current = null;
      controls.target.copy(toTarget);
      camera.position.copy(toPos);
      camera.up.copy(toUp);
      camera.zoom = 1;
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.syncFromCamera();
      if (save) scheduleViewSettledRef.current();
      return;
    }
    snapRef.current = {
      start: performance.now(),
      duration: 280,
      fromPos: camera.position.clone(),
      toPos,
      fromUp: camera.up.clone(),
      toUp,
      fromTarget: controls.target.clone(),
      toTarget,
      fromZoom: camera.zoom,
      toZoom: 1,
      save,
    };
  };

  const writeFrustum = (frustumH: number, aspect: number) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const frustumW = frustumH * aspect;
    camera.top = frustumH / 2;
    camera.bottom = -frustumH / 2;
    camera.right = frustumW / 2;
    camera.left = -frustumW / 2;
    const radius = Math.max(fitRadiusRef.current, 1);
    const dist = radius * 4;
    camera.near = Math.max(radius * 0.01, 0.05);
    camera.far = dist * 40;
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (controls) {
      controls.minDistance = Math.max(radius * 0.15, 1);
      controls.maxDistance = Math.max(radius * 30, 80);
    }
  };

  const applyFitFrustum = () => {
    const camera = cameraRef.current;
    const el = containerRef.current;
    if (!camera || !el) return;
    const width = Math.max(el.clientWidth, 1);
    const height = Math.max(el.clientHeight, 1);
    const aspect = width / height;
    const { halfW, halfH } = fitExtentRef.current;
    const worldW = Math.max(halfW * 2 * FIT_MARGIN, 1);
    const worldH = Math.max(halfH * 2 * FIT_MARGIN, 1);
    const frustumH = containFrustumHeight(worldW, worldH, aspect);
    fitFrameRef.current = { width, height, frustumH };
    writeFrustum(frustumH, aspect);
  };

  /** 처음 맞춘 화면 배율을 유지한다. 줄어든 영역은 모델을 줄이지 않고 잘라 낸다. */
  const cropFrustumToCanvas = () => {
    const camera = cameraRef.current;
    const el = containerRef.current;
    if (!camera || !el) return;
    const width = Math.max(el.clientWidth, 1);
    const height = Math.max(el.clientHeight, 1);
    const frame = fitFrameRef.current;
    if (
      frame.frustumH <= 0 ||
      frame.height <= 0 ||
      width > frame.width + 0.5 ||
      height > frame.height + 0.5
    ) {
      applyFitFrustum();
      return;
    }
    const worldPerPx = frame.frustumH / frame.height;
    writeFrustum(worldPerPx * height, width / height);
  };

  const restyleLoaded = () => {
    const look = lookRef.current;
    const {
      colorMapping: mapping,
      ghostOpacity: opacity,
      prepArch: prep,
    } = look;
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    let anyColor = false;
    const unit = unitToMmRef.current;
    for (const entry of loadedRef.current) {
      if (entry.hasColor) anyColor = true;
      const analysis = paintAnalysisColors(entry, look, unit);
      const useScan = mapping && entry.hasColor && !analysis;
      const mat = analysis
        ? new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            metalness: 0.04,
            roughness: 0.55,
            side: THREE.DoubleSide,
          })
        : createModelPreviewMaterial(entry.geometry, entry.texture, {
            colorMapping: useScan,
          });
      mat.side = THREE.DoubleSide;
      if (!useScan && !analysis) mat.color.set(ROLE_COLOR[entry.role]);
      const ghost = isGhostScanRole(entry.role, prep);
      const ghostOff = ghost && opacity <= 0.001;
      const alpha = ghostOff ? 0 : ghost ? Math.min(1, Math.max(0.08, opacity)) : 1;
      const prepShell =
        look.prepBackTransparent &&
        !ghost &&
        (prep === "both"
          ? entry.role === "upper" || entry.role === "lower"
          : entry.role === prep);
      const shown = prepShell ? Math.min(alpha, 0.38) : alpha;
      mat.transparent = shown < 0.995;
      mat.opacity = shown;
      mat.depthWrite = !ghostOff && !prepShell && (!ghost || shown > 0.92);
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = ghost ? 1 : -1;
      mat.polygonOffsetUnits = 1;
      const prev = entry.mesh.material;
      entry.mesh.material = mat;
      entry.mesh.renderOrder = ghost ? 2 : 0;
      const list = Array.isArray(prev) ? prev : [prev];
      for (const old of list) old.dispose();
      const split = manualRef.current.arch;
      const forced =
        split != null && (entry.role === split || entry.role === "bite");
      const hiddenByAlign =
        split != null && entry.role !== split && entry.role !== "bite";
      if (forced) {
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      }
      syncBackFaceShell(entry.mesh);
      entry.mesh.visible =
        !hiddenByAlign &&
        !ghostOff &&
        visibleRef.current[entry.id] !== false &&
        !dieHideRef.current(entry.role);
      if (forced) entry.mesh.visible = true;
    }
    if (scene && renderer) {
      if (mapping && anyColor) {
        applyScanColorToneMapping(renderer);
        scene.background = new THREE.Color(SCAN_COLOR_PREVIEW_BACKGROUND);
      } else {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        scene.background = new THREE.Color(0xf3f4f6);
      }
    }
  };

  const applyFitFrustumRef = useRef(applyFitFrustum);
  applyFitFrustumRef.current = applyFitFrustum;
  const cropFrustumToCanvasRef = useRef(cropFrustumToCanvas);
  cropFrustumToCanvasRef.current = cropFrustumToCanvas;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f4f6);
    sceneRef.current = scene;

    const width = Math.max(el.clientWidth, 1);
    const height = Math.max(el.clientHeight, 1);
    const aspect = width / height;
    const frustum = 80;
    const camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      5000,
    );
    camera.up.copy(HOME_UP);
    camera.position.copy(HOME_DIR.clone().normalize().multiplyScalar(160));
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.inset = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    labelRenderer.domElement.style.overflow = "hidden";
    el.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    const badgeLayer = new THREE.Group();
    scene.add(badgeLayer);
    badgeLayerRef.current = badgeLayer;

    scene.add(new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 0.55));
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(40, -60, 90);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8eef8, 0.4);
    fill.position.set(-70, 40, 40);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.28);
    rim.position.set(10, 80, -50);
    scene.add(rim);
    const viewRight = new THREE.Vector3();
    const viewUp = new THREE.Vector3();
    const viewToward = new THREE.Vector3();
    const addViewLight = (color: number, intensity: number) => {
      const light = new THREE.DirectionalLight(color, intensity);
      scene.add(light);
      scene.add(light.target);
      return light;
    };
    const rightKey = addViewLight(0xfff6ee, 0.68);
    const rightLow = addViewLight(0xeaf0ff, 0.4);
    const rightFront = addViewLight(0xffffff, 0.34);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    camera.lookAt(0, 0, 0);
    const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.syncFromCamera();
    controlsRef.current = controls;
    const cancelSnap = () => {
      snapRef.current = null;
    };
    controls.addEventListener("start", cancelSnap);
    const onControlChange = () => {
      scheduleViewSettledRef.current();
    };
    controls.addEventListener("change", onControlChange);

    const placeViewLight = (
      light: THREE.DirectionalLight,
      rightAmt: number,
      upAmt: number,
      towardAmt: number,
    ) => {
      light.position
        .copy(controls.target)
        .addScaledVector(viewRight, rightAmt)
        .addScaledVector(viewUp, upAmt)
        .addScaledVector(viewToward, towardAmt);
      light.target.position.copy(controls.target);
    };

    let raf = 0;
    const loop = () => {
      raf = window.requestAnimationFrame(loop);
      const snap = snapRef.current;
      if (snap) {
        const k = easeOutCubic(
          Math.min(1, (performance.now() - snap.start) / snap.duration),
        );
        camera.position.lerpVectors(snap.fromPos, snap.toPos, k);
        camera.up.lerpVectors(snap.fromUp, snap.toUp, k).normalize();
        controls.target.lerpVectors(snap.fromTarget, snap.toTarget, k);
        camera.zoom = snap.fromZoom + (snap.toZoom - snap.fromZoom) * k;
        if (
          snap.fromLeft != null &&
          snap.toLeft != null &&
          snap.fromRight != null &&
          snap.toRight != null &&
          snap.fromTop != null &&
          snap.toTop != null &&
          snap.fromBottom != null &&
          snap.toBottom != null
        ) {
          camera.left = snap.fromLeft + (snap.toLeft - snap.fromLeft) * k;
          camera.right = snap.fromRight + (snap.toRight - snap.fromRight) * k;
          camera.top = snap.fromTop + (snap.toTop - snap.fromTop) * k;
          camera.bottom =
            snap.fromBottom + (snap.toBottom - snap.fromBottom) * k;
        }
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
        if (k >= 1) {
          const finished = snap;
          snapRef.current = null;
          controls.syncFromCamera();
          if (finished.save) scheduleViewSettledRef.current();
        }
      }
      camera.updateMatrixWorld();
      viewRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      viewUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      viewToward.copy(camera.position).sub(controls.target);
      if (viewToward.lengthSq() < 1e-8) viewToward.set(0, 0, 1);
      else viewToward.normalize();
      placeViewLight(rightKey, 52, 24, 34);
      placeViewLight(rightLow, 44, -30, 22);
      placeViewLight(rightFront, 20, 6, 72);
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      const guide = guideCanvasRef.current;
      if (guide) {
        drawViewGuides(
          guide,
          camera,
          unitToMmRef.current,
          centerGuideRef.current,
        );
      }
    };
    loop();

    const onResize = () => {
      const w = Math.max(el.clientWidth, 1);
      const h = Math.max(el.clientHeight, 1);
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
      cropFrustumToCanvasRef.current();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.6 };
    const ndc = new THREE.Vector2();
    type EditDrag =
      | { kind: "margin"; tooth: string; index: number; at: number }
      | {
          kind: "stroke";
          tooth: string;
          samples: MarginSample[];
          points: THREE.Vector3[];
          at: number;
        }
      | {
          kind: "transform";
          tooth: string;
          handle: TransformHandle;
          sx: number;
          sz: number;
          box: TransformBox;
          start: THREE.Vector3;
          y0: number;
          refine0: RefineTransform;
        }
      | { kind: "hook"; tooth: string }
      | { kind: "hole"; tooth: string }
      | { kind: "hole-tip"; tooth: string; end: "top" | "bottom" }
      | { kind: "connector"; tooth: string; along0: number; x0: number }
      | { kind: "insertion"; key: string; at: number };
    let drag: EditDrag | null = null;
    let lastPointer = { x: 0, y: 0 };

    /** 끄는 삽입축이 있는 악만 언더컷을 바로 다시 칠한다. 칠하지 못하면 false. */
    const repaintUndercutNow = (axis: InsertionAxis) => {
      const arch = placementsRef.current.find((row) =>
        axis.toothNumbers.includes(row.toothNumber),
      )?.arch;
      if (!arch) return false;
      const anchors = anchorsFromAxes(
        insertionAxesRef.current,
        placementsRef.current,
        groupRef.current?.position ?? new THREE.Vector3(),
      ).filter((anchor) => anchor.arch === arch);
      let painted = false;
      let restyle = false;
      for (const entry of loadedRef.current) {
        if (entry.role !== arch || !fillUndercutAlign(entry, anchors)) continue;
        painted = true;
        const material = entry.mesh.material as THREE.MeshStandardMaterial;
        if (!material.vertexColors) restyle = true;
        else paintAnalysisColors(entry, lookRef.current, unitToMmRef.current);
      }
      if (restyle) restyleRef.current();
      return painted;
    };

    const aim = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      ndc.set(
        ((event.clientX - rect.left) / width) * 2 - 1,
        -((event.clientY - rect.top) / height) * 2 + 1,
      );
      raycaster.params.Line = { threshold: Math.max(fitRadiusRef.current * 0.02, 0.35) };
      raycaster.setFromCamera(ndc, camera);
    };

    const toothFrame = (tooth: string) => {
      const place = placementsRef.current.find((row) => row.toothNumber === tooth);
      if (!place) return null;
      const axis = insertionAxesRef.current.find((row) =>
        row.toothNumbers.includes(tooth),
      );
      const normal = (axis?.dir ?? frameRef.current?.up ?? new THREE.Vector3(0, 0, 1))
        .clone()
        .normalize();
      const hint = frameRef.current?.right ?? new THREE.Vector3(1, 0, 0);
      const x = hint.clone().addScaledVector(normal, -hint.dot(normal));
      if (x.lengthSq() < 1e-8) x.crossVectors(normal, new THREE.Vector3(0, 1, 0));
      x.normalize();
      const z = new THREE.Vector3().crossVectors(x, normal).normalize();
      return { place, normal, x, z };
    };

    /** 크라운 로컬 각도. 변형으로 옮기고 돌린 크라운 중심·방향 기준이다. */
    const crownAngle = (frame: NonNullable<ReturnType<typeof toothFrame>>, tooth: string, point: THREE.Vector3) => {
      const refine = designEditRef.current?.edits[tooth]?.refine;
      const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
      const local = point.clone().sub(frame.place.center);
      if (refine) {
        local
          .addScaledVector(frame.x, -refine.offsetMm[0] / unit)
          .addScaledVector(frame.z, -refine.offsetMm[1] / unit);
      }
      const turn = ((refine?.rotateDeg ?? 0) * Math.PI) / 180;
      return Math.atan2(local.dot(frame.z), local.dot(frame.x)) - turn;
    };

    const planePoint = (tooth: string) => {
      const frame = toothFrame(tooth);
      if (!frame) return null;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        frame.normal,
        frame.place.center,
      );
      const point = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, point)) return null;
      return { ...frame, point, angle: crownAngle(frame, tooth, point) };
    };

    /** 변형 상자 중심 높이의 치아 평면과 광선이 만나는 점. */
    const boxPlanePoint = (box: TransformBox) => {
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(box.normal, box.center);
      const point = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, point) ? point : null;
    };

    const transformPatch = (
      state: Extract<EditDrag, { kind: "transform" }>,
      point: THREE.Vector3 | null,
      clientY: number,
      symmetric: boolean,
    ): Partial<RefineTransform> | null => {
      const { box, refine0 } = state;
      const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
      if (state.handle === "height") {
        const [x, y, z] = refine0.stretch;
        return { stretch: [x, y + (state.y0 - clientY) / 180, z] };
      }
      if (!point) return null;
      const rel = point.clone().sub(box.center);
      if (state.handle === "move") {
        const delta = point.clone().sub(state.start);
        return {
          offsetMm: [
            refine0.offsetMm[0] + delta.dot(box.frameX) * unit,
            refine0.offsetMm[1] + delta.dot(box.frameZ) * unit,
          ],
        };
      }
      if (state.handle === "rotate") {
        const from = state.start.clone().sub(box.center);
        const a0 = Math.atan2(from.dot(box.frameZ), from.dot(box.frameX));
        const a1 = Math.atan2(rel.dot(box.frameZ), rel.dot(box.frameX));
        return { rotateDeg: refine0.rotateDeg + ((a1 - a0) * 180) / Math.PI };
      }
      const hx = state.sx * box.halfX;
      const hz = state.sz * box.halfZ;
      const px = rel.dot(box.x);
      const pz = rel.dot(box.z);
      const [s0x, s0y, s0z] = refine0.stretch;
      if (symmetric) {
        return { stretch: [s0x * (px / hx), s0y, s0z * (pz / hz)] };
      }
      // 반대 모서리를 붙잡고 늘린다. 상자 중심이 따라 움직인다.
      const kx = (px + hx) / (2 * hx);
      const kz = (pz + hz) / (2 * hz);
      const stretch: [number, number, number] = [
        THREE.MathUtils.clamp(s0x * kx, STRETCH_RANGE.min, STRETCH_RANGE.max),
        s0y,
        THREE.MathUtils.clamp(s0z * kz, STRETCH_RANGE.min, STRETCH_RANGE.max),
      ];
      const shiftX = hx * (stretch[0] / s0x - 1);
      const shiftZ = hz * (stretch[2] / s0z - 1);
      const shift = box.x.clone().multiplyScalar(shiftX).addScaledVector(box.z, shiftZ);
      return {
        stretch,
        offsetMm: [
          refine0.offsetMm[0] + shift.dot(box.frameX) * unit,
          refine0.offsetMm[1] + shift.dot(box.frameZ) * unit,
        ],
      };
    };

    const pickEdit = () => {
      const roots: THREE.Object3D[] = [];
      if (editLayerRef.current) roots.push(editLayerRef.current);
      if (
        insertionMarkerRef.current &&
        designEditRef.current?.tool === "insertion"
      ) {
        roots.push(insertionMarkerRef.current);
      }
      if (roots.length === 0) return null;
      const hits = raycaster.intersectObjects(roots, true);
      // 홀 핸들은 비쳐 보이는 크라운 안쪽에 있어도 먼저 잡는다.
      if (designEditRef.current?.tool === "hole") {
        for (const kind of ["hole-tip", "hole"] as const) {
          const handle = hits.find((hit) => readEditHit(hit.object)?.kind === kind);
          const tag = handle ? readEditHit(handle.object) : null;
          if (handle && tag) {
            return {
              tag,
              point: handle.point.clone(),
              marginPoints: undefined,
              object: handle.object,
            };
          }
        }
      }
      for (const hit of hits) {
        const tag = readEditHit(hit.object);
        if (!tag) continue;
        const marginPoints = hit.object.userData.marginPoints as
          | THREE.Vector3[]
          | undefined;
        return { tag, point: hit.point.clone(), marginPoints };
      }
      return null;
    };

    const marginRatio = (tooth: string, point: THREE.Vector3) => {
      const frame = toothFrame(tooth);
      const edit = designEditRef.current?.edits[tooth];
      if (!frame || !edit) return null;
      const unit = unitToMmRef.current || 1;
      const base = frame.place.radius * 0.78;
      if (base < 1e-6) return null;
      const offset = edit.margin.offsetMm / unit;
      const delta = point.clone().sub(frame.place.center);
      const axial = delta.dot(frame.normal);
      const radial = Math.sqrt(Math.max(0, delta.lengthSq() - axial * axial));
      return (radial - offset) / base;
    };

    const sculptAt = (tooth: string, angle: number, invert: boolean) => {
      const send = onDesignGestureRef.current;
      const brush = designEditRef.current?.sculptBrush;
      if (!send || !brush) return;
      const width = sculptStampWidth(brush.sizeMm, brush.zoomSync ? camera.zoom : 1);
      const amount = 0.84 * brush.strength;
      if (brush.shape === "smooth") {
        send({ type: "smooth", tooth });
        return;
      }
      if (brush.shape === "flatten") {
        send({ type: "flatten", tooth, angle, width, strength: brush.strength });
        return;
      }
      const sign = brush.shape === "remove" ? -1 : 1;
      const wide = brush.shape === "inflate" ? 2.4 : 1;
      send({
        type: "sculpt",
        tooth,
        angle,
        amount: (invert ? -sign : sign) * amount * (brush.shape === "inflate" ? 0.6 : 1),
        width: width * wide,
      });
    };

    const onEditPointerDown = (event: PointerEvent) => {
      if (!designEditRef.current) return;
      aim(event);
      const spec = designEditRef.current;
      const penTooth = spec.activeTooth;
      const penEdit = penTooth ? spec.edits[penTooth] : null;
      if (
        penTooth &&
        penEdit &&
        spec.tool === "margin" &&
        spec.marginMode === "pen" &&
        spec.showMargin &&
        event.button === 0 &&
        !penEdit.margin.deleted &&
        !penEdit.pontic.on &&
        !marginSeedPickRef.current
      ) {
        const point = scanSurfaceHitRef.current(raycaster, penTooth);
        const sample = point ? marginSampleAtRef.current(penTooth, point) : null;
        if (point && sample) {
          drag = {
            kind: "stroke",
            tooth: penTooth,
            samples: [sample],
            points: [point],
            at: performance.now(),
          };
          drawMarginSketchRef.current([point], false);
          event.preventDefault();
          event.stopPropagation();
          lastPointer = { x: event.clientX, y: event.clientY };
          return;
        }
      }
      const hit = pickEdit();
      if (!hit) return;
      const tool = designEditRef.current.tool;
      const brush = designEditRef.current.brush;
      const send = onDesignGestureRef.current;
      if (!send) return;

      if (hit.tag.kind === "insertion" && tool === "insertion" && event.button === 0) {
        drag = { kind: "insertion", key: hit.tag.key, at: 0 };
      } else if (hit.tag.kind === "margin" && event.button === 2) {
        send({ type: "margin-remove", tooth: hit.tag.tooth, index: hit.tag.index });
      } else if (hit.tag.kind === "margin" && event.button === 0 && tool === "margin") {
        drag = { kind: "margin", tooth: hit.tag.tooth, index: hit.tag.index, at: 0 };
      } else if (hit.tag.kind === "margin-line" && event.button === 0 && tool === "margin") {
        const points = hit.marginPoints ?? [];
        let near = 0;
        let best = Infinity;
        points.forEach((row, index) => {
          const dist = row.distanceTo(hit.point);
          if (dist < best) {
            best = dist;
            near = index;
          }
        });
        const sample = marginSampleAtRef.current(hit.tag.tooth, hit.point);
        if (!sample) return;
        send({
          type: "margin-insert",
          tooth: hit.tag.tooth,
          index: near + 1,
          radius: sample.radius,
          depth: sample.depth,
        });
      } else if (hit.tag.kind === "transform" && event.button === 0) {
        const box = hit.object.userData.transformBox as TransformBox | undefined;
        const refine = designEditRef.current.edits[hit.tag.tooth]?.refine;
        if (!box || !refine) return;
        const start = boxPlanePoint(box);
        if (!start && hit.tag.handle !== "height") return;
        drag = {
          kind: "transform",
          tooth: hit.tag.tooth,
          handle: hit.tag.handle,
          sx: hit.tag.sx ?? 1,
          sz: hit.tag.sz ?? 1,
          box,
          start: start ?? box.center.clone(),
          y0: event.clientY,
          refine0: {
            scale: refine.scale,
            stretch: [...refine.stretch],
            offsetMm: [...refine.offsetMm],
            rotateDeg: refine.rotateDeg,
          },
        };
      } else if (hit.tag.kind === "hook" && (event.button === 2 || brush === "erase")) {
        send({ type: "hook-off", tooth: hit.tag.tooth });
      } else if (hit.tag.kind === "hook" && event.button === 0) {
        drag = { kind: "hook", tooth: hit.tag.tooth };
      } else if (
        (hit.tag.kind === "hole" || hit.tag.kind === "hole-tip") &&
        (event.button === 2 || brush === "erase")
      ) {
        send({ type: "hole-remove", tooth: hit.tag.tooth });
      } else if (hit.tag.kind === "hole-tip" && event.button === 0) {
        drag = { kind: "hole-tip", tooth: hit.tag.tooth, end: hit.tag.end };
      } else if (hit.tag.kind === "hole" && event.button === 0) {
        drag = { kind: "hole", tooth: hit.tag.tooth };
      } else if (hit.tag.kind === "connector" && event.button === 0) {
        const along0 =
          designEditRef.current.edits[hit.tag.tooth]?.connector.along ?? 0.5;
        drag = { kind: "connector", tooth: hit.tag.tooth, along0, x0: event.clientX };
      } else if (hit.tag.kind === "crown" && event.button === 0) {
        const frame = toothFrame(hit.tag.tooth);
        if (!frame) return;
        const angle = crownAngle(frame, hit.tag.tooth, hit.point);
        if (tool === "hook") {
          send({
            type: "hook-angle",
            tooth: hit.tag.tooth,
            angle: ((angle * 180) / Math.PI + 360) % 360,
          });
        } else if (tool === "hole") {
          const target = holeTargetRef.current(hit.tag.tooth);
          if (!target || target.edit.implant.on || target.edit.pontic.on) return;
          const point = target.toLocalMm(hit.point);
          const dir = target.edit.hole.on ? target.edit.hole.dir : ([0, 1, 0] as [number, number, number]);
          const issue = target.line({ point, dir }).issue;
          if (issue) send({ type: "hole-reject", tooth: hit.tag.tooth, reason: issue });
          else send({ type: "hole-place", tooth: hit.tag.tooth, point, dir });
        } else if (tool === "cutback" && brush === "minus") {
          send({ type: "cutback-exclude", tooth: hit.tag.tooth, angle });
        } else if (tool === "refine" && brush === "sculpt") {
          sculptAt(hit.tag.tooth, angle, false);
        } else if (tool === "refine" && brush === "erase") {
          send({ type: "smooth", tooth: hit.tag.tooth });
        } else {
          return;
        }
      } else if (hit.tag.kind === "crown" && event.button === 2 && tool === "refine") {
        const placed = planePoint(hit.tag.tooth);
        if (!placed) return;
        sculptAt(hit.tag.tooth, placed.angle, true);
      } else {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      lastPointer = { x: event.clientX, y: event.clientY };
    };

    const onEditPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      aim(event);
      const send = onDesignGestureRef.current;
      if (!send) return;
      if (drag.kind === "margin") {
        const now = performance.now();
        if (now - drag.at < SURFACE_PICK_MS) return;
        drag.at = now;
        const onScan = scanSurfaceHitRef.current(raycaster, drag.tooth);
        const sample = onScan ? marginSampleAtRef.current(drag.tooth, onScan) : null;
        if (sample) {
          send({
            type: "margin",
            tooth: drag.tooth,
            index: drag.index,
            radius: sample.radius,
            depth: sample.depth,
          });
        } else {
          const placed = planePoint(drag.tooth);
          if (!placed) return;
          const ratio = marginRatio(drag.tooth, placed.point);
          if (ratio == null) return;
          send({ type: "margin", tooth: drag.tooth, index: drag.index, radius: ratio });
        }
      } else if (drag.kind === "stroke") {
        const now = performance.now();
        if (now - drag.at < SURFACE_PICK_MS) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        drag.at = now;
        const point = scanSurfaceHitRef.current(raycaster, drag.tooth);
        const last = drag.points[drag.points.length - 1];
        const strokeTooth = drag.tooth;
        const place = placementsRef.current.find((row) => row.toothNumber === strokeTooth);
        if (point && last && place && point.distanceTo(last) > place.radius * 0.03) {
          const sample = marginSampleAtRef.current(drag.tooth, point);
          if (sample) {
            drag.points.push(point);
            drag.samples.push(sample);
            drawMarginSketchRef.current(drag.points, false);
          }
        }
      } else if (drag.kind === "transform") {
        const patch = transformPatch(
          drag,
          drag.handle === "height" ? null : boxPlanePoint(drag.box),
          event.clientY,
          event.shiftKey,
        );
        if (patch) send({ type: "transform", tooth: drag.tooth, patch });
      } else if (drag.kind === "hook") {
        const placed = planePoint(drag.tooth);
        if (!placed) return;
        send({
          type: "hook-angle",
          tooth: drag.tooth,
          angle: ((placed.angle * 180) / Math.PI + 360) % 360,
        });
      } else if (drag.kind === "hole") {
        const target = holeTargetRef.current(drag.tooth);
        if (!target) return;
        const line = target.line();
        const holeTooth = drag.tooth;
        const crowns: THREE.Object3D[] = [];
        editLayerRef.current?.traverse((child) => {
          const hit = child.userData.editHit as EditHit | undefined;
          if (hit?.kind === "crown" && hit.tooth === holeTooth && !child.userData.holeWall) {
            crowns.push(child);
          }
        });
        let world: THREE.Vector3 | null = raycaster.intersectObjects(crowns, false)[0]?.point ?? null;
        if (!world) {
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(line.dir, line.origin);
          world = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        }
        if (!world) return;
        send({ type: "hole-move", tooth: drag.tooth, point: target.toLocalMm(world) });
      } else if (drag.kind === "hole-tip") {
        const target = holeTargetRef.current(drag.tooth);
        if (!target) return;
        const line = target.line();
        const facing = camera.getWorldDirection(new THREE.Vector3());
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(facing, line.origin);
        const at = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        if (!at) return;
        const dir = drag.end === "top" ? at.sub(line.origin) : line.origin.clone().sub(at);
        if (dir.lengthSq() < 1e-10) return;
        send({ type: "hole-dir", tooth: drag.tooth, dir: target.toLocalDir(dir) });
      } else if (drag.kind === "connector") {
        send({
          type: "connector",
          tooth: drag.tooth,
          along: drag.along0 + (event.clientX - drag.x0) / 240,
        });
      } else if (drag.kind === "insertion") {
        const dragKey = drag.key;
        const axis = insertionAxesRef.current.find((row) => row.key === dragKey);
        const rect = renderer.domElement.getBoundingClientRect();
        if (!axis) return;
        const dx = (event.clientX - lastPointer.x) / Math.max(rect.height, 1);
        const dy = (event.clientY - lastPointer.y) / Math.max(rect.height, 1);
        const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        axis.dir.addScaledVector(screenRight, dx * 2.6).addScaledVector(screenUp, -dy * 2.6);
        if (axis.dir.lengthSq() > 1e-8) axis.dir.normalize();
        syncInsertionMarkerRef.current();
        lastPointer = { x: event.clientX, y: event.clientY };
        const now = performance.now();
        if (lookRef.current.undercutMap && now - drag.at >= UNDERCUT_DRAG_MS) {
          drag.at = now;
          repaintUndercutNow(axis);
        }
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const endEditDrag = (event: PointerEvent) => {
      if (!drag) return;
      if (drag.kind === "insertion") {
        const aimedKey = drag.key;
        const aimed = insertionAxesRef.current.find((row) => row.key === aimedKey);
        if (!aimed || !lookRef.current.undercutMap || !repaintUndercutNow(aimed)) {
          for (const entry of loadedRef.current) entry.align = null;
        }
        setLoadVersion((value) => value + 1);
        if (aimed) onInsertionAxisAimedRef.current?.(aimed.toothNumbers);
      }
      if (drag.kind === "stroke") {
        drawMarginSketchRef.current([], false);
        if (drag.samples.length >= 2) {
          onDesignGestureRef.current?.({
            type: "margin-stroke",
            tooth: drag.tooth,
            samples: drag.samples,
          });
        }
      }
      drag = null;
      event.stopPropagation();
    };

    const onEditContext = (event: Event) => {
      if (!designEditRef.current) return;
      aim(event as PointerEvent);
      const hit = pickEdit();
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
    };

    renderer.domElement.addEventListener("pointerdown", onEditPointerDown, true);
    renderer.domElement.addEventListener("pointermove", onEditPointerMove, true);
    renderer.domElement.addEventListener("pointerup", endEditDrag, true);
    renderer.domElement.addEventListener("pointercancel", endEditDrag, true);
    renderer.domElement.addEventListener("contextmenu", onEditContext, true);

    let alignDown: { x: number; y: number } | null = null;
    const onAlignPointerDown = (event: PointerEvent) => {
      if (!manualRef.current.arch || manualRef.current.merging || event.button !== 0) {
        return;
      }
      alignDown = { x: event.clientX, y: event.clientY };
    };
    const onAlignPointerUp = (event: PointerEvent) => {
      const start = alignDown;
      alignDown = null;
      if (!start || !manualRef.current.arch || manualRef.current.merging) return;
      if (event.button !== 0) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      alignApiRef.current.pick(event);
    };
    renderer.domElement.addEventListener("pointerdown", onAlignPointerDown);
    renderer.domElement.addEventListener("pointerup", onAlignPointerUp);

    let occlusionDrag: {
      kind: "move" | "twist" | "tilt";
      arch: "upper" | "lower";
      pointerId: number;
      last: { x: number; y: number };
      pivot: THREE.Vector3;
      matrix: THREE.Matrix4;
    } | null = null;
    /** 그룹 안 좌표로 쓰는 화면 축. */
    const groupAxis = (column: number) => {
      const axis = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, column).normalize();
      const turn = groupRef.current?.getWorldQuaternion(new THREE.Quaternion());
      if (turn) axis.applyQuaternion(turn.invert());
      return axis;
    };
    const pivotOnScreen = (pivot: THREE.Vector3, rect: DOMRect) => {
      const world = pivot.clone();
      groupRef.current?.localToWorld(world);
      world.project(camera);
      return {
        x: rect.left + ((world.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - world.y) / 2) * rect.height,
      };
    };
    const onOcclusionDown = (event: PointerEvent) => {
      const occ = occlusionRef.current;
      const api = occlusionApiRef.current;
      if (!occ || occ.mode !== "free" || event.button !== 0 || !api) return;
      aim(event);
      const meshes = loadedRef.current
        .filter((entry) => entry.role === occ.arch && entry.mesh.visible)
        .map((entry) => entry.mesh);
      if (!raycaster.intersectObjects(meshes, false)[0]) return;
      const pivot = api.pivot(occ.arch);
      if (!pivot) return;
      api.ensureBase(occ.arch);
      api.begin();
      occlusionDrag = {
        kind: event.shiftKey ? "twist" : event.altKey ? "tilt" : "move",
        arch: occ.arch,
        pointerId: event.pointerId,
        last: { x: event.clientX, y: event.clientY },
        pivot,
        matrix: new THREE.Matrix4(),
      };
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // noop
      }
      renderer.domElement.style.cursor = "grabbing";
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onOcclusionMove = (event: PointerEvent) => {
      const drag = occlusionDrag;
      const api = occlusionApiRef.current;
      if (!drag || !api || event.pointerId !== drag.pointerId) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const height = Math.max(rect.height, 1);
      const dx = event.clientX - drag.last.x;
      const dy = event.clientY - drag.last.y;
      const pivot = drag.pivot.clone().applyMatrix4(drag.matrix);
      const around = (axis: THREE.Vector3, angle: number) =>
        new THREE.Matrix4()
          .makeTranslation(pivot.x, pivot.y, pivot.z)
          .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
          .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
      if (drag.kind === "move") {
        const perPx = (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6) / height;
        const shift = groupAxis(0)
          .multiplyScalar(dx * perPx)
          .addScaledVector(groupAxis(1), -dy * perPx);
        drag.matrix.premultiply(new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z));
      } else if (drag.kind === "twist") {
        const center = pivotOnScreen(pivot, rect);
        const before = Math.atan2(-(drag.last.y - center.y), drag.last.x - center.x);
        const after = Math.atan2(-(event.clientY - center.y), event.clientX - center.x);
        drag.matrix.premultiply(around(groupAxis(2), after - before));
      } else {
        const perPx = Math.PI / height;
        drag.matrix.premultiply(around(groupAxis(1), dx * perPx));
        drag.matrix.premultiply(around(groupAxis(0), dy * perPx));
      }
      drag.last = { x: event.clientX, y: event.clientY };
      api.preview(drag.arch, drag.matrix);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onOcclusionUp = (event: PointerEvent) => {
      const drag = occlusionDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      occlusionDrag = null;
      try {
        renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        // noop
      }
      renderer.domElement.style.cursor = "";
      occlusionApiRef.current?.bake(drag.arch, drag.matrix);
      event.stopImmediatePropagation();
    };
    renderer.domElement.addEventListener("pointerdown", onOcclusionDown, true);
    renderer.domElement.addEventListener("pointermove", onOcclusionMove, true);
    renderer.domElement.addEventListener("pointerup", onOcclusionUp, true);
    renderer.domElement.addEventListener("pointercancel", onOcclusionUp, true);

    let scanbodyDown: { x: number; y: number } | null = null;
    const onScanbodyPointerDown = (event: PointerEvent) => {
      if (!scanbodyPickRef.current.tooth || event.button !== 0) return;
      scanbodyDown = { x: event.clientX, y: event.clientY };
    };
    const onScanbodyPointerUp = (event: PointerEvent) => {
      const start = scanbodyDown;
      scanbodyDown = null;
      if (!start || !scanbodyPickRef.current.tooth || event.button !== 0) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      aim(event);
      scanbodyPickApiRef.current(raycaster);
    };
    renderer.domElement.addEventListener("pointerdown", onScanbodyPointerDown);
    renderer.domElement.addEventListener("pointerup", onScanbodyPointerUp);

    let marginDown: { x: number; y: number; button: number } | null = null;
    const onMarginPickDown = (event: PointerEvent) => {
      if (!marginSeedPickRef.current && !marginTraceApiRef.current.active()) return;
      if (event.button !== 0 && event.button !== 2) return;
      marginDown = { x: event.clientX, y: event.clientY, button: event.button };
    };
    const onMarginPickUp = (event: PointerEvent) => {
      const start = marginDown;
      marginDown = null;
      if (!start || start.button !== event.button) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      aim(event);
      const seedTooth = marginSeedPickRef.current;
      if (seedTooth) {
        if (event.button !== 0) return;
        const point = scanSurfaceHitRef.current(raycaster, seedTooth);
        if (point) {
          onMarginSeedPickRef.current?.(seedTooth, { x: point.x, y: point.y, z: point.z });
        }
        return;
      }
      if (event.button === 2) marginTraceApiRef.current.undo();
      else marginTraceApiRef.current.click(raycaster);
    };
    renderer.domElement.addEventListener("pointerdown", onMarginPickDown);
    renderer.domElement.addEventListener("pointerup", onMarginPickUp);

    const meshEditCtl = new ScanMeshEditController({
      dom: renderer.domElement,
      overlay: el,
      camera: () => cameraRef.current,
      targets: () =>
        jawEntries(loadedRef.current).map((entry) => ({
          id: entry.id,
          mesh: entry.mesh,
          scanColor: entry.scanColor,
        })),
      unitToMm: () => (unitToMmRef.current > 0 ? unitToMmRef.current : 1),
      ensureIndexed: (id) => meshEditHostRef.current.ensureIndexed(id),
      onStatus: (status) => onMeshEditStatusRef.current?.(status),
      onBegin: () => onMeshEditRef.current?.("start"),
      replaceShape: (id, shape) => meshEditHostRef.current.replaceShape(id, shape),
      onSculpted: (ids) => {
        meshEditHostRef.current.sculpted(ids);
        meshEditHostRef.current.finish();
      },
    });
    meshEditCtlRef.current = meshEditCtl;
    meshEditCtl.setSpec(meshEditRef.current ?? null);

    return () => {
      meshEditCtl.dispose();
      meshEditCtlRef.current = null;
      window.clearTimeout(viewTimerRef.current);
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onEditPointerDown, true);
      renderer.domElement.removeEventListener("pointermove", onEditPointerMove, true);
      renderer.domElement.removeEventListener("pointerup", endEditDrag, true);
      renderer.domElement.removeEventListener("pointercancel", endEditDrag, true);
      renderer.domElement.removeEventListener("contextmenu", onEditContext, true);
      renderer.domElement.removeEventListener("pointerdown", onAlignPointerDown);
      renderer.domElement.removeEventListener("pointerup", onAlignPointerUp);
      renderer.domElement.removeEventListener("pointerdown", onOcclusionDown, true);
      renderer.domElement.removeEventListener("pointermove", onOcclusionMove, true);
      renderer.domElement.removeEventListener("pointerup", onOcclusionUp, true);
      renderer.domElement.removeEventListener("pointercancel", onOcclusionUp, true);
      renderer.domElement.removeEventListener("pointerdown", onScanbodyPointerDown);
      renderer.domElement.removeEventListener("pointerup", onScanbodyPointerUp);
      renderer.domElement.removeEventListener("pointerdown", onMarginPickDown);
      renderer.domElement.removeEventListener("pointerup", onMarginPickUp);
      controls.removeEventListener("start", cancelSnap);
      controls.removeEventListener("change", onControlChange);
      controls.dispose();
      for (const entry of loadedRef.current) {
        group.remove(entry.mesh);
        disposeBackFaceShell(entry.mesh);
        releaseSceneGeometry(entry.geometry);
        releaseSceneTexture(entry.texture);
        const prev = entry.mesh.material;
        const list = Array.isArray(prev) ? prev : [prev];
        for (const old of list) old.dispose();
      }
      loadedRef.current = [];
      placementsRef.current = [];
      for (const child of [...badgeLayer.children]) {
        (child as CSS2DObject).element.remove();
        badgeLayer.remove(child);
      }
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
      const marker = insertionMarkerRef.current;
      if (marker) {
        scene.remove(marker);
        disposeObject3D(marker);
        insertionMarkerRef.current = null;
      }
      const edits = editLayerRef.current;
      if (edits) {
        scene.remove(edits);
        disposeObject3D(edits);
        editLayerRef.current = null;
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      labelRendererRef.current = null;
      badgeLayerRef.current = null;
      controlsRef.current = null;
      groupRef.current = null;
    };
  }, []);

  placeLoadedRef.current = (reseated) => {
    const group = groupRef.current;
    const loaded = loadedRef.current;
    if (!group || loaded.length === 0) return;
    group.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(group);
    if (!box.isEmpty()) {
      if (!reseated) {
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
      }
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      fitRadiusRef.current = Math.max(sphere.radius, 1);
    }
    const frame = estimateDentalFrame(loaded);
    frameRef.current = frame
      ? {
          up: frame.up.clone(),
          anterior: frame.anterior.clone(),
          right: frame.right.clone(),
        }
      : null;
    unitToMmRef.current = geometryUnitsToMm(fitRadiusRef.current);
    const framed = frame
      ? frameWorkOcclusal({
          loaded,
          groupPosition: group.position,
          frame,
          prepArch: lookRef.current.prepArch ?? null,
          toothNumbers: focusTeethRef.current,
        })
      : null;
    if (framed) {
      HOME_DIR.copy(framed.dir);
      HOME_UP.copy(framed.up);
      fitExtentRef.current = { halfW: framed.halfW, halfH: framed.halfH };
      fitTargetRef.current.copy(framed.target);
      placementsRef.current = framed.placements;
    } else {
      if (frame) applyDentalFrame(frame);
      const fit = measureMeshFit(loaded, group.position, HOME_DIR, HOME_UP);
      fitExtentRef.current = { halfW: fit.halfW, halfH: fit.halfH };
      fitTargetRef.current.copy(fit.target);
      placementsRef.current = [];
    }
    initialPoseRef.current = {
      dir: HOME_DIR.clone(),
      up: HOME_UP.clone(),
      target: fitTargetRef.current.clone(),
      halfW: fitExtentRef.current.halfW,
      halfH: fitExtentRef.current.halfH,
    };
    applyFitFrustum();
    frameCamera(HOME_DIR, HOME_UP, false);
    restyleLoaded();
    if (insertionAxesRef.current.length > 0) syncInsertionMarkerRef.current();
  };

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    viewArmedRef.current = false;
    window.clearTimeout(viewTimerRef.current);
    let cancelled = false;
    const gen = ++layoutGenRef.current;

    const clearGroup = () => {
      for (const entry of loadedRef.current) {
        group.remove(entry.mesh);
        disposeBackFaceShell(entry.mesh);
        releaseSceneGeometry(entry.geometry);
        releaseSceneTexture(entry.texture);
        const prev = entry.mesh.material;
        const list = Array.isArray(prev) ? prev : [prev];
        for (const old of list) old.dispose();
      }
      loadedRef.current = [];
      placementsRef.current = [];
      const layer = badgeLayerRef.current;
      if (layer) {
        for (const child of [...layer.children]) {
          (child as CSS2DObject).element.remove();
          layer.remove(child);
        }
      }
      group.clear();
      group.position.set(0, 0, 0);
    };

    const sources = itemsRef.current;
    insertionAxesRef.current = [];
    syncInsertionMarkerRef.current();
    onInsertionAxisChangeRef.current?.(false);
    if (sources.length === 0) {
      clearGroup();
      setParseNote("");
      setAnalyzing(false);
      setAligning(false);
      onScanColorChangeRef.current?.(false);
      setLoadVersion((v) => v + 1);
      return;
    }

    void (async () => {
      clearGroup();
      setParseNote("");
      const failed: string[] = [];
      const loaded: LoadedMesh[] = [];
      await Promise.all(
        sources.map(async (source) => {
          try {
            const parsed = await loadCachedScanPreview(source);
            if (cancelled) {
              releaseSceneGeometry(parsed.geometry);
              releaseSceneTexture(parsed.texture);
              return;
            }
            parsed.geometry.computeBoundingBox();
            if (!parsed.geometry.getAttribute("normal")) {
              parsed.geometry.computeVertexNormals();
            }
            const hasColor = isScanColorPreview(parsed.geometry, parsed.texture);
            const colorAttr = parsed.geometry.getAttribute("color");
            const mesh = new THREE.Mesh(parsed.geometry);
            loaded.push({
              id: source.id,
              role: source.role,
              mesh,
              geometry: parsed.geometry,
              texture: parsed.texture,
              hasColor,
              scanColor:
                colorAttr instanceof THREE.BufferAttribute ? colorAttr : null,
              dist: null,
              align: null,
              analysisColor: null,
              basePositions: captureBasePositions(parsed.geometry),
              filePositions: captureBasePositions(parsed.geometry),
              editedFileCoords: null,
              meshRevision: 0,
            });
          } catch {
            failed.push(source.fileName);
          }
        }),
      );
      if (cancelled) {
        for (const entry of loaded) {
          releaseSceneGeometry(entry.geometry);
          releaseSceneTexture(entry.texture);
        }
        return;
      }
      const latestRoles = new Map(
        itemsRef.current.map((item) => [item.id, item.role]),
      );
      for (const entry of loaded) {
        const nextRole = latestRoles.get(entry.id);
        if (nextRole) entry.role = nextRole;
      }
      const storedWork = jawsAlreadyStored(itemsRef.current);
      let seated = false;
      if (storedWork) {
        seated = estimateDentalFrame(loaded) != null;
      } else {
        setAligning(true);
        const job = startAlignJob();
        // 맞추는 과정을 보이도록 역할 색으로 먼저 올린다. loadedRef는 끝난 뒤에 넘긴다.
        for (const entry of loaded) {
          const mat = createModelPreviewMaterial(entry.geometry, entry.texture, {
            colorMapping: false,
          });
          mat.side = THREE.DoubleSide;
          mat.color.set(ROLE_COLOR[entry.role]);
          const prev = entry.mesh.material;
          for (const old of Array.isArray(prev) ? prev : [prev]) old.dispose();
          entry.mesh.material = mat;
          group.add(entry.mesh);
        }
        group.position.set(0, 0, 0);
        const box = new THREE.Box3().setFromObject(group);
        if (!box.isEmpty()) {
          group.position.sub(box.getCenter(new THREE.Vector3()));
          fitRadiusRef.current = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1);
          const fit = measureMeshFit(loaded, group.position, HOME_DIR, HOME_UP);
          fitExtentRef.current = { halfW: fit.halfW, halfH: fit.halfH };
          fitTargetRef.current.copy(fit.target);
          applyFitFrustum();
          frameCamera(HOME_DIR, HOME_UP, false);
        }
        let outcome: BiteAlignOutcome | null = null;
        try {
          outcome = await runBiteAlign(
            loaded,
            job,
            () => cancelled || gen !== layoutGenRef.current,
          );
        } catch (error) {
          console.info("[oral-scan] bite-fit failed", error);
        }
        if (cancelled || gen !== layoutGenRef.current) {
          for (const entry of loaded) {
            group.remove(entry.mesh);
            const mat = entry.mesh.material;
            for (const old of Array.isArray(mat) ? mat : [mat]) old.dispose();
            releaseSceneGeometry(entry.geometry);
            releaseSceneTexture(entry.texture);
          }
          return;
        }
        const userStopped = outcome?.stop === "revert";
        const frame = userStopped ? null : estimateDentalFrame(loaded);
        if (frame) reseatOcclusalOrigin(loaded, frame);
        seated = Boolean(frame);
        if (alignEpochRef.current === job.epoch) setAligning(false);
      }
      for (const entry of loaded) group.add(entry.mesh);
      loadedRef.current = loaded;
      if (manualRef.current.arch) layoutSplitRef.current(manualRef.current.arch);
      else placeLoadedRef.current(seated);
      onScanColorChangeRef.current?.(loaded.some((entry) => entry.hasColor));
      setParseNote(
        failed.length ? `열지 못했습니다: ${failed.join(", ")}` : "",
      );
      setLoadVersion((v) => v + 1);
      onMeshesReadyRef.current?.({
        deformed: dirtyScanRoles(loaded).size > 0,
        restore: true,
      });
      viewArmedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [itemsKey]);

  const restyleRef = useRef(restyleLoaded);
  restyleRef.current = restyleLoaded;

  const clearAlignMarks = () => {
    for (const entry of loadedRef.current) {
      const marks = entry.mesh.children.filter((child) => child.userData.alignPick);
      for (const child of marks) {
        child.traverse((obj) => {
          const label = obj as CSS2DObject;
          if (label.element?.isConnected) label.element.remove();
        });
        entry.mesh.remove(child);
        disposeObject3D(child);
      }
    }
  };
  clearAlignMarksRef.current = clearAlignMarks;

  const roleBounds = (role: string) => {
    const box = new THREE.Box3();
    let any = false;
    for (const entry of loadedRef.current) {
      if (entry.role !== role) continue;
      entry.geometry.computeBoundingBox();
      const bounds = entry.geometry.boundingBox;
      if (!bounds || bounds.isEmpty()) continue;
      box.union(bounds);
      any = true;
    }
    return any ? box : null;
  };

  const finishAlignedView = () => {
    const loaded = loadedRef.current;
    for (const entry of loaded) {
      entry.mesh.position.set(0, 0, 0);
      entry.dist = null;
      entry.align = null;
      rememberPositions(entry);
    }
    const seated = estimateDentalFrame(loaded);
    if (seated) {
      reseatOcclusalOrigin(loaded, seated);
      for (const entry of loaded) rememberPositions(entry);
    }
    manualRef.current.arch = null;
    manualRef.current.model = [];
    manualRef.current.bite = [];
    manualRef.current.skipLayout = true;
    placeLoadedRef.current(Boolean(seated));
    syncBadgesRef.current();
    setLoadVersion((value) => value + 1);
  };

  const layoutSplit = (arch: "upper" | "lower") => {
    const group = groupRef.current;
    const loaded = loadedRef.current;
    if (!group || loaded.length === 0) return;
    clearAlignMarks();
    manualRef.current.model = [];
    manualRef.current.bite = [];
    manualRef.current.arch = arch;
    for (const entry of loaded) entry.mesh.position.set(0, 0, 0);
    group.position.set(0, 0, 0);
    const archBox = roleBounds(arch);
    const biteBox = roleBounds("bite");
    if (!archBox || !biteBox) {
      restyleLoaded();
      return;
    }
    const frame = estimateDentalFrame(loaded);
    if (frame) applyDentalFrame(frame);
    frameRef.current = frame
      ? {
          up: frame.up.clone(),
          anterior: frame.anterior.clone(),
          right: frame.right.clone(),
        }
      : null;
    const viewDir = HOME_DIR.clone().normalize();
    const up = HOME_UP.clone();
    if (Math.abs(up.dot(viewDir)) > 0.92) up.set(0, 0, 1);
    up.normalize();
    const screenRight = new THREE.Vector3().crossVectors(viewDir, up);
    if (screenRight.lengthSq() < 1e-8) screenRight.set(1, 0, 0);
    screenRight.normalize();
    const archCenter = archBox.getCenter(new THREE.Vector3());
    const biteCenter = biteBox.getCenter(new THREE.Vector3());
    const halfAlong = (box: THREE.Box3) => {
      const size = box.getSize(new THREE.Vector3());
      return (
        0.5 *
        (Math.abs(size.x * screenRight.x) +
          Math.abs(size.y * screenRight.y) +
          Math.abs(size.z * screenRight.z))
      );
    };
    const archHalf = halfAlong(archBox);
    const biteHalf = halfAlong(biteBox);
    const gap = Math.max(archHalf, biteHalf) * 0.16;
    const halfSep = (archHalf + biteHalf + gap) * 0.5;
    const archOffset = screenRight.clone().multiplyScalar(-halfSep).sub(archCenter);
    const biteOffset = screenRight.clone().multiplyScalar(halfSep).sub(biteCenter);
    for (const entry of loaded) {
      if (entry.role === arch) entry.mesh.position.copy(archOffset);
      else if (entry.role === "bite") entry.mesh.position.copy(biteOffset);
    }
    group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    for (const entry of loaded) {
      if (entry.role !== arch && entry.role !== "bite") continue;
      entry.mesh.updateWorldMatrix(true, false);
      bounds.expandByObject(entry.mesh);
    }
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      group.position.sub(center);
      fitRadiusRef.current = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 1);
    }
    unitToMmRef.current = geometryUnitsToMm(fitRadiusRef.current);
    const shown = loaded.filter((entry) => entry.role === arch || entry.role === "bite");
    const fit = measureMeshFit(shown, group.position, HOME_DIR, HOME_UP);
    fitExtentRef.current = { halfW: fit.halfW, halfH: fit.halfH };
    fitTargetRef.current.copy(fit.target);
    applyFitFrustum();
    frameCamera(HOME_DIR, HOME_UP, false);
    restyleLoaded();
    syncBadgesRef.current();
  };
  layoutSplitRef.current = layoutSplit;

  const addAlignMark = (entry: LoadedMesh, local: THREE.Vector3, index: number) => {
    const radius = Math.max(fitRadiusRef.current * 0.014, 0.35);
    const colors = [0xef4444, 0x22c55e, 0xf59e0b];
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      new THREE.MeshBasicMaterial({
        color: colors[index] ?? 0xffffff,
        depthTest: false,
      }),
    );
    sphere.position.copy(local);
    sphere.renderOrder = 8;
    sphere.userData.alignPick = true;
    const tag = document.createElement("div");
    tag.textContent = String(index + 1);
    tag.style.cssText = [
      "width:16px",
      "height:16px",
      "margin-top:-8px",
      "border-radius:999px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font:700 10px/1 sans-serif",
      "color:#fff",
      "background:rgba(15,23,42,0.78)",
      "pointer-events:none",
    ].join(";");
    const label = new CSS2DObject(tag);
    label.position.set(0, radius * 2.1, 0);
    label.userData.alignPick = true;
    sphere.add(label);
    entry.mesh.add(sphere);
  };

  const runManualMerge = async () => {
    const arch = manualRef.current.arch;
    if (!arch || manualRef.current.merging) return;
    if (manualRef.current.model.length < 3 || manualRef.current.bite.length < 3) return;
    const loaded = loadedRef.current;
    const arches = loaded.filter((entry) => entry.role === arch);
    const bites = loaded.filter((entry) => entry.role === "bite");
    manualRef.current.merging = true;
    const job = startAlignJob();
    setAligning(true);
    const model = manualRef.current.model.map(
      (point) => [point.x, point.y, point.z] as [number, number, number],
    );
    const bite = manualRef.current.bite.map(
      (point) => [point.x, point.y, point.z] as [number, number, number],
    );
    let ok = false;
    try {
      ok = await mergeArchToBiteByPoints(
        arches.map((entry) => entry.geometry),
        bites.map((entry) => entry.geometry),
        model,
        bite,
        { cancelled: () => alignStopped(job) },
      );
    } catch (error) {
      console.info("[oral-scan] bite-points failed", error);
      ok = false;
    }
    if (alignStopped(job)) {
      manualRef.current.merging = false;
      if (alignEpochRef.current === job.epoch) {
        setAligning(false);
        onAlignCancelledRef.current?.();
      }
      return;
    }
    clearAlignMarks();
    manualRef.current.merging = false;
    setAligning(false);
    if (!ok) {
      manualRef.current.model = [];
      manualRef.current.bite = [];
      onAlignProgressRef.current?.({ model: 0, bite: 0 });
      onAlignFailedRef.current?.();
      return;
    }
    for (const entry of loaded) entry.mesh.position.set(0, 0, 0);
    finishAlignedView();
    onAlignProgressRef.current?.({ model: 0, bite: 0 });
    onAlignMergedRef.current?.(arch);
  };

  alignApiRef.current.pick = (event) => {
    const arch = manualRef.current.arch;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!arch || !renderer || !camera || manualRef.current.merging) return;
    groupRef.current?.updateWorldMatrix(true, true);
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const meshes = loadedRef.current
      .filter((entry) => entry.mesh.visible)
      .map((entry) => entry.mesh);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return;
    const entry = loadedRef.current.find((row) => row.mesh === hit.object);
    if (!entry) return;
    const side = entry.role === "bite" ? "bite" : entry.role === arch ? "model" : null;
    if (!side) return;
    const list = manualRef.current[side];
    if (list.length >= 3) return;
    const local = entry.mesh.worldToLocal(hit.point.clone());
    list.push(local);
    addAlignMark(entry, local, list.length - 1);
    onAlignProgressRef.current?.({
      model: manualRef.current.model.length,
      bite: manualRef.current.bite.length,
    });
    if (manualRef.current.model.length >= 3 && manualRef.current.bite.length >= 3) {
      void runManualMerge();
    }
  };

  alignAutoRef.current = async () => {
    const loaded = loadedRef.current;
    if (loaded.length === 0) return false;
    manualRef.current.merging = true;
    manualRef.current.skipLayout = true;
    clearAlignMarks();
    manualRef.current.model = [];
    manualRef.current.bite = [];
    manualRef.current.arch = null;
    const before = loaded.map((entry) => captureBasePositions(entry.geometry));
    const job = startAlignJob();
    for (const entry of loaded) {
      entry.mesh.position.set(0, 0, 0);
      restoreFilePositions(entry);
    }
    setAligning(true);
    placeLoadedRef.current(false);
    let ok = false;
    try {
      const outcome = await runBiteAlign(
        loaded,
        job,
        () => alignEpochRef.current !== job.epoch,
      );
      ok = outcome.seated;
      if (alignEpochRef.current !== job.epoch) return false;
      if (outcome.stop === "revert") {
        loaded.forEach((entry, index) => {
          const snap = before[index];
          if (snap) applyCapturedPositions(entry, snap);
        });
        const seated = estimateDentalFrame(loaded);
        placeLoadedRef.current(Boolean(seated));
        syncBadgesRef.current();
        setLoadVersion((value) => value + 1);
        return false;
      }
      const seated = estimateDentalFrame(loaded);
      if (seated) reseatOcclusalOrigin(loaded, seated);
      for (const entry of loaded) {
        entry.dist = null;
        entry.align = null;
        rememberPositions(entry);
      }
      placeLoadedRef.current(Boolean(seated));
      syncBadgesRef.current();
      setLoadVersion((value) => value + 1);
      return ok;
    } catch (error) {
      console.info("[oral-scan] bite-fit failed", error);
      return false;
    } finally {
      manualRef.current.merging = false;
      manualRef.current.skipLayout = false;
      if (alignEpochRef.current === job.epoch) setAligning(false);
    }
  };

  clearPicksRef.current = () => {
    if (manualRef.current.merging) return;
    clearAlignMarks();
    manualRef.current.model = [];
    manualRef.current.bite = [];
    onAlignProgressRef.current?.({ model: 0, bite: 0 });
  };

  exitAlignViewRef.current = () => {
    clearAlignMarks();
    manualRef.current.model = [];
    manualRef.current.bite = [];
    manualRef.current.arch = null;
    for (const entry of loadedRef.current) entry.mesh.position.set(0, 0, 0);
    if (loadedRef.current.length > 0) {
      const seated = estimateDentalFrame(loadedRef.current);
      placeLoadedRef.current(Boolean(seated));
    }
    syncBadgesRef.current();
  };

  useEffect(() => {
    const next = manualAlignArch ?? null;
    const prev = alignWatchRef.current;
    alignWatchRef.current = next;
    if (manualRef.current.skipLayout) {
      manualRef.current.skipLayout = false;
      manualRef.current.arch = next;
      return;
    }
    if (next === prev) return;
    manualRef.current.arch = next;
    manualRef.current.model = [];
    manualRef.current.bite = [];
    clearAlignMarksRef.current();
    onAlignProgressRef.current?.({ model: 0, bite: 0 });
    if (loadedRef.current.length === 0) return;
    if (!next) {
      exitAlignViewRef.current();
      return;
    }
    layoutSplitRef.current(next);
  }, [manualAlignArch]);

  const occlusionEntries = (arch: "upper" | "lower") =>
    loadedRef.current.filter((entry) => entry.role === arch);

  const settleOcclusion = () => {
    for (const entry of loadedRef.current) {
      if (entry.role !== "upper" && entry.role !== "lower") continue;
      entry.dist = null;
      entry.align = null;
      entry.analysisColor = null;
    }
    syncBadgesRef.current();
    setLoadVersion((value) => value + 1);
    occlusionLiveRef.current = false;
    onOcclusionEditRef.current?.("end");
  };

  occlusionApiRef.current = {
    ensureBase: (arch) => {
      const base = occlusionBaseRef.current;
      for (const entry of occlusionEntries(arch)) {
        if (!base.has(entry.id)) base.set(entry.id, captureBasePositions(entry.geometry));
      }
    },
    begin: () => {
      if (occlusionLiveRef.current) return;
      occlusionLiveRef.current = true;
      onOcclusionEditRef.current?.("start");
    },
    preview: (arch, matrix) => {
      const scale = new THREE.Vector3();
      for (const entry of occlusionEntries(arch)) {
        matrix.decompose(entry.mesh.position, entry.mesh.quaternion, scale);
      }
    },
    bake: (arch, matrix) => {
      const moved = !matrix.equals(new THREE.Matrix4());
      for (const entry of occlusionEntries(arch)) {
        entry.mesh.position.set(0, 0, 0);
        entry.mesh.quaternion.identity();
        if (!moved) continue;
        entry.geometry.applyMatrix4(matrix);
        entry.geometry.computeVertexNormals();
        entry.geometry.computeBoundingBox();
        entry.geometry.computeBoundingSphere();
      }
      settleOcclusion();
    },
    pivot: (arch) => {
      const box = new THREE.Box3();
      for (const entry of occlusionEntries(arch)) {
        if (!entry.geometry.boundingBox) entry.geometry.computeBoundingBox();
        const bounds = entry.geometry.boundingBox;
        if (bounds && !bounds.isEmpty()) box.union(bounds);
      }
      return box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
    },
    away: (arch) => {
      const frame = frameRef.current ?? estimateDentalFrame(loadedRef.current);
      const up = frame?.up.clone() ?? new THREE.Vector3(0, 0, 1);
      if (up.lengthSq() < 1e-8) up.set(0, 0, 1);
      up.normalize();
      return arch === "lower" ? up.negate() : up;
    },
    measureMm: (arch) => {
      const away = occlusionApiRef.current?.away(arch) ?? new THREE.Vector3(0, 0, 1);
      let sum = 0;
      let count = 0;
      for (const entry of occlusionEntries(arch)) {
        const base = occlusionBaseRef.current.get(entry.id);
        const pos = entry.geometry.getAttribute("position");
        if (!base || !pos || base.length !== pos.count * 3) continue;
        const step = Math.max(1, Math.floor(pos.count / 2000));
        for (let i = 0; i < pos.count; i += step) {
          sum +=
            (pos.getX(i) - (base[i * 3] ?? 0)) * away.x +
            (pos.getY(i) - (base[i * 3 + 1] ?? 0)) * away.y +
            (pos.getZ(i) - (base[i * 3 + 2] ?? 0)) * away.z;
          count += 1;
        }
      }
      return count > 0 ? (sum / count) * unitToMmRef.current : 0;
    },
    reset: (arch) => {
      const entries = occlusionEntries(arch).filter((entry) =>
        occlusionBaseRef.current.has(entry.id),
      );
      if (entries.length === 0) return;
      occlusionApiRef.current?.begin();
      for (const entry of entries) {
        const base = occlusionBaseRef.current.get(entry.id);
        entry.mesh.position.set(0, 0, 0);
        entry.mesh.quaternion.identity();
        if (base) applyCapturedPositions(entry, base);
        entry.geometry.computeBoundingSphere();
      }
      settleOcclusion();
    },
  };

  const verticalShift = (arch: "upper" | "lower", mm: number) => {
    const api = occlusionApiRef.current;
    if (!api) return null;
    api.ensureBase(arch);
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const shift = api.away(arch).multiplyScalar((mm - api.measureMm(arch)) / unit);
    return new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z);
  };

  meshEditHostRef.current = {
    replaceShape: (id, shape) => {
      const entry = loadedRef.current.find((row) => row.id === id);
      if (!entry) return;
      const oldFile = entry.editedFileCoords ?? entry.filePositions;
      swapScanGeometry(entry, {
        positions: shape.positions,
        index: new THREE.BufferAttribute(shape.index, 1),
        color: shape.color ? new THREE.BufferAttribute(shape.color, 3) : null,
        uv: shape.uv ? new THREE.BufferAttribute(shape.uv, 2) : null,
      });
      entry.editedFileCoords = gatherRows(oldFile, shape.origin, 3, Number.NaN);
      entry.basePositions = shape.positions.slice();
      entry.meshRevision += 1;
      occlusionBaseRef.current.delete(entry.id);
    },
    ensureIndexed: (id) => {
      const entry = loadedRef.current.find((row) => row.id === id);
      if (!entry) return;
      const geometry = entry.geometry;
      const positions = captureBasePositions(geometry);
      const count = positions.length / 3;
      const index = geometry.getIndex();
      let rows: Uint32Array;
      let nextIndex: Uint32Array;
      if (index) {
        rows = Uint32Array.from({ length: count }, (_, i) => i);
        nextIndex = Uint32Array.from(index.array as ArrayLike<number>);
      } else {
        const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
        const welded = weldVertices(positions, null, 1e-4 / unit);
        rows = welded.rep;
        nextIndex = welded.index;
      }
      const uv = geometry.getAttribute("uv");
      const uvRows = uv
        ? Float32Array.from({ length: uv.count * 2 }, (_, k) =>
            k % 2 === 0 ? uv.getX(k >> 1) : uv.getY(k >> 1),
          )
        : null;
      const color = gatherRows(readAttrTriples(entry.scanColor), rows, 3);
      const nextUv = gatherRows(uvRows, rows, 2);
      swapScanGeometry(entry, {
        positions: gatherRows(positions, rows, 3)!,
        index: new THREE.BufferAttribute(nextIndex, 1),
        color: color ? new THREE.BufferAttribute(color, 3) : null,
        uv: nextUv ? new THREE.BufferAttribute(nextUv, 2) : null,
      });
      entry.filePositions = gatherRows(entry.filePositions, rows, 3)!;
      entry.basePositions = gatherRows(entry.basePositions, rows, 3)!;
      entry.editedFileCoords = gatherRows(entry.editedFileCoords, rows, 3, Number.NaN);
      occlusionBaseRef.current.delete(entry.id);
      restyleRef.current();
    },
    sculpted: (ids) => {
      for (const id of ids) {
        const entry = loadedRef.current.find((row) => row.id === id);
        if (!entry) continue;
        if (!entry.editedFileCoords) entry.editedFileCoords = entry.filePositions;
        entry.basePositions = captureBasePositions(entry.geometry);
        entry.meshRevision += 1;
        entry.dist = null;
        entry.align = null;
        entry.analysisColor = null;
        occlusionBaseRef.current.delete(entry.id);
      }
    },
    finish: () => {
      syncBadgesRef.current();
      setLoadVersion((value) => value + 1);
      onMeshEditRef.current?.("end");
    },
  };

  const meshEditKey = meshEdit ? JSON.stringify(meshEdit) : "";
  useEffect(() => {
    meshEditCtlRef.current?.setSpec(meshEditRef.current ?? null);
  }, [meshEditKey]);

  useEffect(() => {
    meshEditCtlRef.current?.refresh();
  }, [loadVersion]);

  useEffect(() => {
    if (!meshEditRef.current) return;
    const timer = window.setTimeout(() => meshEditCtlRef.current?.refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [visible, ghostOpacity]);

  const occlusionArchKey = occlusionAdjust?.arch ?? null;
  useEffect(() => {
    if (occlusionLiveRef.current) {
      for (const entry of loadedRef.current) {
        entry.mesh.position.set(0, 0, 0);
        entry.mesh.quaternion.identity();
      }
      occlusionLiveRef.current = false;
      onOcclusionEditRef.current?.("end");
    }
    if (!occlusionArchKey) {
      occlusionBaseRef.current.clear();
      return;
    }
    occlusionApiRef.current?.ensureBase(occlusionArchKey);
  }, [occlusionArchKey]);

  useEffect(() => {
    const loaded = loadedRef.current;
    if (loaded.length === 0) return;
    const byId = new Map(itemsRef.current.map((item) => [item.id, item.role]));
    let changed = false;
    for (const entry of loaded) {
      const next = byId.get(entry.id);
      if (!next || next === entry.role) continue;
      changed = true;
    }
    if (!changed) return;
    const gen = ++layoutGenRef.current;
    for (const entry of loaded) {
      restoreBasePositions(entry);
      const next = byId.get(entry.id);
      if (next) entry.role = next;
    }
    const job = startAlignJob();
    setAligning(true);
    void (async () => {
      try {
        const outcome = await runBiteAlign(loaded, job, () => gen !== layoutGenRef.current);
        if (gen !== layoutGenRef.current || alignEpochRef.current !== job.epoch) return;
        const userStopped = outcome.stop === "revert";
        const seated = estimateDentalFrame(loaded);
        if (seated && !userStopped) reseatOcclusalOrigin(loaded, seated);
        if (manualRef.current.arch) layoutSplitRef.current(manualRef.current.arch);
        else placeLoadedRef.current(Boolean(seated));
        setLoadVersion((version) => version + 1);
        if (!userStopped) {
          onMeshesReadyRef.current?.({
            deformed: dirtyScanRoles(loaded).size > 0,
            restore: false,
          });
        }
      } finally {
        if (gen === layoutGenRef.current && alignEpochRef.current === job.epoch) {
          setAligning(false);
        }
      }
    })();
  }, [roleKey]);

  useEffect(() => {
    const loaded = loadedRef.current;
    const look = lookRef.current;
    if (loaded.length === 0 || (!look.contactMap && !look.undercutMap)) {
      setAnalyzing(false);
      return;
    }
    const frame = frameRef.current;
    const anchors = anchorsFromAxes(
      insertionAxesRef.current,
      placementsRef.current,
      groupRef.current?.position ?? new THREE.Vector3(),
    );
    const pending = loaded.some((entry) => {
      const needsDist =
        look.contactMap &&
        antagonistRole(entry.role, prepArch) != null &&
        entry.dist == null;
      const needsAlign =
        look.undercutMap &&
        entry.align == null &&
        (anchors.some((anchor) => anchor.arch === entry.role) ||
          insertionForRole(entry.role, prepArch, frame, null) != null);
      return needsDist || needsAlign;
    });
    if (!pending) {
      setAnalyzing(false);
      return;
    }
    let cancelled = false;
    setAnalyzing(true);
    void fillDesignAnalysis(
      loaded,
      prepArch,
      frame,
      unitToMmRef.current,
      () => cancelled,
      anchors,
    ).then(() => {
      if (cancelled) return;
      setAnalyzing(false);
      restyleRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [prepArch, loadVersion, contactMap, undercutMap]);

  useEffect(() => {
    const opacity = lookRef.current.ghostOpacity;
    const prep = lookRef.current.prepArch;
    const split = manualRef.current.arch;
    for (const entry of loadedRef.current) {
      const ghostOff = isGhostScanRole(entry.role, prep) && opacity <= 0.001;
      const hidden =
        split != null && entry.role !== split && entry.role !== "bite";
      const forced = split != null && (entry.role === split || entry.role === "bite");
      entry.mesh.visible = forced
        ? true
        : !hidden &&
          !ghostOff &&
          visible[entry.id] !== false &&
          !dieHideRef.current(entry.role);
    }
    for (const child of dieLayerRef.current?.children ?? []) {
      child.visible = dieShownRef.current(String(child.userData.dieTooth || ""));
    }
    if (stoneLayerRef.current) stoneLayerRef.current.visible = stoneShown;
  }, [
    visible,
    loadVersion,
    ghostOpacity,
    prepArch,
    manualAlignArch,
    showDies,
    hiddenKey,
    dieReadyKey,
    stoneShown,
    stoneVersion,
  ]);

  useEffect(() => {
    restyleLoaded();
  }, [
    colorMapping,
    ghostOpacity,
    prepArch,
    contactMap,
    undercutMap,
    occlusalGapMm,
    contactMode,
    undercutLimit,
    designEdit?.prepBackTransparent,
    loadVersion,
  ]);

  setViewRef.current = (preset) => {
    const frame = frameRef.current;
    const loaded = loadedRef.current;
    if (preset === "fit" || !frame || loaded.length === 0) {
      const camera = cameraRef.current;
      const curDir = camera
        ? camera.position.clone().sub(fitTargetRef.current).normalize()
        : HOME_DIR;
      const curUp = camera ? camera.up.clone() : HOME_UP;
      frameCamera(curDir, curUp, true, true);
      return;
    }
    const arch = pickCameraArch(prepArch, placementsRef.current, loaded) ?? "lower";
    if (preset === "occlusal") {
      const pose = occlusalCamera(frame, arch);
      frameCamera(pose.dir, pose.up, true, true);
      return;
    }
    if (preset === "buccal") {
      const up = arch === "upper" ? frame.up.clone().negate() : frame.up.clone();
      frameCamera(frame.anterior, up, true, true);
      return;
    }
    if (preset === "lingual") {
      const up = arch === "upper" ? frame.up.clone().negate() : frame.up.clone();
      frameCamera(frame.anterior.clone().negate(), up, true, true);
      return;
    }
  };

  /** 화면 오른쪽·위·앞(카메라 쪽)이 X·Y·Z가 되게 스캔과 월드 좌표를 원점 기준으로 돌린다. 화면은 그대로다. */
  const turnWorldToViewRef = useRef<() => void>(() => {});
  turnWorldToViewRef.current = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || loadedRef.current.length === 0) return;
    camera.updateMatrixWorld(true);
    const sx = new THREE.Vector3();
    const sy = new THREE.Vector3();
    const sz = new THREE.Vector3();
    camera.matrixWorld.extractBasis(sx, sy, sz);
    sx.normalize();
    sy.normalize();
    sz.normalize();
    if (sx.x > 1 - 1e-6 && sy.y > 1 - 1e-6 && sz.z > 1 - 1e-6) return;
    const rot = new THREE.Matrix4().makeBasis(sx, sy, sz).transpose();
    const turn = (value: THREE.Vector3) => value.applyMatrix4(rot);

    groupRef.current?.updateWorldMatrix(true, true);
    const jawTurns = new Map<string, THREE.Matrix4>();
    for (const entry of loadedRef.current) {
      const world = entry.mesh.matrixWorld.clone();
      const local = world.clone().invert().multiply(rot).multiply(world);
      entry.geometry.applyMatrix4(local);
      entry.geometry.computeBoundingBox();
      entry.geometry.computeBoundingSphere();
      entry.basePositions = transformPositions(entry.basePositions, local);
      entry.align = null;
      jawTurns.set(entry.id, local);
    }

    placementsRef.current = placementsRef.current.map((place) => ({
      ...place,
      center: turn(place.center.clone()),
    }));
    for (const axis of insertionAxesRef.current) {
      turn(axis.dir);
      turn(axis.origin);
      turn(axis.view.position);
      turn(axis.view.target);
      turn(axis.view.up);
    }
    const frame = frameRef.current;
    if (frame) {
      turn(frame.up);
      turn(frame.anterior);
      turn(frame.right);
    }
    turn(HOME_DIR);
    turn(HOME_UP);
    const pose = initialPoseRef.current;
    if (pose) {
      turn(pose.dir);
      turn(pose.up);
      turn(pose.target);
    }
    turn(fitTargetRef.current);
    for (const point of scanbodyPickRef.current.points) turn(point);
    scanbodyMarksRef.current?.applyMatrix4(rot);
    for (const point of marginTraceRef.current.points) turn(point);
    marginSketchRef.current?.applyMatrix4(rot);
    dieLayerRef.current?.applyMatrix4(rot);
    dieCacheRef.current = new Map();
    nearbyScanRef.current.clear();

    snapRef.current = null;
    turn(camera.position);
    turn(camera.up);
    turn(controls.target);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.syncFromCamera();

    onWorldTurnedRef.current?.({
      vector: (value) => {
        const out = new THREE.Vector3(value[0], value[1], value[2]).applyMatrix4(rot);
        return [out.x, out.y, out.z];
      },
      jaw: (id, positions) => {
        const local = jawTurns.get(id);
        return local ? transformPositions(positions, local) : positions;
      },
    });
  };

  focusToothRef.current = (raw) => {
    const digits = fdiDigits(raw);
    const place = placementsRef.current.find((row) => row.toothNumber === digits);
    const frame = frameRef.current;
    if (!place || !frame) return;
    const pose = occlusalCamera(frame, place.arch);
    const half = toothWindowHalf([place], fitRadiusRef.current);
    fitExtentRef.current = { halfW: half, halfH: half };
    fitTargetRef.current.copy(place.center);
    HOME_DIR.copy(pose.dir);
    HOME_UP.copy(pose.up);
    applyFitFrustum();
    frameCamera(pose.dir, pose.up, true, true);
  };

  holeTargetRef.current = (tooth) => {
    const place = placementsRef.current.find((row) => row.toothNumber === tooth);
    const edit = designEditRef.current?.edits[tooth];
    if (!place || !edit) return null;
    const up = frameRef.current?.up ?? new THREE.Vector3(0, 0, 1);
    const normal = insertionDirByTooth(insertionAxesRef.current).get(tooth)?.clone() ?? up.clone();
    if (normal.lengthSq() < 1e-8) normal.copy(up);
    normal.normalize();
    const right = frameRef.current?.right ?? new THREE.Vector3(1, 0, 0);
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const inverse = basisQuaternion(normal, right).invert();
    const pose = edit.implant.on ? implantPose(place, normal, edit.implant) : null;
    return {
      edit,
      toLocalMm: (world) => {
        const v = world.clone().sub(place.center).applyQuaternion(inverse).multiplyScalar(unit);
        return [v.x, v.y, v.z];
      },
      toLocalDir: (dir) => {
        const v = dir.clone().applyQuaternion(inverse).normalize();
        return [v.x, v.y, v.z];
      },
      line: (hole = {}) =>
        screwHoleLine({
          place,
          normal,
          right,
          edit: { ...edit, hole: { ...edit.hole, ...hole } },
          unitToMm: unit,
          axis: pose ? { origin: pose.top, dir: pose.axis } : null,
        }),
    };
  };

  viewHoleAxisRef.current = (raw) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const target = holeTargetRef.current(fdiDigits(raw));
    if (!camera || !controls || !target) return false;
    if (!target.edit.hole.on && !(target.edit.implant.on && target.edit.implant.screwHole)) {
      return false;
    }
    const line = target.line();
    const focus = (line.top ?? line.origin).clone();
    const distance = Math.max(camera.position.distanceTo(controls.target), 1);
    const up = camera.up.clone().addScaledVector(line.dir, -camera.up.dot(line.dir));
    if (up.lengthSq() < 1e-8) {
      up.copy(frameRef.current?.anterior ?? new THREE.Vector3(0, 1, 0));
      up.addScaledVector(line.dir, -up.dot(line.dir));
    }
    up.normalize();
    fitTargetRef.current.copy(focus);
    snapRef.current = {
      start: performance.now(),
      duration: 280,
      fromPos: camera.position.clone(),
      toPos: focus.clone().addScaledVector(line.dir, distance),
      fromUp: camera.up.clone(),
      toUp: up,
      fromTarget: controls.target.clone(),
      toTarget: focus,
      fromZoom: camera.zoom,
      toZoom: camera.zoom,
      fromLeft: camera.left,
      toLeft: camera.left,
      fromRight: camera.right,
      toRight: camera.right,
      fromTop: camera.top,
      toTop: camera.top,
      fromBottom: camera.bottom,
      toBottom: camera.bottom,
      save: true,
    };
    return true;
  };

  restoreInsertionViewRef.current = (toothNumbers) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const key = insertionAxisKey(toothNumbers);
    const digits = toothNumbers.map((tooth) => fdiDigits(tooth)).filter(Boolean);
    const axis =
      insertionAxesRef.current.find((row) => row.key === key) ??
      insertionAxesRef.current.find((row) =>
        digits.some((tooth) => row.toothNumbers.includes(tooth)),
      );
    if (!camera || !controls || !axis?.view) return false;
    const view = axis.view;
    fitTargetRef.current.copy(view.target);
    snapRef.current = {
      start: performance.now(),
      duration: 280,
      fromPos: camera.position.clone(),
      toPos: view.position.clone(),
      fromUp: camera.up.clone(),
      toUp: view.up.clone(),
      fromTarget: controls.target.clone(),
      toTarget: view.target.clone(),
      fromZoom: camera.zoom,
      toZoom: view.zoom,
      fromLeft: camera.left,
      toLeft: view.left,
      fromRight: camera.right,
      toRight: view.right,
      fromTop: camera.top,
      toTop: view.top,
      fromBottom: camera.bottom,
      toBottom: view.bottom,
      save: true,
    };
    return true;
  };

  syncBadgesRef.current = () => {
    const layer = badgeLayerRef.current;
    if (!layer) return;
    for (const child of [...layer.children]) {
      (child as CSS2DObject).element.remove();
      layer.remove(child);
    }
    if (manualRef.current.arch) return;
    const frame = frameRef.current;
    const used = new Set<string>();
    const placeOnRing = (button: HTMLButtonElement, parent: HTMLElement) => {
      button.type = "button";
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectToothRef.current?.(button.dataset.tooth ?? button.textContent ?? "");
      });
      parent.appendChild(button);
    };
    if (showInsertionRef.current) {
      for (const axis of insertionAxesRef.current) {
        const rows = badgesRef.current.filter((badge) =>
          axis.toothNumbers.includes(fdiDigits(badge.toothNumber)),
        );
        if (rows.length === 0 || !axis.origin) continue;
        const wrap = document.createElement("div");
        wrap.className = "pointer-events-auto flex items-center justify-center";
        for (const badge of rows) {
          const button = document.createElement("button");
          button.textContent = badge.label ?? badge.toothNumber;
          button.dataset.tooth = badge.toothNumber;
          button.className = badge.active
            ? "rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground"
            : "rounded-full bg-background/95 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-foreground shadow-sm";
          placeOnRing(button, wrap);
          used.add(fdiDigits(badge.toothNumber));
        }
        const label = new CSS2DObject(wrap);
        label.position.copy(
          insertionRingCenter(
            axis.origin,
            axis.dir,
            axis.radius,
            unitToMmRef.current,
          ),
        );
        label.center.set(0.5, 0.5);
        layer.add(label);
      }
    }
    if (!frame) return;
    const placeOf = (tooth: string) =>
      placementsRef.current.find((row) => row.toothNumber === fdiDigits(tooth));
    for (const badge of badgesRef.current) {
      const digits = fdiDigits(badge.toothNumber);
      if (!digits || used.has(digits)) continue;
      const place = placeOf(digits);
      if (!place) continue;
      const spanPlaces = (badge.span ?? []).flatMap((tooth) => {
        const row = placeOf(tooth);
        return row ? [row] : [];
      });
      const center =
        spanPlaces.length > 1
          ? spanPlaces
              .reduce((sum, row) => sum.add(row.center), new THREE.Vector3())
              .multiplyScalar(1 / spanPlaces.length)
          : place.center;
      const pose = occlusalCamera(frame, place.arch);
      const lift = Math.max(place.radius * 0.2, fitRadiusRef.current * 0.008);
      const button = document.createElement("button");
      button.textContent = badge.label ?? badge.toothNumber;
      button.className = badge.active
        ? "pointer-events-auto rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-sm"
        : "pointer-events-auto rounded-md border border-border bg-background/95 px-2 py-1 text-xs font-semibold text-foreground shadow-sm";
      button.type = "button";
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectToothRef.current?.(badge.toothNumber);
      });
      const label = new CSS2DObject(button);
      label.position.copy(center).addScaledVector(pose.dir, lift);
      label.center.set(0.5, 0.5);
      layer.add(label);
    }
    if (showInsertionRef.current) return;
    for (const chip of connectorChipsRef.current) {
      const from = placeOf(chip.from);
      const to = placeOf(chip.to);
      if (!from || !to) continue;
      const pose = occlusalCamera(frame, from.arch);
      const lift = Math.max(
        Math.max(from.radius, to.radius) * 0.2,
        fitRadiusRef.current * 0.008,
      );
      const button = document.createElement("button");
      button.type = "button";
      button.title = `${chip.from}-${chip.to} 커넥터`;
      button.setAttribute("aria-label", `${chip.from}-${chip.to} 커넥터 편집`);
      button.className = cn(
        "pointer-events-auto flex h-5 w-5 items-center justify-center rounded-full border shadow-sm",
        chip.active
          ? "border-primary bg-primary text-primary-foreground"
          : chip.weak
            ? "border-destructive bg-background/95 text-destructive"
            : "border-border bg-background/95 text-muted-foreground",
      );
      button.innerHTML = LINK_ICON_SVG;
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectConnectorRef.current?.(chip.from);
      });
      const label = new CSS2DObject(button);
      label.position
        .copy(from.center)
        .lerp(to.center, 0.5)
        .addScaledVector(pose.dir, lift);
      label.center.set(0.5, 0.5);
      layer.add(label);
    }
  };

  const badgeKey = [
    ...toothBadges.map(
      (badge) =>
        `${badge.toothNumber}:${badge.label ?? ""}:${badge.active ? 1 : 0}:${(badge.span ?? []).join(",")}`,
    ),
    ...connectorChips.map(
      (chip) => `c${chip.from}-${chip.to}:${chip.weak ? 1 : 0}:${chip.active ? 1 : 0}`,
    ),
  ].join("|");

  useEffect(() => {
    syncBadgesRef.current();
  }, [badgeKey, loadVersion, showInsertionAxis]);

  syncInsertionMarkerRef.current = () => {
    const scene = sceneRef.current;
    const prev = insertionMarkerRef.current;
    if (prev && scene) {
      scene.remove(prev);
      disposeObject3D(prev);
    }
    insertionMarkerRef.current = null;
    const axes = insertionAxesRef.current;
    if (!scene || !showInsertionRef.current || axes.length === 0) return;
    const layer = new THREE.Group();
    for (const axis of axes) {
      const origin = axis.origin?.clone() ?? null;
      const radius =
        axis.radius > 0
          ? axis.radius
          : Math.max(fitRadiusRef.current * 0.08, 1);
      if (!origin) continue;
      layer.add(
        buildInsertionMarker(
          origin,
          radius,
          axis.dir,
          axis.key,
          unitToMmRef.current,
        ),
      );
    }
    if (layer.children.length === 0) return;
    scene.add(layer);
    insertionMarkerRef.current = layer;
  };

  useEffect(() => {
    syncInsertionMarkerRef.current();
  }, [showInsertionAxis]);

  resetHomeRef.current = () => {
    const pose = initialPoseRef.current;
    if (!pose) return;
    fitExtentRef.current = { halfW: pose.halfW, halfH: pose.halfH };
    fitTargetRef.current.copy(pose.target);
    applyFitFrustum();
    frameCamera(pose.dir, pose.up, true, true);
  };

  /** 치아 주변 스캔 삼각형을 그 치아 삽입축 프레임으로. 치아·스캔이 없으면 null. */
  const toothMarginFrame = (raw: string) => {
    const tooth = fdiDigits(raw);
    if (!tooth) return null;
    const place = placementsRef.current.find((row) => row.toothNumber === tooth);
    if (!place || !(place.radius > 0)) return null;
    const right = frameRef.current?.right ?? new THREE.Vector3(1, 0, 0);
    const fallback = frameRef.current?.up ?? new THREE.Vector3(0, 0, 1);
    const axis = insertionAxesRef.current.find((row) => row.toothNumbers.includes(tooth));
    const normal = axis?.dir ?? fallback;
    const loaded = loadedRef.current;
    let entries = loaded.filter((entry) => entry.role === place.arch);
    if (entries.length === 0) {
      entries = loaded.filter((entry) => entry.role === "upper" || entry.role === "lower");
    }
    if (entries.length === 0) entries = loaded;
    if (entries.length === 0) return null;
    const triangles = collectProjectedMarginTriangles(
      entries,
      place.center,
      normal,
      right,
      place.radius,
    );
    return { place, normal, right, triangles };
  };

  setInsertionFromViewRef.current = (toothNumbers, options) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const key = insertionAxisKey(toothNumbers);
    if (!camera || !controls || !key) return false;
    const keyTeeth = insertionAxisTeeth(key);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    groupRef.current?.updateWorldMatrix(true, true);
    const places: ToothPlacement[] = [];
    for (const tooth of keyTeeth) {
      const place = placementsRef.current.find(
        (row) => row.toothNumber === tooth,
      );
      if (place) places.push(place);
    }
    const center = new THREE.Vector3();
    let radius = 0;
    for (const place of places) {
      center.add(place.center);
      radius = Math.max(radius, place.radius);
    }
    if (places.length > 0) center.multiplyScalar(1 / places.length);
    else center.copy(controls.target);
    if (!(radius > 0)) {
      const height =
        Math.abs(camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6);
      radius = Math.max(height * 0.06, 1);
    }
    const toothRadius = radius;
    const arch = places[0]?.arch;
    const loaded = loadedRef.current.filter((entry) => entry.mesh.visible);
    const scoped = arch
      ? loaded.filter((entry) => entry.role === arch)
      : loaded;
    const meshes = (scoped.length > 0 ? scoped : loaded).map(
      (entry) => entry.mesh,
    );
    const view = viewCenterHit(camera, meshes);
    const look = view.dir;
    if (look.lengthSq() < 1e-8) return false;
    let contact = view.point;
    if (!contact) contact = rayToothContact(center, look, toothRadius, meshes);
    if (!contact && places.length > 0) contact = center.clone();
    if (!contact) contact = controls.target.clone();
    placementsRef.current = alignPlacementsToPoint(
      placementsRef.current,
      keyTeeth,
      contact,
      toothRadius,
    );
    const framed = fitExtentRef.current.halfH;
    radius = Math.max(Math.min(toothRadius * 0.48, framed * 0.2), 0.6);
    const kept = insertionAxesRef.current.filter((axis) => axis.key !== key);
    kept.push({
      key,
      toothNumbers: keyTeeth,
      dir: look.clone(),
      origin: contact,
      radius,
      view: {
        position: camera.position.clone(),
        target: controls.target.clone(),
        up: camera.up.clone(),
        zoom: camera.zoom,
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
      },
    });
    insertionAxesRef.current = kept;
    for (const entry of loadedRef.current) entry.align = null;
    if (!options?.preview) turnWorldToViewRef.current();
    syncInsertionMarkerRef.current();
    syncBadgesRef.current();
    onInsertionAxisChangeRef.current?.(kept.length > 0);
    setLoadVersion((v) => v + 1);
    return true;
  };

  /** 보이는 보철 조각을 그룹별 월드 삼각형으로 모은다. union 그룹은 합집합. 행렬은 미리 갱신해 둔다. */
  const collectRestorations = (groups: DesignStlExportInput["groups"]) => {
    const exported = new Set<EditHit["kind"]>(["crown", "connector", "hook"]);
    const collected = groups.map((row) => {
      const teeth = new Set(row.teeth);
      const parts: Array<{ mesh: THREE.Mesh; hit: EditHit & { tooth: string } }> = [];
      editLayerRef.current?.traverse((child) => {
        const hit = child.userData.editHit as EditHit | undefined;
        if (!hit || !exported.has(hit.kind) || !("tooth" in hit)) return;
        if (!teeth.has(hit.tooth) || !child.visible) return;
        if ((child as THREE.Mesh).isMesh) parts.push({ mesh: child as THREE.Mesh, hit });
      });
      return { row, parts };
    });
    return Promise.all(
      collected.map(async ({ row, parts }) => {
        if (!row.union) {
          return {
            fileName: row.fileName,
            positions: worldTriangles(parts.map((part) => part.mesh)),
          };
        }
        // 스크루 홀 크라운은 본체와 홀 벽이 합쳐져야 닫힌 입체가 된다.
        const pieces = new Map<string, THREE.Mesh[]>();
        for (const { mesh, hit } of parts) {
          const key = hit.kind === "crown" ? `crown:${hit.tooth}` : mesh.uuid;
          pieces.set(key, [...(pieces.get(key) ?? []), mesh]);
        }
        return {
          fileName: row.fileName,
          positions: await unionTriangleSoups(
            [...pieces.values()].map((meshes) => worldTriangles(meshes)),
            row.union.label,
          ),
        };
      }),
    );
  };

  useImperativeHandle(
    ref,
    () => ({
      setView: (preset) => setViewRef.current(preset),
      focusTooth: (toothNumber) => focusToothRef.current(toothNumber),
      restoreInsertionView: (toothNumbers) =>
        restoreInsertionViewRef.current(toothNumbers),
      viewHoleAxis: (toothNumber) => viewHoleAxisRef.current(toothNumber),
      saveImage: () => saveImageRef.current(),
      captureCanvas: () => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return null;
        renderer.render(scene, camera);
        return renderer.domElement;
      },
      captureConnectorSection: (link, connector) => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return null;
        const place = connectorFrame({
          placements: placementsRef.current,
          frame: frameRef.current,
          insertionByTooth: insertionDirByTooth(insertionAxesRef.current),
          unitToMm: unitToMmRef.current,
          link,
          connector: { ...connector, shiftXMm: 0, shiftYMm: 0 },
        });
        if (!place) return null;
        const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
        const half = place.radius * 1.35;
        const size = renderer.getSize(new THREE.Vector2());
        const ratio = renderer.getPixelRatio();
        const px = Math.floor(Math.min(size.x, size.y, 320));
        if (px < 32) return null;
        const hidden: THREE.Object3D[] = [];
        editLayerRef.current?.traverse((child) => {
          const hit = child.userData.editHit as EditHit | undefined;
          if (hit?.kind !== "connector" && hit?.kind !== "margin" && hit?.kind !== "margin-line") {
            return;
          }
          if (!child.visible) return;
          child.visible = false;
          hidden.push(child);
        });
        const background = scene.background;
        scene.background = new THREE.Color(0xe5e7eb);
        const out: ConnectorSectionShot["sides"] = [];
        try {
          renderer.setScissorTest(true);
          renderer.setViewport(0, 0, px, px);
          renderer.setScissor(0, 0, px, px);
          for (const side of [
            { tooth: link.from, look: place.axis.clone().negate(), mirrored: true },
            { tooth: link.to, look: place.axis.clone(), mirrored: false },
          ]) {
            const shot = new THREE.OrthographicCamera(
              -half,
              half,
              half,
              -half,
              half * 0.02,
              place.span * 2 + half * 4,
            );
            shot.position.copy(place.mid);
            shot.up.copy(place.up);
            shot.lookAt(place.mid.clone().add(side.look));
            shot.updateProjectionMatrix();
            shot.updateMatrixWorld(true);
            renderer.render(scene, shot);
            const canvas = document.createElement("canvas");
            canvas.width = px * ratio;
            canvas.height = px * ratio;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            ctx.drawImage(
              renderer.domElement,
              0,
              (size.y - px) * ratio,
              px * ratio,
              px * ratio,
              0,
              0,
              canvas.width,
              canvas.height,
            );
            out.push({
              tooth: side.tooth,
              image: canvas.toDataURL("image/png"),
              mirrored: side.mirrored,
            });
          }
        } finally {
          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, size.x, size.y);
          scene.background = background;
          for (const child of hidden) child.visible = true;
          renderer.render(scene, camera);
        }
        if (out.length === 0) return null;
        return { halfMm: half * unit, sides: out };
      },
      fitScanbody: (toothNumber, radiusMm) => fitScanbodyRef.current(toothNumber, radiusMm),
      fitScanbodyMesh: (toothNumber, candidates, current) =>
        fitScanbodyMeshRef.current(toothNumber, candidates, current),
      clearScanbodyPicks: () => {
        clearScanbodyMarksRef.current();
        onScanbodyPicksRef.current?.(0);
      },
      buildStoneModel: (input) => buildStoneModelRef.current(input),
      clearStoneModel: () => clearStoneModelRef.current(true),
      exportDesignStl: async ({ groups, scans, stoneParts = [], camCoordinates }) => {
        const scene = sceneRef.current;
        const group = groupRef.current;
        if (!scene || !group) return [];
        scene.updateMatrixWorld(true);
        const restorations = await collectRestorations(groups);
        const scanRows = scans.map((row) => ({
          fileName: row.fileName,
          positions: worldTriangles(
            loadedRef.current
              .filter((entry) => entry.role === row.role)
              .map((entry) => entry.mesh),
          ),
        }));
        const partsById = new Map(stonePartsRef.current.map((part) => [part.id, part]));
        const modelRows = stoneParts.flatMap((row) => {
          const part = partsById.get(row.id);
          return part ? [{ fileName: row.fileName, positions: part.positions.slice() }] : [];
        });
        const origin = new THREE.Vector3();
        let scale = 1;
        if (camCoordinates) {
          origin.copy(group.position);
        } else {
          scale = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
          const pool = restorations.some((row) => row.positions.length > 0)
            ? restorations
            : scanRows.some((row) => row.positions.length > 0)
              ? scanRows
              : modelRows;
          let count = 0;
          for (const row of pool) {
            for (let i = 0; i < row.positions.length; i += 3) {
              origin.x += row.positions[i]!;
              origin.y += row.positions[i + 1]!;
              origin.z += row.positions[i + 2]!;
              count += 1;
            }
          }
          if (count > 0) origin.multiplyScalar(1 / count);
        }
        const files: Array<{ fileName: string; blob: Blob }> = [];
        for (const row of [...restorations, ...scanRows, ...modelRows]) {
          if (row.positions.length === 0) continue;
          const out = row.positions;
          for (let i = 0; i < out.length; i += 3) {
            out[i] = (out[i]! - origin.x) * scale;
            out[i + 1] = (out[i + 1]! - origin.y) * scale;
            out[i + 2] = (out[i + 2]! - origin.z) * scale;
          }
          files.push({ fileName: row.fileName, blob: encodeBinaryStl(out) });
        }
        return files;
      },
      restorationSolids: async (groups) => {
        const scene = sceneRef.current;
        const group = groupRef.current;
        if (!scene || !group) return [];
        scene.updateMatrixWorld(true);
        const rows = await collectRestorations(groups);
        const scale = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
        const origin = group.position;
        const dirs = insertionDirByTooth(insertionAxesRef.current);
        return rows.map((row, index) => {
          const out = row.positions;
          for (let i = 0; i < out.length; i += 3) {
            out[i] = (out[i]! - origin.x) * scale;
            out[i + 1] = (out[i + 1]! - origin.y) * scale;
            out[i + 2] = (out[i + 2]! - origin.z) * scale;
          }
          const dir = groups[index]!.teeth
            .map((tooth) => dirs.get(tooth))
            .find(Boolean);
          return {
            fileName: row.fileName,
            positions: out,
            axis: dir ? [dir.x, dir.y, dir.z] : null,
          };
        });
      },
      resetHomeView: () => resetHomeRef.current(),
      alignToBiteAuto: () => alignAutoRef.current(),
      cancelAlign: () => cancelAlignRef.current(),
      clearAlignPicks: () => clearPicksRef.current(),
      occlusionVerticalMm: () => {
        const arch = occlusionRef.current?.arch;
        const api = occlusionApiRef.current;
        if (!arch || !api) return 0;
        api.ensureBase(arch);
        return api.measureMm(arch);
      },
      previewOcclusionVertical: (mm) => {
        const arch = occlusionRef.current?.arch;
        const matrix = arch ? verticalShift(arch, mm) : null;
        if (!arch || !matrix) return;
        occlusionApiRef.current?.begin();
        occlusionApiRef.current?.preview(arch, matrix);
      },
      commitOcclusionVertical: (mm) => {
        const arch = occlusionRef.current?.arch;
        const matrix = arch ? verticalShift(arch, mm) : null;
        if (!arch || !matrix) return;
        occlusionApiRef.current?.begin();
        occlusionApiRef.current?.bake(arch, matrix);
      },
      resetOcclusion: () => {
        const arch = occlusionRef.current?.arch;
        if (arch) occlusionApiRef.current?.reset(arch);
      },
      exportChangedScans: () => exportScanMeshes(loadedRef.current, null),
      changedScanSignature: () => changedScanStamp(loadedRef.current),
      captureJawPositions: () =>
        jawEntries(loadedRef.current).map((entry) => ({
          id: entry.id,
          positions: captureBasePositions(entry.geometry),
          shape: scanShapeOf(entry),
        })),
      restoreJawPositions: (rows) => {
        const byId = new Map(rows.map((row) => [row.id, row]));
        let changed = false;
        for (const entry of jawEntries(loadedRef.current)) {
          const snap = byId.get(entry.id);
          if (!snap) continue;
          const shape = snap.shape;
          const count = entry.geometry.getAttribute("position")?.count ?? 0;
          if (
            shape &&
            (shape.index !== entry.geometry.getIndex() || snap.positions.length !== count * 3)
          ) {
            swapScanGeometry(entry, {
              positions: snap.positions.slice(),
              index: shape.index,
              color: shape.color,
              uv: shape.uv,
            });
            entry.basePositions = snap.positions.slice();
            occlusionBaseRef.current.delete(entry.id);
          } else {
            applyCapturedPositions(entry, snap.positions);
          }
          if (shape) {
            if (shape.fileCoords || entry.editedFileCoords) entry.meshRevision += 1;
            entry.editedFileCoords = shape.fileCoords;
            entry.filePositions = shape.filePositions;
          }
          changed = true;
        }
        if (!changed) return;
        meshEditCtlRef.current?.refresh();
        restyleRef.current();
        syncBadgesRef.current();
        setLoadVersion((value) => value + 1);
      },
      meshEditApply: () => {
        const ctl = meshEditCtlRef.current;
        if (!ctl) return { kind: "empty" };
        const result = ctl.apply();
        if (result.kind === "trimmed" || (result.kind === "filled" && result.holes > 0)) {
          meshEditHostRef.current.finish();
        }
        return result;
      },
      meshEditInvert: () => meshEditCtlRef.current?.invertSelection(),
      meshEditClear: () => meshEditCtlRef.current?.clearAll(),
      meshEditSelectLoose: () => meshEditCtlRef.current?.selectLoosePieces() ?? false,
      meshEditPickAllHoles: (on) => meshEditCtlRef.current?.pickAllHoles(on),
      exportInsertionAxes: () =>
        insertionAxesRef.current.map((axis) => ({
          key: axis.key,
          toothNumbers: [...axis.toothNumbers],
          dir: [axis.dir.x, axis.dir.y, axis.dir.z],
          origin: [axis.origin.x, axis.origin.y, axis.origin.z],
          radius: axis.radius,
          view: {
            position: [axis.view.position.x, axis.view.position.y, axis.view.position.z],
            target: [axis.view.target.x, axis.view.target.y, axis.view.target.z],
            up: [axis.view.up.x, axis.view.up.y, axis.view.up.z],
            zoom: axis.view.zoom,
            left: axis.view.left,
            right: axis.view.right,
            top: axis.view.top,
            bottom: axis.view.bottom,
          },
        })),
      exportCamera: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return null;
        return {
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
          up: [camera.up.x, camera.up.y, camera.up.z],
          zoom: camera.zoom,
          left: camera.left,
          right: camera.right,
          top: camera.top,
          bottom: camera.bottom,
        };
      },
      restoreCamera: (view) => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        snapRef.current = null;
        controls.target.set(view.target[0], view.target[1], view.target[2]);
        fitTargetRef.current.copy(controls.target);
        camera.position.set(view.position[0], view.position[1], view.position[2]);
        camera.up.set(view.up[0], view.up[1], view.up[2]);
        camera.zoom = view.zoom;
        camera.left = view.left;
        camera.right = view.right;
        camera.top = view.top;
        camera.bottom = view.bottom;
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
        controls.syncFromCamera();
      },
      restoreInsertionAxes: (axes) => {
        const restored: InsertionAxis[] = [];
        for (const axis of axes) {
          const origin = new THREE.Vector3(...axis.origin);
          const dir = new THREE.Vector3(...axis.dir);
          if (dir.lengthSq() < 1e-8) continue;
          dir.normalize();
          const key = insertionAxisKey(
            axis.toothNumbers.length > 0 ? axis.toothNumbers : insertionAxisTeeth(axis.key),
          );
          if (!key) continue;
          const keyTeeth = insertionAxisTeeth(key);
          placementsRef.current = alignPlacementsToPoint(
            placementsRef.current,
            keyTeeth,
            origin,
            axis.radius,
          );
          restored.push({
            key,
            toothNumbers: keyTeeth,
            dir,
            origin,
            radius: axis.radius,
            view: {
              position: new THREE.Vector3(...axis.view.position),
              target: new THREE.Vector3(...axis.view.target),
              up: new THREE.Vector3(...axis.view.up),
              zoom: axis.view.zoom,
              left: axis.view.left,
              right: axis.view.right,
              top: axis.view.top,
              bottom: axis.view.bottom,
            },
          });
        }
        insertionAxesRef.current = restored;
        for (const entry of loadedRef.current) entry.align = null;
        syncInsertionMarkerRef.current();
        syncBadgesRef.current();
        onInsertionAxisChangeRef.current?.(restored.length > 0);
        setLoadVersion((value) => value + 1);
      },
      setInsertionFromView: (toothNumbers, options) =>
        setInsertionFromViewRef.current(toothNumbers, options),
      detectColorMargins: (toothNumbers, seedPoint = null) => {
        groupRef.current?.updateWorldMatrix(true, true);
        const out: Array<{ tooth: string; radii: number[]; depths: number[] }> = [];
        for (const raw of toothNumbers) {
          const frame = toothMarginFrame(raw);
          if (!frame) continue;
          const { place, normal, right, triangles } = frame;

          let localSeed: { x: number; y: number; z: number } | null = null;
          if (seedPoint) {
            const axes = marginFrameAxes(normal, right);
            const dx = seedPoint.x - place.center.x;
            const dy = seedPoint.y - place.center.y;
            const dz = seedPoint.z - place.center.z;
            localSeed = {
              x: dx * axes.x.x + dy * axes.x.y + dz * axes.x.z,
              y: dx * axes.y.x + dy * axes.y.y + dz * axes.y.z,
              z: dx * axes.z.x + dy * axes.z.y + dz * axes.z.z,
            };
          }

          const line = detectProjectedColorMargin(
            triangles,
            place.radius,
            COLOR_MARGIN_POINT_COUNT,
            localSeed,
          );
          if (!line) continue;
          out.push({ tooth: raw, radii: line.radii, depths: line.depths });
        }
        return out;
      },
      detectCavityMargins: (toothNumbers) => {
        groupRef.current?.updateWorldMatrix(true, true);
        const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
        const out: CavityMarginHit[] = [];
        for (const raw of toothNumbers) {
          const frame = toothMarginFrame(raw);
          if (!frame) continue;
          const line = detectCavityMargin(
            frame.triangles,
            frame.place.radius,
            COLOR_MARGIN_POINT_COUNT,
          );
          if (!line) continue;
          out.push({
            tooth: raw,
            radii: line.radii,
            depths: line.depths,
            taperDeg: line.taperDeg,
            depthMm: line.cavityDepth * unit,
            openSides: line.openSides,
          });
        }
        return out;
      },
      alignModelToOcclusalView: () => {
        const loaded = loadedRef.current;
        if (loaded.length === 0) return false;
        const frame = estimateDentalFrame(loaded);
        if (!frame) return false;
        frameRef.current = frame;
        const arch = pickCameraArch(prepArch, placementsRef.current, loaded) ?? "lower";
        const pose = occlusalCamera(frame, arch);
        const group = groupRef.current;
        const groupPos = group ? group.position : new THREE.Vector3();
        const shown = loaded.filter((entry) => visible[entry.id] !== false);
        const meshes = shown.length > 0 ? shown : loaded;
        const fit = measureMeshFit(meshes, groupPos, pose.dir, pose.up);
        fitExtentRef.current = { halfW: fit.halfW, halfH: fit.halfH };
        fitTargetRef.current.copy(fit.target);
        fitRadiusRef.current = Math.max(fit.halfW, fit.halfH, 10);
        applyFitFrustum();
        frameCamera(pose.dir, pose.up, true, true);
        syncBadgesRef.current();
        scheduleViewSettledRef.current();
        return true;
      },
    }),
    [],
  );

  const onSaveImage = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    triggerPngDownload(renderer.domElement.toDataURL("image/png"));
  };
  saveImageRef.current = onSaveImage;

  /** 치아 추정 중심 주변의 지대치 악 스캔 정점(월드). 로드·배치가 같으면 다시 모으지 않는다. */
  const nearbyScanPoints = (tooth: string) => {
    const place = placementsRef.current.find((row) => row.toothNumber === tooth);
    if (!place) return null;
    const c = place.center;
    const cacheKey = `${loadVersion}:${tooth}:${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)}`;
    const cache = nearbyScanRef.current;
    const hit = cache.get(cacheKey);
    if (hit) return { place, ...hit };
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const reach = Math.max(place.radius * 1.5, 9 / unit);
    const reach2 = reach * reach;
    groupRef.current?.updateWorldMatrix(true, true);
    const out: number[] = [];
    const outNormals: number[] = [];
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    for (const entry of loadedRef.current) {
      if (entry.role !== place.arch) continue;
      const pos = entry.geometry.getAttribute("position");
      if (!pos) continue;
      const nor = entry.geometry.getAttribute("normal");
      normalMatrix.getNormalMatrix(entry.mesh.matrixWorld);
      for (let i = 0; i < pos.count; i += 1) {
        point.fromBufferAttribute(pos, i).applyMatrix4(entry.mesh.matrixWorld);
        if (point.distanceToSquared(c) > reach2) continue;
        out.push(point.x, point.y, point.z);
        if (nor) {
          normal.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
          outNormals.push(normal.x, normal.y, normal.z);
        } else {
          outNormals.push(0, 0, 0);
        }
      }
    }
    if (cache.size > 32) cache.clear();
    const row = { points: new Float32Array(out), normals: new Float32Array(outNormals) };
    cache.set(cacheKey, row);
    return { place, ...row };
  };

  /** 삽입축이 치아 쪽을 향한다. 언더컷 칠과 같은 축을 쓴다. */
  const undercutDir = (tooth: string) => {
    const place = placementsRef.current.find((row) => row.toothNumber === tooth);
    if (!place) return null;
    const axis = insertionAxesRef.current.find((row) => row.toothNumbers.includes(tooth));
    if (axis) return axis.dir.clone().normalize();
    return insertionForRole(place.arch, prepArch, frameRef.current, null)?.normalize() ?? null;
  };

  /** 마진 점마다 가장 가까운 스캔 면이 언더컷인지. 스캔이 멀면 false. */
  const marginUndercutFlags = (tooth: string, points: readonly THREE.Vector3[]) => {
    const near = nearbyScanPoints(tooth);
    const dir = undercutDir(tooth);
    if (!near || !dir || near.points.length === 0) return points.map(() => false);
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const limit2 = (0.5 / unit) ** 2;
    const undercutLimit = lookRef.current.undercutLimit;
    const data = near.points;
    const normals = near.normals;
    return points.map((v) => {
      let best = Infinity;
      let at = -1;
      for (let i = 0; i < data.length; i += 3) {
        const dx = data[i]! - v.x;
        const dy = data[i + 1]! - v.y;
        const dz = data[i + 2]! - v.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) {
          best = d2;
          at = i;
        }
      }
      if (at < 0 || best > limit2) return false;
      const align = normals[at]! * dir.x + normals[at + 1]! * dir.y + normals[at + 2]! * dir.z;
      return isUndercutAlignment(align, undercutLimit);
    });
  };
  marginUndercutFlagsRef.current = marginUndercutFlags;

  /** 이 치아 둘레의 지대치 악 스캔 면을 광선이 처음 만나는 점. */
  scanSurfaceHitRef.current = (raycaster, tooth) => {
    const place = placementsRef.current.find((row) => row.toothNumber === tooth);
    if (!place) return null;
    groupRef.current?.updateWorldMatrix(true, true);
    const meshes = loadedRef.current
      .filter((entry) => entry.mesh.visible && entry.role === place.arch)
      .map((entry) => entry.mesh);
    if (meshes.length === 0) return null;
    const reach = place.radius * 2.2;
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      if (hit.point.distanceTo(place.center) <= reach) return hit.point.clone();
    }
    return null;
  };

  /** 월드 점을 그 치아 마진 좌표(각도·기본 고리 비율·축 깊이)로. `marginWorldPoints`의 역. */
  marginSampleAtRef.current = (tooth, point) => {
    const place = placementsRef.current.find((row) => row.toothNumber === tooth);
    const edit = designEditRef.current?.edits[tooth];
    if (!place || !edit) return null;
    const base = place.radius * 0.78;
    if (base < 1e-6) return null;
    const normal = insertionDirByTooth(insertionAxesRef.current).get(tooth)?.clone() ??
      (frameRef.current?.up ?? new THREE.Vector3(0, 0, 1)).clone();
    normal.normalize();
    const hint = frameRef.current?.right ?? new THREE.Vector3(1, 0, 0);
    const x = hint.clone().addScaledVector(normal, -hint.dot(normal));
    if (x.lengthSq() < 1e-8) {
      const fallback =
        Math.abs(normal.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      x.crossVectors(normal, fallback);
    }
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, normal).normalize();
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const local = point.clone().sub(place.center);
    const depth = local.dot(normal);
    const radial = Math.hypot(local.dot(x), local.dot(z));
    return {
      angle: Math.atan2(local.dot(z), local.dot(x)),
      radius: (radial - edit.margin.offsetMm / unit) / base,
      depth,
    };
  };

  drawMarginSketchRef.current = (points, closed) => {
    const scene = sceneRef.current;
    const prev = marginSketchRef.current;
    if (prev) {
      scene?.remove(prev);
      disposeObject3D(prev);
      marginSketchRef.current = null;
    }
    if (!scene || points.length === 0) return;
    const tooth = marginTraceRef.current.tooth ?? designEditRef.current?.activeTooth;
    const place = placementsRef.current.find((row) => row.toothNumber === tooth);
    const size = Math.max((place?.radius ?? 4) * 0.045, 0.15);
    const group = new THREE.Group();
    group.name = "margin-sketch";
    const tracing = marginTraceRef.current.points.length > 0;
    if (tracing) {
      points.forEach((point, index) => {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(index === 0 ? size * 1.6 : size, 10, 8),
          new THREE.MeshBasicMaterial({
            color: index === 0 ? 0xf59e0b : 0x14b8a6,
            depthTest: false,
          }),
        );
        dot.position.copy(point);
        dot.renderOrder = 21;
        group.add(dot);
      });
    }
    if (points.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0x14b8a6, depthTest: false });
      const line = closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
      line.renderOrder = 20;
      line.frustumCulled = false;
      group.add(line);
    }
    scene.add(group);
    marginSketchRef.current = group;
  };

  const marginTraceTooth = () => {
    const spec = designEditRef.current;
    const tooth = spec?.activeTooth;
    if (!spec || !tooth || spec.tool !== "margin" || !spec.showMargin) return null;
    if (marginSeedPickRef.current) return null;
    const edit = spec.edits[tooth];
    if (!edit || !edit.margin.deleted || edit.pontic.on) return null;
    return tooth;
  };
  const resetMarginTrace = () => {
    const trace = marginTraceRef.current;
    const had = trace.points.length > 0;
    trace.points = [];
    drawMarginSketchRef.current([], false);
    if (had) onMarginTraceProgressRef.current?.(0);
  };
  marginTraceApiRef.current = {
    active: marginTraceTooth,
    click: (raycaster) => {
      const tooth = marginTraceTooth();
      if (!tooth) return;
      const trace = marginTraceRef.current;
      if (trace.tooth !== tooth) {
        resetMarginTrace();
        trace.tooth = tooth;
      }
      const place = placementsRef.current.find((row) => row.toothNumber === tooth);
      const first = trace.points[0];
      if (
        first &&
        place &&
        trace.points.length >= 3 &&
        raycaster.ray.distanceToPoint(first) < place.radius * 0.12
      ) {
        const samples = trace.points.flatMap((point) => {
          const sample = marginSampleAtRef.current(tooth, point);
          return sample ? [sample] : [];
        });
        resetMarginTrace();
        onDesignGestureRef.current?.({ type: "margin-trace", tooth, samples });
        return;
      }
      const point = scanSurfaceHitRef.current(raycaster, tooth);
      if (!point) return;
      trace.points.push(point);
      drawMarginSketchRef.current(trace.points, false);
      onMarginTraceProgressRef.current?.(trace.points.length);
    },
    undo: () => {
      const trace = marginTraceRef.current;
      if (!marginTraceTooth() || trace.points.length === 0) return;
      trace.points.pop();
      drawMarginSketchRef.current(trace.points, false);
      onMarginTraceProgressRef.current?.(trace.points.length);
    },
    sync: () => {
      const tooth = marginTraceTooth();
      const trace = marginTraceRef.current;
      if (tooth && tooth === trace.tooth) return;
      resetMarginTrace();
      trace.tooth = tooth;
    },
  };

  const toothAxisDir = (tooth: string) => {
    const axis = insertionAxesRef.current.find((row) => row.toothNumbers.includes(tooth));
    return (axis?.dir ?? frameRef.current?.up ?? new THREE.Vector3(0, 0, 1)).clone().normalize();
  };

  const scanDistanceProbe: ScanDistanceProbe = (tooth, points, normals) => {
    const near = nearbyScanPoints(tooth);
    if (!near || near.points.length === 0) return points.map(() => null);
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const limit = 0.35 / unit;
    const limit2 = limit * limit;
    const data = near.points;
    return points.map((v, index) => {
      let best = Infinity;
      let bx = 0;
      let by = 0;
      let bz = 0;
      for (let i = 0; i < data.length; i += 3) {
        const dx = data[i]! - v.x;
        const dy = data[i + 1]! - v.y;
        const dz = data[i + 2]! - v.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) {
          best = d2;
          bx = dx;
          by = dy;
          bz = dz;
        }
      }
      if (best > limit2) return null;
      const n = normals[index];
      const sign = n && bx * n.x + by * n.y + bz * n.z < 0 ? -1 : 1;
      return sign * Math.sqrt(best) * unit;
    });
  };

  const fitScanbodyOnScan = (tooth: string, radiusMm: number) => {
    const near = nearbyScanPoints(tooth);
    if (!near || near.points.length < 90) return null;
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const n = toothAxisDir(tooth);
    const r = radiusMm / unit;
    const data = near.points;
    const center = near.place.center.clone();
    const d = new THREE.Vector3();
    const flat = new THREE.Vector3();
    let top = 0;
    let fitMm: number | null = null;
    for (let iter = 0; iter < 5; iter += 1) {
      const alongs: number[] = [];
      for (let i = 0; i < data.length; i += 3) {
        d.set(data[i]! - center.x, data[i + 1]! - center.y, data[i + 2]! - center.z);
        const a = d.dot(n);
        flat.copy(d).addScaledVector(n, -a);
        if (flat.length() < r * 1.8) alongs.push(a);
      }
      if (alongs.length < 24) return null;
      alongs.sort((x, y) => x - y);
      top = alongs[Math.floor(0.97 * (alongs.length - 1))]!;
      const shift = new THREE.Vector3();
      let count = 0;
      let deviation = 0;
      for (let i = 0; i < data.length; i += 3) {
        d.set(data[i]! - center.x, data[i + 1]! - center.y, data[i + 2]! - center.z);
        const a = d.dot(n);
        if (a > top - 0.5 / unit || a < top - 6 / unit) continue;
        flat.copy(d).addScaledVector(n, -a);
        const radial = flat.length();
        if (radial > r * 1.8) continue;
        shift.add(flat);
        deviation += Math.abs(radial - r);
        count += 1;
      }
      if (count < 12) break;
      center.addScaledVector(shift, 1 / count);
      fitMm = (deviation / count) * unit;
    }
    const topPoint = center.clone().addScaledVector(n, top);
    const offset = topPoint.sub(near.place.center);
    return {
      axis: [n.x, n.y, n.z] as [number, number, number],
      offset: [offset.x, offset.y, offset.z] as [number, number, number],
      fitMm: fitMm == null ? null : Math.round(fitMm * 1000) / 1000,
    };
  };

  const fitScanbodyMeshOnScan: OralScanOverlayHandle["fitScanbodyMesh"] = (
    tooth,
    candidates,
    current,
  ) => {
    if (candidates.length === 0) return null;
    const near = nearbyScanPoints(tooth);
    if (!near || near.points.length < 90) return null;
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const right = frameRef.current?.right ?? new THREE.Vector3(1, 0, 0);
    const extents = candidates.map((row) => meshExtent(row.mesh.positions));
    let axis: THREE.Vector3;
    let top: THREE.Vector3;
    if (current?.aligned) {
      const pose = implantPose(near.place, toothAxisDir(tooth), current);
      axis = pose.axis;
      top = pose.top;
    } else {
      const fit = fitScanbodyOnScan(tooth, extents[0]!.radiusMm);
      if (!fit) return null;
      axis = new THREE.Vector3(...fit.axis).normalize();
      top = near.place.center.clone().add(new THREE.Vector3(...fit.offset));
    }
    const center = near.place.center;
    const target = new Float32Array(near.points.length);
    for (let i = 0; i < near.points.length; i += 3) {
      target[i] = (near.points[i]! - center.x) * unit;
      target[i + 1] = (near.points[i + 1]! - center.y) * unit;
      target[i + 2] = (near.points[i + 2]! - center.z) * unit;
    }
    const topMm = top.clone().sub(center).multiplyScalar(unit);
    const refDir = new THREE.Vector3(1, 0, 0).applyQuaternion(
      basisQuaternion(axis, right).multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          ((current?.aligned ? current.rotDeg : 0) * Math.PI) / 180,
        ),
      ),
    );
    let index = -1;
    let result: ReturnType<typeof registerScanbody> = null;
    for (let i = 0; i < candidates.length; i += 1) {
      const origin = topMm.clone().addScaledVector(axis, -extents[i]!.topMm);
      const next = registerScanbody({
        model: candidates[i]!.mesh.positions,
        target,
        axis: [axis.x, axis.y, axis.z],
        origin: [origin.x, origin.y, origin.z],
        ref: [refDir.x, refDir.y, refDir.z],
      });
      if (next && (!result || next.score < result.score)) {
        index = i;
        result = next;
      }
    }
    if (!result || index < 0) return null;
    const r = result.pose.r;
    const fitAxis = new THREE.Vector3(r[1], r[4], r[7]).normalize();
    const platform = new THREE.Vector3(...result.pose.t).multiplyScalar(1 / unit).add(center);
    const fitTop = platform.addScaledVector(fitAxis, extents[index]!.topMm / unit);
    const modelX = new THREE.Vector3(r[0], r[3], r[6]).applyQuaternion(
      basisQuaternion(fitAxis, right).invert(),
    );
    const offset = fitTop.sub(near.place.center);
    return {
      key: candidates[index]!.key,
      axis: [fitAxis.x, fitAxis.y, fitAxis.z],
      offset: [offset.x, offset.y, offset.z],
      rotDeg: Math.round(((Math.atan2(-modelX.z, modelX.x) * 180) / Math.PI) * 10) / 10,
      fitMm: Math.round(result.rmsMm * 1000) / 1000,
      topCoverage: result.topCoverage,
    };
  };

  const clearScanbodyMarks = () => {
    const marks = scanbodyMarksRef.current;
    if (marks) {
      sceneRef.current?.remove(marks);
      disposeObject3D(marks);
    }
    scanbodyMarksRef.current = null;
    scanbodyPickRef.current.points = [];
  };

  scanbodyPickApiRef.current = (raycaster) => {
    const tooth = scanbodyPickRef.current.tooth;
    const scene = sceneRef.current;
    if (!tooth || !scene) return;
    const place = placementsRef.current.find((row) => row.toothNumber === tooth);
    if (!place) return;
    groupRef.current?.updateWorldMatrix(true, true);
    const meshes = loadedRef.current
      .filter((entry) => entry.mesh.visible && entry.role === place.arch)
      .map((entry) => entry.mesh);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return;
    const points = scanbodyPickRef.current.points;
    points.push(hit.point.clone());
    if (!scanbodyMarksRef.current) {
      scanbodyMarksRef.current = new THREE.Group();
      scene.add(scanbodyMarksRef.current);
    }
    const mark = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(place.radius * 0.05, 0.15), 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false }),
    );
    mark.position.copy(hit.point);
    mark.renderOrder = 20;
    scanbodyMarksRef.current.add(mark);
    onScanbodyPicksRef.current?.(points.length);
    if (points.length < 3) return;
    const [a, b, c] = points as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const ab = b.clone().sub(a);
    const ac = c.clone().sub(a);
    const normal = new THREE.Vector3().crossVectors(ab, ac);
    const n2 = normal.lengthSq();
    clearScanbodyMarks();
    onScanbodyPicksRef.current?.(0);
    if (n2 < 1e-10) return;
    const center = a
      .clone()
      .add(
        new THREE.Vector3()
          .crossVectors(normal, ab)
          .multiplyScalar(ac.lengthSq())
          .add(new THREE.Vector3().crossVectors(ac, normal).multiplyScalar(ab.lengthSq()))
          .multiplyScalar(1 / (2 * n2)),
      );
    const axis = normal.normalize();
    if (axis.dot(toothAxisDir(tooth)) < 0) axis.negate();
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const radiusMm = designEditRef.current?.scanbodies[tooth]?.radiusMm ?? 2.4;
    const offset = center.clone().sub(place.center);
    onDesignGestureRef.current?.({
      type: "scanbody-fit",
      tooth,
      axis: [axis.x, axis.y, axis.z],
      offset: [offset.x, offset.y, offset.z],
      fitMm: Math.round(Math.abs(center.distanceTo(a) * unit - radiusMm) * 1000) / 1000,
    });
  };
  const fitScanbodyRef = useRef(fitScanbodyOnScan);
  fitScanbodyRef.current = fitScanbodyOnScan;
  const fitScanbodyMeshRef = useRef(fitScanbodyMeshOnScan);
  fitScanbodyMeshRef.current = fitScanbodyMeshOnScan;
  const clearScanbodyMarksRef = useRef(clearScanbodyMarks);
  clearScanbodyMarksRef.current = clearScanbodyMarks;
  const scanDistanceProbeRef = useRef(scanDistanceProbe);
  scanDistanceProbeRef.current = scanDistanceProbe;

  /** 스캔 정점·자세가 바뀌면 달라지는 값. 수동 교합으로 메시를 옮겨도 바뀐다. */
  const scanSignature = () => {
    groupRef.current?.updateWorldMatrix(true, true);
    return loadedRef.current
      .map((entry) => {
        const pos = entry.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
        const m = entry.mesh.matrixWorld.elements;
        return `${entry.role}:${entry.geometry.uuid}:${pos?.version ?? 0}:${m.map((n) => n.toFixed(4)).join(",")}`;
      })
      .join("|");
  };

  /**
   * 크라운 맞춤용 스캔. 대합은 반대 악, 인접은 지대치 악에서 마진 안(지대치)과 마진 아래(치은)를 뺀다.
   * 치조정은 폰틱 발밑, 치은은 크라운 마진 둘레(지대치 밖, 인접치 아래). 법선은 바깥(교합 쪽)을 보게 악마다 뒤집는다.
   */
  const crownAdaptScan = (tooth: string, signature: string): CrownAdaptScan | null => {
    const place = placementsRef.current.find((row) => row.toothNumber === tooth);
    if (!place || (place.arch !== "upper" && place.arch !== "lower")) return null;
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const axis = toothAxisDir(tooth);
    const margin = designEditRef.current?.edits[tooth]?.margin;
    const c = place.center;
    const rawKey = JSON.stringify([
      signature,
      tooth,
      [c.x, c.y, c.z, axis.x, axis.y, axis.z].map((n) => n.toFixed(4)),
    ]);
    const key = JSON.stringify([
      rawKey,
      margin && !margin.deleted
        ? [margin.radii.map((r) => r.toFixed(3)), (margin.depths ?? []).map((d) => d.toFixed(3)), margin.offsetMm]
        : null,
    ]);
    const cache = crownScanRef.current;
    const hit = cache.get(key);
    if (hit) return hit;

    const up = frameRef.current?.up ?? new THREE.Vector3(0, 0, 1);
    const reach = Math.max(place.radius * 2.4, 12 / unit);
    const reach2 = reach * reach;
    const collect = (role: "upper" | "lower") => {
      const points: number[] = [];
      const normals: number[] = [];
      const point = new THREE.Vector3();
      const normal = new THREE.Vector3();
      const normalMatrix = new THREE.Matrix3();
      for (const entry of loadedRef.current) {
        if (entry.role !== role) continue;
        const pos = entry.geometry.getAttribute("position");
        if (!pos) continue;
        const nor = entry.geometry.getAttribute("normal");
        normalMatrix.getNormalMatrix(entry.mesh.matrixWorld);
        for (let i = 0; i < pos.count; i += 1) {
          point.fromBufferAttribute(pos, i).applyMatrix4(entry.mesh.matrixWorld);
          if (point.distanceToSquared(c) > reach2) continue;
          points.push(point.x, point.y, point.z);
          if (nor) normal.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
          else normal.set(0, 0, 0);
          normals.push(normal.x, normal.y, normal.z);
        }
      }
      const occlusal = role === "lower" ? up : up.clone().negate();
      let facing = 0;
      for (let i = 0; i < normals.length; i += 3) {
        facing += normals[i]! * occlusal.x + normals[i + 1]! * occlusal.y + normals[i + 2]! * occlusal.z;
      }
      if (facing < 0) for (let i = 0; i < normals.length; i += 1) normals[i] = -normals[i]!;
      return downsampleCloud(
        { points: new Float32Array(points), normals: new Float32Array(normals) },
        0.12 / unit,
      );
    };
    const split = (cloud: ScanCloud, keep: (lateral: number, axial: number) => boolean): ScanCloud => {
      const points: number[] = [];
      const normals: number[] = [];
      const d = new THREE.Vector3();
      for (let i = 0; i < cloud.points.length; i += 3) {
        d.set(cloud.points[i]! - c.x, cloud.points[i + 1]! - c.y, cloud.points[i + 2]! - c.z);
        const axial = d.dot(axis);
        const lateral = Math.sqrt(Math.max(0, d.lengthSq() - axial * axial));
        if (!keep(lateral, axial)) continue;
        points.push(cloud.points[i]!, cloud.points[i + 1]!, cloud.points[i + 2]!);
        normals.push(cloud.normals[i]!, cloud.normals[i + 1]!, cloud.normals[i + 2]!);
      }
      return { points: new Float32Array(points), normals: new Float32Array(normals) };
    };

    const rawCache = crownRawScanRef.current;
    let raw = rawCache.get(rawKey);
    if (!raw) {
      const opposingCloud = collect(place.arch === "upper" ? "lower" : "upper");
      raw = { own: collect(place.arch), opposing: createScanGrid(opposingCloud, unit) };
      if (rawCache.size > 16) rawCache.clear();
      rawCache.set(rawKey, raw);
    }
    const own = raw.own;
    const radii = margin && !margin.deleted && margin.radii.length > 0 ? margin.radii : null;
    const prepRadius = radii
      ? place.radius * 0.78 * Math.max(...radii) + (margin?.offsetMm ?? 0) / unit + 0.3 / unit
      : place.radius * 0.9;
    const marginTop = Math.max(0, ...(radii ? (margin?.depths ?? []) : []));
    const adjacent = split(own, (lateral, axial) => lateral > prepRadius && axial > marginTop + 0.5 / unit);
    const ridge = split(own, (lateral) => lateral < place.radius);
    const gingiva = radii
      ? split(
          own,
          (lateral, axial) =>
            lateral > prepRadius &&
            lateral < Math.max(place.radius * 1.15, prepRadius + 1 / unit) &&
            axial <= marginTop + 0.5 / unit,
        )
      : null;
    const axisTuple: [number, number, number] = [axis.x, axis.y, axis.z];
    const row: CrownAdaptScan = {
      opposing: raw.opposing,
      adjacent: createScanGrid(adjacent, unit),
      adjacentColumns: createScanColumns(adjacent, axisTuple, unit),
      ridge: createScanColumns(ridge, axisTuple, unit),
      gingiva: gingiva ? createScanColumns(gingiva, axisTuple, unit) : null,
    };
    if (cache.size > 16) cache.clear();
    cache.set(key, row);
    return row;
  };
  const crownAdaptScanRef = useRef(crownAdaptScan);
  crownAdaptScanRef.current = crownAdaptScan;
  const scanSignatureRef = useRef(scanSignature);
  scanSignatureRef.current = scanSignature;
  const lastScanSignatureRef = useRef("");

  useEffect(() => {
    scanbodyPickRef.current.tooth = scanbodyPickTooth;
    clearScanbodyMarksRef.current();
  }, [scanbodyPickTooth]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const prev = editLayerRef.current;
    if (prev) {
      scene.remove(prev);
      disposeObject3D(prev);
      editLayerRef.current = null;
    }
    marginTraceApiRef.current.sync();
    if (!designEdit) {
      onMarginUndercutRef.current?.(null, 0);
      onHoleIssuesRef.current?.({});
      onCrownShellsRef.current?.({});
      return;
    }
    const hidden = hiddenKey ? hiddenKey.split(",") : [];
    const spec =
      hidden.length > 0
        ? {
            ...designEdit,
            edits: Object.fromEntries(
              Object.entries(designEdit.edits).filter(
                ([tooth]) => !hidden.includes(fdiDigits(tooth)),
              ),
            ),
            bridges: designEdit.bridges.filter(
              (link) =>
                !hidden.includes(fdiDigits(link.from)) && !hidden.includes(fdiDigits(link.to)),
            ),
          }
        : designEdit;
    let undercut: { tooth: string | null; count: number } = { tooth: null, count: 0 };
    const holeIssues: Record<string, string> = {};
    const crownShells: Record<string, number> = {};
    const signature = scanSignatureRef.current();
    if (signature !== lastScanSignatureRef.current) {
      lastScanSignatureRef.current = signature;
      crownAdaptCacheRef.current.clear();
    }
    const layer = buildProsthesisEditLayer({
      placements: placementsRef.current,
      frame: frameRef.current,
      insertionByTooth: insertionDirByTooth(insertionAxesRef.current),
      unitToMm: unitToMmRef.current,
      spec,
      probe: (tooth, points, normals) => scanDistanceProbeRef.current(tooth, points, normals),
      marginUndercut: (tooth, points) => {
        const flags = marginUndercutFlagsRef.current(tooth, points);
        undercut = { tooth, count: flags.filter(Boolean).length };
        return flags;
      },
      onHoleIssue: (tooth, issue) => {
        if (issue) holeIssues[tooth] = issue;
      },
      adaptScan: (tooth) => crownAdaptScanRef.current(tooth, signature),
      contactPaint: contactMap ? { gapMm: occlusalGapMm, mode: contactMode } : null,
      adaptCache: crownAdaptCacheRef.current,
      onCrownShell: (tooth, mm) => {
        if (mm != null) crownShells[tooth] = Math.round(mm * 1000) / 1000;
      },
    });
    scene.add(layer);
    editLayerRef.current = layer;
    onMarginUndercutRef.current?.(undercut.tooth, undercut.count);
    onHoleIssuesRef.current?.(holeIssues);
    onCrownShellsRef.current?.(crownShells);
  }, [designEdit, loadVersion, showInsertionAxis, hiddenKey, contactMap, occlusalGapMm, contactMode]);

  const clearStoneModel = (notify: boolean) => {
    const prev = stoneLayerRef.current;
    if (prev) {
      sceneRef.current?.remove(prev);
      disposeObject3D(prev);
    }
    stoneLayerRef.current = null;
    const had = stonePartsRef.current.length > 0;
    stonePartsRef.current = [];
    if (!had) return;
    setStoneVersion((value) => value + 1);
    if (notify) onStoneModelChangeRef.current?.([]);
  };

  const buildStoneModelLayer: OralScanOverlayHandle["buildStoneModel"] = ({ settings, dies }) => {
    const scene = sceneRef.current;
    const frame = frameRef.current;
    clearStoneModel(false);
    if (!scene || !frame) {
      onStoneModelChangeRef.current?.([]);
      return [];
    }
    groupRef.current?.updateWorldMatrix(true, true);
    const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
    const jaws: StoneModelJaw[] = [];
    for (const arch of ["upper", "lower"] as const) {
      const entry = loadedRef.current
        .filter((row) => row.role === arch)
        .sort(
          (a, b) =>
            (b.geometry.getAttribute("position")?.count ?? 0) -
            (a.geometry.getAttribute("position")?.count ?? 0),
        )[0];
      if (!entry) continue;
      jaws.push({ arch, geometry: entry.geometry, matrix: entry.mesh.matrixWorld.clone() });
    }
    const stoneDies = dies.flatMap(({ tooth, margin }) => {
      const digits = fdiDigits(tooth);
      const place = placementsRef.current.find((row) => row.toothNumber === digits);
      if (!place || margin.deleted || margin.radii.length === 0) return [];
      const widest = Math.max(...margin.radii);
      return [
        {
          tooth: digits,
          arch: place.arch,
          center: place.center.clone(),
          cutRadius: place.radius * 0.78 * widest + (margin.offsetMm + 1.2) / unit,
        },
      ];
    });
    const parts = buildStoneModel({
      settings,
      jaws,
      dies: stoneDies,
      up: frame.up.clone(),
      right: frame.right.clone(),
      anterior: frame.anterior.clone(),
      unitToMm: unit,
    });
    if (parts.length > 0) {
      const layer = new THREE.Group();
      layer.name = "stone-model";
      for (const part of parts) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(part.positions.slice(), 3));
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: STONE_PART_RGB[part.kind],
            roughness: 0.75,
            metalness: part.kind === "post" ? 0.2 : 0,
            side: THREE.DoubleSide,
          }),
        );
        mesh.frustumCulled = false;
        mesh.userData.stonePart = part.id;
        layer.add(mesh);
      }
      layer.visible = false;
      scene.add(layer);
      stoneLayerRef.current = layer;
    }
    stonePartsRef.current = parts;
    setStoneVersion((value) => value + 1);
    const summary = parts.map(({ positions, ...rest }) => ({
      ...rest,
      triangleCount: positions.length / 9,
    }));
    onStoneModelChangeRef.current?.(summary);
    return summary;
  };
  const buildStoneModelRef = useRef(buildStoneModelLayer);
  buildStoneModelRef.current = buildStoneModelLayer;
  const clearStoneModelRef = useRef(clearStoneModel);
  clearStoneModelRef.current = clearStoneModel;

  useEffect(() => {
    clearStoneModelRef.current(true);
  }, [loadVersion]);

  const dieMarginKey = dieMargins ? JSON.stringify(dieMargins) : "";
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      const margins = dieMarginsRef.current ?? {};
      const unit = unitToMmRef.current > 0 ? unitToMmRef.current : 1;
      const frame = frameRef.current;
      const up = frame?.up ?? new THREE.Vector3(0, 0, 1);
      const right = frame?.right ?? new THREE.Vector3(1, 0, 0);
      const axes = insertionDirByTooth(insertionAxesRef.current);
      groupRef.current?.updateWorldMatrix(true, true);
      const cache = dieCacheRef.current;
      const next = new Map<string, { sig: string; arch: "upper" | "lower"; positions: Float32Array }>();
      for (const [raw, margin] of Object.entries(margins)) {
        const tooth = fdiDigits(raw);
        const place = placementsRef.current.find((row) => row.toothNumber === tooth);
        if (!place || margin.deleted || margin.radii.length < 3) continue;
        const normal = axes.get(tooth)?.clone() ?? up.clone();
        if (normal.lengthSq() < 1e-8) normal.copy(up);
        normal.normalize();
        const sig = [
          loadVersion,
          place.center.toArray().map((v) => v.toFixed(3)).join(","),
          place.radius.toFixed(3),
          normal.toArray().map((v) => v.toFixed(4)).join(","),
          JSON.stringify(margin),
        ].join("|");
        const hit = cache.get(tooth);
        if (hit && hit.sig === sig) {
          next.set(tooth, hit);
          continue;
        }
        const points = marginWorldPoints({ place, normal, right, margin, unitToMm: unit });
        const reach = Math.max(place.radius * 2, 10 / unit);
        const meshes = loadedRef.current
          .filter((entry) => entry.role === place.arch)
          .map((entry) => entry.mesh);
        const positions = buildMarginDie({
          triangles: nearbyWorldTriangles(meshes, place.center, reach),
          margin: points,
          axis: normal,
          unitToMm: unit,
        });
        if (positions) next.set(tooth, { sig, arch: place.arch, positions });
      }
      dieCacheRef.current = next;

      const prev = dieLayerRef.current;
      if (prev) {
        scene.remove(prev);
        disposeObject3D(prev);
        dieLayerRef.current = null;
      }
      const ready: Array<{ tooth: string; arch: "upper" | "lower" }> = [];
      if (next.size > 0) {
        const layer = new THREE.Group();
        layer.name = "margin-dies";
        for (const [tooth, row] of next) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(row.positions.slice(), 3));
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
              color: DIE_RGB,
              roughness: 0.72,
              metalness: 0,
              side: THREE.DoubleSide,
            }),
          );
          mesh.userData.dieTooth = tooth;
          mesh.visible = dieShownRef.current(tooth);
          mesh.frustumCulled = false;
          layer.add(mesh);
          ready.push({ tooth, arch: row.arch });
        }
        scene.add(layer);
        dieLayerRef.current = layer;
      }
      setDieReady(ready);
      onDiesChangeRef.current?.(ready.map((row) => row.tooth));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [dieMarginKey, loadVersion, showInsertionAxis]);

  return (
    <div className={cn("relative h-full min-h-0 w-full", className)}>
      <div ref={containerRef} className="absolute inset-0" />
      <canvas
        ref={guideCanvasRef}
        className="pointer-events-none absolute inset-0 z-[4] h-full w-full"
        aria-hidden
      />

      {busy && items.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <p className="rounded-md bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            {busyLabel || "스캔을 불러오는 중…"}
          </p>
        </div>
      ) : null}

      {parseNote ? (
        <p className="absolute left-3 top-3 z-10 max-w-sm rounded-md bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm">
          {parseNote}
        </p>
      ) : null}

      {aligning && alignStopAsk && items.length > 0 ? (
        <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-md bg-background/95 px-3 py-1.5 text-xs text-foreground shadow-sm">
          <span>중단했습니다. 지금 보이는 자세를 유지할까요?</span>
          <button
            type="button"
            className="rounded border border-primary bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => resolveAlignChoice(true)}
          >
            이 자세 유지
          </button>
          <button
            type="button"
            className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
            onClick={() => resolveAlignChoice(false)}
          >
            원래대로
          </button>
        </div>
      ) : aligning && items.length > 0 ? (
        <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-md bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
          <span>바이트에 맞는 위치를 찾는 중</span>
          <button
            type="button"
            className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
            onClick={() => cancelAlignRef.current()}
          >
            중단
          </button>
        </div>
      ) : analyzing && items.length > 0 ? (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          접촉과 언더컷을 계산하는 중
        </p>
      ) : null}
    </div>
  );
},
);
