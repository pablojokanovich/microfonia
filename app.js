const STORAGE_KEY = "congress-sound-app-v1";
const state = {
  microphones: [],
  events: [],
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
};

const $ = (id) => document.getElementById(id);
const els = {
  micForm: $("micForm"),
  micBrand: $("micBrand"),
  micModel: $("micModel"),
  micSerial: $("micSerial"),
  bulkForm: $("bulkForm"),
  bulkQuantity: $("bulkQuantity"),
  bulkBrand: $("bulkBrand"),
  bulkModel: $("bulkModel"),
  bulkSerial: $("bulkSerial"),
  micSearch: $("micSearch"),
  micTable: $("micTable"),
  eventForm: $("eventForm"),
  eventId: $("eventId"),
  eventName: $("eventName"),
  eventOrder: $("eventOrder"),
  eventLocation: $("eventLocation"),
  eventStart: $("eventStart"),
  eventEnd: $("eventEnd"),
  eventMicNeed: $("eventMicNeed"),
  assignmentSearch: $("assignmentSearch"),
  assignmentList: $("assignmentList"),
  eventList: $("eventList"),
  calendar: $("calendar"),
  monthLabel: $("monthLabel"),
  alerts: $("alerts"),
  toast: $("toast"),
  totalMics: $("totalMics"),
  activeEvents: $("activeEvents"),
  conflictCount: $("conflictCount"),
  importFile: $("importFile"),
  excelModal: $("excelModal"),
  excelModalTitle: $("excelModalTitle"),
};

let excelAction = "export";
let importMode = "all";

const headers = {
  microphones: ["Marca", "Modelo", "Numero", "Numero de serie", "Activo"],
  events: ["ID", "Nombre", "Orden", "Locacion", "Inicio", "Fin", "Tipo de microfonia necesaria", "Microfonos"],
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ microphones: state.microphones, events: state.events }));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.microphones = Array.isArray(parsed.microphones) ? parsed.microphones : [];
    state.events = Array.isArray(parsed.events) ? parsed.events : [];
    normalizeStoredData();
  } catch {
    showToast("No se pudo leer el guardado local");
  }
}

function normalizeStoredData() {
  const counters = new Map();
  state.microphones = state.microphones.map((mic) => ({
    ...mic,
    brand: mic.brand || "",
    model: mic.model || "",
    serial: mic.serial || mic.notes || "",
  })).map((mic) => {
    if (mic.unitNumber) return mic;
    const key = equipmentKey(mic.brand, mic.model);
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);
    return { ...mic, unitNumber: next };
  });
  state.events = state.events.map((event) => ({
    ...event,
    micNeed: event.micNeed || "",
  }));
}

function equipmentKey(brand, model) {
  return [brand, model].map((value) => String(value || "").trim().toLowerCase()).join("|");
}

function nextUnitNumber(brand, model) {
  const key = equipmentKey(brand, model);
  return state.microphones
    .filter((mic) => equipmentKey(mic.brand, mic.model) === key)
    .reduce((max, mic) => Math.max(max, Number(mic.unitNumber || 0)), 0) + 1;
}

function equipmentLabel(mic) {
  return `${mic.brand || "Sin marca"} ${mic.model || "Sin modelo"} #${mic.unitNumber || 1}`;
}

function compareMicrophones(a, b) {
  return (
    (a.brand || "").localeCompare(b.brand || "") ||
    (a.model || "").localeCompare(b.model || "") ||
    Number(a.unitNumber || 0) - Number(b.unitNumber || 0)
  );
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("toast--show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("toast--show"), 2600);
}

function normalizeDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function formatDateRange(event) {
  return event.start === event.end ? event.start : `${event.start} al ${event.end}`;
}

function selectedMicIds() {
  return [...els.assignmentList.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
}

function conflictReport() {
  const conflicts = [];
  const activeMics = new Set(state.microphones.filter((mic) => mic.active !== false).map((mic) => mic.id));

  for (const mic of state.microphones) {
    if (mic.active === false) continue;
    const assigned = state.events.filter((event) => (event.microphoneIds || []).includes(mic.id));
    for (let i = 0; i < assigned.length; i += 1) {
      for (let j = i + 1; j < assigned.length; j += 1) {
        const first = assigned[i];
        const second = assigned[j];
        if (rangesOverlap(normalizeDate(first.start), normalizeDate(first.end), normalizeDate(second.start), normalizeDate(second.end))) {
          conflicts.push({ mic, events: [first, second] });
        }
      }
    }
  }

  const invalidAssignments = state.events.flatMap((event) =>
    (event.microphoneIds || [])
      .filter((id) => !activeMics.has(id))
      .map((id) => ({ missingMicId: id, events: [event] })),
  );

  return { conflicts, invalidAssignments };
}

function eventHasConflict(eventId) {
  const report = conflictReport();
  return report.conflicts.some((item) => item.events.some((event) => event.id === eventId)) ||
    report.invalidAssignments.some((item) => item.events.some((event) => event.id === eventId));
}

function renderSummary() {
  const report = conflictReport();
  els.totalMics.textContent = state.microphones.filter((mic) => mic.active !== false).length;
  els.activeEvents.textContent = state.events.length;
  els.conflictCount.textContent = report.conflicts.length + report.invalidAssignments.length;
}

function renderInventory() {
  const search = els.micSearch.value.trim().toLowerCase();
  const rows = state.microphones
    .filter((mic) => mic.active !== false)
    .filter((mic) => [equipmentLabel(mic), mic.brand, mic.model, mic.serial].join(" ").toLowerCase().includes(search))
    .sort(compareMicrophones);

  els.micTable.innerHTML = rows
    .map(
      (mic) => `
        <tr>
          <td>${escapeHtml(mic.brand || "")}</td>
          <td>${escapeHtml(mic.model || "")}</td>
          <td><strong>#${escapeHtml(mic.unitNumber || 1)}</strong></td>
          <td>${escapeHtml(mic.serial || "")}</td>
          <td><button class="button button--ghost button--small" data-remove-mic="${mic.id}">Quitar equipo</button></td>
        </tr>
      `,
    )
    .join("");
}

function renderAssignments(availableOnly = false) {
  const search = els.assignmentSearch.value.trim().toLowerCase();
  const currentId = els.eventId.value;
  const currentEvent = state.events.find((event) => event.id === currentId);
  const currentSelected = new Set(currentEvent ? currentEvent.microphoneIds || [] : selectedMicIds());
  const start = normalizeDate(els.eventStart.value);
  const end = normalizeDate(els.eventEnd.value);

  const busyIds = new Set();
  if (start && end) {
    state.events
      .filter((event) => event.id !== currentId)
      .filter((event) => rangesOverlap(start, end, normalizeDate(event.start), normalizeDate(event.end)))
      .forEach((event) => (event.microphoneIds || []).forEach((id) => busyIds.add(id)));
  }

  const rows = state.microphones
    .filter((mic) => mic.active !== false)
    .filter((mic) => [equipmentLabel(mic), mic.brand, mic.model, mic.serial].join(" ").toLowerCase().includes(search))
    .filter((mic) => !availableOnly || !busyIds.has(mic.id) || currentSelected.has(mic.id))
    .sort(compareMicrophones);

  els.assignmentList.innerHTML = rows
    .map((mic) => {
      const busy = busyIds.has(mic.id) && !currentSelected.has(mic.id);
      return `
        <label class="check-row ${busy ? "danger" : ""}">
          <input type="checkbox" value="${mic.id}" ${currentSelected.has(mic.id) ? "checked" : ""} />
          <span>${escapeHtml(equipmentLabel(mic))} <small>${escapeHtml(mic.serial || "")}</small></span>
          <small>${busy ? "Ocupado" : "Libre"}</small>
        </label>
      `;
    })
    .join("");
}

function renderAlerts() {
  const report = conflictReport();
  const items = [
    ...report.conflicts.map(
      (item) => `
        <div class="alert">
          <strong>${escapeHtml(equipmentLabel(item.mic))} duplicado</strong>
          <div>${escapeHtml(item.events[0].name)} (${formatDateRange(item.events[0])}) se cruza con ${escapeHtml(item.events[1].name)} (${formatDateRange(item.events[1])}).</div>
        </div>
      `,
    ),
    ...report.invalidAssignments.map(
      (item) => `
        <div class="alert">
          <strong>Microfono no disponible</strong>
          <div>${escapeHtml(item.events[0].name)} tiene asignado un equipo que ya no existe o fue quitado.</div>
        </div>
      `,
    ),
  ];
  els.alerts.innerHTML = items.length ? items.join("") : `<div class="alert"><strong>Sin alertas</strong><div>La agenda no supera el stock disponible.</div></div>`;
}

function renderEvents() {
  els.eventList.innerHTML = state.events
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((event) => {
      const conflict = eventHasConflict(event.id);
      return `
        <article class="event-card">
          <div class="event-card__top">
            <div>
              <h3>${escapeHtml(event.name)} ${conflict ? '<span class="danger">- alerta</span>' : ""}</h3>
              <p>${escapeHtml(event.order || "Sin orden")} - ${escapeHtml(event.location || "Sin locacion")}</p>
            </div>
            <div class="event-card__actions">
              <button class="button button--ghost button--small" data-edit-event="${event.id}">Editar</button>
              <button class="button button--ghost button--small" data-delete-event="${event.id}">Borrar</button>
            </div>
          </div>
          <p>${formatDateRange(event)} - ${(event.microphoneIds || []).length} microfonos asignados</p>
          ${event.micNeed ? `<p>Necesario: ${escapeHtml(event.micNeed)}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderCalendar() {
  const month = state.currentMonth;
  const year = state.currentYear;
  const monthName = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  els.monthLabel.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const first = new Date(year, month, 1);
  const start = new Date(first);
  const day = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - day);
  const names = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
  const cells = names.map((name) => `<div class="day-name">${name}</div>`);

  for (let i = 0; i < 42; i += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const key = dateKey(current);
    const dayEvents = state.events.filter((event) => event.start <= key && key <= event.end);
    cells.push(`
      <div class="day ${current.getMonth() !== month ? "day--muted" : ""}">
        <span class="day__number">${current.getDate()}</span>
        ${dayEvents
          .map(
            (event) =>
              `<button class="day__event ${eventHasConflict(event.id) ? "day__event--conflict" : ""}" data-edit-event="${event.id}">${escapeHtml(event.name)}</button>`,
          )
          .join("")}
      </div>
    `);
  }
  els.calendar.innerHTML = cells.join("");
}

function renderAll() {
  renderSummary();
  renderInventory();
  renderAssignments();
  renderAlerts();
  renderEvents();
  renderCalendar();
}

function resetEventForm() {
  els.eventId.value = "";
  els.eventForm.reset();
  renderAssignments();
}

function editEvent(id) {
  const event = state.events.find((item) => item.id === id);
  if (!event) return;
  els.eventId.value = event.id;
  els.eventName.value = event.name;
  els.eventOrder.value = event.order || "";
  els.eventLocation.value = event.location || "";
  els.eventStart.value = event.start;
  els.eventEnd.value = event.end;
  els.eventMicNeed.value = event.micNeed || "";
  renderAssignments();
  els.eventName.focus();
}

function deleteEvent(id) {
  state.events = state.events.filter((event) => event.id !== id);
  save();
  renderAll();
  showToast("Evento borrado");
}

function removeMicrophone(id) {
  const mic = state.microphones.find((item) => item.id === id);
  if (mic) mic.active = false;
  save();
  renderAll();
  showToast("Microfono quitado");
}

function addMicrophone(data) {
  const brand = data.brand.trim();
  const model = data.model.trim();
  if (!brand || !model) return false;
  const unitNumber = data.unitNumber || nextUnitNumber(brand, model);
  const code = data.code || `${brand} ${model} #${unitNumber}`;
  state.microphones.push({ id: uid("mic"), active: true, ...data, brand, model, unitNumber, code });
  return true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.micForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const added = addMicrophone({
    brand: els.micBrand.value,
    model: els.micModel.value,
    serial: els.micSerial.value,
  });
  if (!added) {
    showToast("Marca y modelo son obligatorios");
    return;
  }
  els.micForm.reset();
  save();
  renderAll();
  showToast("Microfono agregado");
});

els.bulkForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const qty = Math.max(1, Number(els.bulkQuantity.value || 1));
  let created = 0;
  for (let i = 1; i <= qty; i += 1) {
    const unitNumber = nextUnitNumber(els.bulkBrand.value, els.bulkModel.value);
    if (
      addMicrophone({
        brand: els.bulkBrand.value,
        model: els.bulkModel.value,
        unitNumber,
        serial: els.bulkSerial.value.trim() ? `${els.bulkSerial.value.trim()}-${unitNumber}` : "",
      })
    ) {
      created += 1;
    }
  }
  save();
  renderAll();
  showToast(`${created} microfonos creados`);
});

els.eventForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (els.eventEnd.value < els.eventStart.value) {
    showToast("La fecha de fin no puede ser anterior");
    return;
  }
  const id = els.eventId.value || uid("evt");
  const payload = {
    id,
    name: els.eventName.value.trim(),
    order: els.eventOrder.value.trim(),
    location: els.eventLocation.value.trim(),
    start: els.eventStart.value,
    end: els.eventEnd.value,
    micNeed: els.eventMicNeed.value.trim(),
    microphoneIds: selectedMicIds(),
  };
  const index = state.events.findIndex((item) => item.id === id);
  if (index >= 0) state.events[index] = payload;
  else state.events.push(payload);
  save();
  resetEventForm();
  renderAll();
  showToast(eventHasConflict(id) ? "Guardado con alerta de stock" : "Evento guardado");
});

document.addEventListener("click", (event) => {
  const removeId = event.target.dataset.removeMic;
  const editId = event.target.dataset.editEvent;
  const deleteId = event.target.dataset.deleteEvent;
  if (removeId) removeMicrophone(removeId);
  if (editId) editEvent(editId);
  if (deleteId) deleteEvent(deleteId);
});

els.micSearch.addEventListener("input", renderInventory);
els.assignmentSearch.addEventListener("input", () => renderAssignments());
els.eventStart.addEventListener("change", () => renderAssignments());
els.eventEnd.addEventListener("change", () => renderAssignments());
$("resetEventBtn").addEventListener("click", resetEventForm);
$("selectAvailableBtn").addEventListener("click", () => renderAssignments(true));
$("prevMonthBtn").addEventListener("click", () => {
  state.currentMonth -= 1;
  if (state.currentMonth < 0) {
    state.currentMonth = 11;
    state.currentYear -= 1;
  }
  renderCalendar();
});
$("nextMonthBtn").addEventListener("click", () => {
  state.currentMonth += 1;
  if (state.currentMonth > 11) {
    state.currentMonth = 0;
    state.currentYear += 1;
  }
  renderCalendar();
});
$("clearInventoryBtn").addEventListener("click", () => {
  if (!confirm("Seguro que queres quitar todos los microfonos del inventario?")) return;
  state.microphones.forEach((mic) => {
    mic.active = false;
  });
  save();
  renderAll();
});

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sheetXml(rows) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map(
      (row, rIndex) =>
        `<row r="${rIndex + 1}">${row
          .map((cell, cIndex) => {
            const ref = `${columnName(cIndex + 1)}${rIndex + 1}`;
            return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("")}</sheetData></worksheet>`;
}

function columnName(index) {
  let name = "";
  while (index > 0) {
    const mod = (index - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    index = Math.floor((index - mod) / 26);
  }
  return name;
}

function createWorkbook(files) {
  const encoder = new TextEncoder();
  const records = [];
  const chunks = [];
  let offset = 0;

  Object.entries(files).forEach(([path, content]) => {
    const data = encoder.encode(content);
    const name = encoder.encode(path);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, data);
    records.push({ path, name, crc, size: data.length, offset });
    offset += local.length + data.length;
  });

  const centralStart = offset;
  records.forEach((record) => {
    const central = new Uint8Array(46 + record.name.length);
    const view = new DataView(central.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(10, 0, true);
    view.setUint32(16, record.crc, true);
    view.setUint32(20, record.size, true);
    view.setUint32(24, record.size, true);
    view.setUint16(28, record.name.length, true);
    view.setUint32(42, record.offset, true);
    central.set(record.name, 46);
    chunks.push(central);
    offset += central.length;
  });

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, records.length, true);
  endView.setUint16(10, records.length, true);
  endView.setUint32(12, offset - centralStart, true);
  endView.setUint32(16, centralStart, true);
  chunks.push(end);
  return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function workbookBlob(microphones, events, mode = "all") {
  const micRows = [
    headers.microphones,
    ...microphones.map((mic) => [mic.brand, mic.model, mic.unitNumber || 1, mic.serial || mic.notes || "", mic.active === false ? "NO" : "SI"]),
  ];
  const eventRows = [
    headers.events,
    ...events.map((event) => [
      event.id,
      event.name,
      event.order,
      event.location,
      event.start,
      event.end,
      event.micNeed || "",
      (event.microphoneIds || [])
        .map((id) => {
          const mic = state.microphones.find((item) => item.id === id);
          return mic ? equipmentLabel(mic) : id;
        })
        .join(", "),
    ]),
  ];
  const sheets = [];
  if (mode === "inventory" || mode === "all") sheets.push({ name: "Microfonos", rows: micRows });
  if (mode === "calendar" || mode === "all") sheets.push({ name: "Eventos", rows: eventRows });

  const contentOverrides = sheets
    .map((sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  const workbookSheets = sheets
    .map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const workbookRelationships = sheets
    .map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join("");
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentOverrides}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}</Relationships>`,
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet.rows);
  });
  return createWorkbook(files);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openExcelModal(action) {
  excelAction = action;
  els.excelModalTitle.textContent = action === "export" ? "Exportar Excel" : action === "import" ? "Importar Excel" : "Descargar plantilla";
  els.excelModal.hidden = false;
}

function closeExcelModal() {
  els.excelModal.hidden = true;
}

function filenameForMode(mode, prefix) {
  const suffix = mode === "inventory" ? "inventario" : mode === "calendar" ? "calendario" : "completo";
  return `${prefix}-${suffix}-${dateKey(new Date())}.xlsx`;
}

els.excelModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeModal !== undefined) {
    closeExcelModal();
    return;
  }
  const mode = event.target.closest("[data-excel-choice]")?.dataset.excelChoice;
  if (!mode) return;
  closeExcelModal();
  if (excelAction === "export") {
    download(workbookBlob(state.microphones, state.events, mode), filenameForMode(mode, "congress-sonido"));
    return;
  }
  if (excelAction === "template") {
    download(workbookBlob([], [], mode), filenameForMode(mode, "plantilla-congress-sonido"));
    return;
  }
  importMode = mode;
  els.importFile.click();
});

$("exportBtn").addEventListener("click", () => {
  openExcelModal("export");
});

$("downloadTemplateBtn").addEventListener("click", () => {
  openExcelModal("template");
});

$("importBtn").addEventListener("click", () => {
  openExcelModal("import");
});

els.importFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const workbook = await readWorkbook(file);
    importWorkbook(workbook, importMode);
    save();
    renderAll();
    showToast("Excel importado");
  } catch (error) {
    console.error(error);
    showToast("No se pudo importar el Excel");
  } finally {
    event.target.value = "";
  }
});

async function readWorkbook(file) {
  const entries = await unzip(await file.arrayBuffer());
  const sheetNames = parseWorkbook(entries["xl/workbook.xml"]);
  const sharedStrings = parseSharedStrings(entries["xl/sharedStrings.xml"]);
  const result = {};
  sheetNames.forEach((name, index) => {
    const xml = entries[`xl/worksheets/sheet${index + 1}.xml`];
    if (xml) result[name] = parseSheet(xml, sharedStrings);
  });
  return result;
}

async function unzip(buffer) {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries = {};
  for (let i = 0; i < view.byteLength - 4; i += 1) {
    if (view.getUint32(i, true) !== 0x04034b50) continue;
    const method = view.getUint16(i + 8, true);
    const compressedSize = view.getUint32(i + 18, true);
    const uncompressedSize = view.getUint32(i + 22, true);
    const nameLength = view.getUint16(i + 26, true);
    const extraLength = view.getUint16(i + 28, true);
    const name = decoder.decode(new Uint8Array(buffer, i + 30, nameLength));
    const dataStart = i + 30 + nameLength + extraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8 && "DecompressionStream" in window) {
      data = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
    } else {
      throw new Error(`Metodo ZIP no soportado (${method})`);
    }
    entries[name] = decoder.decode(new Uint8Array(data, 0, uncompressedSize || data.byteLength));
    i = dataStart + compressedSize - 1;
  }
  return entries;
}

function parseWorkbook(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("sheet")].map((sheet) => sheet.getAttribute("name"));
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("si")].map((item) => [...item.querySelectorAll("t")].map((text) => text.textContent).join(""));
}

function parseSheet(xml, sharedStrings = []) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("row")].map((row) => {
    const values = [];
    [...row.querySelectorAll("c")].forEach((cell) => {
      const ref = cell.getAttribute("r") || "";
      const col = ref ? columnIndex(ref.replace(/[0-9]/g, "")) - 1 : values.length;
      const inline = cell.querySelector("is t");
      const value = cell.querySelector("v");
      if (inline) values[col] = inline.textContent;
      else if (cell.getAttribute("t") === "s") values[col] = sharedStrings[Number(value?.textContent || 0)] || "";
      else values[col] = value?.textContent || "";
    });
    return values;
  });
}

function columnIndex(name) {
  return name.split("").reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);
}

function normalizeImportedDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Number(raw) * 86400000).toISOString().slice(0, 10);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function importWorkbook(workbook, mode = "all") {
  const micRows = workbook.Microfonos || workbook.microfonos || [];
  const eventRows = workbook.Eventos || workbook.eventos || [];
  const micLookup = buildMicLookup();

  if ((mode === "inventory" || mode === "all") && micRows.length) {
    micRows.slice(1).forEach((row) => {
      const [first, second, third, fourth, fifth, sixth] = row;
      const isVeryOldTemplate = micRows[0]?.[1] === "Tipo";
      const isOldTemplate = micRows[0]?.[0] === "Codigo";
      const legacyCode = isVeryOldTemplate || isOldTemplate ? first : "";
      const brand = isVeryOldTemplate ? third : isOldTemplate ? second : first;
      const model = isVeryOldTemplate ? fourth : isOldTemplate ? third : second;
      const unitNumber = Number(isVeryOldTemplate || isOldTemplate ? nextUnitNumber(brand, model) : third) || nextUnitNumber(brand, model);
      const serial = isVeryOldTemplate ? fifth : isOldTemplate ? fourth : fourth;
      const active = isVeryOldTemplate ? sixth : isOldTemplate ? fifth : fifth;
      if (!brand || !model) return;
      const label = equipmentLabel({ brand, model, unitNumber });
      const existing = state.microphones.find((mic) => equipmentKey(mic.brand, mic.model) === equipmentKey(brand, model) && Number(mic.unitNumber) === unitNumber);
      if (existing) {
        Object.assign(existing, { brand, model, unitNumber, serial, active: String(active || "SI").toUpperCase() !== "NO" });
        micLookup.set(label.toLowerCase(), existing.id);
        if (legacyCode) micLookup.set(String(legacyCode).toLowerCase(), existing.id);
      } else {
        const mic = { id: uid("mic"), code: legacyCode || label, brand, model, unitNumber, serial, active: String(active || "SI").toUpperCase() !== "NO" };
        state.microphones.push(mic);
        micLookup.set(label.toLowerCase(), mic.id);
        if (legacyCode) micLookup.set(String(legacyCode).toLowerCase(), mic.id);
      }
    });
  }

  if (mode === "inventory" || !eventRows.length) return;

  eventRows.slice(1).forEach((row) => {
    const [id, name, order, location, start, end, seventh, eighth] = row;
    if (!name || !start || !end) return;
    const isOldTemplate = eventRows[0]?.[6] === "Microfonos";
    const micNeed = isOldTemplate ? "" : seventh;
    const micCodes = isOldTemplate ? seventh : eighth;
    const microphoneIds = String(micCodes || "")
      .split(",")
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean)
      .map((code) => micLookup.get(code) || createPlaceholderMicrophone(code, micLookup))
      .filter(Boolean);
    const event = { id: id || uid("evt"), name, order, location, start: normalizeImportedDate(start), end: normalizeImportedDate(end), micNeed, microphoneIds };
    const index = state.events.findIndex((item) => item.id === event.id);
    if (index >= 0) state.events[index] = event;
    else state.events.push(event);
  });
}

function buildMicLookup() {
  const lookup = new Map();
  state.microphones.forEach((mic) => {
    lookup.set(equipmentLabel(mic).toLowerCase(), mic.id);
    if (mic.code) lookup.set(String(mic.code).toLowerCase(), mic.id);
  });
  return lookup;
}

function createPlaceholderMicrophone(label, lookup) {
  const parsed = parseEquipmentLabel(label);
  if (!parsed) return "";
  const existing = state.microphones.find(
    (mic) => equipmentKey(mic.brand, mic.model) === equipmentKey(parsed.brand, parsed.model) && Number(mic.unitNumber) === Number(parsed.unitNumber),
  );
  if (existing) {
    lookup.set(label.toLowerCase(), existing.id);
    return existing.id;
  }
  const mic = {
    id: uid("mic"),
    code: label,
    brand: parsed.brand,
    model: parsed.model,
    unitNumber: parsed.unitNumber,
    serial: "",
    active: true,
  };
  state.microphones.push(mic);
  lookup.set(label.toLowerCase(), mic.id);
  lookup.set(equipmentLabel(mic).toLowerCase(), mic.id);
  return mic.id;
}

function parseEquipmentLabel(label) {
  const match = String(label || "").trim().match(/^(.+)\s+#(\d+)$/);
  if (!match) return null;
  const name = match[1].trim();
  const [brand, ...modelParts] = name.split(/\s+/);
  return {
    brand: brand || "Sin marca",
    model: modelParts.join(" ") || "Sin modelo",
    unitNumber: Number(match[2]) || 1,
  };
}

function makeCrcTable() {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();
function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

load();
renderAll();
