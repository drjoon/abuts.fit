using Hi_Link.Libraries.Model;
using Hi_Link_Advanced;
using Hi_Link_Advanced.EdgeBridge;
using Hi_Link_Advanced.LinkBridge;
using HiLinkBridgeWebApi48.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Http;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class BridgeController : ApiController
    {
        private static readonly HiLinkMode2Client Client = new HiLinkMode2Client();
        private static readonly ConcurrentDictionary<string, DateTime> ControlCooldowns = new ConcurrentDictionary<string, DateTime>();
        private static readonly TimeSpan ControlCooldownWindow = TimeSpan.FromSeconds(5);
        private static readonly ConcurrentDictionary<string, DateTime> RawReadCooldowns = new ConcurrentDictionary<string, DateTime>();
        private static readonly TimeSpan RawReadCooldownWindow = TimeSpan.FromSeconds(5);

        private static bool IsControlOnCooldown(string key)
        {
            var now = DateTime.UtcNow;
            if (ControlCooldowns.TryGetValue(key, out var last) && (now - last) < ControlCooldownWindow)
            {
                return true;
            }

            ControlCooldowns[key] = now;
            return false;
        }
        private static bool IsRawReadOnCooldown(string key)
        {
            var now = DateTime.UtcNow;
            if (RawReadCooldowns.TryGetValue(key, out var last) && (now - last) < RawReadCooldownWindow)
            {
                return true;
            }

            RawReadCooldowns[key] = now;
            return false;
        }

        // POST /raw
        [HttpPost]
        [Route("raw")]
        public async Task<HttpResponseMessage> Raw(RawHiLinkRequest raw)
        {
            Console.WriteLine("[Hi-Link /raw] incoming: uid={0}, dataType={1}, timeout={2}",
                raw?.uid, raw?.dataType, raw?.timeoutMilliseconds);

            if (raw == null || string.IsNullOrWhiteSpace(raw.dataType))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    error = "dataType is required"
                });
            }

            if (!Enum.TryParse(raw.dataType, out CollectDataType type))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    error = "invalid CollectDataType",
                    raw.dataType
                });
            }

            // 조회 계열 CollectDataType에 대한 쿨다운 적용 (커서 이동 등 반응형 제어는 여기에 포함하지 않음)
            var readTypes = new[]
            {
                CollectDataType.GetOPStatus,
                CollectDataType.GetProgListInfo,
                CollectDataType.GetActivateProgInfo,
                CollectDataType.GetMotorTemperature,
                CollectDataType.GetToolLifeInfo,
                CollectDataType.GetMachineList,
            };

            if (Array.IndexOf(readTypes, type) >= 0)
            {
                var key = string.Format("{0}:{1}", raw.uid ?? string.Empty, type);
                if (IsRawReadOnCooldown(key))
                {
                    return Request.CreateResponse((HttpStatusCode)429, new
                    {
                        success = false,
                        message = "raw read request is temporarily rate-limited."
                    });
                }
            }

            int timeout = raw.timeoutMilliseconds > 0 ? raw.timeoutMilliseconds : 3000;

            try
            {
                object payloadObj = null;
                if (raw.payload != null)
                {
                    // CollectDataType 별 payload 타입 강제 변환
                    // 특히 GetProgListInfo는 Hi-Link 예제(Form1.cs) 기준으로
                    // (short)HeadType 값을 기대하므로, JToken -> short 캐스팅을 명시적으로 수행한다.
                    if (type == CollectDataType.GetProgListInfo)
                    {
                        try
                        {
                            // JSON 숫자는 기본적으로 Int64로 역직렬화되므로, 먼저 int로 읽은 뒤 short로 캐스팅한다.
                            var intVal = raw.payload.Type == JTokenType.Integer
                                ? raw.payload.Value<int>()
                                : Convert.ToInt32(raw.payload.ToString());
                            payloadObj = (short)intVal;
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("[Hi-Link /raw] payload cast error for GetProgListInfo: " + ex);
                            // 캐스팅 실패 시 기본값(Main 헤드, 0)으로 진행한다.
                            payloadObj = (short)0;
                        }
                    }
                    else if (type == CollectDataType.GetProgDataInfo)
                    {
                        try
                        {
                            // 예제(Form1.cs) 기준: GetProgDataInfo는 GetProgramData 전체 객체를 payload로 기대한다.
                            var gp = raw.payload.ToObject<GetProgramData>();
                            if (gp == null)
                            {
                                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                                {
                                    success = false,
                                    message = "invalid payload for GetProgDataInfo (missing GetProgramData)",
                                });
                            }

                            var progNo = gp.machineProgramData.programNo;
                            if (progNo <= 0)
                            {
                                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                                {
                                    success = false,
                                    message = "invalid programNo for GetProgDataInfo (must be > 0)",
                                    programNo = progNo,
                                });
                            }

                            payloadObj = gp;
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("[Hi-Link /raw] payload cast error for GetProgDataInfo: " + ex);
                            return Request.CreateResponse(HttpStatusCode.BadRequest, new
                            {
                                success = false,
                                message = "failed to parse payload for GetProgDataInfo",
                                error = ex.Message,
                            });
                        }
                    }
                    else if (type == CollectDataType.UpdateProgram)
                    {
                        try
                        {
                            // Mode2 DLL 예제(Form1.cs) 기준: UpdateProgram 은 UpdateMachineProgramInfo 객체를 payload 로 기대한다.
                            var info = raw.payload.ToObject<UpdateMachineProgramInfo>();

                            // 간단한 유효성 체크: programNo 는 0보다 커야 한다.
                            if (info.programNo <= 0)
                            {
                                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                                {
                                    success = false,
                                    message = "invalid programNo for UpdateProgram (must be > 0)",
                                    programNo = info.programNo,
                                });
                            }

                            payloadObj = info;
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("[Hi-Link /raw] payload cast error for UpdateProgram: " + ex);
                            return Request.CreateResponse(HttpStatusCode.BadRequest, new
                            {
                                success = false,
                                message = "failed to parse payload for UpdateProgram",
                                error = ex.Message,
                            });
                        }
                    }
                    else if (type == CollectDataType.UpdateToolLife)
                    {
                        try
                        {
                            // Mode2 DLL 예제(Form1.cs) 기준: UpdateToolLife 는 List<MachineToolLife> 를 payload 로 기대한다.
                            var list = raw.payload.ToObject<List<MachineToolLife>>();
                            if (list == null || list.Count == 0)
                            {
                                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                                {
                                    success = false,
                                    message = "invalid payload for UpdateToolLife (expected non-empty List<MachineToolLife>)",
                                });
                            }

                            payloadObj = list;
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("[Hi-Link /raw] payload cast error for UpdateToolLife: " + ex);
                            return Request.CreateResponse(HttpStatusCode.BadRequest, new
                            {
                                success = false,
                                message = "failed to parse payload for UpdateToolLife",
                                error = ex.Message,
                            });
                        }
                    }
                    else
                    {
                        payloadObj = raw.payload.ToObject<object>();
                    }
                }

                if (type == CollectDataType.GetProgDataInfo && payloadObj is GetProgramData gpLog)
                {
                    Console.WriteLine(
                        "[Hi-Link /raw:GetProgDataInfo] request uid={0}, headType={1}, programNo={2}",
                        raw?.uid ?? "", gpLog.machineProgramData.headType, gpLog.machineProgramData.programNo);
                }

                object result;

                if (type == CollectDataType.GetProgDataInfo)
                {
                    // GetProgDataInfo 는 간헐적으로 null 이 반환되는 경우가 있어, 소규모 재시도를 수행한다.
                    const int maxAttempts = 3;
                    int attempt = 0;
                    while (true)
                    {
                        attempt++;
                        result = await Client.RequestRawAsync(raw.uid ?? string.Empty, type, payloadObj, timeout);

                        if (result is GetProgramData)
                        {
                            break;
                        }

                        if (attempt >= maxAttempts)
                        {
                            Console.WriteLine(
                                "[Hi-Link /raw:GetProgDataInfo] uid={0} programNo={1} failed after {2} attempts, lastResultType={3}",
                                raw?.uid ?? "", (payloadObj as GetProgramData)?.machineProgramData.programNo,
                                attempt, result?.GetType().FullName ?? "null");
                            break;
                        }

                        Console.WriteLine(
                            "[Hi-Link /raw:GetProgDataInfo] uid={0} programNo={1} retry {2} (result was {3})",
                            raw?.uid ?? "", (payloadObj as GetProgramData)?.machineProgramData.programNo,
                            attempt, result?.GetType().FullName ?? "null");

                        await Task.Delay(200);
                    }
                }
                else
                {
                    result = await Client.RequestRawAsync(raw.uid ?? string.Empty, type, payloadObj, timeout);
                }

                object dataDto;
                int? resultCode = null;

                switch (type)
                {
                    case CollectDataType.GetProgListInfo when result is GetProgramListInfo pl:
                        {
                            var listInfo = pl.machineProgramListInfo;
                            object[] programs;
                            if (listInfo.programArray == null)
                            {
                                programs = Array.Empty<object>();
                            }
                            else
                            {
                                var temp = new List<object>();
                                foreach (var p in listInfo.programArray)
                                {
                                    temp.Add(new
                                    {
                                        no = p.no,
                                        comment = p.comment,
                                        opened = p.opened,
                                    });
                                }
                                programs = temp.ToArray();
                            }

                            dataDto = new
                            {
                                result = pl.result,
                                machineProgramListInfo = new
                                {
                                    headType = listInfo.headType,
                                    programArray = programs,
                                }
                            };
                            resultCode = pl.result;
                            break;
                        }

                    case CollectDataType.GetActivateProgInfo when result is GetActivateProgInfo act:
                        {
                            var cur = act.machineCurrentProgInfo;
                            var curDto = new
                            {
                                mainProgramName = cur.MainProgramName,
                                mainProgramComment = cur.MainProgramComment,
                                subProgramName = cur.SubProgramName,
                                subProgramComment = cur.SubProgramComment,
                            };

                            dataDto = new
                            {
                                result = act.result,
                                machineCurrentProgInfo = curDto,
                            };
                            resultCode = act.result;
                            break;
                        }

                    case CollectDataType.GetOPStatus when result is GetOPStatus op:
                        {
                            object[] ioArray;
                            if (op.ioInfo == null)
                            {
                                ioArray = Array.Empty<object>();
                            }
                            else
                            {
                                var temp = new List<object>();
                                foreach (var io in op.ioInfo)
                                {
                                    temp.Add(new
                                    {
                                        IOUID = io.IOUID,
                                        Status = io.Status,
                                    });
                                }
                                ioArray = temp.ToArray();
                            }

                            dataDto = new
                            {
                                result = op.result,
                                ioInfo = ioArray,
                            };
                            resultCode = op.result;
                            break;
                        }

                    case CollectDataType.GetToolLifeInfo when result is GetToolLifeInfo tl:
                        {
                            var life = tl.machineToolLife;
                            object[] toolArray;
                            if (life.toolLife == null)
                            {
                                toolArray = Array.Empty<object>();
                            }
                            else
                            {
                                var temp = new List<object>();
                                foreach (var t in life.toolLife)
                                {
                                    temp.Add(new
                                    {
                                        toolNum = t.toolNum,
                                        useCount = t.useCount,
                                        configCount = t.configCount,
                                        warningCount = t.warningCount,
                                        use = t.use,
                                    });
                                }
                                toolArray = temp.ToArray();
                            }

                            dataDto = new
                            {
                                result = tl.result,
                                machineToolLife = new
                                {
                                    toolLife = toolArray,
                                }
                            };
                            resultCode = tl.result;
                            break;
                        }

                    case CollectDataType.GetMotorTemperature when result is GetMotorTemperatureInfo mt:
                        {
                            var info = mt.machineMotorTemperature;
                            var list = new List<object>();

                            if (info.mainMotorArray != null)
                            {
                                foreach (var m in info.mainMotorArray)
                                {
                                    list.Add(new { name = m.name, temperature = m.temperature });
                                }
                            }
                            if (info.subMotorArray != null)
                            {
                                foreach (var m in info.subMotorArray)
                                {
                                    list.Add(new { name = m.name, temperature = m.temperature });
                                }
                            }
                            if (info.spindleMotorArray != null)
                            {
                                foreach (var m in info.spindleMotorArray)
                                {
                                    list.Add(new { name = m.name, temperature = m.temperature });
                                }
                            }

                            dataDto = new
                            {
                                result = mt.result,
                                machineMotorTemperature = new
                                {
                                    tempInfo = list.ToArray(),
                                }
                            };
                            resultCode = mt.result;
                            break;
                        }

                    case CollectDataType.GetProgDataInfo when result is GetProgramData gd:
                        {
                            var mp = gd.machineProgramData;
                            Console.WriteLine(
                                "[Hi-Link /raw:GetProgDataInfo] response uid={0}, result={1}, headType={2}, programNo={3}",
                                raw?.uid ?? "", gd.result, mp.headType, mp.programNo);
                            var progDto = new
                            {
                                headType = mp.headType,
                                programNo = mp.programNo,
                                programData = mp.programData,
                            };

                            dataDto = new
                            {
                                result = gd.result,
                                machineProgramData = progDto,
                            };
                            resultCode = gd.result;
                            break;
                        }

                    case CollectDataType.UpdateToolLife:
                        {
                            // Mode2 DLL 예제(Form1.cs) 기준: UpdateToolLife 응답은 short result 코드만 반환한다.
                            if (result is short s)
                            {
                                dataDto = new { result = s };
                                resultCode = s;
                            }
                            else if (result is int i)
                            {
                                dataDto = new { result = i };
                                resultCode = i;
                            }
                            else
                            {
                                dataDto = result;
                            }
                            break;
                        }

                    default:
                        dataDto = result;
                        break;
                }

                var resultType = result?.GetType().FullName ?? "null";
                string resultPreview;
                try
                {
                    resultPreview = JsonConvert.SerializeObject(dataDto);
                }
                catch
                {
                    resultPreview = dataDto?.ToString() ?? "null";
                }

                Console.WriteLine("[Hi-Link /raw] response: uid={0}, type={1}, resultType={2}, result={3}",
                    raw?.uid, type, resultType, resultPreview);

                bool success = true;
                string message = null;

                if (resultCode is int rc)
                {
                    success = rc == 0;
                    message = GetHiLinkResultMessage(rc);
                    if (!success && string.IsNullOrWhiteSpace(message))
                    {
                        message = string.Format("Hi-Link 요청 실패 (uid={0}, type={1}, result={2})", raw?.uid ?? "", type, rc);
                    }

                    // UID 미등록(-89/89)일 경우 machines.json 기반으로 자동 재등록을 시도한다.
                    // 첫 호출은 실패로 반환되지만, 이후 요청부터는 UID가 다시 등록된 상태가 된다.
                    if ((rc == -89 || rc == 89) && !string.IsNullOrWhiteSpace(raw?.uid))
                    {
                        try
                        {
                            var configs = MachinesConfigStore.Load();
                            var cfg = configs.Find(m => m != null && m.uid == raw.uid);
                            if (cfg != null)
                            {
                                Console.WriteLine("[Hi-Link /raw] auto re-add machine for uid={0}, ip={1}, port={2}", cfg.uid, cfg.ip, cfg.port);
                                var (addOk, addCode) = await Client.AddMachineAsync(cfg.uid, cfg.ip, cfg.port);
                                Console.WriteLine("[Hi-Link /raw] auto AddMachine result: success={0}, code={1}", addOk, addCode);
                            }
                            else
                            {
                                Console.WriteLine("[Hi-Link /raw] auto re-add skipped: uid={0} not found in machines.json", raw.uid);
                            }
                        }
                        catch (Exception ex2)
                        {
                            Console.Error.WriteLine("[Hi-Link /raw] auto AddMachine failed for uid={0}: {1}", raw?.uid ?? "", ex2);
                        }
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success,
                    dataType = type.ToString(),
                    result = resultCode,
                    message,
                    data = dataDto
                });
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[Hi-Link raw] uid={0} type={1} error={2}", raw?.uid ?? "", type, ex);

                var friendlyMessage = type == CollectDataType.GetProgDataInfo
                    ? "GetProgDataInfo 요청 처리 중 내부 오류가 발생했습니다. payload 형식 및 programNo를 확인하세요."
                    : "raw Hi-Link request failed";

                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = string.Format("{0} (uid={1}, type={2}, error={3})", friendlyMessage, raw?.uid ?? "", type, ex.Message),
                    error = ex.Message
                });
            }
        }

        // GET /machines/{uid}/status
        [HttpGet]
        [Route("machines/{uid}/status")]
        public async Task<HttpResponseMessage> GetStatus(string uid)
        {
            try
            {
                Console.WriteLine("[Hi-Link /machines/{uid}/status] request: uid={0}", uid);

                // 예제 코드 패턴에 맞춰, 상태 조회는 GetMachineStatus 대신 GetOPStatus 를 사용한다.
                // GetOPStatus 응답의 result 코드만 간단히 해석하여 OK / Error 를 반환한다.
                var result = await Client.RequestRawAsync(uid, CollectDataType.GetOPStatus, null, 3000);

                short? opResult = null;
                if (result is GetOPStatus op)
                {
                    opResult = op.result;
                }
                else if (result is short s)
                {
                    opResult = s;
                }
                else if (result is int i)
                {
                    opResult = (short)i;
                }

                var status = "Unknown";
                int finalResult = opResult ?? -1;
                if (opResult.HasValue)
                {
                    status = opResult.Value == 0 ? "OK" : "Error";
                }

                string resultPreview;
                try
                {
                    resultPreview = JsonConvert.SerializeObject(result);
                }
                catch
                {
                    resultPreview = result?.ToString() ?? "null";
                }

                Console.WriteLine("[Hi-Link /machines/{uid}/status] response: uid={0}, status={1}, raw={2}",
                    uid, status, resultPreview);

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    result = finalResult,
                    status,
                    raw = result
                });
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[GetStatus] uid={0} error={1}", uid, ex.Message);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    result = -1,
                    status = "Error",
                    message = "Hi-Link status request failed",
                    // 내부 DLL 예외 메시지는 콘솔 로그에만 남기고, 클라이언트에는 노출하지 않는다.
                    error = "internal Hi-Link error"
                });
            }
        }

        // DELETE /machines/{uid}
        [HttpDelete]
        [Route("machines/{uid}")]
        public async Task<HttpResponseMessage> DeleteMachine(string uid)
        {
            try
            {
                var result = await Client.RequestRawAsync(uid, CollectDataType.DeleteMachine, null, 5000);
                bool success = (result is short s && s == 0) || (result is int i && i == 0);
                return Request.CreateResponse(HttpStatusCode.OK, new { success });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = "DeleteMachine failed",
                    error = ex.Message
                });
            }
        }

        // POST /machines/{uid}/reset
        [HttpPost]
        [Route("machines/{uid}/reset")]
        public async Task<HttpResponseMessage> ResetMachine(string uid)
        {
            try
            {
                var cooldownKey = $"reset:{uid}";
                if (IsControlOnCooldown(cooldownKey))
                {
                    return Request.CreateResponse((HttpStatusCode)429, new
                    {
                        success = false,
                        message = "Reset command is temporarily rate-limited."
                    });
                }

                var result = await Client.RequestRawAsync(uid, CollectDataType.ResetButton, null, 5000);
                bool success = result == null || (result is short s && s == 0) || (result is int i && i == 0);
                return Request.CreateResponse(HttpStatusCode.OK, new { success });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = "ResetMachine failed",
                    error = ex.Message
                });
            }
        }

        // TODO: 가공 시작(Start) 명령은 준비가 완료될 때까지 브리지 레벨에서 완전히 차단한다.
        //       나중에 실제 가공 개시를 허용할 때는 아래 메서드를 수정하거나 삭제하면 된다.
        // POST /machines/{uid}/start
        [HttpPost]
        [Route("machines/{uid}/start")]
        public HttpResponseMessage StartMachine(string uid)
        {
            Console.WriteLine("[Hi-Link /machines/{uid}/start] BLOCKED: uid={0}", uid);
            return Request.CreateResponse((HttpStatusCode)403, new
            {
                success = false,
                message = "가공 개시 명령은 아직 활성화되지 않았습니다. (BridgeController StartMachine TODO)",
            });
        }

        private static string GetHiLinkResultMessage(int result)
        {
            switch (result)
            {
                case 0:
                    return null;
                case -99:
                    return "라이선스를 활성화하세요.";
                case -32:
                    return "설비 연동 개수 초과 - Type2";
                case -31:
                    return "설비 연동 개수 초과 - Type1";
                case -24:
                    return "시리얼번호 확인 중 알 수 없는 에러입니다. Hi-LINK 담당자에 문의하세요.";
                case -23:
                    return "시리얼번호 확인이 안 될 경우입니다. HI-LINK 담당자에 문의하세요.";
                case -22:
                    return "온라인 활성화 서버에 로그인 불가 혹은 인터넷 연결 상태를 확인하세요.";
                case -21:
                    return "온라인 활성화 서버에 접속 불가 혹은 인터넷 연결 상태를 확인하세요.";
                case -16:
                    return "CNC 통신 에러: 설비 전원, 통신 케이블, IP 및 Port 번호를 확인하세요.";
                case -15:
                    return "CNC Type에 맞는 DLL이 없습니다. CNC Type 지원 여부를 확인하세요.";
                case 21:
                    return "잘못된 시리얼번호를 사용했습니다. 시리얼번호를 정확히 입력하세요.";
                case 22:
                    return "다른 PC에 등록된 Serial 번호입니다. 이미 활성화된 시리얼 번호입니다.";
                case 88:
                    return "이미 등록된 UID 입니다.";
                case -8:
                    return "잘못된 통신 Handler 번호를 사용했습니다.";
                case -7:
                    return "CNC 제어기 타입이 잘못 되었습니다.";
                case 89:
                case -89:
                    return "등록되지 않은 설비 UID 입니다.";
                default:
                    return null;
            }
        }
    }
}