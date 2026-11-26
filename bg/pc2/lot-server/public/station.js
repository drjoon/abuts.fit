// related files:
// - bg/pc2/lot-server/public/index.html
// - bg/pc2/lot-server/src/index.js
// change-log:
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
      btn.innerHTML = `
        <div class="card-top">
          <span class="card-suffix">${item.lotSuffix || "—"}</span>
          <span class="card-meta">${item.tooth ? "#" + item.tooth : ""}</span>
        </div>
        <div class="card-name">${item.patientName || item.requestId || "—"}</div>
        <div class="card-meta">${item.clinicName || item.requestId || ""}</div>
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

  async function matchSuffix(raw, source) {
    const suffix = extractLotSuffix3(raw);
    if (suffix.length !== 3 && !state.selectedId) return;
    if (state.matching) return;
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
    els.modal.classList.add("open");
  }

  function closeModal() {
    els.modal.classList.remove("open");
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

  async function openPackingLabelModal() {
    const wrap = document.createElement("div");
    const help = document.createElement("p");
    help.innerHTML =
      "대기 의뢰를 골라 pack-server로 패킹 라벨을 출력합니다.<br />같은 PC의 8004 포트와 통신합니다.";
    wrap.appendChild(help);

    const tabs = document.createElement("div");
    tabs.className = "scope-tabs";
    let scope = "unprinted";
    const makeTab = (key, label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        scope = key;
        renderList();
        syncTabs();
      });
      tabs.appendChild(btn);
      return btn;
    };
    const tabUnprinted = makeTab("unprinted", "미출력");
    const tabAll = makeTab("all", "전체");
    const tabPrinted = makeTab("printed", "출력됨");
    wrap.appendChild(tabs);

    const syncTabs = () => {
      [tabUnprinted, tabAll, tabPrinted].forEach((btn) =>
        btn.classList.remove("active"),
      );
      if (scope === "unprinted") tabUnprinted.classList.add("active");
      else if (scope === "printed") tabPrinted.classList.add("active");
      else tabAll.classList.add("active");
    };

    const list = document.createElement("div");
    list.className = "print-list";
    wrap.appendChild(list);
    const selected = new Set(
      state.queue.filter((item) => !item.printed).map((item) => item._id),
    );

    const visibleItems = () => {
      if (scope === "unprinted") return state.queue.filter((item) => !item.printed);
      if (scope === "printed") return state.queue.filter((item) => item.printed);
      return state.queue.slice();
    };

    const renderList = () => {
      list.replaceChildren();
      const items = visibleItems();
      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "strip-empty";
        empty.textContent = "해당 의뢰가 없습니다.";
        list.appendChild(empty);
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("label");
        row.className = "print-row";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = selected.has(item._id);
        check.addEventListener("change", () => {
          if (check.checked) selected.add(item._id);
          else selected.delete(item._id);
        });
        const text = document.createElement("span");
        text.textContent = [
          item.lotSuffix || "—",
          item.patientName || item.requestId || "",
          item.clinicName || "",
          item.printed ? "출력됨" : "",
        ]
          .filter(Boolean)
          .join(" · ");
        row.append(check, text);
        list.appendChild(row);
      });
    };

    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.className = "btn";
    selectAll.textContent = "현재 목록 전체 선택";
    selectAll.addEventListener("click", () => {
      visibleItems().forEach((item) => selected.add(item._id));
      renderList();
    });
    wrap.appendChild(selectAll);

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
      const ids = Array.from(selected);
      const targets = state.queue.filter((item) => ids.includes(item._id));
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
      let ok = 0;
      let fail = 0;
      let firstError = "";
      try {
        for (const item of targets) {
          try {
            await api("/api/print-packing-label", {
              method: "POST",
              body: JSON.stringify({
                printer,
                copies: 1,
                requestId: item.requestId,
                lotNumber: item.lotNumber || item.lotSuffix,
                mailboxCode: item.mailboxCode || "-",
                screwType: item.screwType || "-",
                labName: item.labName || item.clinicName || "-",
                clinicName: item.clinicName || "",
                patientName: item.patientName || "",
                toothNumber: item.tooth || "",
                material: item.material || "",
                implantManufacturer: item.implantManufacturer || "",
                implantBrand: item.implantBrand || "",
                implantFamily: item.implantFamily || "",
                implantType: item.implantType || "",
                caseType: "Custom Abutment",
                printedAt: new Date().toISOString(),
              }),
            });
            ok += 1;
          } catch (err) {
            fail += 1;
            if (!firstError) firstError = err.message || "출력 실패";
          }
        }
        if (ok > 0 && fail === 0) {
          closeModal();
          setNote(`패킹 라벨 ${ok}건 출력`, "ok");
          await refreshQueue();
          return;
        }
        status.className = "note bad";
        status.textContent =
          ok > 0
            ? `${ok}건 성공 / ${fail}건 실패`
            : firstError || "출력에 실패했습니다.";
      } finally {
        printBtn.disabled = false;
      }
    });

    syncTabs();
    renderList();
    openModal("패킹 라벨", wrap);
    void loadPrinters(printerSel, PRINTER_PACK_KEY);
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
