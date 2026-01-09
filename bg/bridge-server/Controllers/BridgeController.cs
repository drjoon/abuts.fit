using Hi_Link_Advanced; // CollectDataType enum (OPStatus, MotorTemperature, ToolLifeInfo 유지)
using Hi_Link_Advanced.EdgeBridge; // GetProgramData 등 기존 타입 호환
using Hi_Link.Libraries.Model;
using HiLinkBridgeWebApi48.Models;
using PayloadUpdateActivateProg = Hi_Link.Libraries.Model.UpdateMachineActivateProgNo;
using Mode1Api = HiLinkBridgeWebApi48.Mode1Api;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
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

            const string AlarmDataType = "GetMachineAlarmInfo";

            if (raw == null || string.IsNullOrWhiteSpace(raw.dataType))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    error = "dataType is required"
                });
            }

            // CollectDataType enum에 없는 커스텀 타입: GetMachineAlarmInfo → Mode1 호출로 직접 처리
            if (string.Equals(raw.dataType, AlarmDataType, StringComparison.OrdinalIgnoreCase))
            {
                short headType = 0;
                var headTypeToken = raw.payload?["headType"];
                if (headTypeToken != null && headTypeToken.Type == JTokenType.Integer)
                {
                    try { headType = (short)headTypeToken.Value<int>(); } catch { }
                }

                if (!Mode1Api.TryGetMachineAlarmInfo(raw.uid, headType, out var data, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = err ?? "GetMachineAlarmInfo failed",
                    });
                }

                var alarms = new List<object>();
                if (data.alarmArray != null)
                {
                    foreach (var a in data.alarmArray)
                    {
                        alarms.Add(new
                        {
                            type = a.type,
                            no = a.no,
                        });
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new
                    {
                        headType = data.headType,
                        alarms,
                    }
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
                if (!raw.bypassCooldown && IsRawReadOnCooldown(key))
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
                    else if (type == CollectDataType.UpdateOPStatus)
                    {
                        try
                        {
                            // Mode1 예제(Form1.cs) 기준: SetMachineOPStatus(IOInfo) 호출.
                            // payload가 JObject로 들어오므로 명시적으로 IOInfo로 변환한다.
                            var io = new IOInfo
                            {
                                IOUID = (short)(raw.payload.Value<int?>("IOUID")
                                    ?? raw.payload.Value<int?>("ioUid")
                                    ?? 0),
                                Status = (short)(raw.payload.Value<int?>("Status")
                                    ?? raw.payload.Value<int?>("status")
                                    ?? 0),
                            };
                            payloadObj = io;
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("[Hi-Link /raw] payload cast error for UpdateOPStatus: " + ex);
                            return Request.CreateResponse(HttpStatusCode.BadRequest, new
                            {
                                success = false,
                                message = "failed to parse payload for UpdateOPStatus",
                                error = ex.Message,
                            });
                        }
                    }
                    else if (type == CollectDataType.UpdateActivateProg)
                    {
                        try
                        {
                            // Mode1: HiLink.SetActivateProgram(handle, dto) 호출로 처리
                            var info = raw.payload.ToObject<PayloadUpdateActivateProg>();
                            if (info.programNo <= 0)
                            {
                                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                                {
                                    success = false,
                                    message = "invalid payload for UpdateActivateProg (programNo must be > 0)",
                                    programNo = info.programNo,
                                });
                            }

                            var res = Mode1HandleStore.SetActivateProgram(raw.uid, info, out var err);
                            if (res != 0)
                            {
                                return Request.CreateResponse((HttpStatusCode)500, new
                                {
                                    success = false,
                                    message = err ?? $"SetActivateProgram failed (result={res})",
                                    res,
                                });
                            }

                            return Request.CreateResponse(HttpStatusCode.OK, new
                            {
                                success = true,
                                res = 0,
                            });
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("[Hi-Link /raw] payload cast error for UpdateActivateProg: " + ex);
                            return Request.CreateResponse(HttpStatusCode.BadRequest, new
                            {
                                success = false,
                                message = "failed to parse payload for UpdateActivateProg",
                                error = ex.Message,
                            });
                        }
                    }
                    else if (type == CollectDataType.GetProgListInfo)
                    {
                        short headType = 0;
                        try
                        {
                            // payload가 short/int로 오는 경우만 처리, 실패 시 기본값 0(Main)
                            if (raw.payload != null)
                            {
                                var htVal = raw.payload.ToObject<short>();
                                headType = htVal;
                            }
                        }
                        catch { headType = 0; }

                        if (!Mode1Api.TryGetProgListInfo(raw.uid, headType, out var data, out var err))
                        {
                            return Request.CreateResponse((HttpStatusCode)500, new
                            {
                                success = false,
                                message = err,
                            });
                        }
                        return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data });
                    }
                    else if (type == CollectDataType.GetActivateProgInfo)
                    {
                        if (!Mode1Api.TryGetActivateProgInfo(raw.uid, out var data, out var err))
                        {
                            return Request.CreateResponse((HttpStatusCode)500, new
                            {
                                success = false,
                                message = err,
                            });
                        }
                        return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data });
                    }
                    else if (type == CollectDataType.GetProgDataInfo)
                    {
                        short headType = 0;
                        short programNo = 0;
                        try
                        {
                            if (raw.payload != null)
                            {
                                var ht = raw.payload["headType"];
                                var pn = raw.payload["programNo"];
                                if (ht != null && ht.Type == JTokenType.Integer)
                                    headType = (short)ht.Value<int>();
                                if (pn != null && pn.Type == JTokenType.Integer)
                                    programNo = (short)pn.Value<int>();
                            }
                        }
                        catch { }

                        // fallback: payload가 단일 숫자일 경우 programNo로 간주
                        if (programNo <= 0)
                        {
                            try
                            {
                                programNo = raw.payload.ToObject<short>();
                            }
                            catch { programNo = 0; }
                        }

                        if (programNo <= 0)
                        {
                            return Request.CreateResponse(HttpStatusCode.BadRequest, new
                            {
                                success = false,
                                message = "invalid payload for GetProgDataInfo (programNo must be > 0)",
                            });
                        }

                        if (!Mode1Api.TryGetProgDataInfo(raw.uid, headType, programNo, out var data, out var err))
                        {
                            return Request.CreateResponse((HttpStatusCode)500, new
                            {
                                success = false,
                                message = err,
                            });
                        }
                        return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data });
                    }
                    else if (type == CollectDataType.GetMachineList)
                    {
                        if (!Mode1Api.TryGetMachineList(out var data, out var err))
                        {
                            return Request.CreateResponse((HttpStatusCode)500, new
                            {
                                success = false,
                                message = err,
                            });
                        }
                        return Request.CreateResponse(HttpStatusCode.OK, new { success = true, data });
                    }
                    else if (type == CollectDataType.DeleteProgram)
                    {
                        try
                        {
                            // DeleteProgram도 Mode1 API가 필요하면 추가 구현; 일단 Advanced 경로 유지
                            var info = raw.payload.ToObject<DeleteMachineProgramInfo>();
                            if (info == null || info.programNo <= 0)
                            {
                                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                                {
                                    success = false,
                                    message = "invalid payload for DeleteProgram (programNo must be > 0)",
                                    programNo = info.programNo,
                                });
                            }

                            payloadObj = info;
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("[Hi-Link /raw] payload cast error for DeleteProgram: " + ex);
                            return Request.CreateResponse(HttpStatusCode.BadRequest, new
                            {
                                success = false,
                                message = "failed to parse payload for DeleteProgram",
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
                                "[Hi-Link /raw:GetProgDataInfo] response uid={0}, headType={1}, programNo={2}, length={3}",
                                raw.uid, mp.headType, mp.programNo, mp.programData?.Length ?? 0);
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

                    case CollectDataType.UpdateActivateProg:
                    case CollectDataType.UpdateOPStatus:
                    case CollectDataType.DeleteProgram:
                        {
                            // 예제 기준: 응답은 short result 코드로 돌아오는 케이스가 많다.
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
                        {
                            // 다른 타입에 대해서는 raw object를 그대로 반환한다.
                            dataDto = result;
                            break;
                        }
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

        // POST /machines/{uid}/alarm - GetMachineAlarmInfo (Mode1)
        [HttpPost]
        [Route("machines/{uid}/alarm")]
        public async Task<HttpResponseMessage> GetMachineAlarm(string uid, JObject payload)
        {
            try
            {
                short headType = 0;
                var headTypeToken = payload?["headType"];
                if (headTypeToken != null && headTypeToken.Type == JTokenType.Integer)
                {
                    try { headType = (short)headTypeToken.Value<int>(); } catch { }
                }

                if (!Mode1Api.TryGetMachineAlarmInfo(uid, headType, out var data, out var err))
                {
                    return Request.CreateResponse((HttpStatusCode)500, new
                    {
                        success = false,
                        message = err ?? "GetMachineAlarmInfo failed",
                    });
                }

                var alarms = new List<object>();
                if (data.alarmArray != null)
                {
                    foreach (var a in data.alarmArray)
                    {
                        alarms.Add(new
                        {
                            type = a.type,
                            no = a.no,
                        });
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    data = new
                    {
                        headType = data.headType,
                        alarms,
                    }
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = "GetMachineAlarm failed",
                    error = ex.Message
                });
            }
        }

        // TODO: 가공 시작(Start) 명령은 준비가 완료될 때까지 브리지 레벨에서 완전히 차단한다.
        //       나중에 실제 가공 개시를 허용할 때는 아래 메서드를 수정하거나 삭제하면 된다.
        // POST /machines/{uid}/start
        [HttpPost]
        [Route("machines/{uid}/start")]
        public async Task<HttpResponseMessage> StartMachine(string uid, JObject payload)
        {
            try
            {
                var cooldownKey = $"start:{uid}";
                if (IsControlOnCooldown(cooldownKey))
                {
                    return Request.CreateResponse((HttpStatusCode)429, new
                    {
                        success = false,
                        message = "Start command is temporarily rate-limited."
                    });
                }

                short ioUid = 0;
                var ioUidToken = payload?["ioUid"] ?? payload?["IOUID"];
                if (ioUidToken != null && ioUidToken.Type == JTokenType.Integer)
                {
                    try
                    {
                        ioUid = (short)ioUidToken.Value<int>();
                    }
                    catch { }
                }

                var statusToken = payload != null ? payload["status"] : null;
                // 예제(MACHINE_IO_C_START_Click)와 동일하게, 들어온 status를 "현재 상태"로 보고 0/1 토글 후 전송한다.
                short currentStatus = 0;
                if (statusToken != null && statusToken.Type == JTokenType.Integer)
                {
                    try
                    {
                        currentStatus = (short)statusToken.Value<int>();
                    }
                    catch { currentStatus = 0; }
                }
                short nextStatus = (short)((currentStatus + 1) % 2);

                var io = new IOInfo
                {
                    IOUID = ioUid,
                    Status = nextStatus,
                };

                var result = await Client.RequestRawAsync(uid, CollectDataType.UpdateOPStatus, io, 5000);

                int rc = -1;
                if (result is short s) rc = s;
                else if (result is int i) rc = i;

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = rc == 0,
                    result = rc,
                    ioUid,
                    status = nextStatus,
                });
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[StartMachine] uid={0} error={1}", uid, ex.Message);
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = "StartMachine failed",
                    error = ex.Message
                });
            }
        }

        [HttpPost]
        [Route("machines/{uid}/programs/upload-from-store")]
        public async Task<HttpResponseMessage> UploadProgramFromStore(string uid, JObject payload)
        {
            try
            {
                if (payload == null)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "payload is required"
                    });
                }

                var relPath = payload.Value<string>("path") ?? payload.Value<string>("filePath");
                if (string.IsNullOrWhiteSpace(relPath))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "path is required"
                    });
                }

                var root = Environment.GetEnvironmentVariable("BRIDGE_STORE_ROOT") ?? @"C:\\CNCStore";
                var cleaned = (relPath ?? string.Empty)
                    .Replace('/', Path.DirectorySeparatorChar)
                    .Replace("..", string.Empty);

                var combined = Path.Combine(root, cleaned);
                var full = Path.GetFullPath(combined);
                var rootFull = Path.GetFullPath(root);

                if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "Path is outside of root"
                    });
                }

                if (!System.IO.File.Exists(full))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "file not found",
                        path = relPath
                    });
                }

                var content = System.IO.File.ReadAllText(full);
                var fileName = Path.GetFileName(full);

                int programNo = payload.Value<int?>("programNo") ?? 0;
                if (programNo <= 0)
                {
                    programNo = HiLinkBridgeWebApi48.Controllers.BridgeStoreController.ExtractProgramNo(fileName);
                }

                if (programNo <= 0)
                {
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new
                    {
                        success = false,
                        message = "invalid programNo (must be > 0)",
                        fileName
                    });
                }

                short headType = 0;
                var headTypeToken = payload["headType"];
                if (headTypeToken != null && headTypeToken.Type == JTokenType.Integer)
                {
                    try
                    {
                        headType = (short)headTypeToken.Value<int>();
                    }
                    catch { }
                }

                bool isNew = true;
                var isNewToken = payload["isNew"];
                if (isNewToken != null && (isNewToken.Type == JTokenType.Boolean || isNewToken.Type == JTokenType.Integer))
                {
                    try
                    {
                        isNew = isNewToken.Value<bool>();
                    }
                    catch { }
                }

                int timeoutMs = payload.Value<int?>("timeoutMilliseconds") ?? 60000;
                if (timeoutMs < 3000) timeoutMs = 3000;

                var info = new UpdateMachineProgramInfo
                {
                    headType = headType,
                    programNo = (short)programNo,
                    programData = content,
                    isNew = isNew,
                };

                var result = await Client.RequestRawAsync(uid, CollectDataType.UpdateProgram, info, timeoutMs);

                int rc = -1;
                if (result is short s) rc = s;
                else if (result is int i) rc = i;

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = rc == 0,
                    result = rc,
                    programNo,
                    headType,
                    isNew,
                    path = relPath,
                });
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[UploadProgramFromStore] uid={0} error={1}", uid, ex);
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    message = "UploadProgramFromStore failed",
                    error = ex.Message
                });
            }
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