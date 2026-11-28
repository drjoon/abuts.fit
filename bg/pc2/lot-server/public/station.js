// related files:
// - bg/pc2/lot-server/public/index.html
// - bg/pc2/lot-server/src/index.js
// - bg/pc2/lot-server/src/station-settings.js
// - docs/intent/lot-server-packing-station.md
// change-log:
// - 2026-11-28: 작업 화면 단순화, 설정 탭(카메라/지그/동작/학습)과 저장 버튼 하나로 정리. 학습 현황·대기 표본 라벨.
// - 2026-11-28: 라이브 HUD(큰 코드·다음 행동), 성공/실패 소리, 단축키(S 감시, P 재출력), 기본 프린터 기억, 바퀴 이벤트.
// - 2026-11-27: 패킹 작업대 SSOT — 연습/자동 커밋 토글, 인식→(설정 시)매칭·S3 이미지·라벨·포장.발송, 에러 히스토리 모달+복사, 작업 영역에서 초점·수동인식 제거(설정으로).
// - 2026-11-27: 촬영·인식 ocrLog를 라이브 아래 가로 스크롤 카드로 표시(한 줄).
// - 2026-11-27: 감시 중 OCR 거부·실패(lastError)를 각인 코드 옆 안내(note)에 표시. 코드 칸이 —로만 남아 원인을 모르게 두지 않는다.
// - 2026-11-27: 설정 모달에 ‘각인 인식 · 지그’: 프로필 선택·복제·이름, ROI(X/Y/폭/높이 %, 미리보기 드래그), 글자 높이 범위, 판독 시험(저장·매칭 없음).
// - 2026-11-27: 툴바의 카메라 선택·목록 버튼을 설정(톱니) 버튼으로. 모달에서 카메라·밝기·대비·채도·LED·EV·미리보기·권장값·저장(서버 저장).
//   Esc·바깥 클릭으로 닫는다.
// - 2026-11-27: 공병·패킹 라벨 모달을 어벗츠 FE(VialSticker/PackingLabelPrintDialog)와 같은 레이아웃으로.
// - 2026-11-26: 매칭 옆 프린트 + 패킹 라벨 미리보기(어벗츠 FE와 동일 캔버스).
// - 2026-11-26: 세척·패킹 작업자 로컬 UI(큐·라이브·매칭·스크류 로트).
(() => {
  const PHASE_KO = {
    idle: "대기",
    moving: "움직임",
    stable: "정지·초점",
    focusing: "초점",
    ocr: "OCR",
    hold: "인식 유지",
    error: "오류",
  };

  const els = {
    total: document.querySelector("#queueTotal"),
    diameters: document.querySelector("#diameters"),
    status: document.querySelector("#watchStatus"),
    suffix: document.querySelector("#suffix"),
    note: document.querySelector("#matchNote"),
    live: document.querySelector("#live"),
    liveEmpty: document.querySelector("#liveEmpty"),
    strip: document.querySelector("#requestStrip"),
    ocrLog: document.querySelector("#ocrLog"),
    history: document.querySelector("#history"),
    start: document.querySelector("#startWatch"),
    stop: document.querySelector("#stopWatch"),
    match: document.querySelector("#matchBtn"),
    printMatched: document.querySelector("#printMatchedBtn"),
    settingsBtn: document.querySelector("#settingsBtn"),
    errorChip: document.querySelector("#errorChip"),
    vialBtn: document.querySelector("#vialBtn"),
    packingBtn: document.querySelector("#packingBtn"),
    screwBtn: document.querySelector("#screwBtn"),
    modal: document.querySelector("#modal"),
    modalTitle: document.querySelector("#modalTitle"),
    modalBody: document.querySelector("#modalBody"),
    modalClose: document.querySelector("#modalClose"),
    cycleHud: document.querySelector("#cycleHud"),
    cycleHudCode: document.querySelector("#cycleHudCode"),
    cycleHudMsg: document.querySelector("#cycleHudMsg"),
  };

  const ERROR_HISTORY_MAX = 80;
  const PRINTER_PACK_KEY = "abuts.lot.printer.packing";

  const state = {
    running: false,
    busy: false,
    matching: false,
    reachable: false,
    suffix: "",
    selectedId: "",
    queue: [],
    lastMatched: null,
    branding: null,
    lastLotKey: "",
    history: [],
    ocrLog: [],
    ocrLogSig: "",
    pollTimer: 0,
    liveTimer: 0,
    queueTimer: 0,
    /** @type {{ autoCommit: boolean, collectSamples: boolean }} */
    station: { autoCommit: true, collectSamples: true },
    stationLoaded: false,
    errors: [],
    lastErrorSig: "",
    defaultPrinter: "",
    sound: localStorage.getItem("abuts.lot.sound") !== "0",
    lastHudSig: "",
  };

  function extractLotSuffix3(value) {
    const s = String(value || "").toUpperCase();
    const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
    return match ? match[0] : "";
  }

  function setNote(text, tone) {
    els.note.textContent = "";
    els.note.className = "note" + (tone ? " " + tone : "");
    String(text || "")
      .split("\n")
      .forEach((line, index) => {
        if (index) els.note.appendChild(document.createElement("br"));
        els.note.appendChild(document.createTextNode(line));
      });
  }

  function setBusy(next) {
    state.busy = Boolean(next);
    const disabled = state.busy || state.matching;
    [els.start, els.stop, els.match, els.printMatched].forEach((el) => {
      if (el) el.disabled = disabled;
    });
    if (els.stop) els.stop.hidden = !state.running;
    if (els.start) els.start.hidden = state.running;
  }

  function pushError(message, source) {
    const text = String(message || "").trim();
    if (!text) return;
    const row = {
      at: new Date().toISOString(),
      source: String(source || "station"),
      message: text,
    };
    state.errors = [row, ...state.errors].slice(0, ERROR_HISTORY_MAX);
    renderErrorChip();
  }

  function renderErrorChip() {
    if (!els.errorChip) return;
    const n = state.errors.length;
    if (!n) {
      els.errorChip.hidden = true;
      els.errorChip.textContent = "에러";
      return;
    }
    els.errorChip.hidden = false;
    els.errorChip.textContent = n === 1 ? "에러" : `에러 ${n}`;
  }

  function formatErrorHistoryText() {
    return state.errors
      .map((row) => {
        const t = formatLogTime(row.at);
        return `[${t}] (${row.source}) ${row.message}`;
      })
      .join("\n");
  }

  function openErrorHistoryModal() {
    const wrap = el("div", { class: "error-history" });
    const list = el("pre", { class: "error-history-list" });
    list.textContent = state.errors.length
      ? formatErrorHistoryText()
      : "에러가 없습니다.";
    const copyBtn = el("button", {
      type: "button",
      class: "btn btn-dark",
      text: "복사",
    });
    const clearBtn = el("button", {
      type: "button",
      class: "btn",
      text: "비우기",
    });
    const status = el("p", { class: "note" });
    copyBtn.addEventListener("click", async () => {
      const text = formatErrorHistoryText();
      if (!text) {
        status.className = "note bad";
        status.textContent = "복사할 내용이 없습니다.";
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        status.className = "note ok";
        status.textContent = "클립보드에 복사했습니다.";
      } catch {
        status.className = "note bad";
        status.textContent = "복사에 실패했습니다.";
      }
    });
    clearBtn.addEventListener("click", () => {
      state.errors = [];
      state.lastErrorSig = "";
      renderErrorChip();
      list.textContent = "에러가 없습니다.";
      status.className = "note";
      status.textContent = "비웠습니다.";
    });
    wrap.appendChild(list);
    wrap.appendChild(
      el("div", { class: "error-history-actions" }, [clearBtn, copyBtn]),
    );
    wrap.appendChild(status);
    openModal("에러 히스토리", wrap);
  }

  async function loadStationSettings() {
    try {
      const data = await api("/api/station-settings");
      const s = data.settings || {};
      state.station = {
        autoCommit: s.autoCommit !== false,
        collectSamples: s.collectSamples !== false,
      };
      state.stationLoaded = true;
    } catch (err) {
      pushError(err.message || "작업대 설정을 불러오지 못했습니다.", "settings");
      state.stationLoaded = true;
    }
  }


  function playCue(kind) {
    if (!state.sound) return;
    try {
      const ctx = playCue.ctx || (playCue.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const now = ctx.currentTime;
      const tones = kind === "ok" ? [523, 784] : kind === "bad" ? [196, 147] : [440];
      tones.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.08, now + 0.02 + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16 + i * 0.1);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now + i * 0.08);
        o.stop(now + 0.2 + i * 0.1);
      });
    } catch {}
  }

  function updateHud(cycle) {
    if (!els.cycleHud) return;
    if (!state.running) {
      els.cycleHud.hidden = true;
      return;
    }
    const title = cycle?.title || "";
    const message = cycle?.message || "";
    const tone = cycle?.tone || "wait";
    els.cycleHud.hidden = false;
    els.cycleHud.className = `cycle-hud tone-${tone}`;
    els.cycleHudCode.textContent = title;
    els.cycleHudMsg.textContent = message;
    const sig = `${tone}|${title}|${message}`;
    if (sig !== state.lastHudSig) {
      if (tone === "ok" && title && /출력됨|인식됨/.test(message)) playCue("ok");
      else if (tone === "bad") playCue("bad");
      state.lastHudSig = sig;
    }
  }

  function reportCycle(kind, extra = {}) {
    api("/api/cycle-event", { method: "POST", body: JSON.stringify({ kind, ...extra }) }).catch(() => {});
  }
  function rememberedPackPrinter() {
    return String(localStorage.getItem(PRINTER_PACK_KEY) || state.defaultPrinter || "").trim();
  }

  async function autoPrintAfterMatch(item) {
    if (!item) return { ok: false, reason: "no-item" };
    const printer = rememberedPackPrinter();
    if (!printer) {
      return { ok: false, reason: "no-printer" };
    }
    try {
      const result = await printPackingItems([item], printer);
      if (result.ok > 0 && result.fail === 0) return { ok: true };
      return { ok: false, reason: result.firstError || "print-failed" };
    } catch (err) {
      return { ok: false, reason: err.message || "print-failed" };
    }
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const err = new Error(data.message || "요청에 실패했습니다.");
      err.data = data;
      throw err;
    }
    return data;
  }

  function renderDiameters(labels, counts) {
    els.diameters.replaceChildren();
    (labels || ["6", "8", "10", "12"]).forEach((label, idx) => {
      const span = document.createElement("span");
      span.textContent = `${label}mm ${Number(counts?.[idx] || 0)}`;
      els.diameters.appendChild(span);
    });
  }

  function renderStrip() {
    els.strip.replaceChildren();
    if (!state.queue.length) {
      const empty = document.createElement("div");
      empty.className = "strip-empty";
      empty.textContent = "세척·패킹 대기 의뢰가 없습니다.";
      els.strip.appendChild(empty);
      return;
    }
    const hint = extractLotSuffix3(state.suffix);
    state.queue.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card";
      if (item._id && item._id === state.selectedId) btn.classList.add("selected");
      if (
        hint &&
        (hint.length < 3
          ? String(item.lotSuffix || "").startsWith(hint)
          : item.lotSuffix === hint)
      ) {
        btn.classList.add("hint");
      }
      const screw = String(item.screwType || "").trim() || "—";
      btn.innerHTML = `
        <div class="card-top">
          <span class="card-suffix">${item.lotSuffix || "—"}</span>
          <span class="card-screw">${screw}</span>
        </div>
        <div class="card-name">${item.patientName || item.requestId || "—"}</div>
        <div class="card-meta">${item.clinicName || ""}${item.tooth ? " · #" + item.tooth : ""}</div>
      `;
      btn.addEventListener("click", () => {
        if (state.selectedId === item._id) {
          state.selectedId = "";
          state.suffix = "";
        } else {
          state.selectedId = item._id;
          state.suffix = extractLotSuffix3(item.lotSuffix || item.lotNumber);
        }
        els.suffix.textContent = state.suffix || "—";
        setNote("");
        renderStrip();
      });
      els.strip.appendChild(btn);
    });
  }

  function pushHistory(suffix) {
    const code = extractLotSuffix3(suffix);
    if (!code) return;
    state.history = [code, ...state.history].slice(0, 8);
    els.history.replaceChildren();
    const label = document.createElement("b");
    label.textContent = "최근";
    els.history.appendChild(label);
    state.history.forEach((lot) => {
      const span = document.createElement("span");
      span.textContent = lot;
      els.history.appendChild(span);
    });
  }

  function formatLogTime(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "--:--:--";
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function renderOcrLog(rows) {
    if (!els.ocrLog) return;
    const list = Array.isArray(rows) ? rows : [];
    const sig = list.map((r) => r.id || r.at || r.line).join("|");
    if (sig === state.ocrLogSig) return;
    state.ocrLogSig = sig;
    state.ocrLog = list;
    els.ocrLog.replaceChildren();
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "ocr-log-empty";
      empty.textContent = "촬영·인식 기록이 여기에 쌓입니다.";
      els.ocrLog.appendChild(empty);
      return;
    }
    list.forEach((row) => {
      const card = document.createElement("div");
      card.className = "ocr-log-card" + (row.kind ? ` kind-${row.kind}` : "");
      const time = document.createElement("span");
      time.className = "ocr-log-time";
      time.textContent = formatLogTime(row.at);
      const line = document.createElement("span");
      line.className = "ocr-log-line";
      line.textContent = row.line || row.lot || "—";
      card.appendChild(time);
      card.appendChild(line);
      els.ocrLog.appendChild(card);
    });
  }

  function applyWatch(data) {
    state.reachable = true;
    state.running = Boolean(data.running);
    const phase = PHASE_KO[data.phase] || data.phase || "—";
    const recent = extractLotSuffix3(data.lastLot || data.latest?.lot);
    const rejected = extractLotSuffix3(data.lastRejected?.lot || data.lastRejected);
    document.body.classList.toggle("mode-auto", state.station.autoCommit !== false);
    document.body.classList.toggle("mode-practice", state.station.autoCommit === false);
    const modeHint = state.station.autoCommit ? "" : "연습";
    els.status.textContent = [state.running ? "감시 중" : "정지", modeHint].filter(Boolean).join(" · ");
    if (els.stop) els.stop.hidden = !state.running;
    if (els.start) els.start.hidden = state.running;

    if (state.running) {
      refreshLive();
      // 확정 전 거부·실패 이유를 각인 코드 칸이 —인 채로만 두지 않고 안내에 보여 준다.
      if (!state.matching && data.lastError) {
        const errText = String(data.lastError || "").trim();
        if (errText && errText !== state.lastErrorSig) {
          state.lastErrorSig = errText;
          pushError(errText, "watch");
        }
        if (errText) setNote(errText, "bad");
      } else if (!data.lastError) {
        state.lastErrorSig = "";
      }
    } else {
      els.live.removeAttribute("src");
      els.live.hidden = true;
      els.liveEmpty.hidden = false;
      els.liveEmpty.textContent = "감시를 시작하면 라이브가 표시됩니다.";
    }

    renderOcrLog(data.ocrLog);
    updateHud(data.cycle);

    const lot = recent;
    if (!lot || !state.running || state.matching) return;
    const fileName = String(data.latest?.fileName || "").trim();
    const key = fileName ? `${fileName}:${lot}` : lot;
    if (key === state.lastLotKey) return;
    state.lastLotKey = key;
    state.selectedId = "";
    state.suffix = lot;
    els.suffix.textContent = lot;
    pushHistory(lot);
    renderStrip();
    if (!state.station.autoCommit) {
      setNote("연습 모드 · 인식만 했습니다.", "ok");
      return;
    }
    setNote("");
    void matchSuffix(lot, "auto");
  }

  function refreshLive() {
    if (!state.running) return;
    const img = new Image();
    img.onload = () => {
      if (!state.running) return;
      els.live.src = img.src;
      els.live.hidden = false;
      els.liveEmpty.hidden = true;
    };
    img.src = "/live?t=" + Date.now();
  }

  async function refreshQueue() {
    try {
      const data = await api("/api/queue");
      const payload = data.data || data;
      state.queue = Array.isArray(payload.items) ? payload.items : [];
      els.total.textContent = `${Number(payload.total || state.queue.length)}건`;
      renderDiameters(payload.labels, payload.counts);
      renderStrip();
    } catch (err) {
      els.total.textContent = "—건";
      setNote(
        "대기 목록을 불러오지 못했습니다.\n" + (err.message || ""),
        "bad",
      );
    }
  }

  function findQueueItemForPrint() {
    if (state.selectedId) {
      const selected = state.queue.find((item) => item._id === state.selectedId);
      if (selected) return selected;
    }
    const suffix = extractLotSuffix3(state.suffix);
    if (suffix.length === 3) {
      const matches = state.queue.filter(
        (item) => extractLotSuffix3(item.lotSuffix || item.lotNumber) === suffix,
      );
      if (matches.length === 1) return matches[0];
    }
    return state.lastMatched || null;
  }

  function itemFromMatchResult(result, fallback) {
    const req = result?.request || {};
    const caseInfos = req.caseInfos || {};
    const lotNumber = String(
      req?.lotNumber?.value || fallback?.lotNumber || result?.suffix || "",
    ).trim();
    return {
      ...(fallback || {}),
      _id: String(result?.requestMongoId || fallback?._id || ""),
      requestId: String(result?.requestId || req.requestId || fallback?.requestId || ""),
      lotSuffix: extractLotSuffix3(lotNumber) || fallback?.lotSuffix || "",
      lotNumber: lotNumber || fallback?.lotNumber || "",
      patientName: String(
        caseInfos.patientName || fallback?.patientName || "",
      ).trim(),
      clinicName: String(
        caseInfos.clinicName || fallback?.clinicName || "",
      ).trim(),
      tooth: String(caseInfos.tooth || fallback?.tooth || "").trim(),
      material: String(caseInfos.material || fallback?.material || "").trim(),
      screwType: String(
        req?.screwTracking?.type ||
          caseInfos.screwType ||
          fallback?.screwType ||
          "",
      ).trim(),
      mailboxCode: String(
        req.mailboxAddress || fallback?.mailboxCode || "",
      ).trim(),
      labName: String(
        req?.businessAnchorId?.name ||
          req?.requestorBusinessAnchor?.name ||
          fallback?.labName ||
          "",
      ).trim(),
      implantManufacturer: String(
        caseInfos.implantManufacturer || fallback?.implantManufacturer || "",
      ).trim(),
      implantBrand: String(
        caseInfos.implantBrand || fallback?.implantBrand || "",
      ).trim(),
      implantFamily: String(
        caseInfos.implantFamily || fallback?.implantFamily || "",
      ).trim(),
      implantType: String(
        caseInfos.implantType || fallback?.implantType || "",
      ).trim(),
      connectionDiameter:
        caseInfos.connectionDiameter ?? fallback?.connectionDiameter ?? null,
      maxDiameter: caseInfos.maxDiameter ?? fallback?.maxDiameter ?? null,
      totalLength: caseInfos.totalLength ?? fallback?.totalLength ?? null,
      taperAngle: caseInfos.taperAngle ?? fallback?.taperAngle ?? null,
      manufacturingDate:
        fallback?.manufacturingDate ||
        (window.AbutsPackLabel
          ? window.AbutsPackLabel.toKstYmd(
              req?.productionSchedule?.actualMachiningComplete,
            )
          : "") ||
        "",
      hexVerificationSample: Boolean(
        caseInfos.hexVerificationSample ?? fallback?.hexVerificationSample,
      ),
      printed: Boolean(req?.shippingLabelPrinted?.printed || fallback?.printed),
      createdAt: req.createdAt || fallback?.createdAt || null,
    };
  }

  async function ensureBranding() {
    if (state.branding) return state.branding;
    try {
      const data = await api("/api/branding");
      state.branding =
        data.branding ||
        data.data?.branding ||
        window.AbutsPackLabel?.DEFAULT_BRANDING ||
        null;
    } catch {
      state.branding = window.AbutsPackLabel?.DEFAULT_BRANDING || null;
    }
    return state.branding;
  }

  async function printPackingItems(items, printer) {
    if (!window.AbutsPackLabel) {
      throw new Error("패킹 라벨 모듈을 불러오지 못했습니다.");
    }
    const branding = await ensureBranding();
    let ok = 0;
    let fail = 0;
    let firstError = "";
    for (const item of items) {
      try {
        const zpl = await window.AbutsPackLabel.buildZpl(item, branding);
        await api("/api/print-zpl", {
          method: "POST",
          body: JSON.stringify({
            printer,
            copies: 1,
            requestId: item.requestId,
            title: `Pack Label ${item.requestId || item.lotSuffix || ""}`.trim(),
            zpl,
            paperProfile: "PACK_80x65",
          }),
        });
        ok += 1;
      } catch (err) {
        fail += 1;
        if (!firstError) firstError = err.message || "출력 실패";
      }
    }
    return { ok, fail, firstError };
  }

  async function matchSuffix(raw, source) {
    const suffix = extractLotSuffix3(raw);
    if (suffix.length !== 3 && !state.selectedId) return;
    if (state.matching) return;
    const pendingItem = findQueueItemForPrint();
    state.matching = true;
    setBusy(true);
    setNote("매칭 중…");
    try {
      const body = state.selectedId
        ? {
            requestMongoId: state.selectedId,
            recognizedSuffix: suffix || undefined,
            source: "manual",
          }
        : {
            recognizedSuffix: suffix,
            confirmBySuffix: true,
            source: source === "auto" ? "lot-server" : "manual",
          };
      const data = await api("/api/match", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const result = data.data || {};
      if (!result.matched) {
        const reason = String(result.reason || "");
        let msg = data.message || "매칭에 실패했습니다.";
        if (reason === "ambiguous_suffix") {
          msg = "같은 코드가 여러 건입니다.\n오른쪽 카드를 눌러 지정하세요.";
        } else if (reason === "no_suffix_match") {
          msg = "대기 목록에 없습니다.\n오른쪽 카드를 눌러 선택하세요.";
        }
        setNote(msg, "bad");
        pushError(msg.replace(/\n/g, " "), "match");
        return;
      }
      state.lastMatched = itemFromMatchResult(result, pendingItem);
      pushHistory(result.suffix || suffix);
      const imageOk = data.imageUpload?.ok !== false;
      let note = "포장.발송으로 이동했습니다.";
      if (!imageOk) {
        note += "\n이미지는 첨부되지 않았습니다.";
        pushError("매칭 이미지 S3 업로드 실패", "image");
      }
      if (state.station.autoCommit) {
        const printed = await autoPrintAfterMatch(state.lastMatched);
        if (printed.ok) {
          note += "\n패킹 라벨을 출력했습니다.";
          reportCycle("printed", { code: state.lastMatched?.lotSuffix || state.lastMatched?.suffix || suffix });
        } else if (printed.reason === "no-printer") {
          note += "\n프린터를 패킹 라벨에서 한 번 고르세요.";
          pushError("자동 출력: 저장된 프린터 없음", "print");
        } else if (printed.reason) {
          note += "\n라벨 출력 실패 · 프린트 버튼으로 재출력하세요.";
          pushError(`자동 출력 실패: ${printed.reason}`, "print");
        }
      }
      setNote(note, "ok");
      state.suffix = "";
      state.selectedId = "";
      els.suffix.textContent = "—";
      await refreshQueue();
    } catch (err) {
      const msg = err.message || "매칭에 실패했습니다.";
      setNote(msg, "bad");
      pushError(msg, "match");
    } finally {
      state.matching = false;
      setBusy(false);
    }
  }

  /** 카메라 목록을 select에 채운다. */
  async function loadDevices(selectEl) {
    const data = await api("/devices");
    selectEl.replaceChildren();
    const list = Array.isArray(data.devices) ? data.devices : [];
    if (!list.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "카메라 없음";
      selectEl.appendChild(opt);
      return data;
    }
    list.forEach((item) => {
      const name = typeof item === "string" ? item : item.name;
      const opt = document.createElement("option");
      opt.value = name;
      let label = name;
      if (item?.preferred) label += " · 현미경";
      if (item?.continuity) label += " · Continuity";
      opt.textContent = label;
      selectEl.appendChild(opt);
    });
    if (data.selected) selectEl.value = data.selected;
    return data;
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.includes("-")) node.setAttribute(key, value);
      else node[key] = value;
    }
    for (const child of [].concat(children)) if (child) node.appendChild(child);
    return node;
  }

  const SLIDERS = [
    { key: "brightness", label: "밝기", hint: "권장 128 · 높이면 금속면이 하얗게 날아갑니다" },
    { key: "contrast", label: "대비", hint: "글자 테두리 선명도" },
    { key: "saturation", label: "채도", hint: "OCR은 흑백으로 읽습니다" },
    { key: "hue", label: "색조", hint: "보통 0" },
  ];

  async function openSettingsModal() {
    const wrap = el("div", { class: "settings" });

    // 왼쪽: 미리보기
    const previewImg = el("img", { alt: "카메라 미리보기", hidden: true });
    const previewEmpty = el("p", { text: "미리보기를 불러오는 중…" });
    const previewBox = el("div", { class: "settings-preview" }, [previewImg, previewEmpty]);
    const previewBtn = el("button", { type: "button", class: "btn btn-ghost", text: "미리보기 새로고침" });
    const previewNote = el("p", { class: "settings-hint" });
    const left = el("div", { class: "settings-col" }, [
      previewBox,
      el("div", { class: "settings-preview-bar" }, [previewNote, previewBtn]),
    ]);

    // 오른쪽: 카메라
    const deviceSel = el("select", { class: "field", id: "settingsDevice" });
    const refreshBtn = el("button", { type: "button", class: "btn btn-ghost btn-square", title: "카메라 목록 새로고침", "aria-label": "카메라 목록 새로고침" });
    refreshBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
    const cameraSection = el("section", { class: "settings-section" }, [
      el("h3", { text: "카메라" }),
      el("div", { class: "settings-inline" }, [deviceSel, refreshBtn]),
    ]);

    // 화질 슬라이더
    const inputs = {};
    const imageSection = el("section", { class: "settings-section" }, [el("h3", { text: "화질 (UVC)" })]);
    for (const sl of SLIDERS) {
      const range = el("input", { type: "range", class: "range", id: `set-${sl.key}` });
      const num = el("input", { type: "number", class: "field field-num", "aria-label": sl.label });
      range.addEventListener("input", () => {
        num.value = range.value;
        markDirty();
      });
      num.addEventListener("input", () => {
        range.value = num.value;
        markDirty();
      });
      inputs[sl.key] = { range, num };
      imageSection.appendChild(
        el("div", { class: "settings-slider" }, [
          el("div", { class: "settings-slider-top" }, [
            el("label", { htmlFor: `set-${sl.key}`, text: sl.label }),
            num,
          ]),
          range,
          el("p", { class: "settings-hint", text: sl.hint }),
        ]),
      );
    }

    // 현미경(시리얼)
    const ledSel = el("select", { class: "field" });
    ledSel.appendChild(el("option", { value: "0", text: "현재 단계 유지" }));
    for (let i = 1; i <= 12; i += 1) ledSel.appendChild(el("option", { value: String(i), text: `${i} / 12` }));
    const evSel = el("select", { class: "field" });
    ledSel.addEventListener("change", markDirty);
    evSel.addEventListener("change", markDirty);
    const scopeSection = el("section", { class: "settings-section" }, [
      el("h3", { text: "현미경 (UM20)" }),
      el("div", { class: "settings-grid2" }, [
        el("label", { class: "settings-field" }, [el("span", { text: "LED 밝기" }), ledSel]),
        el("label", { class: "settings-field" }, [el("span", { text: "노출 EV" }), evSel]),
      ]),
      el("p", { class: "settings-hint", text: "LED는 감시 시작 때 켜고 중지 때 끕니다. 단계는 감시 중일 때 바로 바뀝니다." }),
    ]);


    // 각인 인식 · 지그 프로필 (ROI는 프레임 비율 0–1, 화면에는 %)
    const roiLayer = el("div", { class: "roi-layer" });
    const roiRect = el("div", { class: "roi-rect", hidden: true });
    const hitLayer = el("div", { class: "roi-hits" });
    roiLayer.append(roiRect, hitLayer);
    previewBox.appendChild(roiLayer);
    const jigSel = el("select", { class: "field", "aria-label": "지그 프로필" });
    const jigDupBtn = el("button", { type: "button", class: "btn btn-ghost", text: "복제" });
    const jigName = el("input", { type: "text", class: "field", placeholder: "프로필 이름", maxLength: 60 });
    const roiInputs = {};
    const roiGrid = el("div", { class: "settings-grid4" });
    for (const [key, label] of [["x", "X %"], ["y", "Y %"], ["w", "폭 %"], ["h", "높이 %"]]) {
      const input = el("input", { type: "number", class: "field field-num", min: "0", max: "100", step: "0.5" });
      input.addEventListener("input", () => {
        drawRoi(readRoi());
        markJigDirty();
      });
      roiInputs[key] = input;
      roiGrid.appendChild(el("label", { class: "settings-field" }, [el("span", { text: label }), input]));
    }
    const lhMin = el("input", { type: "number", class: "field field-num", min: "2", max: "60", step: "0.5" });
    const lhMax = el("input", { type: "number", class: "field field-num", min: "2", max: "60", step: "0.5" });
    lhMin.addEventListener("input", markJigDirty);
    lhMax.addEventListener("input", markJigDirty);
    const dragBtn = el("button", { type: "button", class: "btn btn-ghost", text: "미리보기에서 영역 그리기" });
    const testBtn = el("button", { type: "button", class: "btn btn-ghost", text: "판독 시험" });
    const jigSaveBtn = el("button", { type: "button", class: "btn btn-primary", text: "지그 저장" });
    const jigStatus = el("p", { class: "settings-hint" });
    const engraveInfo = el("p", { class: "settings-hint" });
    const jigSection = el("section", { class: "settings-section" }, [
      el("h3", { text: "각인 인식 · 지그" }),
      el("div", { class: "settings-inline" }, [jigSel, jigDupBtn]),
      el("label", { class: "settings-field" }, [el("span", { text: "이름" }), jigName]),
      el("p", { class: "settings-hint", text: "각인 면을 찾을 영역(ROI). 지그를 바꾸면 프로필을 복제해 영역만 다시 잡으면 됩니다. 학습 데이터는 지그와 무관합니다." }),
      roiGrid,
      el("div", { class: "settings-grid2" }, [
        el("label", { class: "settings-field" }, [el("span", { text: "글자 높이 최소 %" }), lhMin]),
        el("label", { class: "settings-field" }, [el("span", { text: "글자 높이 최대 %" }), lhMax]),
      ]),
      el("div", { class: "settings-inline settings-jig-actions" }, [dragBtn, testBtn]),
      jigStatus,
      engraveInfo,
    ]);

    const soundChk = el("input", { type: "checkbox" });
    soundChk.checked = state.sound !== false;
    soundChk.addEventListener("change", () => {
      state.sound = soundChk.checked;
      localStorage.setItem("abuts.lot.sound", soundChk.checked ? "1" : "0");
    });
    const autoCommitChk = el("input", {
      type: "checkbox",
      id: "stationAutoCommit",
    });
    autoCommitChk.checked = state.station.autoCommit !== false;
    const collectChk = el("input", {
      type: "checkbox",
      id: "stationCollectSamples",
    });
    collectChk.checked = state.station.collectSamples !== false;
    const workflowStatus = el("p", { class: "settings-hint" });
    const workflowSaveBtn = el("button", {
      type: "button",
      class: "btn btn-primary",
      text: "작업 흐름 저장",
    });
    const workflowSection = el("section", { class: "settings-section" }, [
      el("h3", { text: "작업 흐름" }),
      el("label", { class: "settings-check" }, [
        autoCommitChk,
        el("span", {
          text: "자동 프린트 · 포장.발송 (끄면 연습: 인식만)",
        }),
      ]),
      el("label", { class: "settings-check" }, [
        collectChk,
        el("span", { text: "매칭 성공 때 각인 표본 수집" }),
      ]),
      el("label", { class: "settings-check" }, [
        soundChk,
        el("span", { text: "인식·오류 소리 (단축키: S 감시, P 재출력)" }),
      ]),
      el("p", {
        class: "settings-hint",
        text: "아래 ‘저장하고 적용’으로 함께 저장합니다. 재학습은 학습 탭에서도 할 수 있습니다.",
      }),
      workflowStatus,
    ]);

    const checkFocusBtn = el("button", {
      type: "button",
      class: "btn",
      text: "초점",
    });
    const checkRecognizeBtn = el("button", {
      type: "button",
      class: "btn",
      text: "한 번 인식",
    });
    const checkStatus = el("p", { class: "settings-hint" });
    const checkSection = el("section", { class: "settings-section" }, [
      el("h3", { text: "점검" }),
      el("div", { class: "settings-inline" }, [checkFocusBtn, checkRecognizeBtn]),
      el("p", {
        class: "settings-hint",
        text: "작업 화면에는 두지 않습니다. 초점·수동 인식이 필요할 때만 씁니다.",
      }),
      checkStatus,
    ]);

    const trainStatus = el("div", { class: "settings-train" });
    const trainSection = el("section", { class: "settings-section" }, [
      el("h3", { text: "자동 학습" }),
      el("p", { class: "settings-hint", text: "확정된 표본만 학습에 씁니다. 목록 밖 촬영은 아래에서 코드를 확인한 뒤 넣습니다. 유휴 시간에 자동으로 다시 배우며, 정확도가 떨어지거나 틀린 확정이 있으면 모델을 올리지 않습니다." }),
      trainStatus,
    ]);

    const paneCamera = el("div", { class: "settings-pane", "data-pane": "camera" }, [cameraSection, imageSection, scopeSection, checkSection]);
    const paneJig = el("div", { class: "settings-pane", "data-pane": "jig", hidden: true }, [jigSection]);
    const paneFlow = el("div", { class: "settings-pane", "data-pane": "flow", hidden: true }, [workflowSection]);
    const paneTrain = el("div", { class: "settings-pane", "data-pane": "train", hidden: true }, [trainSection]);
    const right = el("div", { class: "settings-col settings-controls" }, [paneCamera, paneJig, paneFlow, paneTrain]);
    const tabBar = el("div", { class: "settings-tabs", role: "tablist" });
    const tabDefs = [
      ["camera", "카메라"],
      ["jig", "각인·지그"],
      ["flow", "동작"],
      ["train", "학습"],
    ];
    const tabBtns = {};
    function showSettingsTab(id) {
      left.hidden = id === "flow" || id === "train";
      [paneCamera, paneJig, paneFlow, paneTrain].forEach((pane) => {
        pane.hidden = pane.getAttribute("data-pane") !== id;
      });
      Object.entries(tabBtns).forEach(([k, b]) => b.setAttribute("aria-selected", k === id ? "true" : "false"));
      if (id === "train") void refreshTrain();
    }
    tabDefs.forEach(([id, label], i) => {
      const btn = el("button", { type: "button", class: "settings-tab", role: "tab", text: label });
      btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
      btn.addEventListener("click", () => showSettingsTab(id));
      tabBtns[id] = btn;
      tabBar.appendChild(btn);
    });
    const body = el("div", { class: "settings-body" }, [left, right]);
    wrap.appendChild(tabBar);

    const status = el("p", { class: "note settings-status" });
    const resetBtn = el("button", { type: "button", class: "btn btn-ghost", text: "권장값으로" });
    const saveBtn = el("button", { type: "button", class: "btn btn-primary", text: "저장하고 적용" });
    const footer = el("div", { class: "settings-footer" }, [
      status,
      el("div", { class: "settings-actions" }, [resetBtn, saveBtn]),
    ]);
    wrap.append(body, footer);

    let recommended = null;
    let limitsCache = null;
    let evCache = null;
    function markDirty() {
      status.className = "note settings-status";
      status.textContent = "바뀐 값이 있습니다. 저장하면 카메라에 바로 겁니다.";
    }

    function fill(settings, limits = limitsCache, evLabels = evCache) {
      if (limits) limitsCache = limits;
      if (evLabels) evCache = evLabels;
      for (const sl of SLIDERS) {
        const [lo, hi] = limits?.[sl.key] || [0, 255];
        for (const input of [inputs[sl.key].range, inputs[sl.key].num]) {
          input.min = String(lo);
          input.max = String(hi);
          input.step = "1";
          input.value = String(settings[sl.key]);
        }
      }
      ledSel.value = String(settings.ledLevel || 0);
      if (evLabels && !evSel.options.length) {
        evLabels.forEach((label, idx) => {
          if (label === "FLK") return;
          evSel.appendChild(el("option", { value: String(idx), text: label === "Auto" ? "자동 (Auto)" : label }));
        });
      }
      evSel.value = String(settings.ev);
    }

    function readForm() {
      const out = {};
      for (const sl of SLIDERS) out[sl.key] = Number(inputs[sl.key].num.value);
      out.ledLevel = Number(ledSel.value);
      out.ev = Number(evSel.value);
      return out;
    }

    function describeSaved(data) {
      const s = data.settings || {};
      const when = s.savedAt ? new Date(s.savedAt).toLocaleString("ko-KR", { hour12: false }) : "";
      return s.saved ? `저장됨 · ${when}` : "저장된 값 없음 · 권장값 사용 중";
    }

    async function refreshPreview() {
      previewBtn.disabled = true;
      previewEmpty.textContent = "미리보기를 불러오는 중…";
      try {
        const res = await fetch("/api/camera-preview?t=" + Date.now());
        if (!res.ok) throw new Error("미리보기 실패");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        previewImg.onload = () => URL.revokeObjectURL(url);
        previewImg.src = url;
        previewImg.hidden = false;
        previewEmpty.hidden = true;
        previewNote.textContent = state.running ? "감시 중 라이브 화면" : "감시 중이 아니면 LED가 꺼져 있어 어둡게 보일 수 있습니다.";
      } catch (err) {
        previewImg.hidden = true;
        previewEmpty.hidden = false;
        previewEmpty.textContent = "미리보기를 받지 못했습니다. UM Viewer가 켜져 있으면 닫아 주세요.";
      } finally {
        previewBtn.disabled = false;
      }
    }

    async function load() {
      const data = await api("/api/camera-settings");
      recommended = data.recommended;
      fill(data.settings, data.limits, data.evLabels);
      status.className = "note settings-status";
      status.textContent = describeSaved(data);
    }

    async function save(path, payload) {
      saveBtn.disabled = true;
      resetBtn.disabled = true;
      status.className = "note settings-status";
      status.textContent = "카메라에 거는 중… (몇 초 걸립니다)";
      try {
        const data = await api(path, { method: path.endsWith("/reset") ? "POST" : "PUT", body: JSON.stringify(payload || {}) });
        fill(data.settings, data.limits, data.evLabels);
        const uvcOk = data.applied?.uvc?.ok;
        status.className = "note settings-status " + (uvcOk === false ? "bad" : "ok");
        status.textContent =
          uvcOk === false
            ? `저장했지만 카메라에 걸지 못했습니다(${data.applied?.uvc?.reason || "오류"}). 감시 시작 때 다시 겁니다.`
            : "저장하고 적용했습니다. " + describeSaved(data);
        await Promise.allSettled([saveJig(), saveWorkflow()]);
        await refreshPreview();
      } catch (err) {
        status.className = "note settings-status bad";
        status.textContent = err.message || "저장에 실패했습니다.";
      } finally {
        saveBtn.disabled = false;
        resetBtn.disabled = false;
      }
    }

    // ---- 지그 프로필 ----
    let jigState = { active: "", profiles: [] };
    let dragMode = false;
    const pct = (v) => Math.round(Number(v) * 1000) / 10;
    function markJigDirty() {
      jigStatus.className = "settings-hint";
      jigStatus.textContent = "바뀐 지그 값이 있습니다. 아래 ‘저장하고 적용’으로 저장합니다.";
    }
    function readRoi() {
      const v = (k) => Math.max(0, Math.min(100, Number(roiInputs[k].value) || 0)) / 100;
      return { x: v("x"), y: v("y"), w: v("w"), h: v("h") };
    }
    function readProfile() {
      const cur = jigState.profiles.find((p) => p.id === jigSel.value) || {};
      return {
        ...cur,
        id: jigSel.value,
        name: jigName.value.trim() || cur.name,
        roi: readRoi(),
        letterH: { min: (Number(lhMin.value) || 8.5) / 100, max: (Number(lhMax.value) || 16.5) / 100 },
      };
    }
    function drawRoi(roi) {
      roiRect.hidden = !roi;
      if (!roi) return;
      Object.assign(roiRect.style, { left: `${roi.x * 100}%`, top: `${roi.y * 100}%`, width: `${roi.w * 100}%`, height: `${roi.h * 100}%` });
    }
    function fillJig(p) {
      if (!p) return;
      jigName.value = p.name || "";
      roiInputs.x.value = pct(p.roi.x);
      roiInputs.y.value = pct(p.roi.y);
      roiInputs.w.value = pct(p.roi.w);
      roiInputs.h.value = pct(p.roi.h);
      lhMin.value = pct(p.letterH.min);
      lhMax.value = pct(p.letterH.max);
      drawRoi(p.roi);
      hitLayer.replaceChildren();
    }
    function renderJigs(data) {
      jigState = { active: data.active, profiles: data.profiles || [] };
      jigSel.replaceChildren(
        ...jigState.profiles.map((p) => el("option", { value: p.id, text: p.id === data.active ? `${p.name} · 사용 중` : p.name })),
      );
      jigSel.value = data.active;
      fillJig(jigState.profiles.find((p) => p.id === data.active));
    }
    async function loadJigs() {
      renderJigs(await api("/api/jig-profiles"));
      const st = await api("/api/engrave/status").catch(() => null);
      if (st) {
        const m = st.model?.file ? `모델 ${st.model.file}` : "모델 없음";
        const d = st.dataset || {};
        engraveInfo.textContent = `${m} · 학습 표본 ${d.samples || 0}개(글자 위치 있음 ${d.boxed || 0}개)`;
      }
    }
    /** 회전된 ROI 기준 상자(0–1) → 프레임 비율. */
    function boxToFrame(b, rot, roi) {
      const pt = (u, v) => {
        const r = ((rot % 360) + 360) % 360;
        const [a, c] = r === 90 ? [v, 1 - u] : r === 180 ? [1 - u, 1 - v] : r === 270 ? [1 - v, u] : [u, v];
        return [roi.x + a * roi.w, roi.y + c * roi.h];
      };
      const p1 = pt(b[0], b[1]);
      const p2 = pt(b[2], b[3]);
      return { x: Math.min(p1[0], p2[0]), y: Math.min(p1[1], p2[1]), w: Math.abs(p2[0] - p1[0]), h: Math.abs(p2[1] - p1[1]) };
    }
    jigSel.addEventListener("change", () => {
      api("/api/jig-profiles/select", { method: "POST", body: JSON.stringify({ id: jigSel.value }) })
        .then((data) => {
          renderJigs(data);
          jigStatus.className = "settings-hint ok";
          jigStatus.textContent = "이 지그 프로필로 인식합니다.";
        })
        .catch((err) => {
          jigStatus.className = "settings-hint bad";
          jigStatus.textContent = err.message || "프로필 선택 실패";
        });
    });
    jigDupBtn.addEventListener("click", () => {
      const name = `${jigName.value.trim() || "지그"} 복사본`;
      api("/api/jig-profiles/duplicate", { method: "POST", body: JSON.stringify({ id: jigSel.value, name }) })
        .then((data) => {
          renderJigs(data);
          jigStatus.className = "settings-hint ok";
          jigStatus.textContent = "복제했습니다. 이름과 영역을 고친 뒤 ‘지그 저장’을 누르세요.";
          jigName.focus();
          jigName.select();
        })
        .catch((err) => {
          jigStatus.className = "settings-hint bad";
          jigStatus.textContent = err.message || "복제 실패";
        });
    });
    jigName.addEventListener("input", markJigDirty);
    async function saveJig() {
      const data = await api("/api/jig-profiles", { method: "PUT", body: JSON.stringify({ profile: readProfile(), activate: true }) });
      renderJigs(data);
      jigStatus.className = "settings-hint ok";
      jigStatus.textContent = "지그를 저장했습니다. 다음 인식부터 씁니다.";
    }
    testBtn.addEventListener("click", () => {
      testBtn.disabled = true;
      jigStatus.className = "settings-hint";
      jigStatus.textContent = "판독 중… (매칭·저장은 하지 않습니다)";
      const profile = readProfile();
      api("/api/engrave/test", { method: "POST", body: JSON.stringify({ profile }) })
        .then(async (data) => {
          await refreshPreview();
          const r = data.result || {};
          hitLayer.replaceChildren();
          for (const b of r.boxes || []) {
            const f = boxToFrame(b, r.rotation || 0, profile.roi);
            const hit = el("div", { class: `roi-hit ${r.success ? "ok" : ""}` });
            Object.assign(hit.style, { left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` });
            hitLayer.appendChild(hit);
          }
          const why = { "not_in_queue": "대기 목록에 없음", ambiguous: "다른 코드와 비슷함", "low-confidence": "확신 낮음", "no-model": "모델 없음" };
          jigStatus.className = `settings-hint ${r.success ? "ok" : "bad"}`;
          jigStatus.textContent = r.success
            ? `읽음: ${r.lot} (신뢰도 ${r.confidence}, ${r.rotation}°, ${data.ms}ms)`
            : `확정 못 함: ${why[r.reason] || r.reason || "실패"}${r.top ? ` · 1위 ${r.top}` : ""}`;
        })
        .catch((err) => {
          jigStatus.className = "settings-hint bad";
          jigStatus.textContent = err.message || "판독 시험 실패";
        })
        .finally(() => {
          testBtn.disabled = false;
        });
    });
    dragBtn.addEventListener("click", () => {
      dragMode = !dragMode;
      roiLayer.classList.toggle("drawing", dragMode);
      dragBtn.textContent = dragMode ? "그리기 끝내기" : "미리보기에서 영역 그리기";
      if (dragMode) {
        jigStatus.className = "settings-hint";
        jigStatus.textContent = "미리보기에서 각인 면을 드래그해 감싸세요.";
      }
    });
    let dragStart = null;
    const posOf = (ev) => {
      const r = roiLayer.getBoundingClientRect();
      return [Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))];
    };
    roiLayer.addEventListener("pointerdown", (ev) => {
      if (!dragMode) return;
      dragStart = posOf(ev);
      roiLayer.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    roiLayer.addEventListener("pointermove", (ev) => {
      if (!dragMode || !dragStart) return;
      const [x, y] = posOf(ev);
      const roi = { x: Math.min(x, dragStart[0]), y: Math.min(y, dragStart[1]), w: Math.abs(x - dragStart[0]), h: Math.abs(y - dragStart[1]) };
      drawRoi(roi);
      roiInputs.x.value = pct(roi.x);
      roiInputs.y.value = pct(roi.y);
      roiInputs.w.value = pct(roi.w);
      roiInputs.h.value = pct(roi.h);
    });
    roiLayer.addEventListener("pointerup", () => {
      if (!dragStart) return;
      dragStart = null;
      hitLayer.replaceChildren();
      markJigDirty();
    });

    deviceSel.addEventListener("change", () => {
      api("/devices", { method: "POST", body: JSON.stringify({ device: deviceSel.value }) })
        .then(() => {
          status.className = "note settings-status ok";
          status.textContent = "카메라를 바꿨습니다.";
          return refreshPreview();
        })
        .catch((err) => {
          status.className = "note settings-status bad";
          status.textContent = err.message || "카메라 선택 실패";
        });
    });
    refreshBtn.addEventListener("click", () => {
      refreshBtn.disabled = true;
      loadDevices(deviceSel)
        .catch((err) => {
          status.className = "note settings-status bad";
          status.textContent = err.message || "카메라 목록 실패";
        })
        .finally(() => {
          refreshBtn.disabled = false;
        });
    });
    previewBtn.addEventListener("click", () => void refreshPreview());
    resetBtn.addEventListener("click", () => {
      if (recommended) fill(recommended);
      void save("/api/camera-settings/reset");
    });
    saveBtn.addEventListener("click", () => void save("/api/camera-settings", { settings: readForm(), apply: true }));

    async function saveWorkflow() {
      const data = await api("/api/station-settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: {
            autoCommit: Boolean(autoCommitChk.checked),
            collectSamples: Boolean(collectChk.checked),
          },
        }),
      });
      const s = data.settings || {};
      state.station = {
        autoCommit: s.autoCommit !== false,
        collectSamples: s.collectSamples !== false,
      };
      document.body.classList.toggle("mode-auto", state.station.autoCommit !== false);
      workflowStatus.className = "settings-hint ok";
      workflowStatus.textContent = state.station.autoCommit
        ? "자동 프린트·포장.발송을 켭니다."
        : "연습 모드(인식만)입니다.";
    }

    async function refreshTrain() {
      trainStatus.textContent = "불러오는 중…";
      try {
        const data = await api("/api/engrave/status");
        const pending = await api("/api/engrave/pending").catch(() => ({ items: [] }));
        const tr = data.train || {};
        const letters = (tr.letters || data.dataset?.letters || {});
        const grid = el("div", { class: "letter-grid" });
        for (let i = 0; i < 26; i += 1) {
          const ch = String.fromCharCode(65 + i);
          const n = Number(letters[ch] || 0);
          const cell = el("div", { class: "letter-cell" + (n ? "" : " zero") });
          cell.appendChild(el("span", { text: ch }));
          cell.appendChild(el("span", { class: "n", text: String(n) }));
          grid.appendChild(cell);
        }
        const last = tr.lastTrain || tr.lastResult || {};
        const acc = last.accuracy != null ? `${(Number(last.accuracy) * 100).toFixed(1)}%` : "—";
        const missing = (tr.missingLetters || []).join(" ") || "없음";
        const info = el("div");
        info.appendChild(el("p", { class: "settings-hint", text: `상태: ${tr.message || tr.state || "대기"}` }));
        info.appendChild(el("p", { class: "settings-hint", text: `마지막 학습 정확도 ${acc}${last.promoted === false ? " · 승격 안 함" : last.promoted ? " · 적용됨" : ""}` }));
        info.appendChild(el("p", { class: "settings-hint", text: `표본 없는 글자: ${missing}` }));
        const runBtn = el("button", { type: "button", class: "btn", text: "지금 학습(출력·매칭 없음)" });
        runBtn.addEventListener("click", async () => {
          runBtn.disabled = true;
          try {
            await api("/api/engrave/train", { method: "POST", body: "{}" });
            await refreshTrain();
          } catch (err) {
            info.appendChild(el("p", { class: "settings-hint bad", text: err.message || "학습 요청 실패" }));
          } finally {
            runBtn.disabled = false;
          }
        });
        const list = el("div");
        list.appendChild(el("h3", { text: "확인 대기 촬영" }));
        const items = pending.items || [];
        if (!items.length) list.appendChild(el("p", { class: "settings-hint", text: "대기 중인 촬영이 없습니다." }));
        items.slice(0, 20).forEach((it) => {
          const row = el("div", { class: "pending-row" });
          const img = el("img", { alt: it.guess || "대기" });
          img.src = `/api/engrave/pending/frame?id=${encodeURIComponent(it.id)}`;
          const code = el("input", { type: "text", class: "field", maxLength: "3", placeholder: it.guess || "코드", value: it.guess || "" });
          const ok = el("button", { type: "button", class: "btn btn-primary", text: "확인" });
          const skip = el("button", { type: "button", class: "btn btn-ghost", text: "건너뛰기" });
          ok.addEventListener("click", async () => {
            await api("/api/engrave/pending/label", { method: "POST", body: JSON.stringify({ id: it.id, code: code.value }) });
            await refreshTrain();
          });
          skip.addEventListener("click", async () => {
            await api("/api/engrave/pending/skip", { method: "POST", body: JSON.stringify({ id: it.id }) });
            await refreshTrain();
          });
          row.append(img, code, ok, skip);
          list.appendChild(row);
        });
        trainStatus.replaceChildren(grid, info, runBtn, list);
      } catch (err) {
        trainStatus.textContent = err.message || "학습 현황을 불러오지 못했습니다.";
      }
    }

    checkFocusBtn.addEventListener("click", async () => {
      checkFocusBtn.disabled = true;
      checkStatus.className = "settings-hint";
      checkStatus.textContent = "초점 중…";
      try {
        await api("/focus", {
          method: "POST",
          body: JSON.stringify({ area: "whole" }),
        });
        checkStatus.className = "settings-hint ok";
        checkStatus.textContent = "초점을 맞췄습니다.";
        void refreshPreview();
        refreshLive();
      } catch (err) {
        checkStatus.className = "settings-hint bad";
        checkStatus.textContent = err.message || "초점 실패";
      } finally {
        checkFocusBtn.disabled = false;
      }
    });

    checkRecognizeBtn.addEventListener("click", async () => {
      checkRecognizeBtn.disabled = true;
      checkStatus.className = "settings-hint";
      checkStatus.textContent = "인식 중…";
      try {
        const data = await api("/recognize", { method: "POST", body: "{}" });
        const lot = extractLotSuffix3(data.lot);
        if (!lot) {
          checkStatus.className = "settings-hint bad";
          checkStatus.textContent = data.message || "코드를 읽지 못했습니다.";
          return;
        }
        state.lastLotKey = `manual:${lot}:${Date.now()}`;
        state.selectedId = "";
        state.suffix = lot;
        els.suffix.textContent = lot;
        pushHistory(lot);
        renderStrip();
        if (!state.station.autoCommit) {
          checkStatus.className = "settings-hint ok";
          checkStatus.textContent = `연습 · ${lot}`;
          setNote("연습 모드 · 인식만 했습니다.", "ok");
          return;
        }
        checkStatus.className = "settings-hint ok";
        checkStatus.textContent = `${lot} · 매칭 중…`;
        closeModal();
        await matchSuffix(lot, "manual");
      } catch (err) {
        checkStatus.className = "settings-hint bad";
        checkStatus.textContent = err.message || "인식 실패";
      } finally {
        checkRecognizeBtn.disabled = false;
      }
    });

    openModal("설정", wrap, {
      wide: true,
      settings: true,
    });
    loadDevices(deviceSel).catch(() => undefined);
    load().catch((err) => {
      status.className = "note settings-status bad";
      status.textContent = err.message || "설정을 불러오지 못했습니다.";
    });
    loadJigs().catch((err) => {
      jigStatus.className = "settings-hint bad";
      jigStatus.textContent = err.message || "지그 프로필을 불러오지 못했습니다.";
    });
    void refreshPreview();
  }

  function openModal(title, bodyNode, opts = {}) {
    els.modalTitle.replaceChildren();
    els.modalTitle.appendChild(document.createTextNode(title));
    if (opts.size) {
      const size = document.createElement("span");
      size.className = "modal-size";
      size.textContent = opts.size;
      els.modalTitle.appendChild(size);
    }
    els.modalBody.replaceChildren(bodyNode);
    const shell = els.modal?.querySelector(".modal");
    if (shell) {
      shell.classList.remove("modal-wide", "modal-settings", "modal-label");
      if (opts.wide) shell.classList.add("modal-wide");
      if (opts.label) shell.classList.add("modal-label");
      if (opts.settings) shell.classList.add("modal-settings");
    }
    els.modal.classList.add("open");
  }

  function closeModal() {
    els.modal.classList.remove("open");
    const shell = els.modal?.querySelector(".modal");
    if (shell) {
      shell.classList.remove("modal-wide", "modal-settings", "modal-label");
    }
  }

  async function openScrewModal() {
    const wrap = document.createElement("div");
    const help = document.createElement("p");
    help.innerHTML =
      "저장 후 새로 패킹 승인되는 의뢰에는 타입별 최신 로트번호가 스냅샷으로 기록됩니다.";
    wrap.appendChild(help);
    const list = document.createElement("div");
    wrap.appendChild(list);
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "닫기";
    cancel.addEventListener("click", closeModal);
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn-primary";
    save.textContent = "저장";
    actions.append(cancel, save);
    wrap.appendChild(actions);

    let items = [];
    try {
      const data = await api("/api/screw-lot-settings");
      items = Array.isArray(data.data?.items) ? data.data.items : [];
    } catch (err) {
      help.textContent = err.message || "설정을 불러오지 못했습니다.";
      openModal("스크류 로트번호", wrap);
      return;
    }

    const inputs = [];
    items.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "screw-row";
      const type = document.createElement("input");
      type.value = row.type || "";
      type.readOnly = true;
      const lot = document.createElement("input");
      lot.value = row.lotNumber || "";
      lot.placeholder = "로트번호";
      rowEl.append(type, lot);
      list.appendChild(rowEl);
      inputs.push({ type, lot });
    });

    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await api("/api/screw-lot-settings", {
          method: "PUT",
          body: JSON.stringify({
            items: inputs.map((row) => ({
              type: row.type.value,
              lotNumber: row.lot.value,
            })),
          }),
        });
        closeModal();
        setNote("스크류 로트번호를 저장했습니다.", "ok");
      } catch (err) {
        help.textContent = err.message || "저장에 실패했습니다.";
      } finally {
        save.disabled = false;
      }
    });

    openModal("스크류 로트번호", wrap);
  }

  const SCREW_TYPES = ["A", "B", "C", "D", "E"];
  const PRINTER_VIAL_KEY = "abuts.lot.printer.vial";

  function parseQty(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return 0;
    const n = Number.parseInt(digits, 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(99, n);
  }

  function buildPrinterBar() {
    const bar = document.createElement("div");
    bar.className = "label-printer";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "프린터");
    const err = document.createElement("p");
    err.className = "label-printer-err";
    err.hidden = true;
    bar.append(select, err);
    return { bar, select, err };
  }

  function buildLabelFooter(printerBar, cancelBtn, printBtn) {
    const footer = document.createElement("div");
    footer.className = "label-footer";
    const actions = document.createElement("div");
    actions.className = "label-footer-actions";
    actions.append(cancelBtn, printBtn);
    footer.append(printerBar, actions);
    return footer;
  }

  async function loadPrinters(selectEl, storageKey, errEl) {
    selectEl.replaceChildren();
    selectEl.disabled = true;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    const loading = document.createElement("option");
    loading.value = "";
    loading.textContent = "불러오는 중…";
    selectEl.appendChild(loading);
    try {
      const data = await api("/api/printers");
      const printers = Array.isArray(data.printers) ? data.printers : [];
      const saved = String(localStorage.getItem(storageKey) || "").trim();
      const fallback = String(data.defaultPrinter || "").trim();
      selectEl.replaceChildren();
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "프린터";
      selectEl.appendChild(blank);
      if (!printers.length) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = "프린터 없음";
          errEl.classList.remove("bad");
        }
        selectEl.disabled = false;
        return false;
      }
      printers.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        opt.title = name;
        selectEl.appendChild(opt);
      });
      if (saved && printers.includes(saved)) selectEl.value = saved;
      else if (fallback && printers.includes(fallback)) selectEl.value = fallback;
      else selectEl.value = printers[0];
      selectEl.disabled = false;
      return true;
    } catch (_err) {
      selectEl.replaceChildren();
      const fail = document.createElement("option");
      fail.value = "";
      fail.textContent = "프린터";
      selectEl.appendChild(fail);
      selectEl.disabled = false;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = "프린터 조회 불가";
        errEl.classList.add("bad");
      }
      return false;
    }
  }

  function rememberPrinter(storageKey, value) {
    const next = String(value || "").trim();
    if (next) localStorage.setItem(storageKey, next);
  }

  function syncPrintBtn(printBtn, total, printing) {
    printBtn.disabled = printing || total <= 0;
    printBtn.className =
      printing || total <= 0 ? "btn btn-label-muted" : "btn btn-dark";
    printBtn.textContent = printing
      ? "출력 중..."
      : total > 0
        ? `출력 ${total}장`
        : "출력";
  }

  async function openVialModal() {
    if (!window.AbutsVialLabel) {
      setNote("공병 라벨 모듈을 불러오지 못했습니다.", "bad");
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "label-modal vial-modal";

    const previewBox = document.createElement("div");
    previewBox.className = "vial-preview";
    const canvas = document.createElement("canvas");
    previewBox.appendChild(canvas);
    wrap.appendChild(previewBox);

    let previewType = SCREW_TYPES[0];
    let printing = false;
    const qty = {};
    const grid = document.createElement("div");
    grid.className = "vial-grid";
    const cells = {};
    const inputs = {};
    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "btn btn-label-muted";
    printBtn.textContent = "출력";

    const paintPreview = () => {
      window.AbutsVialLabel.paintVialSticker(canvas, {
        screwType: previewType,
        dpi: window.AbutsVialLabel.DPI,
      });
    };

    const totalQty = () =>
      SCREW_TYPES.reduce((sum, type) => sum + parseQty(qty[type]), 0);

    const refreshCells = () => {
      SCREW_TYPES.forEach((type) => {
        const cell = cells[type];
        cell.className = "vial-cell";
        if (type === previewType) cell.classList.add("active");
        else if (parseQty(qty[type]) > 0) cell.classList.add("has-qty");
      });
      syncPrintBtn(printBtn, totalQty(), printing);
    };

    const setQty = (type, next) => {
      const n = Math.max(0, Math.min(99, next));
      qty[type] = n === 0 ? "" : String(n);
      inputs[type].value = qty[type];
      previewType = type;
      refreshCells();
      paintPreview();
    };

    SCREW_TYPES.forEach((type) => {
      const cell = document.createElement("div");
      cell.className = "vial-cell";
      const typeBtn = document.createElement("button");
      typeBtn.type = "button";
      typeBtn.className = "type";
      typeBtn.tabIndex = -1;
      typeBtn.textContent = type;
      typeBtn.addEventListener("click", () => {
        previewType = type;
        refreshCells();
        paintPreview();
      });

      const qtyBox = document.createElement("div");
      qtyBox.className = "vial-qty";
      const input = document.createElement("input");
      input.inputMode = "numeric";
      input.maxLength = 2;
      input.placeholder = "0";
      input.setAttribute("aria-label", `${type} 장수`);
      input.addEventListener("focus", () => {
        previewType = type;
        refreshCells();
        paintPreview();
      });
      input.addEventListener("input", () => {
        qty[type] = input.value.replace(/\D/g, "").slice(0, 2);
        input.value = qty[type] || "";
        previewType = type;
        refreshCells();
        paintPreview();
      });
      const steppers = document.createElement("div");
      steppers.className = "vial-step";
      const up = document.createElement("button");
      up.type = "button";
      up.tabIndex = -1;
      up.setAttribute("aria-label", `${type} 장수 올리기`);
      up.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      up.addEventListener("click", () => setQty(type, parseQty(qty[type]) + 1));
      const down = document.createElement("button");
      down.type = "button";
      down.tabIndex = -1;
      down.setAttribute("aria-label", `${type} 장수 내리기`);
      down.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      down.addEventListener("click", () => setQty(type, parseQty(qty[type]) - 1));
      steppers.append(up, down);
      qtyBox.append(input, steppers);
      cell.append(typeBtn, qtyBox);
      grid.appendChild(cell);
      cells[type] = cell;
      inputs[type] = input;
    });
    wrap.appendChild(grid);

    const { bar: printerBar, select: printerSel, err: printerErr } =
      buildPrinterBar();
    const status = document.createElement("p");
    status.className = "label-status";
    status.hidden = true;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-ghost-text";
    cancel.textContent = "취소";
    cancel.addEventListener("click", closeModal);

    wrap.appendChild(buildLabelFooter(printerBar, cancel, printBtn));
    wrap.appendChild(status);

    printBtn.addEventListener("click", async () => {
      const jobs = SCREW_TYPES.map((type) => ({
        type,
        count: parseQty(qty[type]),
      })).filter((job) => job.count > 0);
      if (!jobs.length) {
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent = "장수를 입력하세요.";
        return;
      }
      const printer = String(printerSel.value || "").trim();
      if (!printer) {
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent = "프린터를 고르세요.";
        return;
      }
      rememberPrinter(PRINTER_VIAL_KEY, printer);
      printing = true;
      cancel.disabled = true;
      syncPrintBtn(printBtn, totalQty(), true);
      status.hidden = true;
      try {
        for (const job of jobs) {
          const jobCanvas = document.createElement("canvas");
          window.AbutsVialLabel.paintVialSticker(jobCanvas, {
            screwType: job.type,
            dpi: window.AbutsVialLabel.DPI,
          });
          const rawBase64 = window.AbutsVialLabel.buildVialStickerTspl(
            jobCanvas,
            job.count,
          );
          await api("/api/print-zpl", {
            method: "POST",
            body: JSON.stringify({
              printer,
              copies: 1,
              title: `Vial sticker ${job.type}`,
              rawBase64,
            }),
          });
        }
        closeModal();
        setNote(
          `공병 라벨 ${jobs.map((j) => `${j.type} ${j.count}장`).join(", ")} 출력`,
          "ok",
        );
      } catch (err) {
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent = err.message || "출력에 실패했습니다.";
      } finally {
        printing = false;
        cancel.disabled = false;
        syncPrintBtn(printBtn, totalQty(), false);
      }
    });

    refreshCells();
    paintPreview();
    openModal("공병 라벨", wrap, { size: "50 × 20 mm", label: true });
    void loadPrinters(printerSel, PRINTER_VIAL_KEY, printerErr).then(() => {
      syncPrintBtn(printBtn, totalQty(), false);
    });
  }

  function paintPackPreview(imgEl, placeholderEl, item, branding) {
    if (!window.AbutsPackLabel) {
      placeholderEl.hidden = false;
      imgEl.hidden = true;
      placeholderEl.textContent = "패킹 라벨 모듈을 불러오지 못했습니다.";
      return Promise.resolve();
    }
    if (!item) {
      placeholderEl.hidden = false;
      imgEl.hidden = true;
      placeholderEl.textContent = "의뢰를 고르면 라벨이 보입니다.";
      imgEl.removeAttribute("src");
      return Promise.resolve();
    }
    placeholderEl.hidden = false;
    imgEl.hidden = true;
    placeholderEl.textContent = "라벨 그리는 중…";
    return window.AbutsPackLabel
      .renderPreview(item, branding)
      .then((canvas) => {
        imgEl.src = canvas.toDataURL("image/png");
        imgEl.alt = `${item.patientName || item.lotSuffix || "패킹"} 라벨 미리보기`;
        imgEl.hidden = false;
        placeholderEl.hidden = true;
      })
      .catch((err) => {
        placeholderEl.hidden = false;
        imgEl.hidden = true;
        placeholderEl.textContent = err.message || "미리보기에 실패했습니다.";
      });
  }

  function buildPackPreviewShell() {
    const preview = document.createElement("div");
    preview.className = "pack-preview";
    const stage = document.createElement("div");
    stage.className = "pack-preview-stage";
    const img = document.createElement("img");
    img.alt = "패킹 라벨 미리보기";
    img.hidden = true;
    const placeholder = document.createElement("div");
    placeholder.className = "pack-preview-empty";
    placeholder.textContent = "의뢰를 고르면 라벨이 보입니다.";
    stage.append(img, placeholder);
    preview.appendChild(stage);
    return { preview, stage, img, placeholder };
  }

  function packCaption(item) {
    if (!item) return "";
    const tooth = item.tooth ? `#${item.tooth}` : "";
    return [item.patientName || "", tooth].filter(Boolean).join(" · ");
  }

  async function openMatchedPrintModal() {
    const item = findQueueItemForPrint();
    if (!item) {
      setNote(
        "프린트할 의뢰가 없습니다.\n오른쪽 카드를 고르거나 매칭하세요.",
        "bad",
      );
      return;
    }
    if (!window.AbutsPackLabel) {
      setNote("패킹 라벨 모듈을 불러오지 못했습니다.", "bad");
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "label-modal pack-modal";

    const { preview, img, placeholder } = buildPackPreviewShell();
    const nav = document.createElement("div");
    nav.className = "pack-nav";
    const navLabel = document.createElement("p");
    navLabel.className = "pack-nav-label";
    navLabel.textContent = `1 / 1${packCaption(item) ? ` · ${packCaption(item)}` : ""}`;
    nav.appendChild(navLabel);
    preview.appendChild(nav);
    wrap.appendChild(preview);

    const { bar: printerBar, select: printerSel, err: printerErr } =
      buildPrinterBar();
    const status = document.createElement("p");
    status.className = "label-status";
    status.hidden = true;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-ghost-text";
    cancel.textContent = "취소";
    cancel.addEventListener("click", closeModal);
    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "btn btn-dark";
    printBtn.textContent = "출력 1장";
    wrap.appendChild(buildLabelFooter(printerBar, cancel, printBtn));
    wrap.appendChild(status);

    printBtn.addEventListener("click", async () => {
      const printer = String(printerSel.value || "").trim();
      if (!printer) {
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent = "프린터를 고르세요.";
        return;
      }
      rememberPrinter(PRINTER_PACK_KEY, printer);
      printBtn.disabled = true;
      cancel.disabled = true;
      printBtn.textContent = "출력 중...";
      status.hidden = true;
      try {
        const result = await printPackingItems([item], printer);
        if (result.ok === 1 && result.fail === 0) {
          closeModal();
          setNote(
            `패킹 라벨 출력 · ${item.lotSuffix || item.patientName || "1건"}`,
            "ok",
          );
          return;
        }
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent = result.firstError || "출력에 실패했습니다.";
      } catch (err) {
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent = err.message || "출력에 실패했습니다.";
      } finally {
        printBtn.disabled = false;
        cancel.disabled = false;
        printBtn.textContent = "출력 1장";
      }
    });

    openModal("패킹 라벨", wrap, {
      size: "80 × 65 mm",
      wide: true,
      label: true,
    });
    void loadPrinters(printerSel, PRINTER_PACK_KEY, printerErr);
    const branding = await ensureBranding();
    void paintPackPreview(img, placeholder, item, branding);
  }

  async function openPackingLabelModal() {
    if (!window.AbutsPackLabel) {
      setNote("패킹 라벨 모듈을 불러오지 못했습니다.", "bad");
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "label-modal pack-modal";

    const { preview, img, placeholder } = buildPackPreviewShell();
    const nav = document.createElement("div");
    nav.className = "pack-nav";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "pack-nav-btn";
    prevBtn.setAttribute("aria-label", "이전 라벨");
    prevBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const navLabel = document.createElement("p");
    navLabel.className = "pack-nav-label";
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "pack-nav-btn";
    nextBtn.setAttribute("aria-label", "다음 라벨");
    nextBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    nav.append(prevBtn, navLabel, nextBtn);
    preview.appendChild(nav);
    wrap.appendChild(preview);

    const toolbar = document.createElement("div");
    toolbar.className = "pack-toolbar";
    const tabs = document.createElement("div");
    tabs.className = "scope-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "패킹 라벨 선택");
    let scope = "unprinted";
    let focusId = "";
    let printing = false;

    const makeTab = (key, label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.scope = key;
      btn.setAttribute("role", "tab");
      btn.addEventListener("click", () => {
        scope = key;
        const visible = visibleItems();
        selected.clear();
        visible.forEach((item) => selected.add(item._id));
        focusId = visible[0]?._id || "";
        renderList();
        syncTabs();
        syncFocus();
      });
      tabs.appendChild(btn);
      return btn;
    };
    const tabUnprinted = makeTab("unprinted", "미출력");
    const tabPrinted = makeTab("printed", "기출력");
    const tabAll = makeTab("all", "전체");

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn pack-clear";
    clearBtn.textContent = "해제";
    clearBtn.addEventListener("click", () => {
      selected.clear();
      renderList();
      syncFocus();
    });
    toolbar.append(tabs, clearBtn);
    wrap.appendChild(toolbar);

    const selected = new Set(
      state.queue.filter((item) => !item.printed).map((item) => item._id),
    );
    const visibleItems = () => {
      if (scope === "unprinted")
        return state.queue.filter((item) => !item.printed);
      if (scope === "printed") return state.queue.filter((item) => item.printed);
      return state.queue.slice();
    };
    if (!focusId) focusId = visibleItems()[0]?._id || "";

    const syncTabs = () => {
      const counts = {
        unprinted: state.queue.filter((item) => !item.printed).length,
        printed: state.queue.filter((item) => item.printed).length,
        all: state.queue.length,
      };
      const fill = (btn, label, count) => {
        btn.replaceChildren();
        btn.appendChild(document.createTextNode(label));
        const n = document.createElement("span");
        n.className = "scope-count";
        n.textContent = String(count);
        btn.appendChild(n);
        btn.classList.toggle("active", btn.dataset.scope === scope);
        btn.setAttribute("aria-selected", btn.dataset.scope === scope ? "true" : "false");
      };
      fill(tabUnprinted, "미출력", counts.unprinted);
      fill(tabPrinted, "기출력", counts.printed);
      fill(tabAll, "전체", counts.all);
    };

    const list = document.createElement("ul");
    list.className = "print-grid";
    wrap.appendChild(list);

    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "btn btn-dark";

    const syncFocus = () => {
      const visible = visibleItems();
      const idx = Math.max(
        0,
        visible.findIndex((item) => item._id === focusId),
      );
      const focusItem = visible[idx] || null;
      focusId = focusItem?._id || "";
      const caption = packCaption(focusItem);
      navLabel.textContent = focusItem
        ? `${idx + 1} / ${visible.length}${caption ? ` · ${caption}` : ""}`
        : "0 / 0";
      prevBtn.disabled = visible.length < 2 || idx <= 0;
      nextBtn.disabled = visible.length < 2 || idx >= visible.length - 1;
      clearBtn.disabled = printing || selected.size === 0;
      void paintPackPreview(img, placeholder, focusItem, state.branding);
      syncPrintBtn(printBtn, selected.size, printing);
    };

    const toggleId = (id) => {
      focusId = id;
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      renderList();
      syncFocus();
    };

    const renderList = () => {
      list.replaceChildren();
      const items = visibleItems();
      if (!items.length) {
        const empty = document.createElement("li");
        empty.className = "print-empty";
        empty.textContent =
          scope === "unprinted"
            ? "미출력 의뢰가 없습니다."
            : scope === "printed"
              ? "기출력 의뢰가 없습니다."
              : "의뢰가 없습니다.";
        list.appendChild(empty);
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("li");
        const card = document.createElement("div");
        card.className = "print-card";
        if (item._id === focusId) card.classList.add("focus");

        const check = document.createElement("button");
        check.type = "button";
        check.className = "print-check";
        check.setAttribute("role", "checkbox");
        check.setAttribute(
          "aria-checked",
          selected.has(item._id) ? "true" : "false",
        );
        check.setAttribute(
          "aria-label",
          `${item.patientName || "의뢰"} 선택`,
        );
        if (selected.has(item._id)) check.classList.add("on");
        check.innerHTML =
          '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        check.addEventListener("click", (ev) => {
          ev.stopPropagation();
          toggleId(item._id);
        });

        const body = document.createElement("button");
        body.type = "button";
        body.className = "print-card-body";
        const top = document.createElement("div");
        top.className = "print-card-top";
        const title = document.createElement("span");
        title.className = "print-card-title";
        title.textContent = `${item.patientName || "환자 없음"}${item.tooth ? ` · #${item.tooth}` : ""}`;
        top.appendChild(title);
        if (item.lotSuffix) {
          const suffix = document.createElement("span");
          suffix.className = "print-card-suffix";
          suffix.textContent = item.lotSuffix;
          top.appendChild(suffix);
        }
        body.appendChild(top);
        if (item.clinicName) {
          const clinic = document.createElement("div");
          clinic.className = "print-card-clinic";
          clinic.textContent = item.clinicName;
          body.appendChild(clinic);
        }
        body.addEventListener("click", () => {
          focusId = item._id;
          renderList();
          syncFocus();
        });

        card.append(check, body);
        if (item.printed) {
          const badge = document.createElement("span");
          badge.className = "print-card-printed";
          badge.textContent = "출력됨";
          card.appendChild(badge);
        }
        row.appendChild(card);
        list.appendChild(row);
      });
    };

    prevBtn.addEventListener("click", () => {
      const visible = visibleItems();
      const idx = visible.findIndex((item) => item._id === focusId);
      if (idx > 0) {
        focusId = visible[idx - 1]._id;
        renderList();
        syncFocus();
      }
    });
    nextBtn.addEventListener("click", () => {
      const visible = visibleItems();
      const idx = visible.findIndex((item) => item._id === focusId);
      if (idx >= 0 && idx < visible.length - 1) {
        focusId = visible[idx + 1]._id;
        renderList();
        syncFocus();
      }
    });

    const { bar: printerBar, select: printerSel, err: printerErr } =
      buildPrinterBar();
    const status = document.createElement("p");
    status.className = "label-status";
    status.hidden = true;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-ghost-text";
    cancel.textContent = "취소";
    cancel.addEventListener("click", closeModal);
    wrap.appendChild(buildLabelFooter(printerBar, cancel, printBtn));
    wrap.appendChild(status);

    printBtn.addEventListener("click", async () => {
      const targets = state.queue.filter((item) => selected.has(item._id));
      if (!targets.length) {
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent = "출력할 의뢰를 고르세요.";
        return;
      }
      const printer = String(printerSel.value || "").trim();
      if (!printer) {
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent = "프린터를 고르세요.";
        return;
      }
      rememberPrinter(PRINTER_PACK_KEY, printer);
      printing = true;
      cancel.disabled = true;
      syncFocus();
      status.hidden = true;
      try {
        const result = await printPackingItems(targets, printer);
        if (result.ok > 0 && result.fail === 0) {
          closeModal();
          setNote(`패킹 라벨 ${result.ok}건 출력`, "ok");
          await refreshQueue();
          return;
        }
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent =
          result.ok > 0
            ? `${result.ok}건 성공 / ${result.fail}건 실패`
            : result.firstError || "출력에 실패했습니다.";
      } catch (err) {
        status.hidden = false;
        status.className = "label-status bad";
        status.textContent = err.message || "출력에 실패했습니다.";
      } finally {
        printing = false;
        cancel.disabled = false;
        syncFocus();
      }
    });

    syncTabs();
    renderList();
    openModal("패킹 라벨", wrap, {
      size: "80 × 65 mm",
      wide: true,
      label: true,
    });
    void loadPrinters(printerSel, PRINTER_PACK_KEY, printerErr);
    void ensureBranding().then(() => syncFocus());
  }

  els.start.addEventListener("click", async () => {
    setBusy(true);
    try {
      state.lastLotKey = "";
      const data = await api("/watch/start", { method: "POST", body: "{}" });
      applyWatch(data);
    } catch (err) {
      setNote(err.message || "감시 시작 실패", "bad");
    } finally {
      setBusy(false);
    }
  });

  els.stop.addEventListener("click", async () => {
    setBusy(true);
    try {
      const data = await api("/watch/stop", { method: "POST", body: "{}" });
      applyWatch(data);
    } catch (err) {
      setNote(err.message || "감시 중지 실패", "bad");
    } finally {
      setBusy(false);
    }
  });

  els.match.addEventListener("click", () => {
    void matchSuffix(state.suffix, "manual");
  });
  els.printMatched?.addEventListener("click", () => {
    void openMatchedPrintModal();
  });

  els.settingsBtn?.addEventListener("click", () => {
    void openSettingsModal();
  });
  els.errorChip?.addEventListener("click", () => {
    openErrorHistoryModal();
  });

  els.vialBtn.addEventListener("click", () => {
    void openVialModal();
  });
  els.packingBtn.addEventListener("click", () => {
    void openPackingLabelModal();
  });
  els.screwBtn.addEventListener("click", () => {
    void openScrewModal();
  });
  els.modalClose.addEventListener("click", closeModal);
  els.modal.addEventListener("click", (ev) => {
    if (ev.target === els.modal) closeModal();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && els.modal.classList.contains("open")) closeModal();
  });

  function tickWatch() {
    fetch("/watch")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success !== false) applyWatch(data);
      })
      .catch(() => {
        state.reachable = false;
        els.status.textContent = "lot-server 미연결";
        els.liveEmpty.hidden = false;
        els.liveEmpty.textContent = "lot-server(8012)에 연결되지 않았습니다.";
      })
      .finally(() => {
        state.pollTimer = window.setTimeout(tickWatch, 1000);
      });
  }

  function tickQueue() {
    void refreshQueue().finally(() => {
      state.queueTimer = window.setTimeout(tickQueue, 5000);
    });
  }

  setBusy(false);
  els.suffix.textContent = "—";
  renderOcrLog([]);
  renderErrorChip();
  void loadStationSettings().finally(() => {
    tickWatch();
    tickQueue();
  });
  state.liveTimer = window.setInterval(() => {
    if (state.running) refreshLive();
  }, 1000);

  window.addEventListener("beforeunload", () => {
    window.clearTimeout(state.pollTimer);
    window.clearTimeout(state.queueTimer);
    window.clearInterval(state.liveTimer);
  });

  document.addEventListener("keydown", (ev) => {
    if (els.modal?.classList.contains("open")) return;
    const tag = (ev.target && ev.target.tagName) || "";
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
    if (ev.key === "s" || ev.key === "S") {
      ev.preventDefault();
      if (state.running) els.stop?.click();
      else els.start?.click();
    } else if (ev.key === "p" || ev.key === "P") {
      ev.preventDefault();
      els.printMatched?.click();
    }
  });

  api("/api/printers")
    .then((data) => {
      state.defaultPrinter = String(data.defaultPrinter || "").trim();
    })
    .catch(() => {});

  if (location.hash === "#settings") void openSettingsModal();

})();
