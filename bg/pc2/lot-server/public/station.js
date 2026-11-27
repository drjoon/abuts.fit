// related files:
// - bg/pc2/lot-server/public/index.html
// - bg/pc2/lot-server/src/index.js
// change-log:
// - 2026-11-27: 촬영·인식 ocrLog를 라이브 아래 가로 스크롤 카드로 표시(한 줄).
// - 2026-11-27: 감시 중 OCR 거부·실패(lastError)를 각인 코드 옆 안내(note)에 표시. 코드 칸이 —로만 남아 원인을 모르게 두지 않는다.
// - 2026-11-27: 설정 모달에 ‘각인 인식 · 지그’: 프로필 선택·복제·이름, ROI(X/Y/폭/높이 %, 미리보기 드래그), 글자 높이 범위, 판독 시험(저장·매칭 없음).
// - 2026-11-27: 툴바의 카메라 선택·목록 버튼을 설정(톱니) 버튼으로. 모달에서 카메라·밝기·대비·채도·LED·EV·미리보기·권장값·저장(서버 저장).
//   Esc·바깥 클릭으로 닫는다.
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
    focus: document.querySelector("#focusBtn"),
    recognize: document.querySelector("#recognizeBtn"),
    match: document.querySelector("#matchBtn"),
    printMatched: document.querySelector("#printMatchedBtn"),
    settingsBtn: document.querySelector("#settingsBtn"),
    vialBtn: document.querySelector("#vialBtn"),
    packingBtn: document.querySelector("#packingBtn"),
    screwBtn: document.querySelector("#screwBtn"),
    modal: document.querySelector("#modal"),
    modalTitle: document.querySelector("#modalTitle"),
    modalBody: document.querySelector("#modalBody"),
    modalClose: document.querySelector("#modalClose"),
  };

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
    [
      els.start,
      els.stop,
      els.focus,
      els.recognize,
      els.match,
      els.printMatched,
    ].forEach((el) => {
      if (el) el.disabled = disabled;
    });
    if (els.stop) els.stop.hidden = !state.running;
    if (els.start) els.start.hidden = state.running;
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
    els.status.textContent = [
      state.running ? "감시 중" : "중지",
      phase,
      recent ? `최근 ${recent}` : "",
      !recent && rejected ? `거부 ${rejected}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (els.stop) els.stop.hidden = !state.running;
    if (els.start) els.start.hidden = state.running;

    if (state.running) {
      refreshLive();
      // 확정 전 거부·실패 이유를 각인 코드 칸이 —인 채로만 두지 않고 안내에 보여 준다.
      if (!state.matching && data.lastError) setNote(data.lastError, "bad");
    } else {
      els.live.removeAttribute("src");
      els.live.hidden = true;
      els.liveEmpty.hidden = false;
      els.liveEmpty.textContent = "감시 시작을 누르면 라이브가 표시됩니다.";
    }

    renderOcrLog(data.ocrLog);

    const lot = recent;
    if (!lot || !state.running || state.matching) return;
    const fileName = String(data.latest?.fileName || "").trim();
    const key = fileName ? `${fileName}:${lot}` : lot;
    if (key === state.lastLotKey) return;
    state.lastLotKey = key;
    state.selectedId = "";
    state.suffix = lot;
    els.suffix.textContent = lot;
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
        if (reason === "ambiguous_suffix") {
          setNote("같은 코드가 여러 건입니다.\n오른쪽 카드를 눌러 지정하세요.", "bad");
        } else if (reason === "no_suffix_match") {
          setNote("대기 목록에 없습니다.\n오른쪽 카드를 눌러 선택하세요.", "bad");
        } else {
          setNote(data.message || "매칭에 실패했습니다.", "bad");
        }
        return;
      }
      state.lastMatched = itemFromMatchResult(result, pendingItem);
      setNote("포장.발송으로 이동했습니다.", "ok");
      pushHistory(result.suffix || suffix);
      state.suffix = "";
      state.selectedId = "";
      els.suffix.textContent = "—";
      await refreshQueue();
    } catch (err) {
      setNote(err.message || "매칭에 실패했습니다.", "bad");
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

    left.appendChild(scopeSection);

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
      el("div", { class: "settings-inline settings-jig-actions" }, [dragBtn, testBtn, jigSaveBtn]),
      jigStatus,
      engraveInfo,
    ]);

    const right = el("div", { class: "settings-col settings-controls" }, [cameraSection, imageSection, jigSection]);
    const body = el("div", { class: "settings-body" }, [left, right]);

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
      jigStatus.textContent = "바뀐 지그 값이 있습니다. ‘지그 저장’을 누르면 인식에 씁니다.";
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
    jigSaveBtn.addEventListener("click", () => {
      jigSaveBtn.disabled = true;
      api("/api/jig-profiles", { method: "PUT", body: JSON.stringify({ profile: readProfile(), activate: true }) })
        .then((data) => {
          renderJigs(data);
          jigStatus.className = "settings-hint ok";
          jigStatus.textContent = "지그를 저장했습니다. 다음 인식부터 씁니다.";
        })
        .catch((err) => {
          jigStatus.className = "settings-hint bad";
          jigStatus.textContent = err.message || "저장 실패";
        })
        .finally(() => {
          jigSaveBtn.disabled = false;
        });
    });
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

    openModal("카메라 · 화질 · 각인 인식 설정", wrap);
    const shell = els.modal?.querySelector(".modal");
    if (shell) shell.classList.add("modal-wide", "modal-settings");
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

  function openModal(title, bodyNode) {
    els.modalTitle.textContent = title;
    els.modalBody.replaceChildren(bodyNode);
    const shell = els.modal?.querySelector(".modal");
    if (shell) shell.classList.remove("modal-wide", "modal-settings");
    els.modal.classList.add("open");
  }

  function closeModal() {
    els.modal.classList.remove("open");
    const shell = els.modal?.querySelector(".modal");
    if (shell) shell.classList.remove("modal-wide", "modal-settings");
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
  const PRINTER_PACK_KEY = "abuts.lot.printer.packing";
  const PRINTER_VIAL_KEY = "abuts.lot.printer.vial";

  function parseQty(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return 0;
    const n = Number.parseInt(digits, 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(99, n);
  }

  async function loadPrinters(selectEl, storageKey) {
    selectEl.replaceChildren();
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
      if (!printers.length) {
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "프린터 없음";
        selectEl.appendChild(empty);
        return;
      }
      printers.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        selectEl.appendChild(opt);
      });
      if (saved && printers.includes(saved)) selectEl.value = saved;
      else if (fallback && printers.includes(fallback)) selectEl.value = fallback;
      else selectEl.value = printers[0];
    } catch (err) {
      selectEl.replaceChildren();
      const fail = document.createElement("option");
      fail.value = "";
      fail.textContent = err.message || "프린터 목록 실패";
      selectEl.appendChild(fail);
    }
  }

  function rememberPrinter(storageKey, value) {
    const next = String(value || "").trim();
    if (next) localStorage.setItem(storageKey, next);
  }

  async function openVialModal() {
    if (!window.AbutsVialLabel) {
      setNote("공병 라벨 모듈을 불러오지 못했습니다.", "bad");
      return;
    }
    const wrap = document.createElement("div");
    const help = document.createElement("p");
    help.innerHTML = "50 × 20 mm · TTP-345(TSPL)<br />타입별 장수를 넣고 출력합니다.";
    wrap.appendChild(help);

    const previewBox = document.createElement("div");
    previewBox.className = "vial-preview";
    const canvas = document.createElement("canvas");
    previewBox.appendChild(canvas);
    wrap.appendChild(previewBox);

    let previewType = SCREW_TYPES[0];
    const qty = {};
    const grid = document.createElement("div");
    grid.className = "vial-grid";
    const cells = {};

    const paintPreview = () => {
      window.AbutsVialLabel.paintVialSticker(canvas, {
        screwType: previewType,
        dpi: window.AbutsVialLabel.DPI,
      });
    };

    const refreshCells = () => {
      SCREW_TYPES.forEach((type) => {
        const cell = cells[type];
        cell.className = "vial-cell";
        if (type === previewType) cell.classList.add("active");
        else if (parseQty(qty[type]) > 0) cell.classList.add("has-qty");
      });
    };

    SCREW_TYPES.forEach((type) => {
      const cell = document.createElement("div");
      cell.className = "vial-cell";
      const typeBtn = document.createElement("button");
      typeBtn.type = "button";
      typeBtn.className = "type";
      typeBtn.textContent = type;
      typeBtn.addEventListener("click", () => {
        previewType = type;
        refreshCells();
        paintPreview();
      });
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
      cell.append(typeBtn, input);
      grid.appendChild(cell);
      cells[type] = cell;
    });
    wrap.appendChild(grid);

    const printerField = document.createElement("div");
    printerField.className = "field";
    const printerLabel = document.createElement("label");
    printerLabel.textContent = "프린터";
    const printerSel = document.createElement("select");
    printerField.append(printerLabel, printerSel);
    wrap.appendChild(printerField);

    const status = document.createElement("p");
    status.className = "note";
    wrap.appendChild(status);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "닫기";
    cancel.addEventListener("click", closeModal);
    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "btn btn-primary";
    printBtn.textContent = "출력";
    actions.append(cancel, printBtn);
    wrap.appendChild(actions);

    printBtn.addEventListener("click", async () => {
      const jobs = SCREW_TYPES.map((type) => ({
        type,
        count: parseQty(qty[type]),
      })).filter((job) => job.count > 0);
      if (!jobs.length) {
        status.className = "note bad";
        status.textContent = "장수를 입력하세요.";
        return;
      }
      const printer = String(printerSel.value || "").trim();
      if (!printer) {
        status.className = "note bad";
        status.textContent = "프린터를 고르세요.";
        return;
      }
      rememberPrinter(PRINTER_VIAL_KEY, printer);
      printBtn.disabled = true;
      status.className = "note";
      status.textContent = "출력 중…";
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
        status.className = "note bad";
        status.textContent = err.message || "출력에 실패했습니다.";
      } finally {
        printBtn.disabled = false;
      }
    });

    refreshCells();
    paintPreview();
    openModal("공병 라벨", wrap);
    void loadPrinters(printerSel, PRINTER_VIAL_KEY);
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
    const img = document.createElement("img");
    img.alt = "패킹 라벨 미리보기";
    img.hidden = true;
    const placeholder = document.createElement("div");
    placeholder.className = "pack-preview-empty";
    placeholder.textContent = "의뢰를 고르면 라벨이 보입니다.";
    preview.append(img, placeholder);
    return { preview, img, placeholder };
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
    wrap.className = "pack-modal";
    const caption = document.createElement("p");
    caption.className = "pack-caption";
    caption.textContent = [
      item.lotSuffix || "—",
      item.patientName || "",
      item.clinicName || "",
      item.requestId ? `#${String(item.requestId).slice(-4)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    wrap.appendChild(caption);

    const { preview, img, placeholder } = buildPackPreviewShell();
    wrap.appendChild(preview);

    const printerField = document.createElement("div");
    printerField.className = "field";
    const printerLabel = document.createElement("label");
    printerLabel.textContent = "프린터";
    const printerSel = document.createElement("select");
    printerField.append(printerLabel, printerSel);
    wrap.appendChild(printerField);

    const status = document.createElement("p");
    status.className = "note";
    wrap.appendChild(status);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "취소";
    cancel.addEventListener("click", closeModal);
    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "btn btn-dark";
    printBtn.textContent = "출력 1장";
    actions.append(cancel, printBtn);
    wrap.appendChild(actions);

    printBtn.addEventListener("click", async () => {
      const printer = String(printerSel.value || "").trim();
      if (!printer) {
        status.className = "note bad";
        status.textContent = "프린터를 고르세요.";
        return;
      }
      rememberPrinter(PRINTER_PACK_KEY, printer);
      printBtn.disabled = true;
      status.className = "note";
      status.textContent = "출력 중…";
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
        status.className = "note bad";
        status.textContent = result.firstError || "출력에 실패했습니다.";
      } catch (err) {
        status.className = "note bad";
        status.textContent = err.message || "출력에 실패했습니다.";
      } finally {
        printBtn.disabled = false;
      }
    });

    openModal("패킹 라벨 80 × 65 mm", wrap);
    if (els.modal?.querySelector(".modal")) {
      els.modal.querySelector(".modal").classList.add("modal-wide");
    }
    void loadPrinters(printerSel, PRINTER_PACK_KEY);
    const branding = await ensureBranding();
    void paintPackPreview(img, placeholder, item, branding);
  }

  async function openPackingLabelModal() {
    if (!window.AbutsPackLabel) {
      setNote("패킹 라벨 모듈을 불러오지 못했습니다.", "bad");
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "pack-modal";

    const { preview, img, placeholder } = buildPackPreviewShell();
    wrap.appendChild(preview);

    const nav = document.createElement("div");
    nav.className = "pack-nav";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn pack-nav-btn";
    prevBtn.textContent = "‹";
    prevBtn.setAttribute("aria-label", "이전 라벨");
    const navLabel = document.createElement("p");
    navLabel.className = "pack-nav-label";
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn pack-nav-btn";
    nextBtn.textContent = "›";
    nextBtn.setAttribute("aria-label", "다음 라벨");
    nav.append(prevBtn, navLabel, nextBtn);
    wrap.appendChild(nav);

    const tabs = document.createElement("div");
    tabs.className = "scope-tabs";
    let scope = "unprinted";
    let focusId = "";
    const makeTab = (key, label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.scope = key;
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
    wrap.appendChild(tabs);

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
      tabUnprinted.textContent = `미출력 ${counts.unprinted}`;
      tabPrinted.textContent = `기출력 ${counts.printed}`;
      tabAll.textContent = `전체 ${counts.all}`;
      [tabUnprinted, tabPrinted, tabAll].forEach((btn) =>
        btn.classList.toggle("active", btn.dataset.scope === scope),
      );
    };

    const list = document.createElement("div");
    list.className = "print-grid";
    wrap.appendChild(list);

    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "btn btn-dark";
    printBtn.textContent = selected.size ? `출력 ${selected.size}장` : "출력";

    const syncFocus = () => {
      const visible = visibleItems();
      const idx = Math.max(
        0,
        visible.findIndex((item) => item._id === focusId),
      );
      const focusItem = visible[idx] || null;
      focusId = focusItem?._id || "";
      navLabel.textContent = focusItem
        ? `${idx + 1} / ${visible.length} · ${focusItem.patientName || focusItem.lotSuffix || "—"}`
        : "0 / 0";
      prevBtn.disabled = visible.length < 2 || idx <= 0;
      nextBtn.disabled = visible.length < 2 || idx >= visible.length - 1;
      void paintPackPreview(img, placeholder, focusItem, state.branding);
      printBtn.textContent = selected.size
        ? `출력 ${selected.size}장`
        : "출력";
    };

    const renderList = () => {
      list.replaceChildren();
      const items = visibleItems();
      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "strip-empty";
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
        const row = document.createElement("label");
        row.className = "print-card";
        if (item._id === focusId) row.classList.add("focus");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = selected.has(item._id);
        check.addEventListener("click", (ev) => ev.stopPropagation());
        check.addEventListener("change", () => {
          if (check.checked) selected.add(item._id);
          else selected.delete(item._id);
          printBtn.textContent = selected.size
            ? `출력 ${selected.size}장`
            : "출력";
        });
        const body = document.createElement("div");
        body.className = "print-card-body";
        const title = document.createElement("strong");
        title.textContent = `${item.patientName || "—"} · ${item.lotSuffix || "—"}`;
        const meta = document.createElement("span");
        meta.textContent = [item.clinicName || "", item.printed ? "출력됨" : ""]
          .filter(Boolean)
          .join(" · ");
        body.append(title, meta);
        row.append(check, body);
        row.addEventListener("click", () => {
          focusId = item._id;
          renderList();
          syncFocus();
        });
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

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn";
    clearBtn.textContent = "해제";
    clearBtn.addEventListener("click", () => {
      selected.clear();
      renderList();
      syncFocus();
    });

    const printerField = document.createElement("div");
    printerField.className = "field";
    const printerLabel = document.createElement("label");
    printerLabel.textContent = "프린터";
    const printerSel = document.createElement("select");
    printerField.append(printerLabel, printerSel);

    const footer = document.createElement("div");
    footer.className = "pack-footer";
    footer.append(clearBtn, printerField);
    wrap.appendChild(footer);

    const status = document.createElement("p");
    status.className = "note";
    wrap.appendChild(status);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "취소";
    cancel.addEventListener("click", closeModal);
    actions.append(cancel, printBtn);
    wrap.appendChild(actions);

    printBtn.addEventListener("click", async () => {
      const targets = state.queue.filter((item) => selected.has(item._id));
      if (!targets.length) {
        status.className = "note bad";
        status.textContent = "출력할 의뢰를 고르세요.";
        return;
      }
      const printer = String(printerSel.value || "").trim();
      if (!printer) {
        status.className = "note bad";
        status.textContent = "프린터를 고르세요.";
        return;
      }
      rememberPrinter(PRINTER_PACK_KEY, printer);
      printBtn.disabled = true;
      status.className = "note";
      status.textContent = "출력 중…";
      try {
        const result = await printPackingItems(targets, printer);
        if (result.ok > 0 && result.fail === 0) {
          closeModal();
          setNote(`패킹 라벨 ${result.ok}건 출력`, "ok");
          await refreshQueue();
          return;
        }
        status.className = "note bad";
        status.textContent =
          result.ok > 0
            ? `${result.ok}건 성공 / ${result.fail}건 실패`
            : result.firstError || "출력에 실패했습니다.";
      } catch (err) {
        status.className = "note bad";
        status.textContent = err.message || "출력에 실패했습니다.";
      } finally {
        printBtn.disabled = false;
      }
    });

    syncTabs();
    renderList();
    openModal("패킹 라벨 80 × 65 mm", wrap);
    if (els.modal?.querySelector(".modal")) {
      els.modal.querySelector(".modal").classList.add("modal-wide");
    }
    void loadPrinters(printerSel, PRINTER_PACK_KEY);
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

  els.focus.addEventListener("click", async () => {
    setBusy(true);
    try {
      await api("/focus", {
        method: "POST",
        body: JSON.stringify({ area: "whole" }),
      });
      refreshLive();
    } catch (err) {
      setNote(err.message || "초점 실패", "bad");
    } finally {
      setBusy(false);
    }
  });

  els.recognize.addEventListener("click", async () => {
    setBusy(true);
    try {
      const data = await api("/recognize", { method: "POST", body: "{}" });
      const lot = extractLotSuffix3(data.lot);
      if (!lot) {
        setNote(data.message || "코드를 읽지 못했습니다.", "bad");
        return;
      }
      state.lastLotKey = `manual:${lot}:${Date.now()}`;
      state.selectedId = "";
      state.suffix = lot;
      els.suffix.textContent = lot;
      await matchSuffix(lot, "manual");
    } catch (err) {
      setNote(err.message || "인식 실패", "bad");
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
  tickWatch();
  tickQueue();
  state.liveTimer = window.setInterval(() => {
    if (state.running) refreshLive();
  }, 1000);

  window.addEventListener("beforeunload", () => {
    window.clearTimeout(state.pollTimer);
    window.clearTimeout(state.queueTimer);
    window.clearInterval(state.liveTimer);
  });
})();
