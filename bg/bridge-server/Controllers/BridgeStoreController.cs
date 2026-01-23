using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;

namespace HiLinkBridgeWebApi48.Controllers
{
    [RoutePrefix("api/bridge-store")]
    public class BridgeStoreController : ApiController
    {
        private static readonly string RootPath = Config.BridgeStoreRoot;

        /// <summary>
        /// 파일명 또는 프로그램 번호를 O#### 형식으로 정규화합니다.
        /// </summary>
        public static string NormalizeProgramName(string input)
        {
            if (string.IsNullOrWhiteSpace(input)) return "O0000";
            
            // 확장자 제거 및 경로 제거
            var name = Path.GetFileNameWithoutExtension(input);
            
            // 숫자만 추출
            var match = System.Text.RegularExpressions.Regex.Match(name, @"\d+");
            if (match.Success)
            {
                int num = int.Parse(match.Value);
                return string.Format("O{0:D4}", num);
            }
            
            return "O0000";
        }

        /// <summary>
        /// O#### 형식에서 숫자만 추출하여 int로 반환합니다.
        /// </summary>
        public static int ExtractProgramNo(string input)
        {
            var match = System.Text.RegularExpressions.Regex.Match(input ?? string.Empty, @"\d+");
            if (match.Success)
            {
                return int.Parse(match.Value);
            }
            return 0;
        }

        private string GetSafePath(string relativePath)
        {
            var rel = relativePath ?? string.Empty;
            rel = rel.Replace('/', Path.DirectorySeparatorChar)
                     .Replace("..", string.Empty);
            var combined = Path.Combine(RootPath, rel);
            var full = Path.GetFullPath(combined);
            if (!full.StartsWith(Path.GetFullPath(RootPath), StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Path is outside of root");
            }
            return full;
        }

        [HttpGet]
        [Route("config")]
        public HttpResponseMessage GetConfig()
        {
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                rootPath = RootPath,
            });
        }

        [HttpGet]
        [Route("list")]
        public HttpResponseMessage List([FromUri] string path = "")
        {
            try
            {
                var target = GetSafePath(path ?? string.Empty);
                if (!Directory.Exists(target))
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new
                    {
                        success = true,
                        path,
                        entries = new object[0]
                    });
                }

                var dirs = Directory.GetDirectories(target)
                    .Select(d => new
                    {
                        name = Path.GetFileName(d),
                        type = "directory"
                    });

                var files = Directory.GetFiles(target)
                    .Where(f =>
                    {
                        var ext = Path.GetExtension(f).ToLowerInvariant();
                        return ext == ".nc" || ext == ".txt";
                    })
                    .Select(f => new
                    {
                        name = Path.GetFileName(f),
                        type = "file",
                        size = new FileInfo(f).Length
                    });

                var entries = dirs.Cast<object>().Concat(files.Cast<object>()).ToArray();

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    path,
                    entries
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        [HttpGet]
        [Route("folder-zip")]
        public HttpResponseMessage GetFolderZip([FromUri] string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "path is required"
                });
            }

            try
            {
                var full = GetSafePath(path);
                if (!Directory.Exists(full))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "folder not found"
                    });
                }

                var ms = new MemoryStream();
                using (var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true))
                {
                    var files = Directory.GetFiles(full, "*", SearchOption.AllDirectories);
                    foreach (var file in files)
                    {
                        var relPath = file.Substring(full.Length)
                            .TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

                        var entryName = string.IsNullOrEmpty(relPath)
                            ? Path.GetFileName(file)
                            : relPath;

                        var entry = zip.CreateEntry(entryName, CompressionLevel.Optimal);
                        using (var entryStream = entry.Open())
                        using (var fileStream = File.OpenRead(file))
                        {
                            fileStream.CopyTo(entryStream);
                        }
                    }
                }

                ms.Position = 0;
                var result = new HttpResponseMessage(HttpStatusCode.OK);
                result.Content = new StreamContent(ms);
                result.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/zip");
                var folderName = Path.GetFileName(full.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                if (string.IsNullOrEmpty(folderName)) folderName = "folder";
                result.Content.Headers.ContentDisposition = new System.Net.Http.Headers.ContentDispositionHeaderValue("attachment")
                {
                    FileName = folderName + ".zip"
                };
                return result;
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        public class MkdirRequest
        {
            public string path { get; set; }
        }

        [HttpPost]
        [Route("mkdir")]
        public HttpResponseMessage Mkdir([FromBody] MkdirRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.path))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "path is required"
                });
            }

            try
            {
                var dir = GetSafePath(req.path);
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        public class RenameRequest
        {
            public string path { get; set; }
            public string newName { get; set; }
        }

        [HttpPost]
        [Route("rename")]
        public HttpResponseMessage Rename([FromBody] RenameRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.path) || string.IsNullOrWhiteSpace(req.newName))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "path and newName are required"
                });
            }

            try
            {
                var src = GetSafePath(req.path);
                var parent = Path.GetDirectoryName(src) ?? RootPath;
                var dst = GetSafePath(Path.Combine(parent, req.newName));

                if (Directory.Exists(src))
                {
                    Directory.Move(src, dst);
                }
                else if (File.Exists(src))
                {
                    File.Move(src, dst);
                }
                else
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "source not found"
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        public class MoveRequest
        {
            public string fromPath { get; set; }
            public string toPath { get; set; }
        }

        [HttpPost]
        [Route("move")]
        public HttpResponseMessage Move([FromBody] MoveRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.fromPath) || string.IsNullOrWhiteSpace(req.toPath))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "fromPath and toPath are required"
                });
            }

            try
            {
                var src = GetSafePath(req.fromPath);
                var dst = GetSafePath(req.toPath);

                if (Directory.Exists(src))
                {
                    Directory.Move(src, dst);
                }
                else if (File.Exists(src))
                {
                    File.Move(src, dst);
                }
                else
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "source not found"
                    });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        [HttpGet]
        [Route("file")]
        public HttpResponseMessage GetFile([FromUri] string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "path is required"
                });
            }

            try
            {
                var full = GetSafePath(path);
                if (!File.Exists(full))
                {
                    return Request.CreateResponse(HttpStatusCode.NotFound, new
                    {
                        success = false,
                        message = "file not found"
                    });
                }

                var content = File.ReadAllText(full);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    name = Path.GetFileName(full),
                    path,
                    content
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        public class SaveFileRequest
        {
            public string path { get; set; }
            public string content { get; set; }
        }

        public class UploadFileRequest
        {
            public string path { get; set; }
            public string content { get; set; }
            public bool normalizeName { get; set; } = true;
        }

        [HttpPost]
        [Route("upload")]
        public HttpResponseMessage UploadFile([FromBody] UploadFileRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.path))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "path is required"
                });
            }

            try
            {
                var fileName = Path.GetFileName(req.path);
                var targetPath = req.path;

                if (req.normalizeName && (fileName.ToLower().EndsWith(".nc") || fileName.ToLower().EndsWith(".txt")))
                {
                    var normalizedName = NormalizeProgramName(fileName) + Path.GetExtension(fileName).ToLower();
                    var parentDir = Path.GetDirectoryName(req.path) ?? string.Empty;
                    targetPath = Path.Combine(parentDir, normalizedName);
                }

                var full = GetSafePath(targetPath);
                var dir = Path.GetDirectoryName(full) ?? RootPath;
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                
                File.WriteAllText(full, req.content ?? string.Empty);
                
                return Request.CreateResponse(HttpStatusCode.OK, new { 
                    success = true, 
                    path = targetPath,
                    normalized = req.normalizeName
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        [HttpPost]
        [Route("file")]
        public HttpResponseMessage SaveFile([FromBody] SaveFileRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.path))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "path is required"
                });
            }

            try
            {
                var full = GetSafePath(req.path);
                var dir = Path.GetDirectoryName(full) ?? RootPath;
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                File.WriteAllText(full, req.content ?? string.Empty);
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        [HttpDelete]
        [Route("file")]
        public HttpResponseMessage DeleteFile([FromUri] string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "path is required"
                });
            }

            try
            {
                var full = GetSafePath(path);
                if (File.Exists(full))
                {
                    File.Delete(full);
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        [HttpDelete]
        [Route("folder")]
        public HttpResponseMessage DeleteFolder([FromUri] string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    success = false,
                    message = "path is required"
                });
            }

            try
            {
                var full = GetSafePath(path);
                if (Directory.Exists(full))
                {
                    Directory.Delete(full, true);
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { success = true });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }
    }
}
