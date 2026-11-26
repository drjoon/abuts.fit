// related files:
// - bg/pc2/lot-server/public/index.html
// - bg/pc2/lot-server/src/index.js
// change-log:
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
    history: document.querySelector("#history"),
    start: document.querySelector("#startWatch"),
    stop: document.querySelector("#stopWatch"),
    focus: document.querySelector("#focusBtn"),
    recognize: document.querySelector("#recognizeBtn"),
    match: document.querySelector("#matchBtn"),
    printMatched: document.querySelector("#printMatchedBtn"),
    device: document.querySelector("#device"),
    refreshDevices: document.querySelector("#refreshDevices"),
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
      els.device,
      els.refreshDevices,
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

  function applyWatch(data) {
    state.reachable = true;
    state.running = Boolean(data.running);
    const phase = PHASE_KO[data.phase] || data.phase || "—";
    const recent = extractLotSuffix3(data.lastLot || data.latest?.lot);
    els.status.textContent = [
      state.running ? "감시 중" : "중지",
      phase,
      recent ? `최근 ${recent}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (els.stop) els.stop.hidden = !state.running;
    if (els.start) els.start.hidden = state.running;

    if (state.running) {
      refreshLive();
    } else {
      els.live.removeAttribute("src");
      els.live.hidden = true;
      els.liveEmpty.hidden = false;
      els.liveEmpty.textContent = "감시 시작을 누르면 라이브가 표시됩니다.";
    }

    const lot = recent;
    if (!lot || !state.running || state.matching) return;
    const fileName = String(data.latest?.fileName || "").trim();
    const key = fileName ? `${fileName}:${lot}` : lot;
    if (key === state.lastLotKey) return;
    state.lastLotKey = key;
    state.selectedId = "";
    state.suffix = lot;
    els.suffix.textContent = lot;
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

  async function loadDevices() {
    const data = await api("/devices");
    els.device.replaceChildren();
    const list = Array.isArray(data.devices) ? data.devices : [];
    if (!list.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "카메라 없음";
      els.device.appendChild(opt);
      return;
    }
    list.forEach((item) => {
      const name = typeof item === "string" ? item : item.name;
      const opt = document.createElement("option");
      opt.value = name;
      let label = name;
      if (item?.preferred) label += " · 현미경";
      if (item?.continuity) label += " · Continuity";
      opt.textContent = label;
      els.device.appendChild(opt);
    });
    if (data.selected) els.device.value = data.selected;
  }

  function openModal(title, bodyNode) {
    els.modalTitle.textContent = title;
    els.modalBody.replaceChildren(bodyNode);
    const shell = els.modal?.querySelector(".modal");
    if (shell) shell.classList.remove("modal-wide");
    els.modal.classList.add("open");
  }

  function closeModal() {
    els.modal.classList.remove("open");
    const shell = els.modal?.querySelector(".modal");
    if (shell) shell.classList.remove("modal-wide");
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

  els.refreshDevices.addEventListener("click", () => {
    loadDevices().catch((err) => setNote(err.message || "카메라 목록 실패", "bad"));
  });

  els.device.addEventListener("change", () => {
    api("/devices", {
      method: "POST",
      body: JSON.stringify({ device: els.device.value }),
    }).catch((err) => setNote(err.message || "카메라 선택 실패", "bad"));
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
  loadDevices().catch(() => undefined);
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
