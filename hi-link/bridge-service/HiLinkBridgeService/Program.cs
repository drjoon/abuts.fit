using HiLinkBridgeService;
using Hi_Link;
using Hi_Link.Libraries.Model;
using Hi_Link_Advanced;
using Hi_Link_Advanced.EdgeBridge;
using Hi_Link_Advanced.LinkBridge;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System;
using System.Text.Json;

namespace HiLinkBridgeService
{
    public class Program
    {
        private static string? GetHiLinkResultMessage(int result)
        {
            // 매뉴얼에 정의된 공통 result 코드들
            switch (result)
            {
                case 0:
                    return null; // 정상 동작
                case -99:
                    return "라이선스를 활성화하세요.";
                case -32:
                    return "설비 연동 개수 초과 - Type2";
                case -31:
                    return "설비 연동 개수 초과 - Type1";
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

        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddSingleton<HiLinkMode2Client>();
            builder.Services.AddSingleton<MessageHandler>();

            var app = builder.Build();

            // Hi-Link EdgeBridge 타입들은 대부분 public field 기반이라
            // 기본 System.Text.Json 옵션으로는 JSON이 {}로만 직렬화된다.
            // 필드까지 포함해서 직렬화하도록 공통 옵션을 정의한다.
            var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
            {
                IncludeFields = true
            };

            var hiLinkSerial = Environment.GetEnvironmentVariable("HILINK_SERIAL");
            if (!string.IsNullOrWhiteSpace(hiLinkSerial))
            {
                SystemInfo.SerialNumber = hiLinkSerial;
            }
            else
            {
                Console.Error.WriteLine("[Hi-Link] HILINK_SERIAL environment variable is not set. DLL requests may fail.");
            }

            _ = app.Services.GetRequiredService<MessageHandler>();

            var allowControl = string.Equals(
                Environment.GetEnvironmentVariable("BRIDGE_ALLOW_CONTROL"),
                "true",
                StringComparison.OrdinalIgnoreCase
            );

            // POST /raw - CollectDataType 이름과 payload를 그대로 받아 Hi-Link DLL에 전달하는 범용 엔드포인트
            app.MapPost("/raw", async (HttpContext ctx, HiLinkMode2Client client) =>
            {
                var raw = await ctx.Request.ReadFromJsonAsync<RawHiLinkRequest>();
                Console.WriteLine($"[Hi-Link /raw] incoming: uid={raw?.uid}, dataType={raw?.dataType}, timeout={raw?.timeoutMilliseconds}");
                if (raw == null || string.IsNullOrWhiteSpace(raw.dataType))
                {
                    ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await ctx.Response.WriteAsJsonAsync(new { error = "dataType is required" });
                    return;
                }

                if (!Enum.TryParse<CollectDataType>(raw.dataType, out var type))
                {
                    ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await ctx.Response.WriteAsJsonAsync(new { error = "invalid CollectDataType", raw.dataType });
                    return;
                }

                // 조회 계열 CollectDataType 만 락과 무관하게 허용하고,
                // 그 외 타입은 BRIDGE_ALLOW_CONTROL=true 인 경우에만 허용
                bool isReadOnlyType = type is
                    CollectDataType.GetOPStatus or
                    CollectDataType.GetMotorTemperature or
                    CollectDataType.GetToolLifeInfo or
                    CollectDataType.GetProgListInfo or
                    CollectDataType.GetActivateProgInfo;

                if (!allowControl && !isReadOnlyType)
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        message = "control CollectDataType is disabled (set BRIDGE_ALLOW_CONTROL=true to enable)",
                        dataType = type.ToString()
                    });
                    return;
                }

                var timeout = raw.timeoutMilliseconds > 0 ? raw.timeoutMilliseconds : 3000;

                try
                {
                    var result = await client.RequestAsync(raw.uid ?? string.Empty, type, raw.payload, timeout);

                    // EdgeBridge 원본 객체를 그대로 보내면 JSON 직렬화가 어려우므로
                    // 프론트에서 사용하는 필드만 담은 가벼운 DTO로 변환한다.
                    object dataDto;
                    int? resultCode = null;

                    switch (type)
                    {
                        case CollectDataType.GetProgListInfo when result is GetProgramListInfo pl:
                            {
                                var listInfo = pl.machineProgramListInfo;
                                var programs = listInfo.programArray == null
                                    ? Array.Empty<object>()
                                    : System.Linq.Enumerable.ToArray(
                                        System.Linq.Enumerable.Select(listInfo.programArray, p => new
                                        {
                                            no = p.no,
                                            comment = p.comment,
                                            opened = p.opened,
                                        }));

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
                                var ioArray = op.ioInfo == null
                                    ? Array.Empty<object>()
                                    : System.Linq.Enumerable.ToArray(
                                        System.Linq.Enumerable.Select(op.ioInfo, io => new
                                        {
                                            IOUID = io.IOUID,
                                            Status = io.Status,
                                        }));

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
                                var toolArray = life.toolLife == null
                                    ? Array.Empty<object>()
                                    : System.Linq.Enumerable.ToArray(
                                        System.Linq.Enumerable.Select(life.toolLife, t => new
                                        {
                                            toolNum = t.toolNum,
                                            useCount = t.useCount,
                                            configCount = t.configCount,
                                            warningCount = t.warningCount,
                                            use = t.use,
                                        }));

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
                                var list = new System.Collections.Generic.List<object>();

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

                        default:
                            // 기타 타입은 일단 원본 객체를 그대로 보낸다.
                            dataDto = result;
                            break;
                    }

                    var resultType = result?.GetType().FullName ?? "null";
                    string resultPreview;
                    try
                    {
                        resultPreview = JsonSerializer.Serialize(dataDto, jsonOptions);
                    }
                    catch
                    {
                        resultPreview = dataDto?.ToString() ?? "null";
                    }

                    Console.WriteLine($"[Hi-Link /raw] response: uid={raw?.uid}, type={type}, resultType={resultType}, result={resultPreview}");

                    var success = resultCode is int rc ? rc == 0 : true;
                    string? message = null;
                    if (resultCode is int rc2)
                    {
                        // Hi-LINK Mode2 매뉴얼 기준 result 코드 메시지 매핑
                        message = GetHiLinkResultMessage(rc2);
                        if (!success && string.IsNullOrWhiteSpace(message))
                        {
                            message = $"Hi-Link 요청 실패 (uid={raw?.uid ?? ""}, type={type}, result={rc2})";
                        }
                    }

                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        success,
                        dataType = type.ToString(),
                        result = resultCode,
                        message,
                        data = dataDto
                    }, jsonOptions);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[Hi-Link raw] uid={raw?.uid ?? ""} type={type} error={ex}");

                    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        message = $"raw Hi-Link request failed (uid={raw?.uid ?? ""}, type={type}, error={ex.Message})",
                        error = ex.Message
                    });
                }
            });

            // GET /machines - 현재 Hi-Link에 등록된 머신 목록 반환
            app.MapGet("/machines", async (HttpContext ctx, HiLinkMode2Client client) =>
            {
                try
                {
                    var machines = client.GetMachineList();
                    await ctx.Response.WriteAsJsonAsync(new { machines });
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[GetMachineList] {ex.Message}");
                    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        message = "GetMachineList failed",
                        error = ex.Message
                    });
                }
            });

            // POST /machines - 새 머신을 Hi-Link에 등록
            app.MapPost("/machines", async (HttpContext ctx, HiLinkMode2Client client) =>
            {
                if (!allowControl)
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await ctx.Response.WriteAsJsonAsync(new { message = "control API is disabled" });
                    return;
                }
                var req = await ctx.Request.ReadFromJsonAsync<AddMachineRequest>();
                if (req == null || string.IsNullOrWhiteSpace(req.uid) || string.IsNullOrWhiteSpace(req.ip))
                {
                    ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await ctx.Response.WriteAsJsonAsync(new { message = "uid, ip are required" });
                    return;
                }
                var result = client.AddMachine(req.uid, req.ip, req.port);
                await ctx.Response.WriteAsJsonAsync(new { success = result });
            });

            // GET /machines/{uid}/status - 특정 머신의 상태 조회
            app.MapGet("/machines/{uid}/status", async (HttpContext ctx, HiLinkMode2Client client, string uid) =>
            {
                try
                {
                    Console.WriteLine($"[Hi-Link /machines/{{uid}}/status] request: uid={uid}");

                    var result = await client.RequestAsync(uid, CollectDataType.GetMachineStatus, null);
                    var status = client.ParseMachineStatus(result);

                    string resultPreview;
                    try
                    {
                        resultPreview = JsonSerializer.Serialize(result);
                    }
                    catch
                    {
                        resultPreview = result?.ToString() ?? "null";
                    }

                    Console.WriteLine($"[Hi-Link /machines/{{uid}}/status] response: uid={uid}, status={status}, raw={resultPreview}");

                    await ctx.Response.WriteAsJsonAsync(new { result, status }, jsonOptions);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[GetMachineStatus] uid={uid} {ex.Message}");
                    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        result = -1,
                        status = "Error",
                        message = "GetMachineStatus failed",
                        error = ex.Message
                    });
                }
            });

            app.MapDelete("/machines/{uid}", async (HttpContext ctx, HiLinkMode2Client client, string uid) =>
            {
                if (!allowControl)
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await ctx.Response.WriteAsJsonAsync(new { message = "control API is disabled" });
                    return;
                }

                try
                {
                    var result = await client.RequestAsync(uid, CollectDataType.DeleteMachine, null, 5000);
                    bool success = result is short s && s == 0 || result is int i && i == 0;
                    await ctx.Response.WriteAsJsonAsync(new { success });
                }
                catch (Exception ex)
                {
                    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        message = "DeleteMachine failed",
                        error = ex.Message
                    });
                }
            });

            app.MapPost("/machines/{uid}/reset", async (HttpContext ctx, HiLinkMode2Client client, string uid) =>
            {
                if (!allowControl)
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await ctx.Response.WriteAsJsonAsync(new { message = "control API is disabled" });
                    return;
                }

                try
                {
                    var result = await client.RequestAsync(uid, CollectDataType.ResetButton, null, 5000);
                    bool success = result is short s && s == 0 || result is int i && i == 0 || result is null;
                    await ctx.Response.WriteAsJsonAsync(new { success });
                }
                catch (Exception ex)
                {
                    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        message = "ResetMachine failed",
                        error = ex.Message
                    });
                }
            });

            app.MapPost("/emergency-stop", async (HttpContext ctx, HiLinkMode2Client client) =>
            {
                if (!allowControl)
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await ctx.Response.WriteAsJsonAsync(new { message = "control API is disabled" });
                    return;
                }

                try
                {
                    var machines = client.GetMachineList();
                    var results = new System.Collections.Generic.List<object>();

                    foreach (var m in machines)
                    {
                        try
                        {
                            var r = await client.RequestAsync(m.UID ?? string.Empty, CollectDataType.ResetButton, null, 5000);
                            bool success = r is short s && s == 0 || r is int i && i == 0 || r is null;
                            results.Add(new { uid = m.UID, success });
                        }
                        catch (Exception ex2)
                        {
                            results.Add(new { uid = m.UID, success = false, error = ex2.Message });
                        }
                    }

                    await ctx.Response.WriteAsJsonAsync(new { results });
                }
                catch (Exception ex)
                {
                    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        message = "emergency-stop failed",
                        error = ex.Message
                    });
                }
            });

            app.MapPost("/resume-all", async (HttpContext ctx) =>
            {
                await ctx.Response.WriteAsJsonAsync(new
                {
                    success = true,
                    message = "resume-all is a no-op for Hi-Link bridge (no specific API)."
                });
            });

            app.MapPost("/machines/{uid}/start", async (HttpContext ctx, string uid) =>
            {
                ctx.Response.StatusCode = StatusCodes.Status501NotImplemented;
                await ctx.Response.WriteAsJsonAsync(new
                {
                    success = false,
                    message = "Start command is not implemented in Hi-Link bridge. Use /raw with appropriate CollectDataType."
                });
            });

            app.MapPost("/machines/{uid}/stop", async (HttpContext ctx, string uid) =>
            {
                ctx.Response.StatusCode = StatusCodes.Status501NotImplemented;
                await ctx.Response.WriteAsJsonAsync(new
                {
                    success = false,
                    message = "Stop command is not implemented in Hi-Link bridge. Use /raw with appropriate CollectDataType."
                });
            });

            app.Run("http://0.0.0.0:5005");
        }
    }

    // /raw 엔드포인트 요청 본문
    public record RawHiLinkRequest(
        string? uid,
        string? dataType,
        JsonElement payload,
        int timeoutMilliseconds
    );

    // /machines 엔드포인트 요청 본문 (POST)
    public record AddMachineRequest(
        string uid,
        string ip,
        int port
    );

}