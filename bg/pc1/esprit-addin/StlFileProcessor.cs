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

        // Composite OrientationProfile startX 진단용 env(현재 선택 로직에는 미사용).
        // SSOT는 MainModuleComposite 내부의 MoveSTL_Module.FrontPointX 고정값이다.
        private const string CompositeOrientationProfileStartXEnv = "ABUTS_COMPOSITE_ORIENTATION_PROFILE_START_X";
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
        private static bool DetermineFaceBeforeComposite()
        {
            string flag = Environment.GetEnvironmentVariable("ABUTS_FACE_BEFORE_COMPOSITE");
            if (!string.IsNullOrWhiteSpace(flag))
            {
                return flag.Equals("1", StringComparison.OrdinalIgnoreCase) || flag.Equals("true", StringComparison.OrdinalIgnoreCase);
            }
            return AppConfig.FaceBeforeCompositeDefault;
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
        // 유지홈(retentionGroove) 옵션 캐시 — request-meta 수신 직후 저장.
        // 이후 5axisComposite_A.prc 의 StepIncrement 를 의뢰별로 덮어쓰기 위해 사용.
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
        public void Process(string stlPath, double? frontLimitX = null, double? backLimitX = null, double? materialDiameter = null, bool twoPhase = false, string requestIdHint = null, double? tiltAxisX = null, double? tiltAxisY = null, double? tiltAxisZ = null)
        {
            AppLogger.BeginRun();
            AppLogger.Log("StlFileProcessor: Process 시작");
            ResetPerRunState();
            TryApplyCompositeOrientationVectorEnvFromPayload(tiltAxisX, tiltAxisY, tiltAxisZ);
            Directory.CreateDirectory(_outputFolder);
            Document document = _documentManager.EnsureDocument(materialDiameter);
            if (document == null)
            {
                AppLogger.Log("StlFileProcessor: 활성화된 ESPRIT 문서를 만들 수 없습니다.");
                return;
            }
            _documentManager.EnsureCleanDocument(document);

            document = _documentManager.ResetDocument(document, materialDiameter);
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
                        // 유지홈(retentionGroove) 옵션 캐시 — 이후 Composite A PRC 의 StepIncrement 를 덮어쓰는 데 사용
                        _backendRetentionGroove = string.IsNullOrWhiteSpace(requestMeta.retentionGroove)
                            ? null
                            : requestMeta.retentionGroove.Trim();
                        TryApplyCompositeFirstPassPercentEnv(requestMeta.tooth);
                        TryApplyCompositeOrientationVectorEnv(requestMeta);
                        AppLogger.Log($"StlFileProcessor: request-meta loaded requestId={requestId}, Clinic={requestMeta.clinicName}, Patient={requestMeta.patientName}, Tooth={requestMeta.tooth}, Implant={requestMeta.implantManufacturer}/{requestMeta.implantBrand}/{requestMeta.implantType}, MaxDia={requestMeta.maxDiameter}, ConnDia={requestMeta.connectionDiameter}, CamDia={requestMeta.camDiameter}, WorkType={requestMeta.workType}, Lot={requestMeta.lotNumber}, SerialCode={(_backendSerialCode ?? "")}, RetentionGroove={(_backendRetentionGroove ?? "<null>")}");
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
                RotateByWAxisDegrees(document, DefaultWAxisRotationDegrees);
                EspritDocumentHelper.LogBoundingBox(document, "AfterRotate");
                // add-in 실행 직전에도 CAM 직경 재확인/재적용(중간 단계에서 값이 변경되는 케이스 방지)
                if (backendCamDiameter.HasValue && backendCamDiameter.Value > 0 && document?.LatheMachineSetup != null)
                {
                    document.LatheMachineSetup.BarDiameter = backendCamDiameter.Value;
                    AppLogger.Log($"StlFileProcessor: Invoke 직전 CAM 직경 재적용 - BarDiameter={backendCamDiameter.Value:F3}");
                }
                InvokeDentalAddin(document, effectiveFrontLimit, effectiveBackLimit, stlBoundingTopZ, finishLineTopZ, finishLineMinZ, finishLineEspritR, twoPhase);
                CaptureNcMetadata(document);
                AppLogger.Log("StlFileProcessor: NC 생성 시작");
                string ncFilePath = _ncGenerator.GenerateNcFile(
                    document,
                    stlPath,
                    ResolveFrontPointForNc(),
                    ResolveStockDiameterForNc(document),
                    _backendSerialCode,
                    stlBoundingTopZ,
                    _prcManager?.ConnectionMachiningProcessFilePath);
                AppLogger.Log($"StlFileProcessor: NC 생성 종료 - path={ncFilePath ?? "<null>"}");
                if (!string.IsNullOrWhiteSpace(ncFilePath))
                {
                    AppLogger.Log($"StlFileProcessor: NC file generated - {ncFilePath}");
                    BackendApiClient.NotifyBackendSuccess(requestId, stlPath, ncFilePath);
                }
                else
                {
                    AppLogger.Log($"StlFileProcessor: NC file generation failed - ncFilePath is empty");
                }

                AppLogger.Log($"StlFileProcessor: 완료 - {stlPath}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: 처리 중 오류 - {ex.Message}");
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

                _capturedFrontPointX = _effectiveFrontLimitX;
                _capturedBackPointX = null;

                if (moveModuleType != null)
                {
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
                    AppLogger.Log("StlFileProcessor: MoveModuleType이 null - BackPointX 캡처 불가");
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
            _effectiveFrontLimitX = null;
            Environment.SetEnvironmentVariable(AppConfig.CompositeFirstPassPercentAEnv, null);
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
            Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_ORIENTATION_VECTOR", null);
            Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_ORIENTATION_PROFILE_LENGTH_MM", null);
            Environment.SetEnvironmentVariable(CompositeOrientationProfileStartXEnv, null);
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
            // 유지홈(retentionGroove) — 5axisComposite_A.prc 의 StepIncrement
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

        // MoveSTL 이후 STL의 X 범위(min/max)를 계산해 Composite OrientationProfile 시작점 SSOT로 사용한다.
        // - minX: 화면 좌측 끝(요청사항 기준 "왼쪽 끝")
        // - maxX: 진단 로그 용도
        private static bool TryComputeStlBoundingXRange(Document document, out double minX, out double maxX)
        {
            minX = 0.0;
            maxX = 0.0;

            List<string> createdFeatureKeys = null;
            SelectionSet selectionSet = null;
            try
            {
                if (document?.GraphicsCollection == null || document?.FeatureRecognition == null)
                {
                    return false;
                }

                const string selectionName = "StlBoundingXTemp";
                try { selectionSet = document.SelectionSets.Add(selectionName); }
                catch { selectionSet = document.SelectionSets[selectionName]; }
                if (selectionSet == null)
                {
                    return false;
                }

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
                    return false;
                }

                Plane plane = null;
                try { plane = document.Planes["XYZ"]; } catch { }
                if (plane == null)
                {
                    try { plane = document.Planes["YZX"]; } catch { }
                }
                if (plane == null)
                {
                    return false;
                }

                HashSet<string> beforeKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    foreach (FeatureChain fc in document.FeatureChains)
                    {
                        if (fc?.Key != null)
                        {
                            beforeKeys.Add(fc.Key);
                        }
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
                        if (fc?.Key == null)
                        {
                            continue;
                        }
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

                if (created == null || created.Length <= 0.0)
                {
                    return false;
                }

                double localMinX = double.PositiveInfinity;
                double localMaxX = double.NegativeInfinity;
                int sampleCount = (int)Math.Max(10.0, Math.Floor(created.Length / 0.1));
                for (int i = 0; i <= sampleCount; i++)
                {
                    double along = created.Length * i / sampleCount;
                    Point p = null;
                    try { p = created.PointAlong(along); } catch { }
                    if (p == null || double.IsNaN(p.X) || double.IsInfinity(p.X))
                    {
                        continue;
                    }

                    if (p.X < localMinX) localMinX = p.X;
                    if (p.X > localMaxX) localMaxX = p.X;
                }

                if (double.IsInfinity(localMinX) || double.IsInfinity(localMaxX))
                {
                    return false;
                }

                minX = localMinX;
                maxX = localMaxX;
                return true;
            }
            catch (Exception ex)
            {
                AppLogger.Log($"StlFileProcessor: STL bounding X 계산 실패 - {ex.GetType().Name}:{ex.Message}");
                return false;
            }
            finally
            {
                if (selectionSet != null)
                {
                    try { selectionSet.RemoveAll(); } catch { }
                }
                CleanupTemporaryFeatureChains(document, createdFeatureKeys, "Stl bounding X");
            }
        }

        // (레거시/진단용) MoveSTL 직후 OrientationProfile startX 후보를 env로 기록한다.
        // 현재 MainModuleComposite 선택 로직은 FrontPointX SSOT를 사용하므로, 본 값은 관찰용이다.
        private void TryApplyCompositeOrientationProfileStartXEnv(Document document)
        {
            try
            {
                if (TryComputeStlBoundingXRange(document, out double minX, out double maxX))
                {
                    Environment.SetEnvironmentVariable(CompositeOrientationProfileStartXEnv, minX.ToString(CultureInfo.InvariantCulture));
                    AppLogger.Log($"DentalAddin: Composite OrientationProfile StartX env 적용 - {CompositeOrientationProfileStartXEnv}={minX.ToString("F4", CultureInfo.InvariantCulture)} (maxX={maxX.ToString("F4", CultureInfo.InvariantCulture)})");
                    return;
                }

                // 계산 실패 시 fallback: MoveSTL_Module.FrontPointX 사용
                Type mainModuleType = DentalAddinReflectionHelper.ResolveMainModuleType();
                Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
                if (moveModuleType != null)
                {
                    object frontObj = moveModuleType.GetField("FrontPointX", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null);
                    if (frontObj != null)
                    {
                        double frontX = Convert.ToDouble(frontObj, CultureInfo.InvariantCulture);
                        if (!double.IsNaN(frontX) && !double.IsInfinity(frontX))
                        {
                            Environment.SetEnvironmentVariable(CompositeOrientationProfileStartXEnv, frontX.ToString(CultureInfo.InvariantCulture));
                            AppLogger.Log($"DentalAddin: Composite OrientationProfile StartX env fallback 적용 - {CompositeOrientationProfileStartXEnv}={frontX.ToString("F4", CultureInfo.InvariantCulture)} (source=MoveSTL_Module.FrontPointX)");
                            return;
                        }
                    }
                }

                AppLogger.Log("DentalAddin: Composite OrientationProfile StartX env 적용 생략 - X 기준 계산 실패");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: Composite OrientationProfile StartX env 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
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

                // 정책 변경(2026-07-03): OrientationProfile 시작점 SSOT는 MoveSTL_Module.FrontPointX.
                // startX env 주입은 좌표계 불일치 원인이 될 수 있어 비활성화한다.
                // TryApplyCompositeOrientationProfileStartXEnv(document);

                TryApplyCompositeSplitByFinishLine(mainModuleType, stlTopZ, finishLineTopZ);
                TryApplyTwoPhaseSplitByFinishLine(mainModuleType, stlTopZ, finishLineTopZ, twoPhase);
                // 유지홈 옵션을 5axisComposite_A 의 StepIncrement 에 반영.
                // PRC 파일은 건드리지 않고, env 변수에 numeric 값만 주입한다.
                // 실제 적용은 MainModuleComposite.TryRunComposite2SplitLine2 → TrySetCompositeStepIncrement 가
                // Esprit COM(IDispatch)을 통해 opA.StepIncrement(DispId 217) 에 직접 SetProperty 한다.
                TryApplyRetentionGrooveToStepIncrementEnv();

                AppLogger.Log("DentalAddin: Emerge 실행 시작 - IGS 서피스 Merge 및 Translate");
                // 중요: Turn_B 직전 Composite_A 선행 실행 시 DriveSurface(=SurfaceNumber)가 필요하므로
                // Main 이전에 Emerge를 반드시 1회 수행해 SurfaceNumber를 확보한다.
                InvokeEmerge(mainModuleType, document);
                AppLogger.Log("DentalAddin: Emerge 실행 완료");
                // TODO: Composite split by finish line
                // TODO: Normalize feature chain names
                // ApplyAdditionalStlShift(document, mainModuleType, AppConfig.DefaultStlShift);
                // AppLogger.Log("DentalAddin: MoveSTL 실행 완료");
                // TODO: Cleanup legacy turning profiles
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
                // FinishLineX는 pre-rotation ESPRIT X 좌표로 변환해야 함
                // STL Z좌표 → ESPRIT X: backLimitX가 stlTopZ에 대응하므로
                // FinishLineX = backLimitX + finishLineTopZ - stlTopZ
                double finishLineEspritX = finishLineTopZ.Value;
                if (stlTopZ.HasValue && stlTopZ.Value > 0.001)
                {
                    finishLineEspritX = backLimitX + finishLineTopZ.Value - stlTopZ.Value;
                }
                DentalAddinReflectionHelper.SetStaticField(moveModuleType, "FinishLineX", finishLineEspritX);
                AppLogger.Log($"DentalAddin: FinishLineX 변환 - finishLineTopZ:{finishLineTopZ.Value:F4}, stlTopZ:{(stlTopZ.HasValue ? stlTopZ.Value.ToString("F4") : "<null>")}, backLimitX:{backLimitX:F4} → FinishLineX:{finishLineEspritX:F4}");
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

                        // 진단용: MoveSTL_Module.FinishLineX 값을 읽되, split 계산에는 사용하지 않는다.
                        // (해당 필드는 MoveSTL 이후 갱신되지 않아 좌표계가 어긋날 수 있음)
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

                        // 기준점(권위값): backend finishLineTopZ를 MoveSTL 이후 현재 좌표계 X로 직접 변환
                        // currentFinishX = backX + finishTopZ - stlTopZ
                        double currentFinishX = backX + finishLineTopZ.Value - stlTopZ.Value;

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

                        // 요청 기준(2026-07-01):
                        //   split line 기준은 finishLine 최상 Z점(top)에서 X축 -1.0mm 지점이다.
                        //   (즉, 기존 정확 기준점에서 좌측으로 1.0mm 이동)
                        // 좌표 변환식:
                        //   ESPRIT X = BackX + Z - stlTopZ
                        //   topX     = BackX + finishLineTopZ - stlTopZ
                        //   splitX   = topX + splitOffsetMm
                        // 중요:
                        //   이 오프셋은 MainModuleComposite.TryResolveTwoPhaseSplitLineTargetX와
                        //   반드시 동일해야 한다. (env 주입/재해석 경로의 SSOT 일치)
                        const double splitOffsetMm = -1.0;
                        double targetZ = finishLineTopZ.Value;
                        double topX = backX + targetZ - stlTopZ.Value;
                        double rawSplitX = topX + splitOffsetMm;
                        double splitX = Math.Max(xMin + 0.01, Math.Min(xMax - 0.01, rawSplitX));

                        Environment.SetEnvironmentVariable(AppConfig.TwoPhaseEnableEnv, "1");
                        Environment.SetEnvironmentVariable(AppConfig.TwoPhaseSplitXEnv, splitX.ToString(CultureInfo.InvariantCulture));

                        // RoughFreeFromMill SplitAB 구현은 기존 env를 사용하므로 같이 설정
                        Environment.SetEnvironmentVariable(AppConfig.RoughfreeformSplitEnableEnv, "1");
                        Environment.SetEnvironmentVariable("ABUTS_ROUGHFREEFORM_SPLIT_X", splitX.ToString(CultureInfo.InvariantCulture));

                        // Rough_A/Face 안전 간격 계산 근거를 동일 로그에 남긴다.
                        // Rough_A 우측 끝 규칙: roughAEnd = splitX - 0.5mm
                        // Face 우측 끝 허용 상한: roughAEnd - 0.3mm
                        const double roughAEndOffsetMm = 0.5;
                        const double faceMinGapMm = 0.3;
                        double roughAEndX = splitX - roughAEndOffsetMm;
                        double faceRightMaxX = roughAEndX - faceMinGapMm;

                        AppLogger.Log($"DentalAddin: TwoPhase split 적용 - finishLineTopZ:{finishLineTopZ.Value.ToString("F4", CultureInfo.InvariantCulture)}, targetZ(top):{targetZ.ToString("F4", CultureInfo.InvariantCulture)}, stlTopZ:{stlTopZ.Value.ToString("F4", CultureInfo.InvariantCulture)}, topX:{topX.ToString("F4", CultureInfo.InvariantCulture)}, splitOffsetMm:{splitOffsetMm.ToString("F3", CultureInfo.InvariantCulture)}, rawSplitX(top-1.0):{rawSplitX.ToString("F4", CultureInfo.InvariantCulture)}, splitX(clamped):{splitX.ToString("F4", CultureInfo.InvariantCulture)}, roughAEndX(split-0.5):{roughAEndX.ToString("F4", CultureInfo.InvariantCulture)}, faceRightMaxX(roughAEnd-0.3):{faceRightMaxX.ToString("F4", CultureInfo.InvariantCulture)} (Front:{frontX.ToString("F4", CultureInfo.InvariantCulture)}, Back:{backX.ToString("F4", CultureInfo.InvariantCulture)})");
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Log($"DentalAddin: TwoPhase split 설정 실패 - {ex.GetType().Name}:{ex.Message}");
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

        // 유지홈(retentionGroove) → FINISH_A StepIncrement 매핑
        //   none    → 0.1
        //   shallow → 0.2
        //   deep    → 0.25
        // 정책:
        //   PRC 파일 사본을 만들지 않는다. 환경변수 ABUTS_COMPOSITE_STEP_INCREMENT_A 에
        //   numeric 값만 주입하고, 실제 StepIncrement 적용은
        //   MainModuleComposite.TryRunComposite2SplitLine2 → TrySetCompositeStepIncrement 가
        //   Esprit COM 객체(opA)에 IDispatch SetProperty 로 수행한다 (PRC DispId 217 동치).
        //   (Single-A/BC/B-Extension 레거시 모드 플래그는 사용하지 않는다)
        private void TryApplyRetentionGrooveToStepIncrementEnv()
        {
            try
            {
                string groove = _backendRetentionGroove;
                if (string.IsNullOrWhiteSpace(groove))
                {
                    Environment.SetEnvironmentVariable(AppConfig.CompositeStepIncrementAEnv, null);
                    Environment.SetEnvironmentVariable(AppConfig.CompositeStockAllowanceAEnv, null);
                    Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_DYNAMIC_DISABLE", null);
                    Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", null);
                    Environment.SetEnvironmentVariable("ABUTS_RETENTION_GROOVE", null);
                    AppLogger.Log("DentalAddin: retentionGroove 미지정 - StepIncrement env 기본값(PRC) 유지");
                    return;
                }

                string normalizedGroove = groove.Trim().ToLowerInvariant();
                if (normalizedGroove == "없음") normalizedGroove = "none";
                if (normalizedGroove == "있음") normalizedGroove = "deep";

                double? stepIncrement = null;
                switch (normalizedGroove)
                {
                    case "none":  // 유지홈 없음
                        stepIncrement = 0.08;
                        // gp.exe 모달 안정화: none/shallow는 Composite 비동적 추가 시도
                        Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_DYNAMIC_DISABLE", "1");
                        // 정책 변경: Finish는 항상 2단(Front/Back). ALL_PHASE 강제 금지.
                        Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", null);
                        break;
                    case "shallow":
                        stepIncrement = 0.15;
                        Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_DYNAMIC_DISABLE", "1");
                        Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", null);
                        break;
                    case "deep":  // 유지홈 있음
                        stepIncrement = 0.20;
                        Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_DYNAMIC_DISABLE", "0");
                        // deep도 동일하게 Front/Back 2단 기준
                        Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", null);
                        break;
                }

                if (!stepIncrement.HasValue)
                {
                    Environment.SetEnvironmentVariable(AppConfig.CompositeStepIncrementAEnv, null);
                    Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_DYNAMIC_DISABLE", null);
                    Environment.SetEnvironmentVariable("ABUTS_COMPOSITE_PHASE_MODE", null);
                    Environment.SetEnvironmentVariable("ABUTS_RETENTION_GROOVE", null);
                    AppLogger.Log($"DentalAddin: retentionGroove 값 비정상 '{groove}' - StepIncrement env 기본값(PRC) 유지");
                    return;
                }

                string envValue = stepIncrement.Value.ToString("0.###", CultureInfo.InvariantCulture);
                Environment.SetEnvironmentVariable(AppConfig.CompositeStepIncrementAEnv, envValue);
                Environment.SetEnvironmentVariable("ABUTS_RETENTION_GROOVE", normalizedGroove);

                // deep 선택 시: B의 StepIncrement는 PRC에 정의된 값(예: 0.08)을 유지해야 하므로
                // B StepIncrement env는 설정하지 않는다. 대신 A의 StockAllowance만 override 한다.
                if (normalizedGroove == "deep")
                {
                    const double stockAllowance = 0.0;
                    Environment.SetEnvironmentVariable(AppConfig.CompositeStockAllowanceAEnv, stockAllowance.ToString(CultureInfo.InvariantCulture));
                    AppLogger.Log($"DentalAddin: retentionGroove=deep - A StockAllowance={stockAllowance.ToString(CultureInfo.InvariantCulture)} 적용 (env)");
                }
                else
                {
                    // deep 외에는 A 오버라이드 해제
                    Environment.SetEnvironmentVariable(AppConfig.CompositeStockAllowanceAEnv, null);
                }

                AppLogger.Log($"DentalAddin: retentionGroove 적용 - groove={normalizedGroove}, StepIncrement={envValue} (env={AppConfig.CompositeStepIncrementAEnv}, PRC 파일 무변경)");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: retentionGroove 적용 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }

        private void TryApplyCompositeFirstPassPercentEnv(string tooth)
        {
            try
            {
                // 정책 정리:
                // - ABUTS_COMPOSITE_FIRST_PASS_PERCENT_A 는 "퍼센트 override" 전용이다.
                // - 기본 시작점(Splitline_1-0.3mm → percent 변환)은 MainModuleComposite에서 계산한다.
                //   따라서 여기서는 기본적으로 env를 주입하지 않는다.
                Environment.SetEnvironmentVariable(AppConfig.CompositeFirstPassPercentAEnv, null);
                AppLogger.Log($"DentalAddin: Composite FirstPassPercent env 미주입(tooth='{tooth ?? ""}') - 기본값은 MainModuleComposite의 Splitline_1-0.3mm 정책 사용");
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

        private bool TryInvokeCustomSurfaceMerge(Type mainModuleType, Document document)
        {
            string surfaceRoot = AppConfig.SurfaceRootDirectory;
            if (string.IsNullOrWhiteSpace(surfaceRoot) || !Directory.Exists(surfaceRoot))
            {
                AppLogger.Log($"DentalAddin: SurfaceRoot 없음 - {surfaceRoot}");
                return false;
            }

            double rl = 1.0;
            try
            {
                FieldInfo rlField = mainModuleType.GetField("RL", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (rlField != null)
                {
                    rl = Convert.ToDouble(rlField.GetValue(null), CultureInfo.InvariantCulture);
                }
            }
            catch
            {
                rl = 1.0;
            }

            string projectFile = rl == 2.0 ? "Project2.igs" : "Project1.igs";
            string extrudeFile = rl == 2.0 ? "ExtrudeL.igs" : "ExtrudeR.igs";
            string projectPath = Path.Combine(surfaceRoot, projectFile);
            string extrudePath = Path.Combine(surfaceRoot, extrudeFile);

            if (!File.Exists(projectPath))
            {
                AppLogger.Log($"DentalAddin: Surface 파일 없음 - {projectPath}");
                return false;
            }

            try
            {
                int beforeCount = document.GraphicsCollection.Count;
                HashSet<string> beforeSurfaceKeys = SnapshotSurfaceKeys(document);
                AppLogger.Log($"DentalAddin: Surface Merge(1) - {projectPath}");
                document.MergeFile(projectPath, Missing.Value);

                GraphicObject surface = FindMergedSurface(document, beforeCount, beforeSurfaceKeys);
                if (surface == null)
                {
                    int afterCount = document?.GraphicsCollection?.Count ?? 0;
                    AppLogger.Log($"DentalAddin: Merge된 Surface를 찾지 못했습니다. (beforeCount={beforeCount}, afterCount={afterCount}, project={projectFile})");
                    return true;
                }

                surface.Layer.Visible = false;
                FieldInfo surfaceNumberField = mainModuleType.GetField("SurfaceNumber", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                surfaceNumberField?.SetValue(null, Convert.ToInt32(surface.Key, CultureInfo.InvariantCulture));

                SelectionSet selectionSet = EspritDocumentHelper.GetOrCreateSelectionSet(document, "Smove");
                selectionSet.RemoveAll();

                Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
                bool needMove = moveModuleType != null && Convert.ToBoolean(moveModuleType.GetField("NeedMove", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null) ?? false);
                double needMoveY = moveModuleType != null ? Convert.ToDouble(moveModuleType.GetField("NeedMoveY", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null) ?? 0.0) : 0.0;
                double needMoveZ = moveModuleType != null ? Convert.ToDouble(moveModuleType.GetField("NeedMoveZ", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null) ?? 0.0) : 0.0;

                if (needMove)
                {
                    selectionSet.Add(surface, Missing.Value);
                    selectionSet.Translate(0.0, needMoveY, needMoveZ, Missing.Value);
                    selectionSet.RemoveAll();
                }

                int[] numCombobox = DentalAddinReflectionHelper.GetMainModuleField<int[]>(mainModuleType, "NumCombobox");
                int finishingMethod = (numCombobox != null && numCombobox.Length > 1) ? numCombobox[1] : 0;
                if (finishingMethod == 1)
                {
                    AppLogger.Log("DentalAddin: FinishingMethod==1, Extrude Merge 생략");
                    return true;
                }

                if (!File.Exists(extrudePath))
                {
                    AppLogger.Log($"DentalAddin: Extrude 파일 없음 - {extrudePath}");
                    return true;
                }

                beforeCount = document.GraphicsCollection.Count;
                beforeSurfaceKeys = SnapshotSurfaceKeys(document);
                AppLogger.Log($"DentalAddin: Surface Merge(2) - {extrudePath}");
                document.MergeFile(extrudePath, Missing.Value);
                GraphicObject extrudeSurface = FindMergedSurface(document, beforeCount, beforeSurfaceKeys, surface.Key);
                if (extrudeSurface != null)
                {
                    extrudeSurface.Layer.Visible = false;
                    FieldInfo surfaceNumber2Field = mainModuleType.GetField("SurfaceNumber2", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                    surfaceNumber2Field?.SetValue(null, Convert.ToDouble(extrudeSurface.Key, CultureInfo.InvariantCulture));
                    FieldInfo gasField = mainModuleType.GetField("Gas", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                    gasField?.SetValue(null, extrudeSurface);
                }

                return true;
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: 커스텀 Surface Merge 실패 - {ex.GetType().Name}:{ex.Message}");
                return false;
            }
        }

        private static HashSet<string> SnapshotSurfaceKeys(Document document)
        {
            HashSet<string> keys = new HashSet<string>(StringComparer.Ordinal);
            if (document?.GraphicsCollection == null)
            {
                return keys;
            }
            try
            {
                foreach (GraphicObject graphic in document.GraphicsCollection)
                {
                    if (graphic?.GraphicObjectType != espGraphicObjectType.espSurface)
                    {
                        continue;
                    }
                    keys.Add(Convert.ToString(graphic.Key, CultureInfo.InvariantCulture) ?? string.Empty);
                }
            }
            catch
            {
            }
            return keys;
        }

        private static GraphicObject FindMergedSurface(Document document, int beforeCount, HashSet<string> beforeSurfaceKeys = null, object excludedKey = null)
        {
            if (document?.GraphicsCollection == null)
            {
                return null;
            }
            string excluded = excludedKey != null ? Convert.ToString(excludedKey, CultureInfo.InvariantCulture) : null;
            if (beforeSurfaceKeys != null && beforeSurfaceKeys.Count > 0)
            {
                try
                {
                    foreach (GraphicObject graphic in document.GraphicsCollection)
                    {
                        if (graphic?.GraphicObjectType != espGraphicObjectType.espSurface)
                        {
                            continue;
                        }
                        string key = Convert.ToString(graphic.Key, CultureInfo.InvariantCulture);
                        if (!string.IsNullOrWhiteSpace(excluded) && string.Equals(key, excluded, StringComparison.Ordinal))
                        {
                            continue;
                        }
                        if (!beforeSurfaceKeys.Contains(key))
                        {
                            return graphic;
                        }
                    }
                }
                catch
                {
                }
            }
            int count = document.GraphicsCollection.Count;
            for (int i = beforeCount + 1; i <= count; i++)
            {
                GraphicObject graphicObject = document.GraphicsCollection[i] as GraphicObject;
                if (graphicObject?.GraphicObjectType != espGraphicObjectType.espSurface)
                {
                    continue;
                }
                if (excludedKey != null && Equals(graphicObject.Key, excludedKey))
                {
                    continue;
                }
                return graphicObject;
            }
            // 최후 수단: 컬렉션 끝에서 역순 탐색하여 Surface를 반환
            for (int i = count; i >= 1; i--)
            {
                GraphicObject graphicObject = document.GraphicsCollection[i] as GraphicObject;
                if (graphicObject?.GraphicObjectType != espGraphicObjectType.espSurface)
                {
                    continue;
                }
                if (excludedKey != null && Equals(graphicObject.Key, excludedKey))
                {
                    continue;
                }
                return graphicObject;
            }
            return null;
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
        private void ApplyAdditionalStlShift(Document document, Type mainModuleType, double deltaX)
        {
            if (document == null || deltaX <= 0)
            {
                return;
            }
            try
            {
                const string selectionName = "StlProcessorShift";
                SelectionSet selectionSet = EspritDocumentHelper.GetOrCreateSelectionSet(document, selectionName);
                if (selectionSet == null)
                {
                    AppLogger.Log("DentalAddin: 추가 이동 SelectionSet 생성 실패");
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
                    AppLogger.Log("DentalAddin: 추가 X 이동 대상 STL 없음");
                    return;
                }
                selectionSet.Translate(deltaX, 0.0, 0.0, Missing.Value);
                selectionSet.RemoveAll();
                Type moveModuleType = DentalAddinReflectionHelper.ResolveMoveModuleType(mainModuleType);
                if (moveModuleType == null)
                {
                    AppLogger.Log("DentalAddin: 추가 이동 후 MoveSTL_Module 타입을 찾을 수 없습니다.");
                    return;
                }
                double? originalFront = 0.0;
                double? originalBack = 0.0;
                double? updatedFront = originalFront.HasValue ? originalFront + deltaX : (double?)null;
                double? updatedBack = originalBack.HasValue ? originalBack + deltaX : (double?)null;
                if (updatedFront.HasValue)
                {
                    DentalAddinReflectionHelper.SetStaticField(moveModuleType, "FrontPointX", updatedFront.Value);
                }
                if (updatedBack.HasValue)
                {
                    DentalAddinReflectionHelper.SetStaticField(moveModuleType, "BackPointX", updatedBack.Value);
                }

                AppLogger.Log($"DentalAddin: STL 추가 X 이동 완료 - delta:{deltaX:F3}, Front:{updatedFront:F3}, Back:{updatedBack:F3}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: STL 추가 이동 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private void AdjustOperationStartPointY(Document document, double deltaX)
        {
            if (document?.Operations == null || deltaX <= 0)
            {
                return;
            }
            try
            {
                int adjustedCount = 0;
                for (int i = 1; i <= document.Operations.Count; i++)
                {
                    try
                    {
                        dynamic op = document.Operations[i];
                        if (op == null) continue;

                        string opName = null;
                        try { opName = op.Name; } catch { }

                        // CONNECTION Operation만 조정 (각인 코드)
                        if (string.IsNullOrEmpty(opName) || !opName.Contains("CONNECTION"))
                        {
                            continue;
                        }

                        // Operation의 Text 속성 (NC 코드) 가져오기
                        string text = null;
                        try { text = op.Text; } catch { }
                        if (string.IsNullOrWhiteSpace(text))
                        {
                            AppLogger.Log($"DentalAddin: Op[{i}] {opName} - Text(NC코드) null");
                            continue;
                        }

                        // NC 코드에서 Y 좌표(ESPRIT X축)를 deltaX만큼 증가
                        string adjustedText = AdjustNcCodeYCoordinates(text, deltaX);
                        if (adjustedText != text)
                        {
                            op.Text = adjustedText;
                            adjustedCount++;
                            AppLogger.Log($"DentalAddin: Op[{i}] {opName} NC 코드 Y 좌표 조정 완료");
                        }
                        else
                        {
                            AppLogger.Log($"DentalAddin: Op[{i}] {opName} - NC 코드에 Y 좌표 없음");
                        }
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Log($"DentalAddin: Operation[{i}] NC 코드 조정 실패 - {ex.Message}");
                    }
                }
                AppLogger.Log($"DentalAddin: Connection NC 코드 조정 완료 - {adjustedCount}개 Operation, deltaX:{deltaX:F3}");
            }
            catch (Exception ex)
            {
                AppLogger.Log($"DentalAddin: NC 코드 조정 실패 - {ex.GetType().Name}:{ex.Message}");
            }
        }
        private string AdjustNcCodeYCoordinates(string ncCode, double deltaX)
        {
            if (string.IsNullOrWhiteSpace(ncCode) || deltaX <= 0)
            {
                return ncCode;
            }

            // NC 코드에서 Y 좌표를 찾아서 deltaX만큼 증가
            // 패턴: Y숫자 (예: Y0.525, Y2.03, Y-1.5)
            var regex = new Regex(@"Y(-?\d+\.?\d*)", RegexOptions.IgnoreCase);
            string result = regex.Replace(ncCode, match =>
            {
                string originalValue = match.Groups[1].Value;
                if (double.TryParse(originalValue, NumberStyles.Float, CultureInfo.InvariantCulture, out double yValue))
                {
                    double adjustedValue = yValue + deltaX;
                    return $"Y{adjustedValue.ToString("F3", CultureInfo.InvariantCulture)}";
                }
                return match.Value;
            });

            return result;
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
