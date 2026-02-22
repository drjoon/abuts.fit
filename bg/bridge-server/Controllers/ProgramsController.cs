using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web.Http;
using Hi_Link.Libraries.Model;
using PayloadUpdateActivateProg = Hi_Link.Libraries.Model.UpdateMachineActivateProgNo;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class ProgramsController : ApiController
    {
        public class SmartUploadProgramRequest
        {
            public short? headType { get; set; }
            public string path { get; set; }
            public bool? isNew { get; set; }
        }

        // POST /api/cnc/smart/upload?machines=M3,M4
        [HttpPost]
        [Route("smart/upload")]
        public HttpResponseMessage SmartUploadProgram(string machines, [FromBody] SmartUploadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var headType = req?.headType ?? (short)1;
            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            var fullPath = BridgeShared.GetSafeBridgeStorePath(relPath);
            if (!File.Exists(fullPath))
            {
                return Request.CreateResponse(HttpStatusCode.NotFound, new
                {
                    success = false,
                    message = "file not found",
                    path = relPath
                });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                var jobId = Guid.NewGuid().ToString("N");
                Console.WriteLine($"[SmartUpload] jobId={jobId} accepted. machineId={machineId} path={relPath}");

                Task.Run(async () =>
                {
                    try
                    {
                        var slotNo = BridgeShared.ParseProgramNoFromName(Path.GetFileName(relPath));
                        if (slotNo <= 0) slotNo = BridgeShared.SINGLE_SLOT;

                        var content = File.ReadAllText(fullPath);
                        var enforced = BridgeShared.EnsurePercentAndHeaderSecondLine(content, slotNo);
                        var processed = BridgeShared.SanitizeProgramTextForCnc(BridgeShared.EnsureProgramEnvelope(enforced));

                        var processedLen = (processed ?? string.Empty).Length;
                        var processedBytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                        Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, (short)slotNo, out var _, out var _);

                        enforced = BridgeShared.EnsurePercentAndHeaderSecondLine(content, slotNo);
                        processed = BridgeShared.SanitizeProgramTextForCnc(BridgeShared.EnsureProgramEnvelope(enforced));
                        processedLen = (processed ?? string.Empty).Length;
                        processedBytes = Encoding.ASCII.GetByteCount(processed ?? string.Empty);

                        if (processedBytes > 512000)
                        {
                            BridgeShared.JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = $"program too large (bytes={processedBytes}, limit=512000)" },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        if (!BridgeShared.UploadProgramDataBlocking(machineId, headType, slotNo, processed, req?.isNew ?? true, out var usedMode, out var upErr))
                        {
                            Console.WriteLine($"[SmartUpload] jobId={jobId} failed: {upErr}");
                            BridgeShared.JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = upErr ?? "SetMachineProgramInfo failed" },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        Console.WriteLine($"[SmartUpload] jobId={jobId} completed. slotNo={slotNo} bytes={processedBytes}");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "COMPLETED",
                            Result = new { success = true, message = "Program uploaded", slotNo, usedMode, bytes = processedBytes },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SmartUpload] jobId={jobId} exception: {ex.Message}");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = ex.Message },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                });

                results.Add(new { machineId, success = true, jobId, message = "Smart upload job accepted", headType, path = relPath });
            }

            return Request.CreateResponse(HttpStatusCode.Accepted, new { success = true, results });
        }

        public class DownloadProgramRequest
        {
            public short? headType { get; set; }
            public short? programNo { get; set; }
            public string path { get; set; }
        }

        // POST /api/cnc/smart/download?machines=M3,M4
        [HttpPost]
        [Route("smart/download")]
        public HttpResponseMessage SmartDownloadProgram(string machines, [FromBody] DownloadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var headType = req?.headType ?? (short)1;
            var programNo = req?.programNo ?? (short)0;
            var relPath = (req?.path ?? string.Empty).Trim();

            if (programNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                var cooldownKey = $"downloadProgram:{machineId}:{headType}:{programNo}";
                if (BridgeShared.IsRawReadOnCooldown(cooldownKey))
                {
                    results.Add(new { machineId, success = false, message = "Too many requests" });
                    continue;
                }

                var jobId = Guid.NewGuid().ToString("N");
                Console.WriteLine($"[SmartDownload] jobId={jobId} accepted. machineId={machineId} headType={headType} programNo={programNo} path={relPath}");

                Task.Run(() =>
                {
                    try
                    {
                        if (!BridgeShared.TryGetProgramDataPreferMode1(machineId, headType, programNo, out var programData, out var error))
                        {
                            Console.WriteLine($"[SmartDownload] jobId={jobId} failed: {error}");
                            BridgeShared.JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = error ?? "GetMachineProgramData failed" },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        int length = (programData ?? string.Empty).Length;
                        string savedPath = null;

                        if (!string.IsNullOrWhiteSpace(relPath))
                        {
                            try
                            {
                                var fullPath = BridgeShared.GetSafeBridgeStorePath(relPath);
                                var dir = Path.GetDirectoryName(fullPath);
                                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                                {
                                    Directory.CreateDirectory(dir);
                                }
                                File.WriteAllText(fullPath, programData ?? string.Empty, Encoding.ASCII);
                                savedPath = relPath;
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"[SmartDownload] jobId={jobId} file write failed: {ex.Message}");
                            }
                        }

                        Console.WriteLine($"[SmartDownload] jobId={jobId} completed. length={length} path={savedPath}");

                        var resultObj = new
                        {
                            success = true,
                            headType,
                            slotNo = programNo,
                            path = savedPath,
                            length,
                            warning = (string)null,
                        };

                        if (!string.IsNullOrEmpty(error) && error.StartsWith("TRUNCATED:"))
                        {
                            resultObj = new
                            {
                                success = true,
                                headType,
                                slotNo = programNo,
                                path = savedPath,
                                length,
                                warning = error,
                            };
                        }

                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "COMPLETED",
                            Result = resultObj,
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SmartDownload] jobId={jobId} exception: {ex.Message}");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = ex.Message },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                });

                results.Add(new { machineId, success = true, jobId, message = "Smart download job accepted", headType, programNo });
            }

            return Request.CreateResponse(HttpStatusCode.Accepted, new { success = true, results });
        }

        // GET /api/cnc/programs?machines=M3,M4
        [HttpGet]
        [Route("programs")]
        public async Task<HttpResponseMessage> GetProgramList(string machines, short headType = 1, short? slotNo = null, string path = null)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            // slotNo가 있으면: 특정 프로그램 다운로드 조회 (레거시 동작 겸용)
            if (slotNo.HasValue && slotNo.Value > 0)
            {
                var programNo = slotNo.Value;
                var relPath = (path ?? string.Empty).Trim();

                foreach (var machineId in machineIds)
                {
                    var cooldownKey = $"downloadProgram:get:{machineId}:{headType}:{programNo}";
                    if (BridgeShared.IsRawReadOnCooldown(cooldownKey))
                    {
                        results.Add(new { machineId, success = false, message = "Too many requests" });
                        continue;
                    }

                    if (!BridgeShared.TryGetProgramDataPreferMode1(machineId, headType, programNo, out var programData, out var error))
                    {
                        results.Add(new { machineId, success = false, message = error ?? "GetMachineProgramData failed" });
                        continue;
                    }

                    try
                    {
                        int length = (programData ?? string.Empty).Length;
                        string savedPath = null;

                        if (!string.IsNullOrWhiteSpace(relPath))
                        {
                            var fullPath = BridgeShared.GetSafeBridgeStorePath(relPath);
                            var dir = Path.GetDirectoryName(fullPath);
                            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                            {
                                Directory.CreateDirectory(dir);
                            }
                            File.WriteAllText(fullPath, programData ?? string.Empty, Encoding.ASCII);
                            savedPath = relPath;
                        }

                        if (!string.IsNullOrEmpty(error) && error.StartsWith("TRUNCATED:"))
                        {
                            results.Add(new { machineId, success = true, headType, slotNo = programNo, path = savedPath, length, warning = error });
                        }
                        else
                        {
                            results.Add(new { machineId, success = true, headType, slotNo = programNo, path = savedPath, length });
                        }
                    }
                    catch (Exception ex)
                    {
                        results.Add(new { machineId, success = false, message = ex.Message });
                    }
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, results });
            }

            // 목록 조회
            foreach (var machineId in machineIds)
            {
                var timeoutMs = 2500;
                var task = Task.Factory.StartNew(() =>
                {
                    MachineProgramListInfo info;
                    string error;
                    var ok = Mode1Api.TryGetProgListInfo(machineId, headType, out info, out error);
                    return (ok: ok, info: info, error: error);
                }, TaskCreationOptions.LongRunning);

                var completed = await Task.WhenAny(task, Task.Delay(timeoutMs));
                if (completed != task)
                {
                    Mode1HandleStore.Invalidate(machineId);
                    results.Add(new { machineId, success = false, message = $"GetMachineProgramListInfo timeout (>{timeoutMs}ms)" });
                    continue;
                }

                var result = await task;
                if (!result.ok)
                {
                    var msg = (result.error ?? "GetMachineProgramListInfo failed") as string;
                    if (!string.IsNullOrEmpty(msg) && msg.Contains("result=-8"))
                    {
                        msg = msg + " (무효 핸들러: 다시 시도하세요)";
                    }
                    results.Add(new { machineId, success = false, message = msg });
                    continue;
                }

                var responseInfo = result.info;
                responseInfo.headType = headType;

                results.Add(new { machineId, success = true, data = responseInfo });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, results });
        }

        public class ActivateProgramRequest
        {
            public short? headType { get; set; }
            public short? programNo { get; set; }
        }

        public class DeleteProgramRequest
        {
            public short? headType { get; set; }
            public short? programNo { get; set; }
        }

        // POST /api/cnc/programs/delete?machines=M3,M4
        [HttpPost]
        [Route("programs/delete")]
        public HttpResponseMessage DeleteProgram(string machines, [FromBody] DeleteProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var headType = req?.headType ?? (short)0;
            var programNo = req?.programNo ?? (short)0;

            if (programNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                var cooldownKey = $"deleteProgram:{machineId}:{headType}:{programNo}";
                if (BridgeShared.IsControlOnCooldown(cooldownKey))
                {
                    results.Add(new { machineId, success = false, message = "Too many requests" });
                    continue;
                }

                var jobId = Guid.NewGuid().ToString("N");
                Console.WriteLine($"[DeleteProgram] jobId={jobId} accepted. machineId={machineId} programNo={programNo}");

                Task.Run(() =>
                {
                    try
                    {
                        if (!Mode1Api.TryDeleteMachineProgramInfo(machineId, headType, programNo, out var activateProgNum, out var error))
                        {
                            Console.WriteLine($"[DeleteProgram] jobId={jobId} failed: {error}");
                            BridgeShared.JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = error ?? "DeleteMachineProgramInfo failed" },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        Console.WriteLine($"[DeleteProgram] jobId={jobId} completed");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "COMPLETED",
                            Result = new { success = true, message = "Program deleted", headType, programNo, activateProgNum },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[DeleteProgram] jobId={jobId} exception: {ex.Message}");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = ex.Message },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                });

                results.Add(new { machineId, success = true, jobId, message = "Delete program job accepted" });
            }

            return Request.CreateResponse(HttpStatusCode.Accepted, new { success = true, results });
        }

        // POST /api/cnc/programs/activate?machines=M3,M4
        [HttpPost]
        [Route("programs/activate")]
        public HttpResponseMessage ActivateProgram(string machines, [FromBody] ActivateProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            if (req == null || !req.programNo.HasValue || req.programNo.Value <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            var dto = new PayloadUpdateActivateProg
            {
                headType = req.headType ?? 1,
                programNo = req.programNo.Value
            };

            foreach (var machineId in machineIds)
            {
                var jobId = Guid.NewGuid().ToString("N");
                Console.WriteLine($"[ActivateProgram] jobId={jobId} accepted. machineId={machineId} programNo={dto.programNo}");

                Task.Run(() =>
                {
                    try
                    {
                        var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var error);
                        if (res != 0)
                        {
                            Console.WriteLine($"[ActivateProgram] jobId={jobId} failed: {error}");
                            BridgeShared.JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = error ?? $"SetActivateProgram failed (result={res})" },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        Console.WriteLine($"[ActivateProgram] jobId={jobId} completed");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "COMPLETED",
                            Result = new { success = true, message = "Program activated", programNo = dto.programNo, headType = dto.headType },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[ActivateProgram] jobId={jobId} exception: {ex.Message}");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = ex.Message },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                });

                results.Add(new { machineId, success = true, jobId, message = "Activate program job accepted" });
            }

            return Request.CreateResponse(HttpStatusCode.Accepted, new { success = true, results });
        }

        // POST /api/cnc/programs/activate-sub?machines=M3,M4
        [HttpPost]
        [Route("programs/activate-sub")]
        public HttpResponseMessage ActivateProgramSub(string machines, [FromBody] ActivateProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            if (req == null || !req.programNo.HasValue || req.programNo.Value <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var dto = new PayloadUpdateActivateProg
            {
                headType = 2,
                programNo = req.programNo.Value
            };

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                Mode1HandleStore.Invalidate(machineId);

                var res = Mode1HandleStore.SetActivateProgram(machineId, dto, out var error);
                if (res != 0)
                {
                    results.Add(new { machineId, success = false, message = error ?? $"SetActivateProgram failed (result={res})" });
                    continue;
                }

                results.Add(new { machineId, success = true, message = "Program activated", programNo = dto.programNo, headType = dto.headType });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, results });
        }

        // GET /api/cnc/programs/active?machines=M3,M4
        [HttpGet]
        [Route("programs/active")]
        public HttpResponseMessage GetActiveProgram(string machines)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                if (!Mode1Api.TryGetActivateProgInfo(machineId, out var info, out var error))
                {
                    results.Add(new { machineId, success = false, message = error ?? "GetMachineActivateProgInfo failed" });
                    continue;
                }

                results.Add(new { machineId, success = true, data = info });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, results });
        }
    }
}

        public class UploadProgramRequest
        {
            public short? headType { get; set; }
            public int? slotNo { get; set; }
            public string path { get; set; }
            public bool? isNew { get; set; }
        }

        // POST /api/cnc/programs?machines=M3,M4
        [HttpPost]
        [Route("programs")]
        public HttpResponseMessage UploadProgram(string machines, [FromBody] UploadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var headType = req?.headType ?? (short)1;
            var slotNo = req?.slotNo ?? 0;
            if (slotNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "slotNo is required" });
            }

            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            try
            {
                var fullPath = BridgeShared.GetSafeBridgeStorePath(relPath);
                if (!File.Exists(fullPath))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "file not found",
                        path = relPath
                    });
                }

                var content = File.ReadAllText(fullPath);
                var processed = BridgeShared.SanitizeProgramTextForCnc(BridgeShared.EnsureProgramEnvelope(BridgeShared.EnsureProgramHeader(content, slotNo)));

                var machineIds = BridgeShared.ParseMachineIds(machines);
                var results = new List<object>();

                foreach (var machineId in machineIds)
                {
                    BridgeShared.QueueUploadProgramData(machineId, headType, slotNo, processed, req?.isNew ?? true);
                    results.Add(new { machineId, success = true, message = "Program upload requested", slotNo, path = relPath });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new { success = true, results });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        // POST /api/cnc/programs/download?machines=M3,M4
        [HttpPost]
        [Route("programs/download")]
        public HttpResponseMessage DownloadProgram(string machines, [FromBody] DownloadProgramRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var headType = req?.headType ?? (short)1;
            var programNo = req?.programNo ?? (short)0;
            if (programNo <= 0)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "programNo is required" });
            }

            var relPath = (req?.path ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(relPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "path is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                var cooldownKey = $"downloadProgram:{machineId}:{headType}:{programNo}";
                if (BridgeShared.IsRawReadOnCooldown(cooldownKey))
                {
                    results.Add(new { machineId, success = false, message = "Too many requests" });
                    continue;
                }

                if (!BridgeShared.TryGetProgramDataPreferMode1(machineId, headType, programNo, out var programData, out var error))
                {
                    results.Add(new { machineId, success = false, message = error ?? "GetMachineProgramData failed" });
                    continue;
                }

                try
                {
                    var fullPath = BridgeShared.GetSafeBridgeStorePath(relPath);
                    var dir = Path.GetDirectoryName(fullPath);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    {
                        Directory.CreateDirectory(dir);
                    }
                    File.WriteAllText(fullPath, programData ?? string.Empty, Encoding.ASCII);

                    if (!string.IsNullOrEmpty(error) && error.StartsWith("TRUNCATED:"))
                    {
                        results.Add(new { machineId, success = true, headType, slotNo = programNo, path = relPath, warning = error });
                    }
                    else
                    {
                        results.Add(new { machineId, success = true, headType, slotNo = programNo, path = relPath });
                    }
                }
                catch (Exception ex)
                {
                    results.Add(new { machineId, success = false, message = ex.Message });
                }
            }

            return Request.CreateResponse(HttpStatusCode.OK, new { success = true, results });
        }
    }
}
