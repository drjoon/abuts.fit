// change-log:
// - 2026-10-03: 알림 보기 — 탭 URL을 바꾸지 않고 채팅 이벤트만 주입(새로고침 방지).
// - 2026-10-03: v6 — 401/403 백오프·URL 캐시 무시. 탭 숨김 폴링은 웹 session.browserAlive.
// - 2026-10-03: v4 — PC 알람(/notify·/session) + 브라우저 종료 시 API 장기 폴링.
// - 2026-09-27: v3 — Windows 연결 프로그램과 같은 동작·API. 앱 하나를 열면 「설치할까요?」 한 번 → 사용자 폴더에 복사,
//   LaunchAgent로 로그인 때마다 보이지 않게 실행. 케이스 폴더 확인·저장·Finder로 열기만 한다.
// - 2026-09-27: macOS 헬퍼 v2 — Windows lab-cad-helper.ps1과 같은 HTTP API(127.0.0.1:8010).
// related files:
// - bg/lab-cad-helper/mac/build.sh
// - bg/lab-cad-helper/win/HttpServer.cs
// - bg/lab-cad-helper/rules.md
// - web/frontend/src/shared/files/labHelperClient.ts
import AppKit
import Foundation
import Network

let helperVersion = 7
let helperPort: UInt16 = 8010
let agentLabel = "fit.abuts.labhelper"
let appTitle = "어벗츠 연결 프로그램"
let defaultOrigins: Set<String> = [
  "https://abuts.fit", "https://www.abuts.fit", "http://localhost:5173", "http://127.0.0.1:5173",
]
let maxHeaderBytes = 64 * 1024
let maxJsonBytes = 1024 * 1024
let maxFileBytes: Int64 = 4 * 1024 * 1024 * 1024

let fm = FileManager.default
let appSupport = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
let supportDir = appSupport.appendingPathComponent("Abuts/LabHelper", isDirectory: true)
let legacyDir = appSupport.appendingPathComponent("Abuts/LabCadHelper", isDirectory: true)
let installedApp = supportDir.appendingPathComponent("AbutsLabHelper.app", isDirectory: true)
let installedExe = installedApp.appendingPathComponent("Contents/MacOS/AbutsLabHelper")
let configURL = supportDir.appendingPathComponent("config.json")
let logURL = supportDir.appendingPathComponent("helper.log")
let agentPlist = fm.homeDirectoryForCurrentUser
  .appendingPathComponent("Library/LaunchAgents/\(agentLabel).plist")

// MARK: - log · config

let logQueue = DispatchQueue(label: "abuts.lab.helper.log")

func log(_ message: String) {
  let f = DateFormatter()
  f.dateFormat = "yyyy-MM-dd HH:mm:ss"
  let line = "\(f.string(from: Date())) \(message)\n"
  logQueue.async {
    try? fm.createDirectory(at: supportDir, withIntermediateDirectories: true)
    if let attrs = try? fm.attributesOfItem(atPath: logURL.path),
       let size = attrs[.size] as? Int, size > 1024 * 1024 {
      try? fm.removeItem(at: logURL)
    }
    if let h = try? FileHandle(forWritingTo: logURL) {
      h.seekToEndOfFile()
      h.write(Data(line.utf8))
      try? h.close()
    } else {
      try? Data(line.utf8).write(to: logURL)
    }
  }
}

func readJsonFile(_ url: URL) -> [String: Any] {
  guard let data = try? Data(contentsOf: url),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
  return obj
}

final class Config {
  private let lock = NSLock()
  private var _workFolder: String
  private var _allowOrigin: String

  init() {
    let map = readJsonFile(configURL)
    _workFolder = (map["workFolder"] as? String ?? "").trimmingCharacters(in: .whitespaces)
    _allowOrigin = (map["allowOrigin"] as? String ?? "").trimmingCharacters(in: .whitespaces)
  }

  var workFolder: String {
    get { lock.lock(); defer { lock.unlock() }; return _workFolder }
    set {
      lock.lock()
      _workFolder = newValue
      let obj: [String: Any] = ["workFolder": _workFolder, "allowOrigin": _allowOrigin]
      lock.unlock()
      try? fm.createDirectory(at: supportDir, withIntermediateDirectories: true)
      if let data = try? JSONSerialization.data(withJSONObject: obj) {
        try? data.write(to: configURL, options: .atomic)
      }
    }
  }

  var allowOrigin: String {
    lock.lock(); defer { lock.unlock() }; return _allowOrigin
  }
}

// MARK: - PC 알람 (v4)

final class AlarmSession {
  static let shared = AlarmSession()
  private let lock = NSLock()
  private var apiOrigin = ""
  private var appOrigin = ""
  private var token = ""
  private var enabled = true
  private var muted = Set<String>()
  private var browserAlive = false
  private var lastHeartbeat = Date.distantPast
  private var pollStarted = false

  static let heartbeatExpire: TimeInterval = 60
  static let pollWaitSec = 25
  static let soundDebounce: TimeInterval = 0.9

  func apply(_ body: [String: Any]) {
    lock.lock()
    if let origin = (body["apiOrigin"] as? String)?.trimmingCharacters(in: .whitespaces), !origin.isEmpty {
      var next = origin
      while next.hasSuffix("/") { next = String(next.dropLast()) }
      apiOrigin = next
    }
    if let origin = (body["appOrigin"] as? String)?.trimmingCharacters(in: .whitespaces), !origin.isEmpty {
      var next = origin
      while next.hasSuffix("/") { next = String(next.dropLast()) }
      appOrigin = next
    }
    if let t = (body["token"] as? String)?.trimmingCharacters(in: .whitespaces), !t.isEmpty {
      token = t
    }
    if let prefs = body["prefs"] as? [String: Any] {
      if let en = prefs["enabled"] as? Bool { enabled = en }
      else if let en = prefs["enabled"] as? NSNumber { enabled = en.boolValue }
      muted = Set((prefs["mutedPracticeIds"] as? [Any] ?? []).compactMap {
        let s = "\($0)".trimmingCharacters(in: .whitespaces)
        return s.isEmpty ? nil : s
      })
    }
    if let alive = body["browserAlive"] as? Bool {
      browserAlive = alive
    } else if let alive = body["browserAlive"] as? NSNumber {
      browserAlive = alive.boolValue
    }
    lastHeartbeat = Date()
    let startPoll = !pollStarted
    if startPoll { pollStarted = true }
    lock.unlock()
    if startPoll { AlarmPoller.start() }
  }

  func clear() {
    lock.lock()
    apiOrigin = ""
    appOrigin = ""
    token = ""
    browserAlive = false
    lastHeartbeat = .distantPast
    lock.unlock()
  }

  func shouldPoll() -> Bool {
    lock.lock(); defer { lock.unlock() }
    if apiOrigin.isEmpty || token.isEmpty { return false }
    if !browserAlive { return true }
    return Date().timeIntervalSince(lastHeartbeat) > AlarmSession.heartbeatExpire
  }

  func snapshot() -> (apiOrigin: String, appOrigin: String, token: String, enabled: Bool, muted: Set<String>) {
    lock.lock(); defer { lock.unlock() }
    return (apiOrigin, appOrigin, token, enabled, muted)
  }

  func isPracticeMuted(_ practiceId: String) -> Bool {
    let id = practiceId.trimmingCharacters(in: .whitespaces)
    lock.lock(); defer { lock.unlock() }
    if !enabled { return true }
    if id.isEmpty { return false }
    return muted.contains(id)
  }
}

enum AlarmNotify {
  private static let lock = NSLock()
  private static var lastPlayed = Date.distantPast

  static func href(from alarm: [String: Any], appOrigin: String) -> String {
    let direct = "\(alarm["href"] ?? "")".trimmingCharacters(in: .whitespaces)
    if !direct.isEmpty { return direct }
    let tid = "\(alarm["transferId"] ?? "")".trimmingCharacters(in: .whitespaces)
    var origin = appOrigin.trimmingCharacters(in: .whitespaces)
    while origin.hasSuffix("/") { origin = String(origin.dropLast()) }
    if tid.isEmpty || origin.isEmpty { return "" }
    let enc = tid.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? tid
    return "\(origin)/dashboard/practice-transfers?mode=receive&openTransfer=\(enc)"
  }

  static func play(title: String, body: String, href: String = "") {
    lock.lock()
    let now = Date()
    if now.timeIntervalSince(lastPlayed) < AlarmSession.soundDebounce {
      lock.unlock()
      return
    }
    lastPlayed = now
    lock.unlock()
    if let tink = NSSound(contentsOfFile: "/System/Library/Sounds/Tink.aiff", byReference: true) {
      tink.play()
    } else if let glass = NSSound(contentsOfFile: "/System/Library/Sounds/Glass.aiff", byReference: true) {
      glass.play()
    } else {
      NSSound.beep()
    }
    DispatchQueue.main.async {
      NSUserNotificationCenter.default.delegate = AlarmNotifCenter.shared
      let n = NSUserNotification()
      n.title = title.isEmpty ? appTitle : title
      n.informativeText = body.isEmpty ? "새 알림" : body
      n.soundName = nil
      let link = href.trimmingCharacters(in: .whitespaces)
      if !link.isEmpty { n.userInfo = ["href": link] }
      NSUserNotificationCenter.default.deliver(n)
    }
  }

  private static func jxaStringLiteral(_ s: String) -> String {
    let escaped = s
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\"", with: "\\\"")
    return "\"\(escaped)\""
  }

  /// 앞창이 치과여도, 이미 열린 기공소 수신함(또는 치과 발신함) 탭을 찾아 그 URL로 연다.
  @discardableResult
  static func focusExistingBrowserTab(_ href: String) -> Bool {
    let target = jxaStringLiteral(href)
    let source = """
    function tabMatches(u, target) {
      u = String(u || "");
      target = String(target || "");
      if (u.indexOf("practice-transfers") < 0 && u.indexOf("mode=receive") < 0) return false;
      function hostOf(s) {
        try { return String(s.split("/")[2] || ""); } catch (e) { return ""; }
      }
      function normHost(h) {
        return h.replace("127.0.0.1", "localhost").replace("[::1]", "localhost");
      }
      if (normHost(hostOf(u)) !== normHost(hostOf(target))) return false;
      var wantReceive = target.indexOf("mode=receive") !== -1;
      var wantSend = target.indexOf("mode=send") !== -1;
      if (wantReceive) return u.indexOf("mode=send") === -1;
      if (wantSend) {
        if (u.indexOf("mode=receive") !== -1) return false;
        if (u.indexOf("practice-transfers") !== -1) return true;
        if (u.indexOf("/practice/dashboard") !== -1) return true;
        if (u.indexOf("/dashboard/new-request") !== -1) return true;
        return u.indexOf("mode=send") !== -1;
      }
      return true;
    }
    function extractOpenTransfer(target) {
      var m = String(target || "").match(/[?&]openTransfer=([^&]*)/);
      if (!m) return "";
      try { return decodeURIComponent(String(m[1] || "").replace(/\\+/g, " ")); } catch (e) {
        return String(m[1] || "");
      }
    }
    function injectOpen(tab, target) {
      var id = extractOpenTransfer(target);
      if (!id || id === "null" || id === "undefined") return false;
      var mode = String(target).indexOf("mode=send") !== -1 ? "send" : "receive";
      var js = "(function(){var id=" + JSON.stringify(id) + ";var mode=" + JSON.stringify(mode) + ";var href=" + JSON.stringify(target) + ";try{var path=String(location.pathname||'');if(path.indexOf('practice-transfers')>=0||path.indexOf('/practice/dashboard')>=0){var u=new URL(location.href);u.searchParams.set('mode',mode);history.replaceState({},'',u.pathname+u.search);window.dispatchEvent(new CustomEvent('abuts:practice-transfer:open',{detail:{transferId:id,panel:'chat'}}));}else{location.assign(href);}}catch(e){location.assign(href);}})();";
      try { tab.execute({ javascript: js }); return true; } catch (e1) {}
      try { tab.execute(js); return true; } catch (e2) {}
      return false;
    }
    function tryChromeFamily(name, target) {
      var app = Application(name);
      if (!app.running()) return false;
      var wins = app.windows();
      for (var wi = 0; wi < wins.length; wi++) {
        var w = wins[wi];
        var tabs = w.tabs();
        for (var ti = 0; ti < tabs.length; ti++) {
          var u = "";
          try { u = tabs[ti].url(); } catch (e) { continue; }
          if (!tabMatches(u, target)) continue;
          var injected = false;
          try { injected = injectOpen(tabs[ti], target); } catch (eInj) {}
          if (!injected) {
            try { tabs[ti].url = target; } catch (e2) {}
          }
          try { w.activeTabIndex = ti + 1; } catch (e3) {}
          try { app.activate(); } catch (e4) {}
          try { w.index = 1; } catch (e5) {}
          return true;
        }
      }
      return false;
    }
    function trySafari(target) {
      var app = Application("Safari");
      if (!app.running()) return false;
      var wins = app.windows();
      for (var wi = 0; wi < wins.length; wi++) {
        var w = wins[wi];
        var tabs = w.tabs();
        for (var ti = 0; ti < tabs.length; ti++) {
          var u = "";
          try { u = tabs[ti].url(); } catch (e) { continue; }
          if (!tabMatches(u, target)) continue;
          var injectedS = false;
          try { injectedS = injectOpen(tabs[ti], target); } catch (eInjS) {}
          if (!injectedS) {
            try { tabs[ti].url = target; } catch (e2) {}
          }
          try { w.currentTab = tabs[ti]; } catch (e3) {}
          try { app.activate(); } catch (e4) {}
          try { w.index = 1; } catch (e5) {}
          return true;
        }
      }
      return false;
    }
    var target = \(target);
    var found = false;
    var names = ["Google Chrome", "Google Chrome Canary", "Chromium", "Microsoft Edge", "Brave Browser", "Arc"];
    for (var i = 0; i < names.length; i++) {
      try { if (tryChromeFamily(names[i], target)) found = true; } catch (e) {}
      if (found) break;
    }
    if (!found) {
      try { if (trySafari(target)) found = true; } catch (e) {}
    }
    found;
    """
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    proc.arguments = ["-l", "JavaScript", "-e", source]
    let out = Pipe()
    proc.standardOutput = out
    let err = Pipe()
    proc.standardError = err
    do {
      try proc.run()
      proc.waitUntilExit()
    } catch {
      log("open-href osascript: \(error.localizedDescription)")
      return false
    }
    let data = out.fileHandleForReading.readDataToEndOfFile()
    let text = String(data: data, encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased() ?? ""
    let errText = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let ok = proc.terminationStatus == 0 && text.contains("true")
    if !ok {
      log("open-href jxa fail status=\(proc.terminationStatus) out=\(text) err=\(errText)")
    }
    return ok
  }

  /// 수신함 탭을 앞으로. 못 찾으면 fallbackNew일 때만 앞창 브라우저로 연다.
  @discardableResult
  static func openHref(_ raw: String, fallbackNew: Bool = true) -> Bool {
    let href = raw.trimmingCharacters(in: .whitespaces)
    guard let url = URL(string: href), let scheme = url.scheme?.lowercased() else { return false }
    guard scheme == "http" || scheme == "https" else { return false }
    if focusExistingBrowserTab(href) { return true }
    if fallbackNew { NSWorkspace.shared.open(url) }
    return false
  }
}

final class AlarmNotifCenter: NSObject, NSUserNotificationCenterDelegate {
  static let shared = AlarmNotifCenter()

  func userNotificationCenter(_ center: NSUserNotificationCenter, didActivate notification: NSUserNotification) {
    switch notification.activationType {
    case .contentsClicked, .actionButtonClicked:
      let href = (notification.userInfo?["href"] as? String) ?? ""
      AlarmNotify.openHref(href)
    default:
      break
    }
  }

  func userNotificationCenter(_ center: NSUserNotificationCenter, shouldPresent notification: NSUserNotification) -> Bool {
    true
  }
}

enum AlarmPoller {
  static func start() {
    DispatchQueue.global(qos: .utility).async {
      while true {
        if !AlarmSession.shared.shouldPoll() {
          Thread.sleep(forTimeInterval: 2)
          continue
        }
        let snap = AlarmSession.shared.snapshot()
        if !snap.enabled || snap.apiOrigin.isEmpty || snap.token.isEmpty {
          Thread.sleep(forTimeInterval: 2)
          continue
        }
        let waited = waitOnce(apiOrigin: snap.apiOrigin, token: snap.token)
        if waited.status == 401 || waited.status == 403 {
          // 잘못된·만료 토큰 — 브라우저 세션 갱신까지 대기(스팸 방지).
          Thread.sleep(forTimeInterval: 15)
          continue
        }
        if let alarm = waited.alarm {
          let practiceId = "\(alarm["practiceBusinessAnchorId"] ?? "")".trimmingCharacters(in: .whitespaces)
          if AlarmSession.shared.isPracticeMuted(practiceId) { continue }
          let title = "\(alarm["title"] ?? "")"
          let body = "\(alarm["body"] ?? "")"
          AlarmNotify.play(title: title, body: body, href: AlarmNotify.href(from: alarm, appOrigin: snap.appOrigin))
        } else {
          Thread.sleep(forTimeInterval: 0.5)
        }
      }
    }
  }

  private static func waitOnce(apiOrigin: String, token: String) -> (alarm: [String: Any]?, status: Int) {
    let urlStr = "\(apiOrigin)/api/lab-helper/alarms/wait?wait=\(AlarmSession.pollWaitSec)"
    guard let url = URL(string: urlStr) else { return (nil, 0) }
    var req = URLRequest(url: url, timeoutInterval: TimeInterval(AlarmSession.pollWaitSec + 10))
    req.httpMethod = "GET"
    req.cachePolicy = .reloadIgnoringLocalCacheData
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
    req.setValue("AbutsLabHelper/\(helperVersion)", forHTTPHeaderField: "User-Agent")
    let sem = DispatchSemaphore(value: 0)
    var result: [String: Any]?
    var status = 0
    URLSession.shared.dataTask(with: req) { data, response, _ in
      defer { sem.signal() }
      guard let http = response as? HTTPURLResponse else { return }
      status = http.statusCode
      guard status == 200,
            let data = data,
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            (obj["ok"] as? Bool) != false,
            let alarm = obj["alarm"] as? [String: Any] else { return }
      result = alarm
    }.resume()
    _ = sem.wait(timeout: .now() + .seconds(AlarmSession.pollWaitSec + 15))
    return (result, status)
  }
}

// MARK: - 케이스 폴더

/// 폴더·파일 이름 한 칸. 웹 `labWorkFolder.sanitizeFolderSegment`·Windows `SafeSegment`와 같은 규칙.
func safeSegment(_ value: String) -> String {
  let bad = Set("\\/:*?\"<>|")
  var s = String(value.map { ch -> Character in
    if bad.contains(ch) { return " " }
    if let a = ch.unicodeScalars.first?.value, a < 32 { return " " }
    return ch
  })
  s = s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    .trimmingCharacters(in: .whitespaces)
  while s.hasSuffix(".") || s.hasSuffix(" ") { s.removeLast() }
  if s == "" || s == "." || s == ".." { return "" }
  if s.count > 150 { s = String(s.prefix(150)) }
  return s
}

func normalizeWorkFolder(_ path: String) -> String {
  var p = path.trimmingCharacters(in: .whitespacesAndNewlines)
    .trimmingCharacters(in: CharacterSet(charactersIn: "\""))
  if p.isEmpty { return "" }
  p = (p as NSString).expandingTildeInPath
  guard p.hasPrefix("/") else { return "" }
  p = (p as NSString).standardizingPath
  while p.count > 1 && p.hasSuffix("/") { p.removeLast() }
  return p
}

func isFolder(_ path: String) -> Bool {
  var isDir: ObjCBool = false
  return !path.isEmpty && fm.fileExists(atPath: path, isDirectory: &isDir) && isDir.boolValue
}

// MARK: - HTTP

struct RequestHead {
  let method: String
  let path: String
  let query: [String: String]
  let headers: [String: String]
  let contentLength: Int64
}

func decodeComponent(_ s: String) -> String {
  s.replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? s
}

func parseHead(_ data: Data) -> RequestHead? {
  guard let text = String(data: data, encoding: .utf8) else { return nil }
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
  var query: [String: String] = [:]
  if let q = target.firstIndex(of: "?") {
    for pair in target[target.index(after: q)...].split(separator: "&") {
      let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
      query[decodeComponent(kv[0])] = kv.count > 1 ? decodeComponent(kv[1]) : ""
    }
    target = String(target[..<q])
  }
  while target.count > 1 && target.hasSuffix("/") { target.removeLast() }
  return RequestHead(
    method: parts[0].uppercased(), path: target, query: query, headers: headers,
    contentLength: Int64(headers["content-length"] ?? "") ?? 0)
}

let statusText: [Int: String] = [
  200: "OK", 204: "No Content", 400: "Bad Request", 403: "Forbidden", 404: "Not Found",
  411: "Length Required", 413: "Payload Too Large", 500: "Internal Server Error",
]

func fail(_ code: String, _ message: String) -> [String: Any] {
  ["ok": false, "code": code, "message": message]
}

final class HttpConnection {
  let conn: NWConnection
  let config: Config
  let queue: DispatchQueue
  var headBuffer = Data()
  var head: RequestHead?
  var body = Data()
  var received: Int64 = 0
  var finished = false
  var origin = ""
  /// PUT 파일 저장
  var fileHandle: FileHandle?
  var fileTemp: URL?
  var fileDest: URL?
  /// 본문은 버리고 끝에 이 응답을 보낸다
  var pendingError: (Int, [String: Any])?

  init(conn: NWConnection, config: Config, queue: DispatchQueue) {
    self.conn = conn
    self.config = config
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
        dropFile()
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
        if headBuffer.count > maxHeaderBytes { respond(400, fail("BAD_REQUEST", "헤더가 너무 깁니다.")) }
        return
      }
      guard let parsed = parseHead(headBuffer.subdata(in: 0..<range.lowerBound)) else {
        respond(400, fail("BAD_REQUEST", "잘못된 요청입니다."))
        return
      }
      head = parsed
      let rest = headBuffer.subdata(in: range.upperBound..<headBuffer.count)
      headBuffer = Data()
      if !prepare(parsed) { return }
      feed(rest)
    } else {
      feed(data)
    }
  }

  func isAllowed(_ o: String) -> Bool {
    let v = o.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
    if defaultOrigins.contains(v) { return true }
    return config.allowOrigin.split(separator: ",").contains {
      $0.trimmingCharacters(in: CharacterSet(charactersIn: "/ ")) == v
    }
  }

  /// false면 이미 응답했다.
  func prepare(_ req: RequestHead) -> Bool {
    let o = req.headers["origin"] ?? ""
    if !o.isEmpty && !isAllowed(o) {
      respond(403, fail("ORIGIN_NOT_ALLOWED", "허용되지 않은 사이트입니다."))
      return false
    }
    origin = o
    if req.headers["transfer-encoding"] != nil {
      respond(411, fail("LENGTH_REQUIRED", "Content-Length가 필요합니다."))
      return false
    }
    if req.method == "PUT" && req.path == "/cases/file" {
      if req.contentLength < 0 || req.contentLength > maxFileBytes {
        respond(413, fail("TOO_LARGE", "파일이 너무 큽니다."))
        return false
      }
      switch resolveCase(req.query["workFolder"] ?? "", req.query["caseFolder"] ?? "") {
      case .failure(let err):
        pendingError = (200, err.body)
      case .success(let folder):
        let name = safeSegment(req.query["name"] ?? "")
        if name.isEmpty {
          pendingError = (400, fail("BAD_NAME", "파일 이름이 없습니다."))
          return true
        }
        do {
          try fm.createDirectory(at: folder, withIntermediateDirectories: true)
          let dest = folder.appendingPathComponent(name)
          let temp = folder.appendingPathComponent(name + ".abuts-part")
          fm.createFile(atPath: temp.path, contents: nil)
          fileHandle = try FileHandle(forWritingTo: temp)
          fileTemp = temp
          fileDest = dest
        } catch {
          pendingError = (500, fail("WRITE_FAILED", "파일을 쓸 수 없습니다: \(error.localizedDescription)"))
        }
      }
    } else if req.contentLength > maxJsonBytes {
      respond(413, fail("TOO_LARGE", "요청이 너무 큽니다."))
      return false
    }
    return true
  }

  func feed(_ data: Data) {
    guard let req = head, !finished else { return }
    if !data.isEmpty {
      let take = data.prefix(Int(max(0, min(Int64(data.count), req.contentLength - received))))
      received += Int64(take.count)
      if pendingError != nil {
        // 버린다
      } else if let fh = fileHandle {
        fh.write(take)
      } else {
        body.append(take)
      }
    }
    if received >= req.contentLength { handle(req) }
  }

  func dropFile() {
    if let fh = fileHandle { try? fh.close() }
    fileHandle = nil
    if let t = fileTemp { try? fm.removeItem(at: t) }
    fileTemp = nil
  }

  func jsonBody() -> [String: Any] {
    guard !body.isEmpty,
          let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return [:] }
    return obj
  }

  struct CaseError: Error { let body: [String: Any] }

  func resolveCase(_ workFolder: String, _ caseFolder: String) -> Result<URL, CaseError> {
    let root = normalizeWorkFolder(workFolder.isEmpty ? config.workFolder : workFolder)
    guard isFolder(root) else {
      return .failure(CaseError(body: fail("WORK_FOLDER_NOT_FOUND", "작업 폴더를 찾을 수 없습니다.")))
    }
    let name = safeSegment(caseFolder)
    guard !name.isEmpty else {
      return .failure(CaseError(body: fail("BAD_CASE", "케이스 폴더 이름이 없습니다.")))
    }
    if root != config.workFolder { config.workFolder = root }
    return .success(URL(fileURLWithPath: root, isDirectory: true).appendingPathComponent(name, isDirectory: true))
  }

  func handle(_ req: RequestHead) {
    if let (status, obj) = pendingError {
      dropFile()
      return respond(status, obj)
    }
    if req.method == "OPTIONS" { return preflight(req) }
    switch (req.method, req.path) {
    case ("GET", "/health"):
      let wf = config.workFolder
      return respond(200, [
        "ok": true, "service": "abuts-lab-helper", "version": helperVersion, "os": "mac",
        "port": Int(helperPort), "workFolder": wf, "workFolderExists": isFolder(wf),
      ])
    case ("GET", "/work-folder"):
      let wf = config.workFolder
      return respond(200, ["ok": true, "path": wf, "exists": isFolder(wf)])
    case ("POST", "/work-folder"):
      let want = normalizeWorkFolder(jsonBody()["path"] as? String ?? "")
      guard isFolder(want) else {
        return respond(200, fail("WORK_FOLDER_NOT_FOUND", "폴더를 찾을 수 없습니다. 주소를 확인해 주세요."))
      }
      config.workFolder = want
      return respond(200, ["ok": true, "path": want])
    case ("POST", "/work-folder/pick"):
      var initial = jsonBody()["initial"] as? String ?? ""
      if initial.isEmpty { initial = config.workFolder }
      pickFolder(initial: initial) { [self] picked in
        queue.async { [self] in
          guard let picked = picked else {
            return respond(200, fail("CANCELED", "취소했습니다."))
          }
          config.workFolder = picked
          respond(200, ["ok": true, "path": picked])
        }
      }
      return
    case ("POST", "/cases/check"):
      let b = jsonBody()
      switch resolveCase(b["workFolder"] as? String ?? "", b["caseFolder"] as? String ?? "") {
      case .failure(let err):
        return respond(200, err.body)
      case .success(let folder):
        var missing: [String] = []
        for row in b["files"] as? [[String: Any]] ?? [] {
          let name = safeSegment(row["name"] as? String ?? "")
          if name.isEmpty { continue }
          let size = (row["size"] as? NSNumber)?.int64Value ?? 0
          let path = folder.appendingPathComponent(name).path
          let attrs = try? fm.attributesOfItem(atPath: path)
          let have = (attrs?[.size] as? NSNumber)?.int64Value
          if have == nil || (size > 0 && have != size) { missing.append(name) }
        }
        return respond(200, [
          "ok": true, "folder": folder.path, "exists": isFolder(folder.path), "missing": missing,
        ])
      }
    case ("PUT", "/cases/file"):
      guard let fh = fileHandle, let temp = fileTemp, let dest = fileDest else {
        return respond(500, fail("WRITE_FAILED", "파일을 쓸 수 없습니다."))
      }
      try? fh.close()
      fileHandle = nil
      do {
        if fm.fileExists(atPath: dest.path) { try fm.removeItem(at: dest) }
        try fm.moveItem(at: temp, to: dest)
        fileTemp = nil
      } catch {
        dropFile()
        return respond(500, fail("WRITE_FAILED", "파일 저장 실패: \(error.localizedDescription)"))
      }
      return respond(200, ["ok": true, "folder": dest.deletingLastPathComponent().path, "name": dest.lastPathComponent])
    case ("POST", "/cases/reveal"):
      let b = jsonBody()
      switch resolveCase(b["workFolder"] as? String ?? "", b["caseFolder"] as? String ?? "") {
      case .failure(let err):
        return respond(200, err.body)
      case .success(let folder):
        guard isFolder(folder.path) else {
          return respond(200, fail("CASE_NOT_FOUND", "케이스 폴더가 없습니다."))
        }
        respond(200, ["ok": true, "folder": folder.path])
        DispatchQueue.main.async {
          let cfg = NSWorkspace.OpenConfiguration()
          cfg.activates = true
          if let finder = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.finder") {
            NSWorkspace.shared.open([folder], withApplicationAt: finder, configuration: cfg)
          } else {
            NSWorkspace.shared.open(folder)
          }
        }
        return
      }
    case ("POST", "/notify"):
      let b = jsonBody()
      let title = b["title"] as? String ?? ""
      var text = b["body"] as? String ?? ""
      if text.isEmpty { text = b["message"] as? String ?? "" }
      respond(200, ["ok": true])
      AlarmNotify.play(title: title, body: text, href: "\(b["href"] as? String ?? "")")
      return
    case ("POST", "/open-href"):
      let href = "\(jsonBody()["href"] as? String ?? "")"
      let focused = AlarmNotify.openHref(href, fallbackNew: false)
      return respond(200, ["ok": true, "focused": focused])
    case ("POST", "/session"):
      AlarmSession.shared.apply(jsonBody())
      return respond(200, ["ok": true])
    case ("POST", "/session/clear"):
      AlarmSession.shared.clear()
      return respond(200, ["ok": true])
    case ("POST", "/shutdown"):
      respond(200, ["ok": true])
      log("shutdown")
      queue.asyncAfter(deadline: .now() + 0.2) { exit(0) }
      return
    default:
      return respond(404, fail("NOT_FOUND", "없는 경로입니다."))
    }
  }

  func pickFolder(initial: String, done: @escaping (String?) -> Void) {
    DispatchQueue.main.async {
      NSApp.activate(ignoringOtherApps: true)
      let panel = NSOpenPanel()
      panel.canChooseDirectories = true
      panel.canChooseFiles = false
      panel.canCreateDirectories = true
      panel.allowsMultipleSelection = false
      panel.prompt = "선택"
      panel.message = "환자 케이스를 모아 두는 작업 폴더를 고르세요."
      panel.level = .modalPanel
      if isFolder(initial) { panel.directoryURL = URL(fileURLWithPath: initial, isDirectory: true) }
      let ok = panel.runModal() == .OK
      done(ok ? panel.url.map { normalizeWorkFolder($0.path) } : nil)
    }
  }

  func corsHeaders() -> String {
    guard !origin.isEmpty else { return "" }
    return "Access-Control-Allow-Origin: \(origin)\r\nVary: Origin\r\nAccess-Control-Allow-Private-Network: true\r\n"
  }

  func preflight(_ req: RequestHead) {
    let allowHeaders = req.headers["access-control-request-headers"] ?? "content-type"
    var h = "HTTP/1.1 204 No Content\r\n" + corsHeaders()
    h += "Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS\r\n"
    h += "Access-Control-Allow-Headers: \(allowHeaders.isEmpty ? "content-type" : allowHeaders)\r\n"
    h += "Access-Control-Max-Age: 600\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    send(Data(h.utf8))
  }

  func respond(_ status: Int, _ obj: [String: Any]) {
    let payload = (try? JSONSerialization.data(withJSONObject: obj)) ?? Data("{}".utf8)
    var h = "HTTP/1.1 \(status) \(statusText[status] ?? "Error")\r\n" + corsHeaders()
    h += "Content-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\n"
    h += "Content-Length: \(payload.count)\r\nConnection: close\r\n\r\n"
    var out = Data(h.utf8)
    out.append(payload)
    send(out)
  }

  func send(_ data: Data) {
    if finished { return }
    finished = true
    conn.send(content: data, completion: .contentProcessed { [conn] _ in conn.cancel() })
  }
}

// MARK: - 설치

func run(_ launchPath: String, _ args: [String]) -> Int32 {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: launchPath)
  p.arguments = args
  p.standardOutput = FileHandle.nullDevice
  p.standardError = FileHandle.nullDevice
  do {
    try p.run()
    p.waitUntilExit()
    return p.terminationStatus
  } catch {
    return -1
  }
}

func healthBody(timeout: TimeInterval) -> String? {
  var result: String?
  let sem = DispatchSemaphore(value: 0)
  var req = URLRequest(url: URL(string: "http://127.0.0.1:\(helperPort)/health")!)
  req.timeoutInterval = timeout
  URLSession.shared.dataTask(with: req) { data, _, _ in
    if let data = data { result = String(data: data, encoding: .utf8) }
    sem.signal()
  }.resume()
  _ = sem.wait(timeout: .now() + timeout + 0.5)
  return result
}

func stopRunningHelper() {
  let uid = String(getuid())
  _ = run("/bin/launchctl", ["bootout", "gui/\(uid)/\(agentLabel)"])
  var req = URLRequest(url: URL(string: "http://127.0.0.1:\(helperPort)/shutdown")!)
  req.httpMethod = "POST"
  req.timeoutInterval = 1.5
  let sem = DispatchSemaphore(value: 0)
  URLSession.shared.dataTask(with: req) { _, _, _ in sem.signal() }.resume()
  _ = sem.wait(timeout: .now() + 2)
  for _ in 0..<20 where healthBody(timeout: 0.4) != nil { Thread.sleep(forTimeInterval: 0.15) }
}

func writeAgentPlist() throws {
  let plist: [String: Any] = [
    "Label": agentLabel,
    "ProgramArguments": [installedExe.path, "--serve"],
    "RunAtLoad": true,
    "KeepAlive": ["SuccessfulExit": false],
    "LimitLoadToSessionType": "Aqua",
    "ProcessType": "Interactive",
  ]
  try fm.createDirectory(at: agentPlist.deletingLastPathComponent(), withIntermediateDirectories: true)
  let data = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
  try data.write(to: agentPlist, options: .atomic)
}

func migrateLegacy() {
  let legacyConfig = legacyDir.appendingPathComponent("config.json")
  if !fm.fileExists(atPath: configURL.path),
     let folder = readJsonFile(legacyConfig)["workFolder"] as? String, !folder.isEmpty {
    Config().workFolder = folder
  }
  try? fm.removeItem(at: legacyDir)
}

func alert(_ message: String, _ info: String, buttons: [String], style: NSAlert.Style = .informational) -> Int {
  NSApp.activate(ignoringOtherApps: true)
  let a = NSAlert()
  a.messageText = message
  a.informativeText = info
  a.alertStyle = style
  for b in buttons { a.addButton(withTitle: b) }
  a.window.level = .floating
  return a.runModal().rawValue - NSApplication.ModalResponse.alertFirstButtonReturn.rawValue
}

func install(silent: Bool = false) -> Int32 {
  let quiet = silent || fm.fileExists(atPath: installedApp.path)
  do {
    stopRunningHelper()
    try fm.createDirectory(at: supportDir, withIntermediateDirectories: true)
    if fm.fileExists(atPath: installedApp.path) { try fm.removeItem(at: installedApp) }
    try fm.copyItem(at: Bundle.main.bundleURL, to: installedApp)
    _ = run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", installedApp.path])
    migrateLegacy()
    try writeAgentPlist()
    let uid = String(getuid())
    if run("/bin/launchctl", ["bootstrap", "gui/\(uid)", agentPlist.path]) != 0 {
      _ = run("/bin/launchctl", ["load", "-w", agentPlist.path])
    }
  } catch {
    log("install failed: \(error)")
    if !quiet {
      _ = alert("설치 중 문제가 생겼습니다.", error.localizedDescription, buttons: ["확인"], style: .critical)
    }
    return 1
  }
  var ok = false
  for _ in 0..<32 {
    if let body = healthBody(timeout: 0.5), body.contains("\"version\":\(helperVersion)") {
      ok = true
      break
    }
    Thread.sleep(forTimeInterval: 0.25)
  }
  log("install ok=\(ok) quiet=\(quiet)")
  if quiet { return ok ? 0 : 3 }
  if ok {
    _ = alert("설치가 끝났습니다.", "브라우저로 돌아가면 이어서 저장합니다.", buttons: ["확인"])
    return 0
  }
  _ = alert("설치는 됐지만 연결 확인에 실패했습니다.", "Mac을 다시 시작한 뒤 다시 시도해 주세요.", buttons: ["확인"], style: .warning)
  return 3
}

/// serve 중 원격 version.json이 더 높으면 zip을 받아 조용히 교체한다.
func startAutoUpdate() {
  DispatchQueue.global(qos: .utility).async {
    Thread.sleep(forTimeInterval: 8)
    let origins: [String] = {
      var list: [String] = []
      let snap = AlarmSession.shared.snapshot()
      if !snap.apiOrigin.isEmpty { list.append(snap.apiOrigin) }
      list.append(contentsOf: ["https://abuts.fit", "https://www.abuts.fit"])
      return list
    }()
    for origin in origins {
      if autoUpdateOnce(from: origin) { return }
    }
  }
}

func autoUpdateOnce(from origin: String) -> Bool {
  let metaURL = URL(string: "\(origin)/downloads/lab-helper/version.json")!
  var metaReq = URLRequest(url: metaURL, timeoutInterval: 8)
  metaReq.setValue("AbutsLabHelper/\(helperVersion)", forHTTPHeaderField: "User-Agent")
  let sem = DispatchSemaphore(value: 0)
  var metaData: Data?
  URLSession.shared.dataTask(with: metaReq) { data, response, _ in
    if let http = response as? HTTPURLResponse, http.statusCode == 200 { metaData = data }
    sem.signal()
  }.resume()
  _ = sem.wait(timeout: .now() + 12)
  guard let data = metaData,
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    return false
  }
  let remote: Int
  if let n = obj["version"] as? Int { remote = n }
  else if let n = obj["version"] as? NSNumber { remote = n.intValue }
  else if let s = obj["version"] as? String, let n = Int(s) { remote = n }
  else { return false }
  if remote <= helperVersion {
    log("auto-update up-to-date local=\(helperVersion) remote=\(remote)")
    return true
  }
  var path = "/downloads/lab-helper/AbutsLabHelper-mac.zip"
  if let mac = obj["mac"] as? [String: Any],
     let p = mac["path"] as? String, !p.isEmpty {
    path = p.hasPrefix("/") ? p : "/\(p)"
  }
  let downloadURL = path.hasPrefix("http")
    ? URL(string: path)!
    : URL(string: origin + path)!
  log("auto-update download \(downloadURL.absoluteString)")
  var fileReq = URLRequest(url: downloadURL, timeoutInterval: 120)
  fileReq.setValue("AbutsLabHelper/\(helperVersion)", forHTTPHeaderField: "User-Agent")
  let sem2 = DispatchSemaphore(value: 0)
  var zipURL: URL?
  URLSession.shared.downloadTask(with: fileReq) { url, response, _ in
    defer { sem2.signal() }
    guard let url = url, let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
    let dest = fm.temporaryDirectory.appendingPathComponent("AbutsLabHelper-mac.zip")
    try? fm.removeItem(at: dest)
    try? fm.copyItem(at: url, to: dest)
    zipURL = dest
  }.resume()
  _ = sem2.wait(timeout: .now() + 130)
  guard let zip = zipURL else { return false }
  let extractDir = fm.temporaryDirectory.appendingPathComponent("AbutsLabHelperUpdate", isDirectory: true)
  try? fm.removeItem(at: extractDir)
  try? fm.createDirectory(at: extractDir, withIntermediateDirectories: true)
  guard run("/usr/bin/unzip", ["-o", zip.path, "-d", extractDir.path]) == 0 else { return false }
  // zip 안 「어벗츠 연결.app」
  let appName = "어벗츠 연결.app"
  let newApp = extractDir.appendingPathComponent(appName)
  guard fm.fileExists(atPath: newApp.path) else {
    log("auto-update: app missing in zip")
    return false
  }
  // 설치본 교체: 새 바이너리에서 --silent-update 실행
  let updater = newApp.appendingPathComponent("Contents/MacOS/AbutsLabHelper")
  _ = run(updater.path, ["--silent-update"])
  exit(0)
}

func uninstall() -> Int32 {
  stopRunningHelper()
  try? fm.removeItem(at: agentPlist)
  try? fm.removeItem(at: supportDir)
  _ = alert("삭제했습니다.", "작업 폴더에 저장한 파일은 그대로 있습니다.", buttons: ["확인"])
  return 0
}

func runInstaller() -> Int32 {
  let app = NSApplication.shared
  app.setActivationPolicy(.regular)
  let installed = fm.fileExists(atPath: installedApp.path)
  let info = "「작업열기」를 누르면 의뢰 파일을 작업 폴더에 저장하고 폴더를 열어 줍니다.\n"
    + "관리자 암호 없이 이 사용자에게만 설치되고, 화면에 보이지 않게 켜져 있습니다."
  if installed {
    // 수동으로 설치본을 열면 다시 설치(조용히)·삭제. 자동 갱신은 --silent-update.
    let choice = alert("어벗츠 연결 프로그램이 이미 설치돼 있습니다.", info, buttons: ["다시 설치", "취소", "삭제"])
    switch choice {
    case 0: return install(silent: true)
    case 2: return uninstall()
    default: return 0
    }
  }
  let choice = alert("어벗츠 연결 프로그램을 설치할까요?", info, buttons: ["설치", "취소"])
  switch choice {
  case 0: return install()
  default: return 0
  }
}

// MARK: - 진입

func isRunningFromInstallDir() -> Bool {
  Bundle.main.bundleURL.standardizedFileURL.path == installedApp.standardizedFileURL.path
}

func serve() -> Never {
  let config = Config()
  let queue = DispatchQueue(label: "abuts.lab.helper", attributes: .concurrent)
  let params = NWParameters.tcp
  params.requiredLocalEndpoint = NWEndpoint.hostPort(
    host: "127.0.0.1", port: NWEndpoint.Port(rawValue: helperPort)!)
  params.allowLocalEndpointReuse = true
  let listener: NWListener
  do {
    listener = try NWListener(using: params)
  } catch {
    log("listen failed: \(error)")
    exit(0)
  }
  listener.newConnectionHandler = { conn in
    HttpConnection(conn: conn, config: config, queue: DispatchQueue(label: "abuts.lab.conn", target: queue)).start()
  }
  listener.stateUpdateHandler = { st in
    switch st {
    case .ready:
      log("serve v\(helperVersion)")
      startAutoUpdate()
    case .failed(let err):
      log("listener failed: \(err) — already running?")
      exit(0)
    default:
      break
    }
  }
  listener.start(queue: queue)
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  app.run()
  exit(0)
}

let args = CommandLine.arguments.dropFirst()
if args.contains("--serve") || isRunningFromInstallDir() {
  serve()
} else if args.contains("--uninstall") {
  _ = NSApplication.shared
  exit(uninstall())
} else if args.contains("--silent-update") {
  _ = NSApplication.shared
  exit(install(silent: true))
} else {
  exit(runInstaller())
}
