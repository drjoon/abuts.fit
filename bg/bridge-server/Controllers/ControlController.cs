using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Http;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/cnc")]
    public class ControlController : ApiController
    {
        public static bool IsRunning { get; set; } = true;

        public class StartStopRequest
        {
            public short? ioUid { get; set; }
            public short? panelType { get; set; }
            public int? status { get; set; }
        }

        // POST /api/cnc/start?machines=M3,M4
        [HttpPost]
        [Route("start")]
        public HttpResponseMessage Start(string machines, [FromBody] StartStopRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            short ioUid = req?.ioUid ?? 61;
            short panelType = req?.panelType ?? 0;
            bool status = req?.status == null || req?.status == 1;

            foreach (var machineId in machineIds)
            {
                var cooldownKey = $"start:{machineId}";
                if (BridgeShared.IsControlOnCooldown(cooldownKey))
                {
                    results.Add(new { machineId, success = false, message = "Too many requests" });
                    continue;
                }

                var jobId = Guid.NewGuid().ToString("N");
                Console.WriteLine($"[MachineStart] jobId={jobId} accepted. machineId={machineId} ioUid={ioUid}");

                Task.Run(() =>
                {
                    try
                    {
                        if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
                        {
                            Console.WriteLine($"[MachineStart] jobId={jobId} failed: {error}");
                            BridgeShared.JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = error ?? "SetMachinePanelIO failed" },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        Console.WriteLine($"[MachineStart] jobId={jobId} completed");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "COMPLETED",
                            Result = new { success = true, message = "Start signal sent", ioUid, status },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[MachineStart] jobId={jobId} exception: {ex.Message}");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = ex.Message },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                });

                results.Add(new { machineId, success = true, jobId, message = "Start signal job accepted" });
            }

            return Request.CreateResponse(HttpStatusCode.Accepted, new { success = true, results });
        }

        // POST /api/cnc/stop?machines=M3,M4
        [HttpPost]
        [Route("stop")]
        public HttpResponseMessage Stop(string machines, [FromBody] StartStopRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            short ioUid = req?.ioUid ?? 62;
            short panelType = req?.panelType ?? 0;
            bool status = req?.status == null || req?.status == 1;

            foreach (var machineId in machineIds)
            {
                var cooldownKey = $"stop:{machineId}";
                if (BridgeShared.IsControlOnCooldown(cooldownKey))
                {
                    results.Add(new { machineId, success = false, message = "Too many requests" });
                    continue;
                }

                var jobId = Guid.NewGuid().ToString("N");
                Console.WriteLine($"[MachineStop] jobId={jobId} accepted. machineId={machineId} ioUid={ioUid}");

                Task.Run(() =>
                {
                    try
                    {
                        if (!Mode1Api.TrySetMachinePanelIO(machineId, panelType, ioUid, status, out var error))
                        {
                            Console.WriteLine($"[MachineStop] jobId={jobId} failed: {error}");
                            BridgeShared.JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = error ?? "SetMachinePanelIO failed" },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        Console.WriteLine($"[MachineStop] jobId={jobId} completed");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "COMPLETED",
                            Result = new { success = true, message = "Stop signal sent", ioUid, status },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[MachineStop] jobId={jobId} exception: {ex.Message}");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = ex.Message },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                });

                results.Add(new { machineId, success = true, jobId, message = "Stop signal job accepted" });
            }

            return Request.CreateResponse(HttpStatusCode.Accepted, new { success = true, results });
        }

        // POST /api/cnc/reset?machines=M3,M4
        [HttpPost]
        [Route("reset")]
        public HttpResponseMessage Reset(string machines)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                var cooldownKey = $"reset:{machineId}";
                if (BridgeShared.IsControlOnCooldown(cooldownKey))
                {
                    results.Add(new { machineId, success = false, message = "Too many requests" });
                    continue;
                }

                var jobId = Guid.NewGuid().ToString("N");
                Console.WriteLine($"[MachineReset] jobId={jobId} accepted. machineId={machineId}");

                Task.Run(() =>
                {
                    try
                    {
                        Mode1HandleStore.Invalidate(machineId);

                        if (!Mode1Api.TrySetMachineReset(machineId, out var error))
                        {
                            var msg = (error ?? "SetMachineReset failed") as string;
                            if (msg.Contains("-8"))
                            {
                                Mode1HandleStore.Invalidate(machineId);
                            }

                            Console.WriteLine($"[MachineReset] jobId={jobId} failed: {error}");
                            BridgeShared.JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = msg },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        Console.WriteLine($"[MachineReset] jobId={jobId} completed");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "COMPLETED",
                            Result = new { success = true, message = "Machine reset signal sent" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[MachineReset] jobId={jobId} exception: {ex.Message}");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = ex.Message },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                });

                results.Add(new { machineId, success = true, jobId, message = "Reset signal job accepted" });
            }

            return Request.CreateResponse(HttpStatusCode.Accepted, new { success = true, results });
        }

        public class MachineModeRequest
        {
            public string mode { get; set; }
        }

        // POST /api/cnc/mode?machines=M3,M4
        [HttpPost]
        [Route("mode")]
        public HttpResponseMessage Mode(string machines, [FromBody] MachineModeRequest req)
        {
            if (string.IsNullOrWhiteSpace(machines))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "machines parameter is required" });
            }

            var mode = (req?.mode ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(mode))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, message = "mode is required (EDIT, AUTO)" });
            }

            var machineIds = BridgeShared.ParseMachineIds(machines);
            var results = new List<object>();

            foreach (var machineId in machineIds)
            {
                var cooldownKey = $"mode:{machineId}:{mode.ToUpperInvariant()}";
                if (BridgeShared.IsControlOnCooldown(cooldownKey))
                {
                    results.Add(new { machineId, success = false, message = "Too many requests" });
                    continue;
                }

                var jobId = Guid.NewGuid().ToString("N");
                Console.WriteLine($"[MachineMode] jobId={jobId} accepted. machineId={machineId} mode={mode}");

                Task.Run(() =>
                {
                    try
                    {
                        if (!Mode1Api.TrySetMachineMode(machineId, mode, out var error))
                        {
                            Console.WriteLine($"[MachineMode] jobId={jobId} failed: {error}");
                            BridgeShared.JobResults[jobId] = new JobResult
                            {
                                JobId = jobId,
                                Status = "FAILED",
                                Result = new { success = false, message = error ?? "SetMachineMode failed" },
                                CreatedAtUtc = DateTime.UtcNow
                            };
                            return;
                        }

                        Console.WriteLine($"[MachineMode] jobId={jobId} completed");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "COMPLETED",
                            Result = new { success = true, message = $"Mode changed to {mode.ToUpperInvariant()}" },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[MachineMode] jobId={jobId} exception: {ex.Message}");
                        BridgeShared.JobResults[jobId] = new JobResult
                        {
                            JobId = jobId,
                            Status = "FAILED",
                            Result = new { success = false, message = ex.Message },
                            CreatedAtUtc = DateTime.UtcNow
                        };
                    }
                });

                results.Add(new { machineId, success = true, jobId, message = $"Mode change to {mode.ToUpperInvariant()} job accepted" });
            }

            return Request.CreateResponse(HttpStatusCode.Accepted, new { success = true, results });
        }
    }
}
