// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - web/backend/controllers/requests/common.review.controller.js
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;

using DPTechnology.AnnexLibraries.EspritAnnex;
using Esprit;
using EspritConstants;
using EspritTechnology;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;
using Abuts.EspritAddIns.ESPRIT2025AddinProject;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.DentalAddin;
using static Org.BouncyCastle.Math.EC.ECCurve;
using DentalAddin;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject
{
    public class StlFileProcessor
    {
        private const string StlImportLayerName = "AbutsStlImport";
        private const double DefaultWAxisRotationDegrees = 30.0;
        // 제조사 수동 헥스 회전 canonical 모드값
        // - "STL모델대로" / "헥스30도회전" 모두 STL 실회전은 동일하게 적용한다.
        //   => totalW = 30 + (-appliedDeg)
        // - 두 모드(및 헥스X 확장)의 차이는 NC C축 후처리에서 분기한다.
        // 하위호환: 백엔드가 레거시 "0"/"30"을 보내도 내부에서 canonical 모드로 정규화한다.
        private const string ManufacturerHexModeCorrected = "STL모델대로";
        private const string ManufacturerHexModeUncorrected = "헥스30도회전";
        // 헥스40 계열(NC C축 가산): STL모델+(base=0) / 헥스30+(base=30). STL 실회전은 보정(STL모델대로)와 동일.
        private const string ManufacturerHexModeStlPlus = "STL모델+";
        private const string ManufacturerHexModeHex30Plus = "헥스30+";


        private const double CompositeFinishToleranceThresholdZMm = 15.0;
        private const double CompositeFinishToleranceOverrideMm = 0.03;
        private const string BackRoughFourWayEnableEnv = "ABUTS_BACK_ROUGH_4WAY_ENABLE";
        private const string FinishLineMinZEnv = "ABUTS_FINISHLINE_MIN_Z";
        // Finish_Cuff SSOT env
        // - ABUTS_COMPOSITE_CUFF_PROFILE: backend finishline points를 ESPRIT FeatureChain으로 변환한 profile token("6,<key>")
        // - ABUTS_COMPOSITE_CUFF_START_X: 시작 X (정책: finishline min_z)
        // - ABUTS_COMPOSITE_CUFF_END_X: 종료 X (정책: finishline min_z - 1.2mm)
        private const string CompositeCuffProfileEnv = "ABUTS_COMPOSITE_CUFF_PROFILE";
        private const string CompositeCuffStartXEnv = "ABUTS_COMPOSITE_CUFF_START_X";
        private const string CompositeCuffEndXEnv = "ABUTS_COMPOSITE_CUFF_END_X";
        private const string CompositeCuffProfilePointsEnv = "ABUTS_COMPOSITE_CUFF_PROFILE_POINTS_XYZ";
        // STL에 실제 적용된 W축 총 회전각(도). OrientationProfile/finishline 좌표변환 SSOT로 공유한다.
        private const string CompositeOrientationWAxisDegreesEnv = "ABUTS_COMPOSITE_ORIENTATION_W_AXIS_DEGREES";
        private static readonly HttpClient BackendHttp;

        // gp.exe 비정상 종료 시 Windows GPF 모달(오류 대화상자) 억제
        private const uint SEM_FAILCRITICALERRORS = 0x0001;
        private const uint SEM_NOGPFAULTERRORBOX = 0x0002;
        private const uint SEM_NOOPENFILEERRORBOX = 0x8000;

        [DllImport("kernel32.dll")]
        private static extern uint SetErrorMode(uint uMode);

        static StlFileProcessor()
        {
            var handler = new HttpClientHandler
            {
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
                UseProxy = false
            };
            BackendHttp = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(10)
            };

            try
            {
                uint mode = SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX;
                SetErrorMode(mode);
                AppLogger.Log($"StlFileProcessor: SetErrorMode 적용 - mode=0x{mode:X}");
            }
            catch
            {
                // 모달 억제 실패 시에도 기능은 계속 수행
            }
        }


        private readonly Application _espApp;
        private readonly string _outputFolder;
        private readonly string _postProcessorFile;
        private readonly DentalAddinPrcManager _prcManager;
        private readonly DentalAddinConfigurator _configurator;
        private readonly EspritDocumentManager _documentManager;
        private readonly BackendApiClient _backendClient;
        private readonly NcFileGenerator _ncGenerator;
        private double? _capturedFrontPointX;
        private double? _capturedBackPointX;
        private double? _capturedStockDiameter;
        private string _backendLotNumber;
        private string _backendSerialCode;
        private string _backendRequestId;
        private string _backendImplantLabel;
        private double[][] _backendFinishLinePoints;
            // request-meta(caseInfos.manufacturerHexRotation) 제조사 헥스 회전 모드값
            // - canonical: "STL모델대로" | "헥스30도회전" | "STL모델+" | "헥스30+"
            // - 하위호환: "0"|"30", legacy "헥스40도회전"/"헥스10도회전" → STL모델+
            private string _backendManufacturerHexRotation;
        // request-meta(caseInfos.hexRotation.appliedDeg)
        // Rhino가 실제 mesh에는 적용하지 않고 전달하는 "가상 보정량" telemetry.
        // 주의: Rhino와 Esprit의 회전 부호 기준이 달라, Esprit 적용 시 부호를 반전해 사용한다.
        // canonical "STL모델대로"/"헥스30도회전" 모두 STL모델대로 기준 회전에 반영한다.
        private double? _backendHexRotationAppliedDeg;
        // 유지홈(retentionGroove) — request-meta none/deep 필수. Finish StepIncrement·Back 겹침 SSOT.
        private string _backendRetentionGroove;
        public string FaceHoleProcessFilePath { get; set; }
        public string ConnectionMachiningProcessFilePath { get; set; }
        private double? _effectiveFrontLimitX;
        public double DefaultBackLimitX { get; set; } = 0;
        public string lotNumber { get; set; } = "ACR";
        // [정책] 로컬 storage는 임시 캐시 — 백엔드 DB + S3가 SSOT
        // - 입력 STL(2-filled): 없으면 Connect.DownloadSourceFileToFilledDir()로 S3에서 다운로드
        // - 출력 NC(3-nc): 생성 후 BackendApiClient.NotifyBackendSuccess()로 S3에 presign 업로드
        // - 로컬 파일은 PurgeOldFiles()로 15일 후 자동 삭제
        public StlFileProcessor(Application app, string outputFolder = null,
            string postProcessorFile = "Acro_dent_XE.asc")
        {
            _espApp = app ?? throw new InvalidOperationException("ESPRIT Application not initialized");
            // [정책] StorageNcDirectory 대신 OS temp 기반 임시 디렉토리 사용
            // NC 파일은 S3 업로드 후 BackendApiClient.NotifyBackendSuccess()에서 삭제됨
            _outputFolder = string.IsNullOrWhiteSpace(outputFolder)
                ? System.IO.Path.Combine(System.IO.Path.GetTempPath(), "abuts-esprit-nc")
                : outputFolder;
            _postProcessorFile = postProcessorFile;
            _prcManager = new DentalAddinPrcManager();
            _prcManager.FaceHoleProcessFilePath = this.FaceHoleProcessFilePath;
            _prcManager.ConnectionMachiningProcessFilePath = this.ConnectionMachiningProcessFilePath;
            _configurator = new DentalAddinConfigurator(_prcManager);
            _documentManager = new EspritDocumentManager(_espApp);
            _backendClient = new BackendApiClient();
            _ncGenerator = new NcFileGenerator(_espApp, _outputFolder, _postProcessorFile);
        }
        public Esprit.PMTab exTab;
        // requestIdHint:
        // - 백엔드가 트리거 시 전달한 canonical requestId
        // - R&D 샘플 복사본이 원본과 동일 STL 파일명을 공유해도, 공정/콜백 귀속이 원본으로 섞이지 않도록 우선 사용한다.
        public void Process(string stlPath, double? frontLimitX = null, double? backLimitX = null, double? materialDiameter = null, bool twoPhase = false, string requestIdHint = null, double? tiltAxisX = null, double? tiltAxisY = null, double? tiltAxisZ = null, double? stlZLengthMm = null, string manufacturerHexRotationHint = null, double? hexRotationAppliedDegHint = null)
        {
            AppLogger.BeginRun();
            var processSw = System.Diagnostics.Stopwatch.StartNew();
            AppLogger.Log("StlFileProcessor: Process 시작");
            AppLogger.Log("[PERF] StlFileProcessor.Process START");
            ResetPerRunState();
            if (string.IsNullOrWhiteSpace(manufacturerHexRotationHint))
            {
                throw new InvalidOperationException("ManufacturerHexRotation from backend payload is missing");
            }
            _backendManufacturerHexRotation = manufacturerHexRotationHint.Trim();
            if (hexRotationAppliedDegHint.HasValue &&
                !double.IsNaN(hexRotationAppliedDegHint.Value) &&
                !double.IsInfinity(hexRotationAppliedDegHint.Value))
            {
                _backendHexRotationAppliedDeg = hexRotationAppliedDegHint.Value;
            }
            AppLogger.Log($"StlFileProcessor: payload hex mode={_backendManufacturerHexRotation}, appliedDeg={(_backendHexRotationAppliedDeg.HasValue ? _backendHexRotationAppliedDeg.Value.ToString("F4", CultureInfo.InvariantCulture) : "<null>")}");
            TryApplyCompositeOrientationVectorEnvFromPayload(tiltAxisX, tiltAxisY, tiltAxisZ);
            TryApplyCompositeFinishToleranceEnv(stlZLengthMm);
            Directory.CreateDirectory(_outputFolder);
            Document document = _documentManager.EnsureDocument(materialDiameter);
            if (document == null)
            {
                AppLogger.Log("StlFileProcessor: 활성화된 ESPRIT 문서를 만들 수 없습니다.");
                return;
            }
            _documentManager.EnsureCleanDocument(document);

            var resetSw = System.Diagnostics.Stopwatch.StartNew();
            document = _documentManager.ResetDocument(document, materialDiameter);
            resetSw.Stop();
            AppLogger.Log($"[PERF] StlFileProcessor.ResetDocument END elapsedMs={resetSw.ElapsedMilliseconds}");
            if (document == null)
            {
                AppLogger.Log("StlFileProcessor: 템플릿 문서 초기화에 실패했습니다.");
                return;
            }

            InitializeActivePlane(document);

            EspritDocumentHelper.RemoveLayerIfExists(document, StlImportLayerName);
            double effectiveFrontLimit = frontLimitX ?? throw new InvalidOperationException("FrontPoint from backend is missing");
            double effectiveBackLimit = backLimitX ?? 0.0;
            _effectiveFrontLimitX = effectiveFrontLimit;
            AppLogger.Log($"StlFileProcessor: LimitX 적용 - Front:{effectiveFrontLimit:F4}, Back:{effectiveBackLimit:F4} (초기값, STL 이동 후 업데이트됨)");
            string requestId = null;
            BackendApiClient.RequestMetaCaseInfos requestMeta = null;
            double? backendCamDiameter = null;
            double? finishLineTopZ = null;
            double? finishLineMinZ = null;
            double? stlBoundingTopZ = null;
            double? finishLineEspritR = null;
            _backendLotNumber = null;
            _backendSerialCode = null;
            _backendRequestId = null;
            _backendImplantLabel = null;
            _backendFinishLinePoints = null;
            // hex mode/appliedDeg는 payload SSOT — 아래 null 초기화 대상에서 제외한다.
            try
            {
                requestId = string.IsNullOrWhiteSpace(requestIdHint)
                    ? BackendApiClient.ExtractRequestIdFromStlPath(stlPath)
                    : requestIdHint.Trim();
                AppLogger.Log($"StlFileProcessor: requestId resolved={requestId} (source={(string.IsNullOrWhiteSpace(requestIdHint) ? "stlPath" : "payload")})");
                if (!string.IsNullOrWhiteSpace(requestId))
                {
                    BackendApiClient.RequestMetaResponse requestMetaResponse = FetchRequestMeta(requestId);
                    requestMeta = requestMetaResponse?.data?.caseInfos;
                    double[][] finishLinePoints = requestMetaResponse?.data?.caseInfos?.finishLine?.points;
                    _backendFinishLinePoints = finishLinePoints;
                    if (finishLinePoints != null && finishLinePoints.Length > 0)
                    {
                        double[] finishTopPoint = null;
                        double maxFinishZ = double.NegativeInfinity;
                        double minFinishZ = double.PositiveInfinity;
                        foreach (double[] p in finishLinePoints)
                        {
                            if (p == null || p.Length < 3)
                            {
                                continue;
                            }
                            double sourceX = p[0];
                            double sourceY = p[1];
                            double sourceZ = p[2];
                            if (double.IsNaN(sourceX) || double.IsInfinity(sourceX) || double.IsNaN(sourceY) || double.IsInfinity(sourceY) || double.IsNaN(sourceZ) || double.IsInfinity(sourceZ))
                            {
                                continue;
                            }
                            if (sourceZ > maxFinishZ)
                            {
                                maxFinishZ = sourceZ;
                                finishTopPoint = p;
                            }
                            if (sourceZ < minFinishZ)
                            {
                                minFinishZ = sourceZ;
                            }
                        }
                        if (finishTopPoint != null)
                        {
                            finishLineTopZ = finishTopPoint[2];
                            finishLineEspritR = Math.Sqrt(finishTopPoint[0] * finishTopPoint[0] + finishTopPoint[1] * finishTopPoint[1]);
                        }
                        if (!double.IsInfinity(minFinishZ))
                        {
                            finishLineMinZ = minFinishZ;
                        }
                    }
                    _backendSerialCode = requestMetaResponse?.data?.serialCode;
                    _backendRequestId = requestId;
                    if (requestMeta != null)
                    {
                        _backendImplantLabel = $"{requestMeta.clinicName}_{requestMeta.patientName}_{requestMeta.tooth}";
                        if (!string.IsNullOrWhiteSpace(requestMeta.lotNumber))
                        {
                            _backendLotNumber = requestMeta.lotNumber.Trim();
                            lotNumber = _backendLotNumber;
                        }
                        else
                        {
                            throw new InvalidOperationException($"request-meta 응답에 lotNumber가 없습니다. requestId={requestId}");
                        }
                        // 유지홈(retentionGroove) SSOT — 백엔드 none/deep만 허용. StepIncrement·Finish_Back 겹침에 사용.
                        _backendRetentionGroove = RequireBackendRetentionGrooveOrThrow(
                            requestMeta.retentionGroove,
                            requestId);
                        // hex mode는 payload SSOT — request-meta에서 덮어쓰지 않는다.
                        // Rhino telemetry(appliedDeg)는 payload에 없을 때만 request-meta에서 보조 로드한다.
                        if (!_backendHexRotationAppliedDeg.HasValue)
                        {
                            double? appliedHex = requestMeta.hexRotation?.appliedDeg;
                            if (appliedHex.HasValue && !double.IsNaN(appliedHex.Value) && !double.IsInfinity(appliedHex.Value))
                            {
                                _backendHexRotationAppliedDeg = appliedHex.Value;
                            }
                        }
                        TryApplyCompositeFirstPassPercentEnv(requestMeta.tooth);
                        TryApplyCompositeOrientationVectorEnv(requestMeta);
                        if (requestMeta.maxDiameter > 0.0)
                        {
                            Environment.SetEnvironmentVariable(
                                "ABUTS_MAX_DIAMETER",
                                requestMeta.maxDiameter.ToString("0.###", CultureInfo.InvariantCulture));
                        }
                        AppLogger.Log($"StlFileProcessor: request-meta loaded requestId={requestId}, Clinic={requestMeta.clinicName}, Patient={requestMeta.patientName}, Tooth={requestMeta.tooth}, Implant={requestMeta.implantManufacturer}/{requestMeta.implantBrand}/{requestMeta.implantType}, MaxDia={requestMeta.maxDiameter}, ConnDia={requestMeta.connectionDiameter}, CamDia={requestMeta.camDiameter}, WorkType={requestMeta.workType}, Lot={requestMeta.lotNumber}, SerialCode={(_backendSerialCode ?? "")}, RetentionGroove={(_backendRetentionGroove ?? "<null>")}, ManufacturerHexRotation(mode)={(_backendManufacturerHexRotation ?? "<null>")}, HexAppliedDeg={(_backendHexRotationAppliedDeg.HasValue ? _backendHexRotationAppliedDeg.Value.ToString("F4", CultureInfo.InvariantCulture) : "<null>")}");
                        AppLogger.Log($"StlFileProcessor: finishLine topZ={(finishLineTopZ.HasValue ? finishLineTopZ.Value.ToString("F4", CultureInfo.InvariantCulture) : "<null>")}, minZ={(finishLineMinZ.HasValue ? finishLineMinZ.Value.ToString("F4", CultureInfo.InvariantCulture) : "<null>")}, espritR={(finishLineEspritR.HasValue ? finishLineEspritR.Value.ToString("F4", CultureInfo.InvariantCulture) : "<null>")}, TwoPhase={twoPhase}");
                        if (!_prcManager.ApplyBackendPrcNames((BackendApiClient.RequestMetaCaseInfos)requestMeta, requestId, _backendImplantLabel))
                        {
                            AppLogger.Log("StlFileProcessor: 백엔드 PRC 설정 실패로 공정을 중단합니다.");
                            return;
                        }
                    }
                    else
                    {
                        throw new InvalidOperationException($"request-meta 응답이 비어있습니다. requestId={requestId}");
                    }
                }
                else
                {
                    AppLogger.Log("StlFileProcessor: requestId 추출 실패 - 파일명 규칙 확인 필요");
                }
                double machineBarDiameter = document?.LatheMachineSetup?.BarDiameter ?? 0;
                if (machineBarDiameter > 0)
                {
                    AppLogger.Log($"StlFileProcessor: 기존 장비 BarDiameter={machineBarDiameter:F3}");
                }
                else
                {
                    AppLogger.Log("StlFileProcessor: 기존 BarDiameter 정보를 찾을 수 없어 기본 절차를 사용합니다.");
                }
                if (materialDiameter.HasValue && materialDiameter.Value > 0)
                {
                    AppLogger.Log($"StlFileProcessor: 백엔드 MaterialDiameter 요청={materialDiameter.Value:F3}");
                    backendCamDiameter = materialDiameter.Value;
                }
                else if (requestMeta != null && requestMeta.camDiameter > 0)
                {
                    backendCamDiameter = requestMeta.camDiameter;
                    AppLogger.Log($"StlFileProcessor: request-meta CamDiameter 사용={backendCamDiameter.Value:F3}");
                }
                else
                {
                    AppLogger.Log("StlFileProcessor: 백엔드 CAM 직경을 찾지 못해 기존/추정 BarDiameter를 사용합니다.");
                }
                document.Refresh();
                Layer prevLayer = null;
                try
                {
                    prevLayer = document.ActiveLayer;
                }
                catch
                {
                }
                Layer stlLayer = EspritDocumentHelper.GetOrCreateLayer(document, StlImportLayerName);
                if (stlLayer != null)
                {
                    document.ActiveLayer = stlLayer;
                }
                document.MergeFile(stlPath);
                EspritDocumentHelper.LogBoundingBox(document, "AfterMerge");
                if (prevLayer != null)
                {
                    try
                    {
                        document.ActiveLayer = prevLayer;
                    }
                    catch
                    {
                    }
                }
                stlBoundingTopZ = TryComputeStlBoundingTopZ(document);
                AppLogger.Log($"StlFileProcessor: STL bounding topZ={(stlBoundingTopZ.HasValue ? stlBoundingTopZ.Value.ToString("F4", CultureInfo.InvariantCulture) : "<null>")}");
                Connect.SetCurrentDocument(document);
                UpdateLatheBarDiameter(document, stlPath, machineBarDiameter, backendCamDiameter);
                if (backendCamDiameter.HasValue && backendCamDiameter.Value > 0 && document?.LatheMachineSetup != null)
                {
                    // CAM 직경을 SSOT로 고정: 이후 공정 필터(턴/러프)가 동일 값을 참조한다.
                    document.LatheMachineSetup.BarDiameter = backendCamDiameter.Value;
                    Environment.SetEnvironmentVariable("ABUTS_CAM_DIAMETER", backendCamDiameter.Value.ToString(CultureInfo.InvariantCulture));
                    AppLogger.Log($"StlFileProcessor: CAM 직경 SSOT 고정 - BarDiameter={backendCamDiameter.Value:F3}");
                }
                Rotate90Degrees(document);

                string hexMode = NormalizeManufacturerHexRotationMode(_backendManufacturerHexRotation);
                double effectiveWAxisRotationDeg = 0.0;
                // 제조사 헥스 회전 정책 SSOT
                // - 보정(STL모델대로): 기본 +30도 + Rhino telemetry(appliedDeg)를 Esprit 부호계로 반전 적용
                //   => totalW = 30 + (-appliedDeg)
                // - 무보정(헥스30도회전): STL 회전은 보정(STL모델대로)와 동일 적용
                //   => totalW = 30 + (-appliedDeg)
                //   (차이는 NC 후처리에서 C0를 C30.0 계열로 치환.
                //    C30 정수 표기 금지 — CNC가 인식하지 못함. FormatRotationNumber 참고)
                // default fallback 금지: 허용 모드 외 값은 즉시 예외 처리한다.
                if (string.Equals(hexMode, ManufacturerHexModeCorrected, StringComparison.Ordinal))
                {
                    double telemetryHexRotationDegrees = ResolveManufacturerAdditionalHexRotationDegrees(hexMode);
                    RotateByWAxisDegrees(document, DefaultWAxisRotationDegrees);
                    if (Math.Abs(telemetryHexRotationDegrees) > 0.0001)
                    {
                        RotateByWAxisDegrees(document, telemetryHexRotationDegrees);
                    }
                    effectiveWAxisRotationDeg = DefaultWAxisRotationDegrees + telemetryHexRotationDegrees;
                    AppLogger.Log($"StlFileProcessor: 제조사 헥스 회전 보정(STL모델대로) 모드 적용 - base={DefaultWAxisRotationDegrees:F1}도, hexTelemetry={telemetryHexRotationDegrees:F4}도, total={effectiveWAxisRotationDeg:F4}도 (raw='{_backendManufacturerHexRotation ?? ""}')");
                }
                else if (string.Equals(hexMode, ManufacturerHexModeUncorrected, StringComparison.Ordinal))
                {
                    double telemetryHexRotationDegrees = ResolveManufacturerAdditionalHexRotationDegrees(hexMode);
                    RotateByWAxisDegrees(document, DefaultWAxisRotationDegrees);
                    if (Math.Abs(telemetryHexRotationDegrees) > 0.0001)
                    {
                        RotateByWAxisDegrees(document, telemetryHexRotationDegrees);
                    }
                    effectiveWAxisRotationDeg = DefaultWAxisRotationDegrees + telemetryHexRotationDegrees;
                    AppLogger.Log($"StlFileProcessor: 제조사 헥스 회전 무보정(헥스30도회전) 모드 적용 - stlModelBase={DefaultWAxisRotationDegrees:F1}도, hexTelemetry={telemetryHexRotationDegrees:F4}도, total={effectiveWAxisRotationDeg:F4}도 (raw='{_backendManufacturerHexRotation ?? ""}')");
                }
                else
                {
                    throw new InvalidOperationException($"지원하지 않는 manufacturerHexRotation 모드입니다. mode='{hexMode ?? ""}', raw='{_backendManufacturerHexRotation ?? ""}'");
                }
                // OrientationProfile/FinishLine 좌표변환도 STL 실회전과 동일한 각도를 사용하도록 env로 공유한다.
                Environment.SetEnvironmentVariable(CompositeOrientationWAxisDegreesEnv, effectiveWAxisRotationDeg.ToString(CultureInfo.InvariantCulture));
                AppLogger.Log($"StlFileProcessor: 실효 W축 회전각 공유 - {CompositeOrientationWAxisDegreesEnv}={effectiveWAxisRotationDeg.ToString("F4", CultureInfo.InvariantCulture)}");
                EspritDocumentHelper.LogBoundingBox(document, "AfterRotate");
                // add-in 실행 직전에도 CAM 직경 재확인/재적용(중간 단계에서 값이 변경되는 케이스 방지)
                if (backendCamDiameter.HasValue && backendCamDiameter.Value > 0 && document?.LatheMachineSetup != null)
                {
                    document.LatheMachineSetup.BarDiameter = backendCamDiameter.Value;
                    AppLogger.Log($"StlFileProcessor: Invoke 직전 CAM 직경 재적용 - BarDiameter={backendCamDiameter.Value:F3}");
                }
                var addinSw = System.Diagnostics.Stopwatch.StartNew();
                NcJobCancellation.ThrowIfCurrentCancelled("before-InvokeDentalAddin");
                InvokeDentalAddin(document, effectiveFrontLimit, effectiveBackLimit, stlBoundingTopZ, finishLineTopZ, finishLineMinZ, finishLineEspritR, twoPhase);
                addinSw.Stop();
                AppLogger.Log($"[PERF] StlFileProcessor.InvokeDentalAddin END elapsedMs={addinSw.ElapsedMilliseconds}");
                NcJobCancellation.ThrowIfCurrentCancelled("after-InvokeDentalAddin");
                CaptureNcMetadata(document);
                NcJobCancellation.ThrowIfCurrentCancelled("before-GenerateNc");
                AppLogger.Log("StlFileProcessor: NC 생성 시작");
                var ncSw = System.Diagnostics.Stopwatch.StartNew();
                string ncFilePath = _ncGenerator.GenerateNcFile(
                    document,
                    stlPath,
                    ResolveFrontPointForNc(),
                    ResolveStockDiameterForNc(document),
                    _backendSerialCode,
                    stlBoundingTopZ,
                    _prcManager?.ConnectionMachiningProcessFilePath,
                    _backendManufacturerHexRotation,
                    _backendHexRotationAppliedDeg);
                ncSw.Stop();
                AppLogger.Log($"StlFileProcessor: NC 생성 종료 - path={ncFilePath ?? "<null>"}");
                AppLogger.Log($"[PERF] StlFileProcessor.GenerateNc END elapsedMs={ncSw.ElapsedMilliseconds}");
                NcJobCancellation.ThrowIfCurrentCancelled("before-NotifyBackendSuccess");
                if (!string.IsNullOrWhiteSpace(ncFilePath))
                {
                    AppLogger.Log($"StlFileProcessor: NC file generated - {ncFilePath}");
                    BackendApiClient.NotifyBackendSuccess(requestId, stlPath, ncFilePath);
                }
                else
                {
                    AppLogger.Log($"StlFileProcessor: NC file generation failed - ncFilePath is empty");
                }

                processSw.Stop();
                AppLogger.Log($"StlFileProcessor: 완료 - {stlPath}");
                AppLogger.Log($"[PERF] StlFileProcessor.Process END elapsedMs={processSw.ElapsedMilliseconds}");
            }
            catch (OperationCanceledException oce)
            {
                processSw.Stop();
                AppLogger.Log($"StlFileProcessor: CAM 생성 중단 - {oce.Message}");
                AppLogger.Log($"[PERF] StlFileProcessor.Process END(cancelled) elapsedMs={processSw.ElapsedMilliseconds}");
                // 프론트 cancel-regeneration이 이미 CANCELLED 처리. 실패 콜백/REJECTED 금지.
                throw;
            }
            catch (Exception ex)
            {
                processSw.Stop();
                AppLogger.Log($"StlFileProcessor: 처리 중 오류 - {ex.Message}");
                AppLogger.Log($"[PERF] StlFileProcessor.Process END(error) elapsedMs={processSw.ElapsedMilliseconds}");
                try
                {
                    if (!string.IsNullOrWhiteSpace(requestId))
                    {
                        BackendApiClient.NotifyBackendFailure(requestId, stlPath, ex.Message);
                    }
                }
                catch (Exception notifyEx)
                {
                    AppLogger.Log($"StlFileProcessor: 실패 등록 중 오류 - {notifyEx.GetType().Name}:{notifyEx.Message}");
                }
                throw;
            }
        }
        private void CaptureNcMetadata(Document document)
        {
            try
            {
                AppLogger.Log("StlFileProcessor: CaptureNcMetadata 시작");
                Type mainModuleType = DentalAddinReflectionHelper.ResolveMainModuleType();
                AppLogger.Log($"StlFileProcessor: MainModuleType resolved = {(mainModuleType != null ? mainModuleType.FullName : "null")}");

                Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
                AppLogger.Log($"StlFileProcessor: MoveModuleType resolved = {(moveModuleType != null ? moveModuleType.FullName : "null")}");

                // Front도 Back과 동일하게 post-MoveSTL 값을 사용한다.
                // 이전에는 Front만 payload(_effectiveFrontLimitX, 이동 전)를 그대로 썼고
                // Back만 MoveSTL 이후 필드를 읽어 비대칭이었다(NC 헤더/ResolveFrontPointForNc 왜곡).
                _capturedFrontPointX = _effectiveFrontLimitX;
                _capturedBackPointX = null;

                if (moveModuleType != null)
                {
                    object frontPointXObj = DentalAddinReflectionHelper.GetMainModuleField<object>(moveModuleType, "FrontPointX");
                    AppLogger.Log($"StlFileProcessor: FrontPointX 필드 읽기 - obj={frontPointXObj}, type={frontPointXObj?.GetType().Name ?? "null"}");

                    if (frontPointXObj != null && frontPointXObj is double)
                    {
                        double preShiftFrontPointX = _capturedFrontPointX ?? double.NaN;
                        _capturedFrontPointX = (double)frontPointXObj;
                        AppLogger.Log($"StlFileProcessor: FrontPointX 캡처 성공(post-MoveSTL) - {preShiftFrontPointX:F4}(이동 전) -> {_capturedFrontPointX:F4}");
                    }
                    else
                    {
                        AppLogger.Log("StlFileProcessor: FrontPointX 캡처 실패 - frontPointXObj가 null이거나 double이 아님, payload(_effectiveFrontLimitX) fallback 유지");
                    }

                    object backPointXObj = DentalAddinReflectionHelper.GetMainModuleField<object>(moveModuleType, "BackPointX");
                    AppLogger.Log($"StlFileProcessor: BackPointX 필드 읽기 - obj={backPointXObj}, type={backPointXObj?.GetType().Name ?? "null"}");

                    if (backPointXObj != null && backPointXObj is double)
                    {
                        _capturedBackPointX = (double)backPointXObj;
                        AppLogger.Log($"StlFileProcessor: BackPointX 캡처 성공 - {_capturedBackPointX:F4}");
                    }
                    else
                    {
                        AppLogger.Log($"StlFileProcessor: BackPointX 캡처 실패 - backPointXObj가 null이거나 double이 아님");
                    }
                }
                else
                {
                    AppLogger.Log("StlFileProcessor: MoveModuleType이 null - Front/BackPointX 캡처 불가");
                }

                double barDiameter = document?.LatheMachineSetup?.BarDiameter ?? 0;
                _capturedStockDiameter = barDiameter > 0 ? barDiameter : (double?)null;
                AppLogger.Log($"StlFileProcessor: NC 메타 캡처 완료 - Front:{(_capturedFrontPointX?.ToString("F3") ?? "null")}, Back:{(_capturedBackPointX?.ToString("F3") ?? "null")}, StockDia:{(_capturedStockDiameter?.ToString("F3") ?? "null")}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: NC 메타 캡처 실패 - {ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}");
            }
        }
        private double ResolveFrontPointForNc()
        {
            AppLogger.Log($"StlFileProcessor: ResolveFrontPointForNc 호출 - _capturedFrontPointX={(_capturedFrontPointX?.ToString("F4") ?? "null")}");

            if (_capturedFrontPointX.HasValue && !double.IsNaN(_capturedFrontPointX.Value))
            {
                double absFrontPointX = Math.Abs(_capturedFrontPointX.Value);
                AppLogger.Log($"StlFileProcessor: FrontPointX 사용 - {_capturedFrontPointX.Value:F4} → Math.Abs = {absFrontPointX:F4}");
                return absFrontPointX;
            }

            string errorMsg = $"FrontPointX not captured (_capturedFrontPointX={((_capturedFrontPointX.HasValue ? _capturedFrontPointX.Value.ToString("F4") : "null"))})";
            AppLogger.Log($"StlFileProcessor: 에러 - {errorMsg}");
            throw new InvalidOperationException(errorMsg);
        }
        private double ResolveStockDiameterForNc(Document document)
        {
            if (_capturedStockDiameter.HasValue && _capturedStockDiameter.Value > 0)
            {
                return _capturedStockDiameter.Value;
            }
            double docValue = document?.LatheMachineSetup?.BarDiameter ?? 0;
            return docValue > 0 ? docValue : 0;
        }
        private void ResetPerRunState()
        {
            _capturedFrontPointX = null;
            _capturedBackPointX = null;
            _capturedStockDiameter = null;
            _backendLotNumber = null;
            _backendSerialCode = null;
            _backendRequestId = null;
            _backendImplantLabel = null;
            _backendFinishLinePoints = null;
            _backendManufacturerHexRotation = null;
            _backendHexRotationAppliedDeg = null;
            _effectiveFrontLimitX = null;
            Environment.SetEnvironmentVariable(AppConfig.CompositeFirstPassPercentAEnv, null);
            Environment.SetEnvironmentVariable(AppConfig.CompositeFinishToleranceEnv, null);
            Environment.SetEnvironmentVariable(AppConfig.TwoPhaseEnableEnv, null);
            Environment.SetEnvironmentVariable(AppConfig.TwoPhaseSplitXEnv, null);
            Environment.SetEnvironmentVariable(AppConfig.TwoPhaseTurningRegionEnv, null);
            Environment.SetEnvironmentVariable(AppConfig.TwoPhaseRoughRegionEnv, null);
            Environment.SetEnvironmentVariable(AppConfig.RoughfreeformSplitEnableEnv, null);
            Environment.SetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_X", null);
            Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_DYNAMIC_DISABLE", null);
            Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", null);
            Environment.SetEnvironmentVariable("ABUTS_RETENTION_GROOVE", null);
            Environment.SetEnvironmentVariable("ABUTS_CAM_DIAMETER", null);
            Environment.SetEnvironmentVariable("ABUTS_MAX_DIAMETER", null);
            Environment.SetEnvironmentVariable("ABUTS_FRONT_FACE_END_OFFSET_MM", null);
            Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_ORIENTATION_VECTOR", null);
            Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_ORIENTATION_PROFILE_LENGTH_MM", null);
            Environment.SetEnvironmentVariable(CompositeOrientationWAxisDegreesEnv, null);
            Environment.SetEnvironmentVariable(BackRoughFourWayEnableEnv, null);
            Environment.SetEnvironmentVariable(FinishLineMinZEnv, null);
            Environment.SetEnvironmentVariable(CompositeCuffProfileEnv, null);
            Environment.SetEnvironmentVariable(CompositeCuffStartXEnv, null);
            Environment.SetEnvironmentVariable(CompositeCuffEndXEnv, null);
            Environment.SetEnvironmentVariable(CompositeCuffProfilePointsEnv, null);

            FaceHoleProcessFilePath = null;
            ConnectionMachiningProcessFilePath = null;
            lotNumber = "ACR";
            exTab = null;
        }
        private static BackendApiClient.RequestMetaResponse FetchRequestMeta(string requestId)
        {
            if (string.IsNullOrWhiteSpace(requestId))
            {
                return null;
            }
            BackendApiClient backendClient = new BackendApiClient();
            var response = backendClient.FetchRequestMeta(requestId);
            return new BackendApiClient.RequestMetaResponse { ok = response != null, data = response };
        }
        [DataContract]
        private class RequestMetaResponse
        {
            [DataMember] public bool ok { get; set; }
            [DataMember] public RequestMetaData data { get; set; }
        }
        [DataContract]
        private class RequestMetaData
        {
            [DataMember] public string requestId { get; set; }
            [DataMember] public RequestMetaLotNumber lotNumber { get; set; }
            [DataMember] public string serialCode { get; set; }
            [DataMember] public RequestMetaCaseInfos caseInfos { get; set; }
        }
        [DataContract]
        private class RequestMetaLotNumber
        {
            [DataMember] public string part { get; set; }
        }
        [DataContract]
        private class RequestMetaCaseInfos
        {
            [DataMember] public string clinicName { get; set; }
            [DataMember] public string patientName { get; set; }
            [DataMember] public string tooth { get; set; }
            [DataMember] public string implantManufacturer { get; set; }
            [DataMember] public string implantSystem { get; set; }
            [DataMember] public string implantType { get; set; }
            [DataMember] public double maxDiameter { get; set; }
            [DataMember] public double connectionDiameter { get; set; }
            [DataMember] public double camDiameter { get; set; }
            [DataMember] public string workType { get; set; }
            [DataMember] public string lotNumber { get; set; }
            [DataMember] public string faceHolePrcFileName { get; set; }
            [DataMember] public string connectionPrcFileName { get; set; }
            // 제조사 수동 헥스 회전 모드값
            // - canonical: "STL모델대로" | "헥스30도회전" | "STL모델+" | "헥스30+"
            // - legacy: "0" | "30" | "헥스40도회전" (→ STL모델+)
            [DataMember] public string manufacturerHexRotation { get; set; }
            // 유지홈(retentionGroove) — Finish_Front(legacy A env 경로) StepIncrement
            // 값을 의뢰별로 덮어쓰기 위한 필드. rules.md §7.4.1 참조.
            [DataMember] public string retentionGroove { get; set; }
            [DataMember] public RequestMetaFinishLine finishLine { get; set; }
        }
        [DataContract]
        private class RequestMetaFinishLine
        {
            [DataMember] public double[][] points { get; set; }
        }
        private static double? TryGetFinishLineTopZ(RequestMetaData meta)
        {
            try
            {
                var pts = meta?.caseInfos?.finishLine?.points;
                if (pts == null || pts.Length < 2)
                {
                    return null;
                }
                double maxZ = double.NegativeInfinity;
                int valid = 0;
                foreach (var p in pts)
                {
                    if (p == null || p.Length < 3) continue;
                    double z = p[2];
                    if (double.IsNaN(z) || double.IsInfinity(z)) continue;
                    valid++;
                    if (z > maxZ) maxZ = z;
                }
                if (valid < 1 || double.IsNegativeInfinity(maxZ)) return null;
                return maxZ;
            }
            catch
            {
                return null;
            }
        }
        private static double? TryComputeStlBoundingTopZ(Document document)
        {
            double? result = null;
            List<string> createdFeatureKeys = null;
            SelectionSet selectionSet = null;
            try
            {
                if (document?.GraphicsCollection == null || document?.FeatureRecognition == null)
                {
                    return null;
                }
                const string selectionName = "StlBoundingTemp";
                try { selectionSet = document.SelectionSets.Add(selectionName); }
                catch { selectionSet = document.SelectionSets[selectionName]; }
                if (selectionSet == null) return null;
                selectionSet.RemoveAll();
                foreach (GraphicObject graphic in document.GraphicsCollection)
                {
                    if (graphic?.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        selectionSet.Add(graphic, Missing.Value);
                        break;
                    }
                }
                if (selectionSet.Count == 0)
                {
                    return null;
                }
                Plane plane = null;
                try { plane = document.Planes["YZX"]; } catch { }
                if (plane == null)
                {
                    try { plane = document.Planes["XYZ"]; } catch { }
                }
                if (plane == null) return null;
                HashSet<string> beforeKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    foreach (FeatureChain fc in document.FeatureChains)
                    {
                        if (fc?.Key != null) beforeKeys.Add(fc.Key);
                    }
                }
                catch { }
                document.FeatureRecognition.CreatePartProfileShadow(selectionSet, plane, espGraphicObjectReturnType.espFeatureChains);
                document.Refresh();
                FeatureChain created = null;
                createdFeatureKeys = new List<string>();
                try
                {
                    foreach (FeatureChain fc in document.FeatureChains)
                    {
                        if (fc?.Key == null) continue;
                        if (!beforeKeys.Contains(fc.Key))
                        {
                            createdFeatureKeys.Add(fc.Key);
                            if (created == null)
                            {
                                created = fc;
                            }
                        }
                    }
                }
                catch { }
                if (created == null || created.Length <= 0)
                {
                    return null;
                }
                result = EspritDocumentHelper.TryComputeFeatureChainMaxZ(created, createdFeatureKeys);
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: STL bounding topZ 계산 실패 - {ex.GetType().Name}:{ex.Message}");
            }
            finally
            {
                if (selectionSet != null)
                {
                    try { selectionSet.RemoveAll(); } catch { }
                }
                CleanupTemporaryFeatureChains(document, createdFeatureKeys, "Stl bounding");
            }
            return result;
        }





        public static void CleanupTemporaryFeatureChains(Document document, List<string> createdKeys, string context)
        {
            if (document?.FeatureChains == null || createdKeys == null)
            {
                return;
            }
            try
            {
                foreach (string key in createdKeys)
                {
                    try
                    {
                        var chain = document.FeatureChains[key];
                        if (chain != null)
                        {
                            document.FeatureChains.Remove(chain);
                        }
                    }
                    catch { }
                }
                AppLogger.Log($"StlFileProcessor: 임시 FeatureChain 정리 완료 - {context}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: 임시 FeatureChain 정리 실패 - {context} ({ex.GetType().Name}:{ex.Message})");
            }
        }


        private void Rotate90Degrees(Document document)
        {
            if (document == null)
            {
                return;
            }
            const string selectionName = "StlProcessorTemp";
            SelectionSet selectionSet = EspritDocumentHelper.GetOrCreateSelectionSet(document, selectionName);
            if (selectionSet == null)
            {
                AppLogger.Log("StlFileProcessor: SelectionSet 생성 실패");
                return;
            }
            selectionSet.RemoveAll();
            foreach (GraphicObject graphic in document.GraphicsCollection)
            {
                if (graphic?.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                {
                    selectionSet.Add(graphic, Missing.Value);
                }
            }
            if (selectionSet.Count == 0)
            {
                AppLogger.Log("StlFileProcessor: 회전 대상 STL이 없습니다.");
                return;
            }
            Point origin = document.GetPoint(0, 0, 0);
            Point yAxisPoint = document.GetPoint(0, 1, 0);
            Segment yAxis = document.GetSegment(origin, yAxisPoint);
            selectionSet.Rotate(yAxis, -Math.PI / 2, Missing.Value);
            selectionSet.RemoveAll();
        }
        private void RotateByWAxisDegrees(Document document, double degrees)
        {
            if (document == null)
            {
                return;
            }
            if (Math.Abs(degrees) <= 0.0001)
            {
                return;
            }

            const string selectionName = "StlProcessorTemp";
            SelectionSet selectionSet = EspritDocumentHelper.GetOrCreateSelectionSet(document, selectionName);
            if (selectionSet == null)
            {
                AppLogger.Log("StlFileProcessor: W축 회전용 SelectionSet 생성 실패");
                return;
            }

            try
            {
                selectionSet.RemoveAll();
                foreach (GraphicObject graphic in document.GraphicsCollection)
                {
                    if (graphic?.GraphicObjectType == espGraphicObjectType.espSTL_Model)
                    {
                        selectionSet.Add(graphic, Missing.Value);
                    }
                }
                if (selectionSet.Count == 0)
                {
                    AppLogger.Log("StlFileProcessor: W축 회전 대상 STL이 없습니다.");
                    return;
                }

                Point origin = document.GetPoint(0, 0, 0);
                Point xAxisPoint = document.GetPoint(1, 0, 0);
                Segment wAxis = document.GetSegment(origin, xAxisPoint);
                double angleRad = degrees * Math.PI / 180.0;
                selectionSet.Rotate(wAxis, angleRad, Missing.Value);
                AppLogger.Log($"StlFileProcessor: STL W축 회전 적용 - {degrees:F1}도 (C0 기준)");
            }
            finally
            {
                try
                {
                    selectionSet.RemoveAll();
                }
                catch
                {
                }
            }
        }
        // related files (manufacturer hex rotation mode validation):
        // - web/backend/controllers/bg/bg.controller.js
        // - web/backend/controllers/requests/common.requests.controller.js
        private string NormalizeManufacturerHexRotationMode(string rawMode)
        {
            string mode = string.IsNullOrWhiteSpace(rawMode)
                ? ""
                : rawMode.Trim();

            // canonical 입력 우선
            if (string.Equals(mode, ManufacturerHexModeCorrected, StringComparison.Ordinal))
            {
                return ManufacturerHexModeCorrected;
            }
            if (string.Equals(mode, ManufacturerHexModeUncorrected, StringComparison.Ordinal))
            {
                return ManufacturerHexModeUncorrected;
            }
            // 플러스 모드: STL 실회전은 STL모델대로(보정)와 동일. NC C축만 modeBase+addDeg.
            // 검색: STL모델+, 헥스30+, ApplyManufacturerHexRotationToNc
            if (string.Equals(mode, ManufacturerHexModeStlPlus, StringComparison.Ordinal) ||
                string.Equals(mode, "헥스40도회전", StringComparison.Ordinal) ||
                string.Equals(mode, "헥스10도회전", StringComparison.Ordinal))
            {
                return ManufacturerHexModeCorrected;
            }
            if (string.Equals(mode, ManufacturerHexModeHex30Plus, StringComparison.Ordinal))
            {
                return ManufacturerHexModeCorrected;
            }
            if (Regex.IsMatch(mode, @"^\s*헥스\s*[+-]?\d+(?:\.\d+)?\s*도회전\s*$", RegexOptions.CultureInvariant))
            {
                // 레거시 헥스X도회전 → STL 회전은 보정(STL모델대로) 경로. NC는 GenerateNcFile 원본 라벨로 후처리.
                return ManufacturerHexModeCorrected;
            }

            // legacy 입력 하위호환
            if (string.Equals(mode, "0", StringComparison.Ordinal))
            {
                return ManufacturerHexModeCorrected;
            }
            if (string.Equals(mode, "30", StringComparison.Ordinal))
            {
                return ManufacturerHexModeUncorrected;
            }

            if (string.IsNullOrWhiteSpace(mode))
            {
                throw new InvalidOperationException("manufacturerHexRotation 값이 비어 있습니다. request-meta.caseInfos.manufacturerHexRotation은 'STL모델대로' | '헥스30도회전' | 'STL모델+' | '헥스30+' 이어야 합니다.");
            }

            throw new InvalidOperationException($"지원하지 않는 manufacturerHexRotation 값입니다. value='{mode}'");
        }

        private double ResolveManufacturerAdditionalHexRotationDegrees(string normalizedMode)
        {
            // 정책: "보정(STL모델대로)" 기준 보정량(-appliedDeg)을 계산한다.
            //       "무보정(헥스30도회전)"도 이 기준값을 그대로 쓰고, 별도 +30도를 추가한다.
            // 중요: appliedDeg는 Rhino 좌표계 기준 값이며 Esprit W축 회전 부호계와 반대이므로
            //        Esprit 적용값은 부호를 반전한다. (STL모델대로 SSOT: +30 + (-appliedDeg))
            if (!string.Equals(normalizedMode, ManufacturerHexModeCorrected, StringComparison.Ordinal) &&
                !string.Equals(normalizedMode, ManufacturerHexModeUncorrected, StringComparison.Ordinal))
            {
                throw new InvalidOperationException($"지원하지 않는 manufacturerHexRotation 모드입니다. mode='{normalizedMode ?? ""}'");
            }

            if (_backendHexRotationAppliedDeg.HasValue &&
                !double.IsNaN(_backendHexRotationAppliedDeg.Value) &&
                !double.IsInfinity(_backendHexRotationAppliedDeg.Value))
            {
                double rawAppliedDeg = _backendHexRotationAppliedDeg.Value;
                double espritAppliedDeg = -rawAppliedDeg;
                AppLogger.Log($"StlFileProcessor: hex telemetry 부호 반전 적용 - rawAppliedDeg={rawAppliedDeg.ToString("F4", CultureInfo.InvariantCulture)}, espritAppliedDeg={espritAppliedDeg.ToString("F4", CultureInfo.InvariantCulture)}");
                return espritAppliedDeg;
            }

            AppLogger.Log("StlFileProcessor: hexRotation.appliedDeg 없음 - telemetry 보정 0도 적용");
            return 0.0;
        }
        private void InvokeDentalAddin(Document document, double frontLimitX, double backLimitX, double? stlTopZ, double? finishLineTopZ, double? finishLineMinZ, double? finishLineEspritR, bool twoPhase)
        {
            if (document == null || _espApp == null)
            {
                return;
            }
            try
            {
                Type mainModuleType = DentalAddinReflectionHelper.ResolveMainModuleType();
                if (mainModuleType == null)
                {
                    AppLogger.Log("DentalAddin: MainModule 타입을 찾을 수 없습니다.");
                    return;
                }
                try
                {
                    var mmAsm = mainModuleType.Assembly;
                    var mmAsmName = mmAsm?.GetName();
                    AppLogger.Log($"DentalAddin: MainModuleType - {mainModuleType.FullName}, Assembly:{mmAsmName?.Name}, Version:{mmAsmName?.Version}, Location:{mmAsm?.Location}");
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"DentalAddin: MainModuleType Assembly 정보 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
                }
                EnsureMainModuleContext(mainModuleType, document);
                bool bindInvoked = DentalAddinReflectionHelper.TryInvokeMainModuleMethod(mainModuleType, "Bind", false, _espApp, document);
                if (!bindInvoked)
                {
                    AppLogger.Log("DentalAddin: Bind 미제공 - 필드 주입만으로 진행합니다.");
                }
                _configurator.ConfigureDentalProcesses(mainModuleType);
                ApplyTurningParameters(mainModuleType);
                EnsureMoveModuleDefaults(mainModuleType, document);
                ApplyLimitPoints(mainModuleType, frontLimitX, backLimitX, finishLineTopZ, finishLineEspritR, stlTopZ);

                AppLogger.Log("DentalAddin: MoveSurface 실행 시작 - NeedMoveY/Z 계산");
                InvokeMoveSurface(mainModuleType);
                AppLogger.Log("DentalAddin: MoveSurface 실행 완료");

                AppLogger.Log($"DentalAddin: MoveSTL 실행 시작 (FrontLimit:{frontLimitX}, BackLimit:{backLimitX})");
                InvokeMoveSTL(mainModuleType);

                // Finish_Cuff용 finishline profile을 MoveSTL 이후 좌표계로 생성/등록한다.
                // 중요: profile 생성은 MoveSTL 이후에 수행해야 한다.
                // 이유: MoveSTL이 모델 X를 이동시키므로, 생성 시점이 어긋나면 SpineProfile과 실제 모델 좌표가 불일치한다.
                TryCreateCompositeCuffFinishLineProfile(document, mainModuleType, backLimitX);



                TryApplyCompositeSplitByFinishLine(mainModuleType, stlTopZ, finishLineTopZ);
                TryApplyTwoPhaseSplitByFinishLine(mainModuleType, stlTopZ, finishLineTopZ, twoPhase);
                TryApplyBackRoughModeByFinishLineMinZ(finishLineMinZ);
                // 유지홈(none/deep) → ABUTS_RETENTION_GROOVE. StepIncrement는 MainModuleComposite가 groove로 직접 적용.
                TryApplyRetentionGrooveToStepIncrementEnv();

                AppLogger.Log("DentalAddin: Emerge 실행 시작 - IGS 서피스 Merge 및 Translate");
                // 중요: Turn_B 직전 Finish_Front 선행 실행 시 DriveSurface(=SurfaceNumber)가 필요하므로
                // Main 이전에 Emerge를 반드시 1회 수행해 SurfaceNumber를 확보한다.
                InvokeEmerge(mainModuleType, document);
                AppLogger.Log("DentalAddin: Emerge 실행 완료");

                AppLogger.Log("DentalAddin: Main 실행 시작");
                bool searchToolInvoked = DentalAddinReflectionHelper.TryInvokeMainModuleMethod(mainModuleType, "SearchTool", false);
                AppLogger.Log(searchToolInvoked
                    ? "DentalAddin: SearchTool 실행 완료"
                    : "DentalAddin: SearchTool 미제공 - 기존 Tool 구성 사용");
                EnsureCompositeTool(mainModuleType, document);
                bool mainInvoked = DentalAddinReflectionHelper.TryInvokeMainModuleMethod(mainModuleType, "Main");
                if (!mainInvoked)
                {
                    return;
                }
                AppLogger.Log("DentalAddin: Main 실행 완료");
                AppLogger.Log("DentalAddin: PostMain - 작업 완료");
                AppLogger.Log("StlFileProcessor: DentalPanel 호출 완료");
            }
            catch (Exception ex)
            {
                Exception root = ex.GetBaseException();
                AppLogger.Log($"StlFileProcessor: DentalAddin 실행 실패\n{root}");
                throw;
            }
        }
        private void EnsureCompositeTool(Type mainModuleType, Document document)
        {
            try
            {
                object tools = document?.Tools;
                if (tools == null)
                {
                    AppLogger.Log("CompositeTool - Document.Tools null");
                    return;
                }
                int[] numCombobox = DentalAddinReflectionHelper.GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                int finishingMethod = (numCombobox != null && numCombobox.Length > 1) ? numCombobox[1] : 0;
                string strictToolId = null;
                string relaxedToolId = null;
                string relaxedInfo = null;
                foreach (Tool tool in EnumerateTools(tools))
                {
                    if (tool is not ToolMillBallMill ball)
                    {
                        continue;
                    }
                    if (finishingMethod == 1 && string.IsNullOrWhiteSpace(strictToolId) && Math.Abs(ball.ToolDiameter - 1.2) <= 0.05)
                    {
                        strictToolId = ball.ToolID;
                        break;
                    }
                    if (string.IsNullOrWhiteSpace(strictToolId) &&
                        ball.Orientation == espMillToolOrientation.espMillToolOrientationYPlus &&
                        Math.Abs(ball.ToolDiameter - 4.0) <= 0.01)
                    {
                        strictToolId = ball.ToolID;
                        break;
                    }
                    if (string.IsNullOrWhiteSpace(relaxedToolId) && Math.Abs(ball.ToolDiameter - 4.0) <= 0.5)
                    {
                        relaxedToolId = ball.ToolID;
                        relaxedInfo = $"Dia:{ball.ToolDiameter:F2}, Ori:{ball.Orientation}";
                    }
                }
                string targetToolId = !string.IsNullOrWhiteSpace(strictToolId) ? strictToolId : relaxedToolId;
                if (string.IsNullOrWhiteSpace(targetToolId))
                {
                    AppLogger.Log($"DentalAddin: CompositeTool - BM1.2 공구를 찾지 못했습니다. Finishing 4축 공정이 누락될 수 있습니다.");
                    LogToolsSnapshot(tools);
                    return;
                }
                if (string.IsNullOrWhiteSpace(strictToolId))
                {
                    AppLogger.Log($"DentalAddin: CompositeTool - 원본(Y+ Ø4) 미발견, 완화조건으로 선택: {targetToolId} ({relaxedInfo})");
                    LogToolsSnapshot(tools);
                }
                else
                {
                    AppLogger.Log($"DentalAddin: CompositeTool - 원본조건 공구 사용: {targetToolId}");
                }
                DentalAddinReflectionHelper.SetStaticField(mainModuleType, "ToolNs", targetToolId);
                AppLogger.Log($"DentalAddin: CompositeTool - ToolNs 설정: {targetToolId} (FinishingMethod:{finishingMethod})");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"CompositeTool 준비 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static void DisableComposite2(Type mainModuleType)
        {
            try
            {
                AppLogger.Log("CompositeTool - DisableComposite2 호출됨 (NumCombobox 수정은 하지 않음)");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"CompositeTool - Composite2 비활성화 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static void LogToolsSnapshot(object tools)
        {
            try
            {
                int total = GetCollectionCount(tools);
                AppLogger.Log($"CompositeTool - Tools.Count:{total}");
                int printed = 0;
                foreach (Tool tool in EnumerateTools(tools))
                {
                    if (printed >= 80)
                    {
                        AppLogger.Log("CompositeTool - Tools 출력 생략(상한 80)");
                        break;
                    }
                    string id = string.Empty;
                    espToolType style = 0;
                    try { id = tool.ToolID ?? string.Empty; } catch { }
                    try { style = tool.ToolStyle; } catch { }
                    if (tool is ToolMillBallMill ball)
                    {
                        AppLogger.Log($"CompositeTool - Tool[{printed + 1}] Id:{id}, Style:{style}, Dia:{ball.ToolDiameter:F2}, Ori:{ball.Orientation}");
                    }
                    else
                    {
                        AppLogger.Log($"CompositeTool - Tool[{printed + 1}] Id:{id}, Style:{style}");
                    }
                    printed++;
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"CompositeTool - Tools 스냅샷 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private static IEnumerable<Tool> EnumerateTools(object tools)
        {
            if (tools == null)
            {
                yield break;
            }
            int count = GetCollectionCount(tools);
            if (count > 0)
            {
                for (int i = 1; i <= count; i++)
                {
                    Tool tool = GetToolByIndex(tools, i);
                    if (tool != null)
                    {
                        yield return tool;
                    }
                }
                yield break;
            }
            if (tools is IEnumerable enumerable)
            {
                foreach (object entry in enumerable)
                {
                    if (entry is Tool tool)
                    {
                        yield return tool;
                    }
                }
            }
        }
        private static int GetCollectionCount(object collection)
        {
            if (collection == null)
            {
                return 0;
            }
            try
            {
                object value = collection.GetType().InvokeMember("Count", BindingFlags.GetProperty, null, collection, null);
                if (value is int count)
                {
                    return count;
                }
            }
            catch
            {
                // ignore
            }
            return 0;
        }
        private static Tool GetToolByIndex(object collection, int index)
        {
            if (collection == null)
            {
                return null;
            }
            object[] args = { index };
            try
            {
                object value = collection.GetType().InvokeMember("Item", BindingFlags.GetProperty, null, collection, args);
                return value as Tool;
            }
            catch
            {
                try
                {
                    object value = collection.GetType().InvokeMember("get_Item", BindingFlags.InvokeMethod, null, collection, args);
                    return value as Tool;
                }
                catch
                {
                    // ignore
                }
            }
            return null;
        }
        private void ApplyLimitPoints(Type mainModuleType, double frontLimitX, double backLimitX, double? finishLineTopZ = null, double? finishLineEspritR = null, double? stlTopZ = null)
        {
            Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
            if (moveModuleType == null)
            {
                AppLogger.Log("DentalAddin: MoveSTL_Module 타입을 찾을 수 없습니다.");
                return;
            }
            AppLogger.Log($"DentalAddin: ApplyLimitPoints - FrontPointX={frontLimitX:F4}, BackPointX={backLimitX:F4} (초기값) 설정");
            DentalAddinReflectionHelper.SetStaticField(moveModuleType, "FrontPointX", frontLimitX);
            DentalAddinReflectionHelper.SetStaticField(moveModuleType, "BackPointX", backLimitX);
            double downZ = DentalAddinPrcManager.ReadBottomZLimitFromFacePrc();
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "DownZ", downZ);
            AppLogger.Log($"DentalAddin: MoveSTL_Module 필드 설정 완료 - BackPointX는 STL 이동 중 업데이트될 예정, DownZ={downZ}");
            if (finishLineTopZ.HasValue)
            {
                DentalAddinReflectionHelper.SetStaticField(moveModuleType, "FinishLineTopZ", finishLineTopZ.Value);
                // [SSOT] FrontPointX = -FrontPoint.z 와 동일: FinishLineX = -finishLineTopZ (MoveSTL 이전)
                // MoveSTL/Chazhi: Abs 가드로 += delta → 후 = BackPointX - finishLineTopZ (초기 Back=0)
                // 금지: Back + Z - stlTopZ (finish line을 헥스/하방 쪽으로 ~stlTopZ-2Z 밀림).
                double finishLineEspritX = -finishLineTopZ.Value;
                DentalAddinReflectionHelper.SetStaticField(moveModuleType, "FinishLineX", finishLineEspritX);
                AppLogger.Log($"DentalAddin: FinishLineX 변환 - finishLineTopZ:{finishLineTopZ.Value:F4}, formula:X=-Z, backLimitX:{backLimitX:F4}, stlTopZ:{(stlTopZ.HasValue ? stlTopZ.Value.ToString("F4") : "<null>")}(ignored) → FinishLineX:{finishLineEspritX:F4}");
            }
            if (finishLineEspritR.HasValue)
            {
                DentalAddinReflectionHelper.SetStaticField(moveModuleType, "FinishLineR", finishLineEspritR.Value);
            }
            if (finishLineTopZ.HasValue || finishLineEspritR.HasValue)
            {
                AppLogger.Log($"DentalAddin: 한계점 설정 완료 - FrontPointX:{frontLimitX}, BackPointX:{backLimitX}, FinishLineR:{(finishLineEspritR.HasValue ? finishLineEspritR.Value.ToString("F4") : "<null>")}");
            }
            else
            {
                AppLogger.Log($"DentalAddin: 한계점 설정 완료 - FrontPointX:{frontLimitX}, BackPointX:{backLimitX}");
            }
        }

        private void TryApplyCompositeSplitByFinishLine(Type mainModuleType, double? stlTopZ, double? finishLineTopZ)
                {
                    try
                    {
                        if (!stlTopZ.HasValue || !finishLineTopZ.HasValue)
                        {
                            AppLogger.Log("DentalAddin: finishLine 기반 Composite2SplitLine2 생략 - topZ 부족");
                            return;
                        }
                        if (double.IsNaN(stlTopZ.Value) || double.IsNaN(finishLineTopZ.Value))
                        {
                            AppLogger.Log("DentalAddin: finishLine 기반 Composite2SplitLine2 생략 - topZ NaN");
                            return;
                        }

                        Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
                        if (moveModuleType == null)
                        {
                            AppLogger.Log("DentalAddin: finishLine 기반 Composite2SplitLine2 생략 - MoveSTL_Module 타입 없음");
                            return;
                        }

                        FieldInfo frontField = moveModuleType.GetField("FrontPointX", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                        FieldInfo backField = moveModuleType.GetField("BackPointX", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                        if (frontField == null || backField == null)
                        {
                            AppLogger.Log("DentalAddin: finishLine 기반 Composite2SplitLine2 생략 - Front/BackPointX 필드 없음");
                            return;
                        }

                        double frontX = Convert.ToDouble(frontField.GetValue(null), CultureInfo.InvariantCulture);
                        double backX = Convert.ToDouble(backField.GetValue(null), CultureInfo.InvariantCulture);

                        // finishLine 기준 오프셋(mm) - 기본 1.0
                        // 필요 시 env(ABUTS_FINISHLINE_SPLIT_OFFSET_MM)로 런타임 조정 가능
                        double offsetMm = 1.0;
                        string offsetRaw = Environment.GetEnvironmentVariable("ABUTS_FINISHLINE_SPLIT_OFFSET_MM");
                        if (!string.IsNullOrWhiteSpace(offsetRaw) && double.TryParse(offsetRaw, NumberStyles.Float, CultureInfo.InvariantCulture, out double parsedOffset))
                        {
                            offsetMm = parsedOffset;
                        }

                        double span = backX - frontX;
                        if (Math.Abs(span) < 0.001)
                        {
                            AppLogger.Log("DentalAddin: finishLine 기반 Composite2SplitLine2 생략 - span 너무 작음");
                            return;
                        }

                        double direction = span >= 0 ? 1.0 : -1.0;

                        // 진단용: MoveSTL_Module.FinishLineX (ApplyLimitPoints + MoveSTL/Chazhi 시프트 후).
                        // SharedFinishSplit env는 아래 topX 식으로 직접 계산한다.
                        double? finishXByField = null;
                        FieldInfo finishXField = moveModuleType.GetField("FinishLineX", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                        if (finishXField != null)
                        {
                            try
                            {
                                object fv = finishXField.GetValue(null);
                                if (fv != null)
                                {
                                    double parsed = Convert.ToDouble(fv, CultureInfo.InvariantCulture);
                                    if (!double.IsNaN(parsed) && !double.IsInfinity(parsed))
                                    {
                                        finishXByField = parsed;
                                    }
                                }
                            }
                            catch { }
                        }

                        // 기준점(권위값): backend finishLineTopZ → MoveSTL 이후 ESPRIT X
                        // SSOT: X=-Z, 초기 Back=0 → currentFinishX = backX - finishTopZ
                        double currentFinishX = backX - finishLineTopZ.Value;

                        // 오프셋 방향 정책:
                        // - env ABUTS_FINISHLINE_SPLIT_SIDE=front|back 로 명시 가능
                        // - 기본값: front (요청사항: finish line 최정상보다 1mm 좌측)
                        string splitSideRaw = Environment.GetEnvironmentVariable("ABUTS_FINISHLINE_SPLIT_SIDE");
                        bool useFrontSide = string.Equals(splitSideRaw, "front", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(splitSideRaw, "left", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(splitSideRaw, "-1", StringComparison.OrdinalIgnoreCase);
                        bool useBackSide = string.Equals(splitSideRaw, "back", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(splitSideRaw, "right", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(splitSideRaw, "1", StringComparison.OrdinalIgnoreCase);
                        if (!useFrontSide && !useBackSide)
                        {
                            useFrontSide = true;
                        }

                        double candidateFront = currentFinishX - direction * offsetMm;
                        double candidateBack = currentFinishX + direction * offsetMm;
                        double rawSplitX = useFrontSide ? candidateFront : candidateBack;

                        double xMin = Math.Min(0.0, Math.Min(frontX, backX));
                        double xMax = Math.Max(frontX, backX);
                        // 경계에 너무 붙으면 SplitPercent가 0%/100%에 붙어 AB 분할이 꺼지므로 0.5mm 안전 마진 사용
                        double splitX = Math.Max(xMin + 0.5, Math.Min(xMax - 0.5, rawSplitX));
                        bool clamped = Math.Abs(splitX - rawSplitX) > 1e-6;

                        Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_SPLIT_ENABLE", "1");
                        Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_SPLIT_X", splitX.ToString(CultureInfo.InvariantCulture));
                        AppLogger.Log($"DentalAddin: finishLine split 적용(v3) - bboxTopZ:{stlTopZ.Value.ToString("F4", CultureInfo.InvariantCulture)}, finishTopZ:{finishLineTopZ.Value.ToString("F4", CultureInfo.InvariantCulture)}, finishXByField(diag):{(finishXByField.HasValue ? finishXByField.Value.ToString("F4", CultureInfo.InvariantCulture) : "<null>")}, currentFinishX(authoritative):{currentFinishX.ToString("F4", CultureInfo.InvariantCulture)}, offsetMm:{offsetMm.ToString("F3", CultureInfo.InvariantCulture)}, sideRaw:'{splitSideRaw ?? ""}', useFront:{useFrontSide}, useBack:{useBackSide}, candidateFront:{candidateFront.ToString("F4", CultureInfo.InvariantCulture)}, candidateBack:{candidateBack.ToString("F4", CultureInfo.InvariantCulture)}, rawSplitX:{rawSplitX.ToString("F4", CultureInfo.InvariantCulture)}, splitX(safe-clamped):{splitX.ToString("F4", CultureInfo.InvariantCulture)}, clamped:{clamped} (xRange:[{xMin.ToString("F4", CultureInfo.InvariantCulture)}~{xMax.ToString("F4", CultureInfo.InvariantCulture)}], Front:{frontX.ToString("F4", CultureInfo.InvariantCulture)}, Back:{backX.ToString("F4", CultureInfo.InvariantCulture)}, span:{span.ToString("F4", CultureInfo.InvariantCulture)}, dir:{direction.ToString("F0", CultureInfo.InvariantCulture)}, deltaFromFinish:{(splitX - currentFinishX).ToString("F4", CultureInfo.InvariantCulture)})");
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Log($"DentalAddin: finishLine 기반 Composite2SplitLine2 설정 실패 - {ex.GetType().Name}:{ex.Message}");
                    }
                }

                // TwoPhase(초기 Turning/Rough) 분할선을 finishLine 최상 Z점 자체 기준으로 계산하여 env로 전달
                private void TryApplyTwoPhaseSplitByFinishLine(Type mainModuleType, double? stlTopZ, double? finishLineTopZ, bool twoPhase)
                {
                    try
                    {
                        if (!twoPhase)
                        {
                            return;
                        }
                        if (!stlTopZ.HasValue || !finishLineTopZ.HasValue)
                        {
                            AppLogger.Log("DentalAddin: TwoPhase split 생략 - stlTopZ/finishLineTopZ 부족");
                            return;
                        }

                        Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
                        if (moveModuleType == null)
                        {
                            AppLogger.Log("DentalAddin: TwoPhase split 생략 - MoveSTL_Module 타입 없음");
                            return;
                        }

                        FieldInfo frontField = moveModuleType.GetField("FrontPointX", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                        FieldInfo backField = moveModuleType.GetField("BackPointX", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                        if (frontField == null || backField == null)
                        {
                            AppLogger.Log("DentalAddin: TwoPhase split 생략 - Front/BackPointX 필드 없음");
                            return;
                        }

                        double frontX = Convert.ToDouble(frontField.GetValue(null), CultureInfo.InvariantCulture);
                        double backX = Convert.ToDouble(backField.GetValue(null), CultureInfo.InvariantCulture);
                        double xMin = Math.Min(frontX, backX);
                        double xMax = Math.Max(frontX, backX);

                        // [SSOT] SharedFinishSplitX
                        //   Front_Rough끝 = Splitline_2 = Finish_Front끝
                        //   = finishLineTopX - 1.0 (피니시라인 topZ 상방=tip쪽 1mm)
                        // 좌표 (MoveSTL 이후, FrontPoint와 동일 X=-Z):
                        //   finishLineTopX = BackPointX - finishLineTopZ
                        // MainModuleComposite.SharedFinishSplitOffsetFromFinishLineTopMm 과 동일해야 한다.
                        // MoveSTL FinishLineX 시프트는 Abs 가드 필수(음수 초기값).
                        const double splitOffsetMm = -1.0;
                        double topX = backX - finishLineTopZ.Value;
                        double rawSplitX = topX + splitOffsetMm;
                        double splitX = Math.Max(xMin + 0.01, Math.Min(xMax - 0.01, rawSplitX));

                        Environment.SetEnvironmentVariable(AppConfig.TwoPhaseEnableEnv, "1");
                        Environment.SetEnvironmentVariable(AppConfig.TwoPhaseSplitXEnv, splitX.ToString(CultureInfo.InvariantCulture));
                        Environment.SetEnvironmentVariable(AppConfig.RoughfreeformSplitEnableEnv, "1");
                        Environment.SetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_X", splitX.ToString(CultureInfo.InvariantCulture));

                        AppLogger.Log($"DentalAddin: SharedFinishSplit 적용 - finishLineTopZ:{finishLineTopZ.Value.ToString("F4", CultureInfo.InvariantCulture)}, topX:{topX.ToString("F4", CultureInfo.InvariantCulture)} (=Back-Z), splitOffsetMm:{splitOffsetMm.ToString("F3", CultureInfo.InvariantCulture)}, sharedSplitX:{splitX.ToString("F4", CultureInfo.InvariantCulture)} (=Front_Rough끝/Splitline_2/Finish seam, finishTop 상방1mm) (Front:{frontX.ToString("F4", CultureInfo.InvariantCulture)}, Back:{backX.ToString("F4", CultureInfo.InvariantCulture)})");
                            }
                            catch (Exception ex)
                            {
                                AppLogger.Log($"DentalAddin: TwoPhase split 설정 실패 - {ex.GetType().Name}:{ex.Message}");
                            }
                        }

                private void TryApplyBackRoughModeByFinishLineMinZ(double? finishLineMinZ)
                {
                    try
                    {
                        if (!finishLineMinZ.HasValue || double.IsNaN(finishLineMinZ.Value) || double.IsInfinity(finishLineMinZ.Value))
                        {
                            Environment.SetEnvironmentVariable(BackRoughFourWayEnableEnv, "0");
                            Environment.SetEnvironmentVariable(FinishLineMinZEnv, null);
                            AppLogger.Log("DentalAddin: Back_Rough 각도 정책 적용 - finishLine minZ 없음, 2-way(180deg x2) 고정");
                            return;
                        }

                        double minZ = finishLineMinZ.Value;

                        Environment.SetEnvironmentVariable(FinishLineMinZEnv, minZ.ToString(CultureInfo.InvariantCulture));
                        Environment.SetEnvironmentVariable(BackRoughFourWayEnableEnv, "0");

                        AppLogger.Log($"DentalAddin: Back_Rough 각도 정책 적용 - finishLineMinZ:{minZ.ToString("F4", CultureInfo.InvariantCulture)}, mode:180deg x2(고정)");
                    }
                    catch (Exception ex)
                    {
                        Environment.SetEnvironmentVariable(BackRoughFourWayEnableEnv, "0");
                        Environment.SetEnvironmentVariable(FinishLineMinZEnv, null);
                        AppLogger.Log($"DentalAddin: Back_Rough 각도 정책 설정 실패 - {ex.GetType().Name}:{ex.Message}");
                    }
                }

        // Finish_Cuff용 backend finishline curve 생성.
        //
        // 입력:
        // - _backendFinishLinePoints: backend request-meta.finishLine.points (source STL 좌표계)
        // - originalBackLimitX: MoveSTL 전 BackPointX(payload)
        //
        // 출력:
        // - ABUTS_COMPOSITE_CUFF_PROFILE = "6,<featureChainKey>"
        // - ABUTS_COMPOSITE_CUFF_START_X = finishline min_z를 현 좌표계 X로 환산한 값
        // - ABUTS_COMPOSITE_CUFF_END_X   = finishline min_z 기준 우측 +1.5mm를 현 좌표계 X로 환산한 값
        //
        // 좌표 변환 SSOT:
        // 1) Rotate90Degrees(Y축 -90°)
        // 2) RotateByWAxisDegrees(X축 +30°)
        // 3) MoveSTL 후 X 이동량(deltaX = movedBackX - originalBackLimitX) 반영
        private void TryCreateCompositeCuffFinishLineProfile(Document document, Type mainModuleType, double originalBackLimitX)
        {
            try
            {
                if (document == null || _backendFinishLinePoints == null || _backendFinishLinePoints.Length < 3)
                {
                    AppLogger.Log("DentalAddin: Composite Cuff FinishLine profile 생성 생략 - finishLine points 부족");
                    return;
                }

                Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
                if (moveModuleType == null)
                {
                    AppLogger.Log("DentalAddin: Composite Cuff FinishLine profile 생성 생략 - MoveSTL_Module 타입 없음");
                    return;
                }

                FieldInfo backField = moveModuleType.GetField("BackPointX", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (backField == null)
                {
                    AppLogger.Log("DentalAddin: Composite Cuff FinishLine profile 생성 생략 - BackPointX 필드 없음");
                    return;
                }

                double movedBackX = Convert.ToDouble(backField.GetValue(null), CultureInfo.InvariantCulture);
                // MoveSTL 이후 실제 좌표계로 맞추기 위한 X 이동 보정량
                // - originalBackLimitX: MoveSTL 전 값
                // - movedBackX: MoveSTL 후 값
                double deltaX = movedBackX - originalBackLimitX;

                const string chainName = "BackendFinishLineCurve";
                try
                {
                    if (document?.FeatureChains != null)
                    {
                        for (int i = document.FeatureChains.Count; i >= 1; i--)
                        {
                            FeatureChain existing = null;
                            try { existing = document.FeatureChains[i]; } catch { }
                            if (existing == null)
                            {
                                continue;
                            }

                            if (!string.Equals(existing.Name ?? string.Empty, chainName, StringComparison.OrdinalIgnoreCase))
                            {
                                continue;
                            }

                            try { document.FeatureChains.Remove(existing); } catch { }
                        }
                    }
                }
                catch { }

                // STL 전처리 회전과 동일한 각도(SSOT)로 finishline points를 변환한다.
                // - 보정(STL모델대로): +30° + hex telemetry(appliedDeg)
                // - 무보정(헥스30도회전): (+30° + hex telemetry(appliedDeg)) + 30°
                double wAxisDeg = DefaultWAxisRotationDegrees;
                string wAxisDegRaw = Environment.GetEnvironmentVariable(CompositeOrientationWAxisDegreesEnv);
                if (!string.IsNullOrWhiteSpace(wAxisDegRaw) &&
                    double.TryParse(wAxisDegRaw, NumberStyles.Float, CultureInfo.InvariantCulture, out double parsedWAxisDeg) &&
                    !double.IsNaN(parsedWAxisDeg) &&
                    !double.IsInfinity(parsedWAxisDeg))
                {
                    wAxisDeg = parsedWAxisDeg;
                }
                double wAxisRad = wAxisDeg * Math.PI / 180.0;
                double cosX = Math.Cos(wAxisRad);
                double sinX = Math.Sin(wAxisRad);

                List<Point> transformed = new List<Point>();
                double minSourceZ = double.PositiveInfinity;
                double maxSourceZ = double.NegativeInfinity;
                for (int i = 0; i < _backendFinishLinePoints.Length; i++)
                {
                    double[] p = _backendFinishLinePoints[i];
                    if (p == null || p.Length < 3)
                    {
                        continue;
                    }

                    double sx = p[0];
                    double sy = p[1];
                    double sz = p[2];
                    if (double.IsNaN(sx) || double.IsInfinity(sx) || double.IsNaN(sy) || double.IsInfinity(sy) || double.IsNaN(sz) || double.IsInfinity(sz))
                    {
                        continue;
                    }

                    if (sz < minSourceZ)
                    {
                        minSourceZ = sz;
                    }
                    if (sz > maxSourceZ)
                    {
                        maxSourceZ = sz;
                    }

                    // STL 전처리와 동일 변환 적용
                    // 1) Y축 -90도
                    double rx1 = -sz;
                    double ry1 = sy;
                    double rz1 = sx;

                    // 2) X축 +30도
                    double rx2 = rx1;
                    double ry2 = ry1 * cosX - rz1 * sinX;
                    double rz2 = ry1 * sinX + rz1 * cosX;

                    // 3) MoveSTL 이후 X 이동 보정(deltaX)
                    //    여기까지 적용해야 backend finishline curve와 현재 모델 좌표계가 일치한다.
                    Point tp = document.GetPoint(rx2 + deltaX, ry2, rz2);
                    transformed.Add(tp);
                }

                if (transformed.Count < 3)
                {
                    AppLogger.Log($"DentalAddin: Composite Cuff FinishLine profile 생성 생략 - 유효 포인트 부족(count={transformed.Count})");
                    return;
                }

                // backend finishline points 순서는 보장되지 않을 수 있다.
                // 순서가 섞이면 profile에 긴 cross-link가 생기고, 결과적으로 Finish_Cuff가
                // 나선/그물 형태로 붕괴할 수 있으므로 YZ 평면 극각으로 1회전 순서를 재정렬한다.
                double cy = transformed.Average(p => p.Y);
                double cz = transformed.Average(p => p.Z);
                List<Point> ordered = transformed
                    .OrderBy(p => Math.Atan2(p.Z - cz, p.Y - cy))
                    .ToList();

                // 동일/근접점 중복은 짧은 진동 링크를 만들 수 있어 제거한다.
                List<Point> filtered = new List<Point>();
                const double duplicateTol = 1e-4;
                for (int i = 0; i < ordered.Count; i++)
                {
                    Point p = ordered[i];
                    if (filtered.Count == 0)
                    {
                        filtered.Add(p);
                        continue;
                    }

                    Point prev = filtered[filtered.Count - 1];
                    double d = Math.Sqrt(
                        (p.X - prev.X) * (p.X - prev.X)
                        + (p.Y - prev.Y) * (p.Y - prev.Y)
                        + (p.Z - prev.Z) * (p.Z - prev.Z));
                    if (d > duplicateTol)
                    {
                        filtered.Add(p);
                    }
                }

                if (filtered.Count < 3)
                {
                    AppLogger.Log($"DentalAddin: Composite Cuff FinishLine profile 생성 생략 - 정렬/중복제거 후 포인트 부족(count={filtered.Count})");
                    return;
                }

                // Main.Clean 이후에도 Finish_Cuff 시점에서 동일 피쳐를 재생성할 수 있도록
                // 변환 완료된 points를 env로 직렬화하여 함께 저장한다.
                try
                {
                    StringBuilder sbPoints = new StringBuilder(filtered.Count * 32);
                    for (int i = 0; i < filtered.Count; i++)
                    {
                        Point p = filtered[i];
                        if (i > 0) sbPoints.Append('|');
                        sbPoints.Append(p.X.ToString("0.######", CultureInfo.InvariantCulture));
                        sbPoints.Append(',');
                        sbPoints.Append(p.Y.ToString("0.######", CultureInfo.InvariantCulture));
                        sbPoints.Append(',');
                        sbPoints.Append(p.Z.ToString("0.######", CultureInfo.InvariantCulture));
                    }
                    Environment.SetEnvironmentVariable(CompositeCuffProfilePointsEnv, sbPoints.ToString());
                }
                catch (Exception serEx)
                {
                    Environment.SetEnvironmentVariable(CompositeCuffProfilePointsEnv, null);
                    AppLogger.Log($"DentalAddin: Composite Cuff profile points 직렬화 실패 - {serEx.GetType().Name}:{serEx.Message}");
                }

                FeatureChain fc = document.FeatureChains.Add(filtered[0]);
                for (int i = 1; i < filtered.Count; i++)
                {
                    fc.Add(filtered[i]);
                }

                Point first = filtered[0];
                Point last = filtered[filtered.Count - 1];
                double closeDist = Math.Sqrt(
                    (last.X - first.X) * (last.X - first.X)
                    + (last.Y - first.Y) * (last.Y - first.Y)
                    + (last.Z - first.Z) * (last.Z - first.Z));
                if (closeDist > 1e-4)
                {
                    fc.Add(document.GetSegment(last, first));
                }

                fc.Name = chainName;
                try
                {
                    // 시각 확인/디버깅 편의를 위해 전용 가이드 레이어에 배치
                    Layer guideLayer = null;
                    try { guideLayer = document.Layers.Add("CompositeGuides"); } catch { guideLayer = document.Layers["CompositeGuides"]; }
                    if (guideLayer != null)
                    {
                        fc.Layer = guideLayer;
                    }
                }
                catch { }

                int key = 0;
                int.TryParse(Convert.ToString(fc.Key, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out key);
                if (key > 0)
                {
                    string profileToken = "6," + key.ToString(CultureInfo.InvariantCulture);
                    Environment.SetEnvironmentVariable(CompositeCuffProfileEnv, profileToken);

                    // Finish_Cuff 시작/종료점 SSOT:
                    // - 시작 X: finishline min_z
                    // - 종료 X: finishline min_z - 1.2mm
                    // - 주의: splitline_1(max_z+1.0) 기준이 아니라 finishline z 기준을 직접 사용
                    // - 현 좌표계 환산: Y축 -90° 회전에서 X'=-Z, 이후 MoveSTL deltaX 보정
                    //   startX = -(minZ) + deltaX
                    //   endX   = -(minZ - 1.2) + deltaX
                    const double cuffEndOffsetFromFinishMinZMm = -1.2;
                    if (!double.IsInfinity(minSourceZ) && !double.IsInfinity(maxSourceZ))
                    {
                        double cuffStartX = -(minSourceZ) + deltaX;
                        double cuffEndX = -(minSourceZ + cuffEndOffsetFromFinishMinZMm) + deltaX;

                        Environment.SetEnvironmentVariable(CompositeCuffStartXEnv, cuffStartX.ToString(CultureInfo.InvariantCulture));
                        Environment.SetEnvironmentVariable(CompositeCuffEndXEnv, cuffEndX.ToString(CultureInfo.InvariantCulture));

                        AppLogger.Log($"DentalAddin: Composite Cuff profile 생성 완료 - profile={profileToken}, pointsRaw={transformed.Count}, pointsOrdered={filtered.Count}, movedBackX={movedBackX.ToString("F4", CultureInfo.InvariantCulture)}, deltaX={deltaX.ToString("F4", CultureInfo.InvariantCulture)}, finishMinZ={minSourceZ.ToString("F4", CultureInfo.InvariantCulture)}, finishTopZ={maxSourceZ.ToString("F4", CultureInfo.InvariantCulture)}, cuffStartX(minZ)={cuffStartX.ToString("F4", CultureInfo.InvariantCulture)}, cuffEndX(minZ-1.2)={cuffEndX.ToString("F4", CultureInfo.InvariantCulture)}");
                    }
                    else
                    {
                        Environment.SetEnvironmentVariable(CompositeCuffStartXEnv, null);
                        Environment.SetEnvironmentVariable(CompositeCuffEndXEnv, null);
                        AppLogger.Log($"DentalAddin: Composite Cuff profile 생성 완료 - profile={profileToken}, pointsRaw={transformed.Count}, pointsOrdered={filtered.Count}, movedBackX={movedBackX.ToString("F4", CultureInfo.InvariantCulture)}, deltaX={deltaX.ToString("F4", CultureInfo.InvariantCulture)}, finishMinZ/finishMaxZ=<null>");
                    }
                }
                else
                {
                    Environment.SetEnvironmentVariable(CompositeCuffProfileEnv, null);
                    Environment.SetEnvironmentVariable(CompositeCuffStartXEnv, null);
                    Environment.SetEnvironmentVariable(CompositeCuffEndXEnv, null);
                    Environment.SetEnvironmentVariable(CompositeCuffProfilePointsEnv, null);
                    AppLogger.Log("DentalAddin: Composite Cuff profile 생성 실패 - key 파싱 오류");
                }
            }
            catch (Exception ex)
            {
                Environment.SetEnvironmentVariable(CompositeCuffProfileEnv, null);
                Environment.SetEnvironmentVariable(CompositeCuffStartXEnv, null);
                Environment.SetEnvironmentVariable(CompositeCuffEndXEnv, null);
                Environment.SetEnvironmentVariable(CompositeCuffProfilePointsEnv, null);
                AppLogger.Log($"DentalAddin: Composite Cuff FinishLine profile 생성 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

                private void TryApplyCompositeFinishToleranceEnv(double? stlZLengthMm)
        {
            try
            {
                if (!stlZLengthMm.HasValue || double.IsNaN(stlZLengthMm.Value) || double.IsInfinity(stlZLengthMm.Value))
                {
                    Environment.SetEnvironmentVariable(AppConfig.CompositeFinishToleranceEnv, null);
                    AppLogger.Log("DentalAddin: STL Z 길이 메타데이터 없음 - Composite Finish 공차는 PRC 기본값(0.02) 유지");
                    return;
                }

                double zLength = stlZLengthMm.Value;
                if (zLength > CompositeFinishToleranceThresholdZMm)
                {
                    string toleranceValue = CompositeFinishToleranceOverrideMm.ToString("0.###", CultureInfo.InvariantCulture);
                    Environment.SetEnvironmentVariable(AppConfig.CompositeFinishToleranceEnv, toleranceValue);
                    AppLogger.Log($"DentalAddin: STL Z 길이 조건 충족(zLength={zLength.ToString("F3", CultureInfo.InvariantCulture)}mm > {CompositeFinishToleranceThresholdZMm.ToString("F3", CultureInfo.InvariantCulture)}mm) - Finish_Front/Back Tolerance={toleranceValue} 적용");
                }
                else
                {
                    Environment.SetEnvironmentVariable(AppConfig.CompositeFinishToleranceEnv, null);
                    AppLogger.Log($"DentalAddin: STL Z 길이 조건 미충족(zLength={zLength.ToString("F3", CultureInfo.InvariantCulture)}mm <= {CompositeFinishToleranceThresholdZMm.ToString("F3", CultureInfo.InvariantCulture)}mm) - Composite Finish 공차는 PRC 기본값(0.02) 유지");
                }
            }
            catch (Exception ex)
            {
                Environment.SetEnvironmentVariable(AppConfig.CompositeFinishToleranceEnv, null);
                AppLogger.Log($"DentalAddin: Composite Finish 공차 env 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private void TryApplyCompositeOrientationVectorEnvFromPayload(double? tiltAxisX, double? tiltAxisY, double? tiltAxisZ)
        {
            try
            {
                if (!tiltAxisX.HasValue || !tiltAxisY.HasValue || !tiltAxisZ.HasValue)
                {
                    return;
                }

                double vx = tiltAxisX.Value;
                double vy = tiltAxisY.Value;
                double vz = tiltAxisZ.Value;
                double magnitude = Math.Sqrt(vx * vx + vy * vy + vz * vz);
                if (double.IsNaN(magnitude) || double.IsInfinity(magnitude) || magnitude < 1e-6)
                {
                    AppLogger.Log($"DentalAddin: payload TiltAxisVector 무효 - raw=({vx},{vy},{vz})");
                    return;
                }

                string envValue = string.Format(CultureInfo.InvariantCulture, "{0:0.######},{1:0.######},{2:0.######}", vx, vy, vz);
                Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_ORIENTATION_VECTOR", envValue);
                AppLogger.Log($"DentalAddin: payload TiltAxisVector 적용 - ABUTS_COMPOSITE_ORIENTATION_VECTOR={envValue}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: payload TiltAxisVector 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private void TryApplyCompositeOrientationVectorEnv(BackendApiClient.RequestMetaCaseInfos requestMeta)
        {
            try
            {
                if (requestMeta == null)
                {
                    return;
                }

                double[] vector = null;
                string vectorSource = null;

                if (requestMeta.compositeTiltVector != null && requestMeta.compositeTiltVector.Length >= 3)
                {
                    vector = requestMeta.compositeTiltVector;
                    vectorSource = "caseInfos.compositeTiltVector";
                }
                else if (requestMeta.tiltAxisVector != null && requestMeta.tiltAxisVector.Length >= 3)
                {
                    vector = requestMeta.tiltAxisVector;
                    vectorSource = "caseInfos.tiltAxisVector";
                }
                else if (requestMeta.inclinedAxisVector != null && requestMeta.inclinedAxisVector.Length >= 3)
                {
                    vector = requestMeta.inclinedAxisVector;
                    vectorSource = "caseInfos.inclinedAxisVector";
                }
                else if (requestMeta.slopeAxisVector != null && requestMeta.slopeAxisVector.Length >= 3)
                {
                    vector = requestMeta.slopeAxisVector;
                    vectorSource = "caseInfos.slopeAxisVector";
                }

                if (vector == null)
                {
                    string vectorCsv = null;
                    if (!string.IsNullOrWhiteSpace(requestMeta.compositeTiltVectorCsv))
                    {
                        vectorCsv = requestMeta.compositeTiltVectorCsv;
                        vectorSource = "caseInfos.compositeTiltVectorCsv";
                    }
                    else if (!string.IsNullOrWhiteSpace(requestMeta.tiltAxisVectorCsv))
                    {
                        vectorCsv = requestMeta.tiltAxisVectorCsv;
                        vectorSource = "caseInfos.tiltAxisVectorCsv";
                    }
                    else if (!string.IsNullOrWhiteSpace(requestMeta.inclinedAxisVectorCsv))
                    {
                        vectorCsv = requestMeta.inclinedAxisVectorCsv;
                        vectorSource = "caseInfos.inclinedAxisVectorCsv";
                    }
                    else if (!string.IsNullOrWhiteSpace(requestMeta.slopeAxisVectorCsv))
                    {
                        vectorCsv = requestMeta.slopeAxisVectorCsv;
                        vectorSource = "caseInfos.slopeAxisVectorCsv";
                    }

                    if (!string.IsNullOrWhiteSpace(vectorCsv))
                    {
                        char[] separators = new[] { ',', ';', ' ', '\t', '|', '/' };
                        string[] parts = vectorCsv.Split(separators, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 3
                            && double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out double x)
                            && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out double y)
                            && double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out double z))
                        {
                            vector = new[] { x, y, z };
                        }
                    }
                }

                if (vector == null || vector.Length < 3)
                {
                    string existing = Environment.GetEnvironmentVariable("ABUTS_COMPOSITE_ORIENTATION_VECTOR");
                    if (!string.IsNullOrWhiteSpace(existing))
                    {
                        AppLogger.Log($"DentalAddin: request-meta 경사축 벡터 없음 - payload/env 벡터 유지 ({existing})");
                    }
                    else
                    {
                        AppLogger.Log("DentalAddin: Composite 경사축 벡터 없음 - OrientationProfile env 주입 생략");
                    }
                    return;
                }

                double vx = vector[0];
                double vy = vector[1];
                double vz = vector[2];
                double magnitude = Math.Sqrt(vx * vx + vy * vy + vz * vz);
                if (double.IsNaN(magnitude) || double.IsInfinity(magnitude) || magnitude < 1e-6)
                {
                    AppLogger.Log($"DentalAddin: Composite 경사축 벡터 무효 - source={vectorSource}, raw=({vx},{vy},{vz})");
                    return;
                }

                string envValue = string.Format(CultureInfo.InvariantCulture, "{0:0.######},{1:0.######},{2:0.######}", vx, vy, vz);
                Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_ORIENTATION_VECTOR", envValue);
                AppLogger.Log($"DentalAddin: Composite 경사축 벡터 적용 - source={vectorSource}, ABUTS_COMPOSITE_ORIENTATION_VECTOR={envValue}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: Composite 경사축 벡터 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        // 유지홈(retentionGroove) SSOT — 백엔드 none/deep만 허용.
        // Finish_Front StepIncrement / Finish_Back 1피치 겹침은 ABUTS_RETENTION_GROOVE 를 본다.
        // ABUTS_COMPOSITE_STEP_INCREMENT_A 는 사용하지 않는다.
        //   none → 0.12, deep → 0.20
        // Finish_Back(B) StepIncrement는 PRC 기본(0.08) 유지.
        private const string RetentionGrooveMissingMessage =
            "유지홈(retentionGroove)이 백엔드에서 전달되지 않았습니다. none 또는 deep이 필요합니다.";

        private static string RequireBackendRetentionGrooveOrThrow(string raw, string requestId)
        {
            string normalized = NormalizeBackendRetentionGrooveOrNull(raw);
            if (normalized == null)
            {
                string shown = string.IsNullOrWhiteSpace(raw) ? "<empty>" : raw.Trim();
                throw new InvalidOperationException(
                    $"{RetentionGrooveMissingMessage} (requestId={requestId ?? ""}, received='{shown}')");
            }
            return normalized;
        }

        private static string NormalizeBackendRetentionGrooveOrNull(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }
            string groove = raw.Trim().ToLowerInvariant();
            if (groove == "없음") groove = "none";
            if (groove == "있음") groove = "deep";
            if (groove == "none" || groove == "deep")
            {
                return groove;
            }
            return null;
        }

        private void TryApplyRetentionGrooveToStepIncrementEnv()
        {
            // request-meta 단계에서 이미 none/deep으로 확정. 여기서는 env 브리지만 수행.
            string normalizedGroove = RequireBackendRetentionGrooveOrThrow(
                _backendRetentionGroove,
                _backendRequestId);

            // legacy numeric env는 더 이상 쓰지 않는다(오용 방지로 항상 해제).
            Environment.SetEnvironmentVariable(AppConfig.CompositeStepIncrementAEnv, null);
            Environment.SetEnvironmentVariable(AppConfig.CompositeStepIncrementBEnv, null);
            Environment.SetEnvironmentVariable("ABUTS_RETENTION_GROOVE", normalizedGroove);
            Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", null);

            if (normalizedGroove == "none")
            {
                Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_DYNAMIC_DISABLE", "1");
                Environment.SetEnvironmentVariable(AppConfig.CompositeStockAllowanceAEnv, null);
            }
            else // deep
            {
                Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_DYNAMIC_DISABLE", "0");
                const double stockAllowance = 0.0;
                Environment.SetEnvironmentVariable(
                    AppConfig.CompositeStockAllowanceAEnv,
                    stockAllowance.ToString(CultureInfo.InvariantCulture));
                AppLogger.Log($"DentalAddin: retentionGroove=deep - A StockAllowance={stockAllowance.ToString(CultureInfo.InvariantCulture)} 적용 (env)");
            }

            AppLogger.Log(
                $"DentalAddin: retentionGroove 적용 - groove={normalizedGroove} (ABUTS_RETENTION_GROOVE; STEP_INCREMENT_A 미사용)");
        }

        private void TryApplyCompositeFirstPassPercentEnv(string tooth)
        {
            try
            {
                // 정책 정리:
                // - ABUTS_COMPOSITE_FIRST_PASS_PERCENT_A 는 "퍼센트 override" 전용이다.
                // - 기본 시작점(Splitline_1+0.5mm, 단 Splitline_2-1.0mm 상한)은 MainModuleComposite에서 계산한다.
                //   따라서 여기서는 기본적으로 env를 주입하지 않는다.
                Environment.SetEnvironmentVariable(AppConfig.CompositeFirstPassPercentAEnv, null);
                AppLogger.Log($"DentalAddin: Composite FirstPassPercent env 미주입(tooth='{tooth ?? ""}') - 기본값은 MainModuleComposite의 Splitline_1+0.5mm(Splitline_2-1.0mm 상한) 정책 사용");
            }
            catch (Exception ex)
            {
                Environment.SetEnvironmentVariable(AppConfig.CompositeFirstPassPercentAEnv, null);
                AppLogger.Log($"DentalAddin: FirstPassPercent env 설정 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private void InvokeMoveSurface(Type mainModuleType)
        {
            Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
            if (moveModuleType == null)
            {
                AppLogger.Log("DentalAddin: MoveSTL_Module 타입을 찾을 수 없어 MoveSurface 호출 생략");
                return;
            }
            bool invoked = DentalAddinReflectionHelper.TryInvokeMainModuleMethod(moveModuleType, "MoveSurface");
            if (!invoked)
            {
                AppLogger.Log("DentalAddin: MoveSurface 메서드 호출 실패");
                return;
            }

            // MoveSurface 실행 후 계산된 값 로깅
            try
            {
                FieldInfo needMoveField = moveModuleType.GetField("NeedMove", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                FieldInfo needMoveYField = moveModuleType.GetField("NeedMoveY", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                FieldInfo needMoveZField = moveModuleType.GetField("NeedMoveZ", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);

                bool needMove = needMoveField != null && Convert.ToBoolean(needMoveField.GetValue(null));
                double needMoveY = needMoveYField != null ? Convert.ToDouble(needMoveYField.GetValue(null)) : 0;
                double needMoveZ = needMoveZField != null ? Convert.ToDouble(needMoveZField.GetValue(null)) : 0;

                AppLogger.Log($"DentalAddin: MoveSurface 계산 결과 - NeedMove:{needMove}, NeedMoveY:{needMoveY:F4}, NeedMoveZ:{needMoveZ:F4}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: MoveSurface 결과 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private void InvokeEmerge(Type mainModuleType, Document document)
        {
            if (mainModuleType == null)
            {
                AppLogger.Log("DentalAddin: MainModule 타입이 null이어서 Emerge 호출 생략");
                return;
            }

            if (document == null)
            {
                AppLogger.Log("DentalAddin: Document가 null이어서 Emerge 호출 생략");
                return;
            }

            // DriveSurface 기준면 SSOT는 MainModule.Emerge 단일 경로로 유지한다.
            // (StlFileProcessor 쪽 커스텀 merge 경로는 좌표/키 불일치 원인이 되어 비활성화)
            bool invoked = DentalAddinReflectionHelper.TryInvokeMainModuleMethod(mainModuleType, "Emerge", false);
            if (!invoked)
            {
                AppLogger.Log("DentalAddin: Emerge 메서드 호출 실패");
                return;
            }

            // Emerge 실행 후 SurfaceNumber 로깅
            try
            {
                FieldInfo surfaceNumberField = mainModuleType.GetField("SurfaceNumber", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (surfaceNumberField != null)
                {
                    int surfaceNumber = Convert.ToInt32(surfaceNumberField.GetValue(null));
                    AppLogger.Log($"DentalAddin: Emerge 완료 - SurfaceNumber:{surfaceNumber}");
                }
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: Emerge 결과 로깅 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }



        private void InvokeMoveSTL(Type mainModuleType)
        {
            Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
            if (moveModuleType == null)
            {
                AppLogger.Log("DentalAddin: MoveSTL_Module 타입을 찾을 수 없어 MoveSTL 호출 생략");
                return;
            }
            bool moveInvoked = DentalAddinReflectionHelper.TryInvokeMainModuleMethod(moveModuleType, "MoveSTL");
            if (!moveInvoked)
            {
                AppLogger.Log("DentalAddin: MoveSTL 메서드 호출 실패");
            }
        }

        private void EnsureMainModuleContext(Type mainModuleType, Document document)
        {
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "Document", document);
            DentalAddinReflectionHelper.SetStaticProperty(mainModuleType, "EspritApp", _espApp);
        }
        private static void InitializeActivePlane(Document document)
        {
            if (document == null)
            {
                return;
            }

            try
            {
                Plane xyzPlane = null;
                try
                {
                    xyzPlane = document.Planes["XYZ"];
                }
                catch (Exception ex)
                {
                    AppLogger.Log($"StlFileProcessor: XYZ 작업면 조회 실패 - {ex.GetType().Name}:{ex.Message}");
                }

                if (xyzPlane == null)
                {
                    AppLogger.Log("StlFileProcessor: XYZ 작업면이 없어 ActivePlane 초기화를 건너뜁니다.");
                    return;
                }

                document.ActivePlane = xyzPlane;
                AppLogger.Log("StlFileProcessor: ActivePlane을 XYZ로 초기화했습니다.");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: ActivePlane 초기화 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private void UpdateLatheBarDiameter(Document document, string stlPath, double initialBarDiameter, double? backendMaterialDiameter)
        {
            try
            {
                // 우선순위: 백엔드 전달값 > 기존 장비값 > 추정값
                double diameter = (backendMaterialDiameter.HasValue && backendMaterialDiameter.Value > 0)
                    ? backendMaterialDiameter.Value
                    : (initialBarDiameter > 0 ? initialBarDiameter : ResolveBarDiameter(document, stlPath));
                if (diameter <= 0)
                {
                    diameter = 6.0;
                }
                if (document?.LatheMachineSetup == null)
                {
                    AppLogger.Log("StlFileProcessor: LatheMachineSetup이 없어 BarDiameter 설정을 건너뜁니다.");
                    return;
                }
                document.LatheMachineSetup.BarDiameter = diameter;
                string src = (backendMaterialDiameter.HasValue && backendMaterialDiameter.Value > 0)
                    ? "backend"
                    : (initialBarDiameter > 0 ? "machine" : "fallback");
                AppLogger.Log($"StlFileProcessor: BarDiameter 설정 - {diameter:F3} (src:{src}, STL:{Path.GetFileName(stlPath)})");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: BarDiameter 설정 실패 - {ex.Message}");
            }
        }
        private double ResolveBarDiameter(Document document, string stlPath)
        {
            // TODO: STL 최대 직경 계산 로직 연동(백엔드 결과 활용)
            return 6.0;
        }
        private void EnsureMoveModuleDefaults(Type mainModuleType, Document document)
        {
            Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
            if (moveModuleType == null)
            {
                AppLogger.Log("DentalAddin: MoveSTL_Module 타입을 찾을 수 없습니다 (기본값 주입 생략).");
                return;
            }
            double mtiDefault = 0.0;
            double barDiameter = document?.LatheMachineSetup?.BarDiameter ?? 0.0;
            DentalAddinReflectionHelper.SetStaticField(moveModuleType, "MTI", mtiDefault);
            double frontLimit = _effectiveFrontLimitX ?? throw new InvalidOperationException("FrontPointX not initialized");
            DentalAddinReflectionHelper.SetStaticField(moveModuleType, "FrontPointX", frontLimit);
            DentalAddinReflectionHelper.SetStaticField(moveModuleType, "NeedMove", false);
            DentalAddinReflectionHelper.SetStaticField(moveModuleType, "NeedMoveY", 0.0);
            DentalAddinReflectionHelper.SetStaticField(moveModuleType, "NeedMoveZ", 0.0);
            DentalAddinReflectionHelper.SetStaticField(moveModuleType, "FinishLineX", 0.0);
            DentalAddinReflectionHelper.SetStaticField(moveModuleType, "FinishLineR", 0.0);
            AppLogger.Log($"DentalAddin: MoveSTL 초기화 - MTI:{mtiDefault}(overwrite), Front:{frontLimit}(overwrite), BarDia:{barDiameter}");
        }
        private static void ApplyTurningParameters(Type mainModuleType)
        {
            if (mainModuleType == null)
            {
                return;
            }
            // 우선 순위: UserData.NumData -> AppConfig 기본값
            // NumData 인덱스(Tech_Default_Path.xml)
            //   [1] Exit angle, [2] Front Mill Depth, [3] Turning Depth, [4] Angle Number, [5] Turning Extend
            double[] numData = DentalAddinReflectionHelper.GetMainModuleField<double[]>(mainModuleType, "NumData");
            double exitAngle = (numData != null && numData.Length > 1 && numData[1] > 0) ? numData[1] : AppConfig.ExitAngle;
            double frontMillDepth = (numData != null && numData.Length > 2 && numData[2] > 0) ? numData[2] : AppConfig.TurningDepth;
            double turningDepth = (numData != null && numData.Length > 3 && numData[3] > 0) ? numData[3] : AppConfig.TurningDepth;
            double angleNumber = (numData != null && numData.Length > 4 && numData[4] > 0) ? numData[4] : exitAngle;
            double turningExtend = (numData != null && numData.Length > 5 && numData[5] > 0) ? numData[5] : AppConfig.TurningExtend;

            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "MillingDepth", frontMillDepth);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "DownZ", frontMillDepth);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "TurningDepth", turningDepth);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "TurningExtend", turningExtend);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "Chamfer", exitAngle);
            DentalAddinReflectionHelper.SetStaticField(mainModuleType, "AngleNumber", angleNumber);
            AppLogger.Log($"DentalAddin: Turning/Milling 파라미터 설정 - FrontDepth:{frontMillDepth}, TurningDepth:{turningDepth}, Extend:{turningExtend}, ExitAngle:{exitAngle}, AngleNumber:{angleNumber}");
        }
    }
}
