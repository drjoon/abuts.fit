// change-log:
// - 2026-09-27: macOS 헬퍼 v2 — Windows lab-cad-helper.ps1과 같은 HTTP API(127.0.0.1:8010).
//   작업 폴더 저장·폴더 고르기(NSOpenPanel)·Finder로 열기. 3Shape/exocad는 macOS 미지원이라 폴더만 연다.
// related files:
// - bg/lab-cad-helper/lab-cad-helper.ps1
// - bg/lab-cad-helper/mac/build.sh
// - bg/lab-cad-helper/mac/Abuts연결_설치.command
// - web/frontend/src/shared/files/labCadHelperClient.ts
import AppKit
import Foundation
import Network

let helperVersion = 2
let defaultPort: UInt16 = 8010
let allowedOrigins: Set<String> = [
  "https://abuts.fit", "https://www.abuts.fit", "http://localhost:5173", "http://127.0.0.1:5173",
]
let maxJsonBody = 256 * 1024
let maxFileBody = 1024 * 1024 * 1024
let sessionTtl: TimeInterval = 30 * 60

let supportDir: URL = {
  let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
  return base.appendingPathComponent("Abuts/LabCadHelper", isDirectory: true)
}()
let configURL = supportDir.appendingPathComponent("config.json")
let tempRoot = FileManager.default.temporaryDirectory.appendingPathComponent("abuts-lab-cad-helper", isDirectory: true)

func log(_ message: String) {
  let f = DateFormatter()
  f.dateFormat = "yyyy-MM-dd HH:mm:ss"
  print("[abuts-lab-helper] \(f.string(from: Date())) \(message)")
  fflush(stdout)
}

struct HelperConfig: Codable {
  var workFolder: String = ""
}

func loadConfig() -> HelperConfig {
  guard let data = try? Data(contentsOf: configURL),
        let cfg = try? JSONDecoder().decode(HelperConfig.self, from: data) else { return HelperConfig() }
  return cfg
}

func saveConfig(_ cfg: HelperConfig) {
  try? FileManager.default.createDirectory(at: supportDir, withIntermediateDirectories: true)
  if let data = try? JSONEncoder().encode(cfg) { try? data.write(to: configURL, options: .atomic) }
}

func isFolder(_ path: String) -> Bool {
  var isDir: ObjCBool = false
  return !path.isEmpty && FileManager.default.fileExists(atPath: path, isDirectory: &isDir) && isDir.boolValue
}

func sanitizeFileName(_ name: String, fallback: String) -> String {
  var base = (name as NSString).lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
  let bad = CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)
  base = String(base.unicodeScalars.map { bad.contains($0) ? "_" : Character($0) })
  while base.hasSuffix(".") { base.removeLast() }
  if base.isEmpty || base == "." || base == ".." { base = fallback }
  if base.count > 120 { base = String(base.prefix(120)) }
  return base
}

struct Session {
  let dir: URL
  let isTemp: Bool
  var files: [URL]
  let createdAt: Date
}

final class HelperState {
  var config = loadConfig()
  var sessions: [String: Session] = [:]
  var running = true

  func prune() {
    let now = Date()
    for (id, s) in sessions where now.timeIntervalSince(s.createdAt) > sessionTtl {
      sessions.removeValue(forKey: id)
      // 작업 폴더 안 케이스 폴더는 지우지 않는다. temp만 정리.
      if s.isTemp { try? FileManager.default.removeItem(at: s.dir) }
    }
  }
}

struct RequestHead {
  let method: String
  let path: String
  let headers: [String: String]
  let contentLength: Int
}

func parseHead(_ data: Data) -> RequestHead? {
  guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else { return nil }
  let lines = text.components(separatedBy: "\r\n")
  let parts = lines.first?.split(separator: " ").map(String.init) ?? []
  guard parts.count >= 2 else { return nil }
  var headers: [String: String] = [:]
  for line in lines.dropFirst() {
    guard let idx = line.firstIndex(of: ":") else { continue }
    let key = line[..<idx].trimmingCharacters(in: .whitespaces).lowercased()
    headers[key] = line[line.index(after: idx)...].trimmingCharacters(in: .whitespaces)
  }
  var target = parts[1]
  if let q = target.firstIndex(of: "?") { target = String(target[..<q]) }
  return RequestHead(
    method: parts[0].uppercased(), path: target, headers: headers,
    contentLength: Int(headers["content-length"] ?? "") ?? 0)
}

let statusText: [Int: String] = [
  200: "OK", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 404: "Not Found",
  411: "Length Required", 413: "Payload Too Large", 422: "Unprocessable Entity", 500: "Internal Server Error",
]

final class HttpConnection {
  let conn: NWConnection
  let state: HelperState
  let queue: DispatchQueue
  var headBuffer = Data()
  var head: RequestHead?
  var body = Data()
  var received = 0
  var fileHandle: FileHandle?
  var fileDest: URL?
  var fileSessionId = ""
  var finished = false
  var responseOrigin = ""

  init(conn: NWConnection, state: HelperState, queue: DispatchQueue) {
    self.conn = conn
    self.state = state
    self.queue = queue
  }

  func start() {
    conn.start(queue: queue)
    receive()
  }

  func receive() {
    conn.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [self] data, _, isComplete, error in
      if let data = data, !data.isEmpty { consume(data) }
      if finished { return }
      if isComplete || error != nil {
        cleanupFile()
        conn.cancel()
        return
      }
      receive()
    }
  }

  func consume(_ data: Data) {
    if head == nil {
      headBuffer.append(data)
      guard let range = headBuffer.range(of: Data("\r\n\r\n".utf8)) else {
        if headBuffer.count > 65536 { respond(400, ["ok": false, "message": "헤더가 너무 깁니다."]) }
        return
      }
      guard let parsed = parseHead(headBuffer.subdata(in: 0..<range.lowerBound)) else {
        respond(400, ["ok": false, "message": "잘못된 요청"])
        return
      }
      head = parsed
      let rest = headBuffer.subdata(in: range.upperBound..<headBuffer.count)
      headBuffer = Data()
      if !prepareBody(parsed) { return }
      feed(rest)
    } else {
      feed(data)
    }
  }

  /// false면 이미 응답했다.
  func prepareBody(_ req: RequestHead) -> Bool {
    let origin = req.headers["origin"] ?? ""
    responseOrigin = allowedOrigins.contains(origin) ? origin : ""
    if !origin.isEmpty && responseOrigin.isEmpty && req.path != "/health" {
      respond(401, ["ok": false, "message": "허용되지 않은 출처입니다."])
      return false
    }
    if req.headers["transfer-encoding"] != nil {
      respond(411, ["ok": false, "message": "Content-Length가 필요합니다."])
      return false
    }
    if let (sid, name) = matchFileUpload(req) {
      guard let session = state.sessions[sid] else {
        respond(404, ["ok": false, "message": "세션이 없습니다."])
        return false
      }
      if req.contentLength > maxFileBody {
        respond(413, ["ok": false, "message": "파일이 너무 큽니다(최대 1GB)."])
        return false
      }
      let dest = session.dir.appendingPathComponent(sanitizeFileName(name, fallback: "model.stl"))
      let part = dest.appendingPathExtension("part")
      FileManager.default.createFile(atPath: part.path, contents: nil)
      guard let handle = try? FileHandle(forWritingTo: part) else {
        respond(500, ["ok": false, "message": "파일을 쓸 수 없습니다."])
        return false
      }
      fileHandle = handle
      fileDest = dest
      fileSessionId = sid
    } else if req.contentLength > maxJsonBody {
      respond(413, ["ok": false, "message": "요청 본문이 너무 큽니다."])
      return false
    }
    return true
  }

  func feed(_ data: Data) {
    guard let req = head, !finished else { return }
    if !data.isEmpty {
      let take = data.prefix(max(0, req.contentLength - received))
      received += take.count
      if let fh = fileHandle { fh.write(take) } else { body.append(take) }
    }
    if received >= req.contentLength { handle(req) }
  }

  func cleanupFile() {
    guard let fh = fileHandle, let dest = fileDest else { return }
    try? fh.close()
    fileHandle = nil
    try? FileManager.default.removeItem(at: dest.appendingPathExtension("part"))
  }

  func matchFileUpload(_ req: RequestHead) -> (String, String)? {
    guard req.method == "PUT" else { return nil }
    let parts = req.path.split(separator: "/").map(String.init)
    guard parts.count == 4, parts[0] == "sessions", parts[2] == "files" else { return nil }
    return (parts[1].removingPercentEncoding ?? parts[1], parts[3].removingPercentEncoding ?? parts[3])
  }

  func jsonBody() -> [String: Any] {
    guard !body.isEmpty, let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return [:] }
    return obj
  }

  func handle(_ req: RequestHead) {
    let method = req.method
    let path = req.path
    let parts = path.split(separator: "/").map(String.init)

    if method == "OPTIONS" { return respondRaw(204, Data(), contentType: nil) }
    if path == "/health" && method == "GET" {
      let wf = state.config.workFolder
      return respond(200, [
        "ok": true, "service": "abuts-lab-cad-helper", "version": helperVersion, "os": "mac",
        "runtime": "swift", "port": Int(port), "workFolder": wf, "workFolderExists": isFolder(wf),
      ])
    }
    if path == "/shutdown" && method == "POST" {
      respond(200, ["ok": true])
      state.running = false
      queue.asyncAfter(deadline: .now() + 0.3) { exit(0) }
      return
    }
    if path == "/work-folder" && method == "GET" {
      let wf = state.config.workFolder
      return respond(200, ["ok": true, "path": wf, "exists": isFolder(wf)])
    }
    if path == "/work-folder" && method == "POST" {
      let want = ((jsonBody()["path"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      guard isFolder(want) else {
        return respond(400, ["ok": false, "code": "WORK_FOLDER_NOT_FOUND", "message": "폴더를 찾을 수 없습니다. 경로를 확인해 주세요."])
      }
      state.config.workFolder = want
      saveConfig(state.config)
      log("work folder set: \(want)")
      return respond(200, ["ok": true, "path": want])
    }
    if path == "/work-folder/pick" && method == "POST" {
      var initial = (jsonBody()["initial"] as? String) ?? ""
      if initial.isEmpty { initial = state.config.workFolder }
      guard let picked = pickFolder(initial: initial) else {
        return respond(200, ["ok": false, "code": "CANCELED", "message": "폴더 선택을 취소했습니다."])
      }
      state.config.workFolder = picked
      saveConfig(state.config)
      log("work folder picked: \(picked)")
      return respond(200, ["ok": true, "path": picked])
    }
    if path == "/sessions" && method == "POST" {
      state.prune()
      let b = jsonBody()
      let workFolder = ((b["workFolder"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      let caseFolder = (b["caseFolder"] as? String) ?? ""
      let sid = String(format: "%llx-%@", UInt64(Date().timeIntervalSince1970 * 1000),
                       String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(8)).lowercased())
      let dir: URL
      var isTemp = true
      if !workFolder.isEmpty {
        guard isFolder(workFolder) else {
          return respond(400, ["ok": false, "code": "WORK_FOLDER_NOT_FOUND", "message": "작업 폴더를 찾을 수 없습니다. 작업 폴더를 다시 지정해 주세요."])
        }
        dir = URL(fileURLWithPath: workFolder, isDirectory: true)
          .appendingPathComponent(sanitizeFileName(caseFolder, fallback: sid), isDirectory: true)
        isTemp = false
        if state.config.workFolder != workFolder {
          state.config.workFolder = workFolder
          saveConfig(state.config)
        }
      } else {
        dir = tempRoot.appendingPathComponent(sid, isDirectory: true)
      }
      do {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      } catch {
        return respond(500, ["ok": false, "message": "폴더를 만들 수 없습니다: \(error.localizedDescription)"])
      }
      state.sessions[sid] = Session(dir: dir, isTemp: isTemp, files: [], createdAt: Date())
      return respond(200, ["ok": true, "sessionId": sid, "folder": dir.path])
    }
    if let fh = fileHandle, let dest = fileDest {
      try? fh.close()
      fileHandle = nil
      let part = dest.appendingPathExtension("part")
      try? FileManager.default.removeItem(at: dest)
      do {
        try FileManager.default.moveItem(at: part, to: dest)
      } catch {
        return respond(500, ["ok": false, "message": "파일 저장 실패: \(error.localizedDescription)"])
      }
      if var s = state.sessions[fileSessionId] {
        if !s.files.contains(dest) { s.files.append(dest) }
        state.sessions[fileSessionId] = s
      }
      return respond(200, ["ok": true, "fileName": dest.lastPathComponent, "bytes": received])
    }
    if method == "POST", parts.count == 3, parts[0] == "sessions", parts[2] == "open" || parts[2] == "reveal" {
      let sid = parts[1].removingPercentEncoding ?? parts[1]
      guard let s = state.sessions[sid] else { return respond(404, ["ok": false, "message": "세션이 없습니다."]) }
      if parts[2] == "open" && s.files.isEmpty {
        return respond(400, ["ok": false, "message": "열 파일이 없습니다."])
      }
      DispatchQueue.main.async { NSWorkspace.shared.open(s.dir) }
      if parts[2] == "reveal" {
        return respond(200, ["ok": true, "folder": s.dir.path, "count": s.files.count])
      }
      log("opened session=\(sid) guide=folder_only")
      return respond(200, [
        "ok": true, "folder": s.dir.path, "count": s.files.count, "mode": "folder", "guide": "folder_only",
        "clipboard": false,
      ])
    }
    respond(404, ["ok": false, "message": "not found"])
  }

  func pickFolder(initial: String) -> String? {
    var picked: String?
    DispatchQueue.main.sync {
      NSApp.activate(ignoringOtherApps: true)
      let panel = NSOpenPanel()
      panel.canChooseDirectories = true
      panel.canChooseFiles = false
      panel.canCreateDirectories = true
      panel.allowsMultipleSelection = false
      panel.prompt = "선택"
      panel.message = "환자 케이스를 저장할 작업 폴더를 고르세요."
      if isFolder(initial) { panel.directoryURL = URL(fileURLWithPath: initial, isDirectory: true) }
      if panel.runModal() == .OK, let url = panel.url { picked = url.path }
    }
    return picked
  }

  func respond(_ status: Int, _ obj: [String: Any]) {
    let data = (try? JSONSerialization.data(withJSONObject: obj)) ?? Data("{}".utf8)
    respondRaw(status, data, contentType: "application/json; charset=utf-8")
  }

  func respondRaw(_ status: Int, _ body: Data, contentType: String?) {
    if finished { return }
    finished = true
    cleanupFile()
    var h = "HTTP/1.1 \(status) \(statusText[status] ?? "OK")\r\n"
    if !responseOrigin.isEmpty { h += "Access-Control-Allow-Origin: \(responseOrigin)\r\nVary: Origin\r\n" }
    h += "Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS\r\n"
    h += "Access-Control-Allow-Headers: Content-Type, x-abuts-cad-secret\r\n"
    h += "Access-Control-Allow-Private-Network: true\r\n"
    h += "Access-Control-Max-Age: 600\r\nCache-Control: no-store\r\nConnection: close\r\n"
    if let ct = contentType { h += "Content-Type: \(ct)\r\n" }
    h += "Content-Length: \(body.count)\r\n\r\n"
    var out = Data(h.utf8)
    out.append(body)
    conn.send(content: out, completion: .contentProcessed { [conn] _ in conn.cancel() })
  }
}

// ---------- main ----------

let port = UInt16(ProcessInfo.processInfo.environment["LAB_CAD_HELPER_PORT"] ?? "") ?? defaultPort
let state = HelperState()
let queue = DispatchQueue(label: "abuts.lab.helper")

let params = NWParameters.tcp
params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
params.allowLocalEndpointReuse = true

let listener: NWListener
do {
  listener = try NWListener(using: params)
} catch {
  log("listen failed: \(error)")
  exit(1)
}
listener.newConnectionHandler = { conn in
  HttpConnection(conn: conn, state: state, queue: queue).start()
}
listener.stateUpdateHandler = { st in
  switch st {
  case .ready:
    log("v\(helperVersion) listening on http://127.0.0.1:\(port)")
    log("work folder: \(state.config.workFolder.isEmpty ? "(unset)" : state.config.workFolder)")
  case .failed(let err):
    log("listener failed: \(err) — another helper is running?")
    exit(0)
  default:
    break
  }
}
listener.start(queue: queue)

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.run()
