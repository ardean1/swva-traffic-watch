/* SWVA Traffic Watch — vanilla JS + Leaflet + hls.js */
(function () {
  "use strict";

  var MARION = { lat: 36.8344, lon: -81.5148 };
  var CAMS_URL = "https://511.vdot.virginia.gov/services/map/layers/map/cams";
  var PROXY_URL = "/proxy/cams";
  var STORAGE_KEY = "swvaTrafficWatch.gridSlots.v1";
  var RECENT_KEY = "swvaTrafficWatch.recent.v1";
  var SNAPSHOT_MS = 6500;
  var BBOX = { west: -82.85, east: -79.7, south: 36.35, north: 37.65 };

  /* Nearest town/city for SWVA (approx centers). Offline — no geocode API. */
  var TOWNS = [
    { name: "Marion", lat: 36.8344, lon: -81.5148 },
    { name: "Chilhowie", lat: 36.7982, lon: -81.6821 },
    { name: "Saltville", lat: 36.8815, lon: -81.7621 },
    { name: "Abingdon", lat: 36.7098, lon: -81.9773 },
    { name: "Bristol", lat: 36.5951, lon: -82.1887 },
    { name: "Wytheville", lat: 36.9485, lon: -81.0848 },
    { name: "Rural Retreat", lat: 36.8937, lon: -81.2762 },
    { name: "Pulaski", lat: 37.0476, lon: -80.7798 },
    { name: "Radford", lat: 37.1318, lon: -80.5764 },
    { name: "Christiansburg", lat: 37.1299, lon: -80.4089 },
    { name: "Blacksburg", lat: 37.2296, lon: -80.4139 },
    { name: "Dublin", lat: 37.1057, lon: -80.6851 },
    { name: "Pearisburg", lat: 37.3265, lon: -80.7351 },
    { name: "Narrows", lat: 37.3315, lon: -80.8115 },
    { name: "Roanoke", lat: 37.2710, lon: -79.9414 },
    { name: "Salem", lat: 37.2935, lon: -80.0548 },
    { name: "Vinton", lat: 37.2807, lon: -79.8967 },
    { name: "Troutville", lat: 37.4149, lon: -79.8762 },
    { name: "Buchanan", lat: 37.5271, lon: -79.6798 },
    { name: "Lexington", lat: 37.7840, lon: -79.4428 },
    { name: "Natural Bridge", lat: 37.6293, lon: -79.5431 },
    { name: "Galax", lat: 36.6612, lon: -80.9239 },
    { name: "Hillsville", lat: 36.7637, lon: -80.7367 },
    { name: "Fancy Gap", lat: 36.6726, lon: -80.6920 },
    { name: "Independence", lat: 36.6223, lon: -81.1509 },
    { name: "Tazewell", lat: 37.1146, lon: -81.5196 },
    { name: "Bluefield", lat: 37.2698, lon: -81.2223 },
    { name: "Richlands", lat: 37.0932, lon: -81.7937 },
    { name: "Lebanon", lat: 36.9009, lon: -82.0801 },
    { name: "Gate City", lat: 36.6379, lon: -82.5810 },
    { name: "Norton", lat: 36.9334, lon: -82.6290 },
    { name: "Big Stone Gap", lat: 36.8662, lon: -82.7743 },
    { name: "Wise", lat: 36.9759, lon: -82.5768 },
    { name: "Clintwood", lat: 37.1501, lon: -82.4571 },
    { name: "Grundy", lat: 37.2779, lon: -82.0990 },
    { name: "Rocky Mount", lat: 36.9976, lon: -79.8919 },
    { name: "Martinsville", lat: 36.6915, lon: -79.8725 },
    { name: "Stuart", lat: 36.6432, lon: -80.2695 },
    { name: "Floyd", lat: 36.9112, lon: -80.3201 },
    { name: "Bedford", lat: 37.3343, lon: -79.5231 },
    { name: "Lynchburg", lat: 37.4138, lon: -79.1422 },
    { name: "Draper", lat: 37.0029, lon: -80.7459 },
    { name: "Max Meadows", lat: 36.9707, lon: -80.9548 },
    { name: "Atkins", lat: 36.8673, lon: -81.4234 },
    { name: "Seven Mile Ford", lat: 36.8090, lon: -81.6282 },
    { name: "Glade Spring", lat: 36.7912, lon: -81.7712 },
    { name: "Damascus", lat: 36.6337, lon: -81.7837 },
    { name: "Troutdale", lat: 36.7012, lon: -81.4398 },
    { name: "Sugar Grove", lat: 36.7754, lon: -81.4084 }
  ];


  var cameras = [];
  var byId = {};
  var filtered = [];
  var map, markersLayer;
  var markerById = {};
  var selectedId = null;
  var gridSlots = [null, null, null, null];
  var pickSlot = null;
  var singlePlayer = null;
  var gridPlayers = [null, null, null, null];
  var presetsBuilt = [];

  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $("status");
  var listEl = $("cam-list");
  var routeEl = $("route");
  var qEl = $("q");
  var sortEl = $("sort");
  var townEl = $("town");

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function inBbox(lon, lat) {
    return lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;
  }

  function isSwva(props, lon, lat) {
    var j = String(props.jurisdiction || "");
    if (j === "Salem") return true;
    if (lon != null && lat != null && inBbox(lon, lat)) return true;
    return false;
  }

  function parseFeature(f) {
    var p = f.properties || {};
    var g = f.geometry || {};
    var c = g.coordinates || [];
    var lon = c[0], lat = c[1];
    if (lon == null || lat == null) return null;
    if (!isSwva(p, lon, lat)) return null;
    var id = String(p.id != null ? p.id : p.guid || p.name || "");
    if (!id) return null;
    var mrmRaw = p.mrm;
    var mrm = (mrmRaw != null && mrmRaw !== "" && Number(mrmRaw) > 0) ? Number(mrmRaw) : null;
    return {
      id: id,
      name: String(p.name || id),
      description: String(p.description || p.name || "Camera"),
      route: String(p.route || ""),
      direction: String(p.direction || ""),
      jurisdiction: String(p.jurisdiction || ""),
      mrm: mrm,
      lon: lon,
      lat: lat,
      image_url: p.image_url || "",
      https_url: p.https_url || "",
      ios_url: p.ios_url || "",
      active: p.active !== false
    };
  }

  function dist2(a, b) {
    var dlat = a.lat - b.lat;
    var dlon = a.lon - b.lon;
    return dlat * dlat + dlon * dlon;
  }

  function nearestTown(lat, lon) {
    var best = TOWNS[0];
    var bestD = Infinity;
    for (var i = 0; i < TOWNS.length; i++) {
      var t = TOWNS[i];
      var d = dist2({ lat: lat, lon: lon }, t);
      if (d < bestD) { bestD = d; best = t; }
    }
    return { name: best.name, dist2: bestD, lat: best.lat, lon: best.lon };
  }

  function assignTowns(list) {
    list.forEach(function (c) {
      var n = nearestTown(c.lat, c.lon);
      c.town = n.name;
      c.townDist2 = n.dist2;
    });
  }


  function label(cam) {
    var pin = mapPinText(cam);
    var bits = [];
    if (cam.town) bits.push(cam.town);
    if (cam.route) bits.push(cam.route);
    if (cam.direction) bits.push(cam.direction);
    var detail = bits.join(" · ");
    if (cam.description && cam.description !== pin) {
      detail = detail ? detail + " — " + cam.description : cam.description;
    }
    return { title: pin, detail: detail || cam.jurisdiction || "" };
  }

  /** Short highway number for map pins: I-81 → 81, US-11 → 11, VA-107 → 107 */
  function hwyNumber(route) {
    var s = String(route || "");
    var m = s.match(/\b(?:I|US|VA|SR)[- ]?(\d+)\b/i);
    if (m) return m[1];
    m = s.match(/\b(\d{1,3})\b/);
    return m ? m[1] : "";
  }

  function mileFromCam(cam) {
    if (cam.mrm != null && Number(cam.mrm) > 0) {
      var n = Number(cam.mrm);
      return (Math.round(n * 10) / 10).toString();
    }
    var d = String(cam.description || "");
    var m = d.match(/\bMM\s*([0-9]+(?:\.[0-9]+)?)/i);
    return m ? m[1] : "";
  }

  /** Highway/MM piece without town */
  function hwyPinPart(cam) {
    var hwy = hwyNumber(cam.route) || hwyNumber(cam.description);
    var mm = mileFromCam(cam);
    var dir = String(cam.direction || "").trim().toUpperCase();
    if (hwy && mm) {
      var t = hwy + " MM " + mm;
      if (dir && dir.length <= 3) t += " " + dir;
      return t;
    }
    if (hwy) return hwy + (dir ? " " + dir : "");
    var r = String(cam.route || "").trim();
    if (r) return r.length > 14 ? r.slice(0, 14) : r;
    return "";
  }

  /** Map pin: town first, then highway/MM — e.g. "Marion · 81 MM 45.8 NB" */
  function mapPinText(cam) {
    var town = String(cam.town || "").trim();
    var hwy = hwyPinPart(cam);
    if (town && hwy) return town + " · " + hwy;
    if (town) return town;
    if (hwy) return hwy;
    return "cam";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadSlots() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length === 4) {
        gridSlots = arr.map(function (x) { return x ? String(x) : null; });
      }
    } catch (e) {}
  }

  function saveSlots() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(gridSlots)); } catch (e) {}
  }

  function pushRecent(id) {
    try {
      var arr = [];
      var raw = localStorage.getItem(RECENT_KEY);
      if (raw) arr = JSON.parse(raw) || [];
      arr = arr.filter(function (x) { return x !== id; });
      arr.unshift(id);
      if (arr.length > 12) arr = arr.slice(0, 12);
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function getRecentIds() {
    try {
      var raw = localStorage.getItem(RECENT_KEY);
      return raw ? (JSON.parse(raw) || []) : [];
    } catch (e) { return []; }
  }

  async function fetchCams() {
    setStatus("Loading cameras…");
    var urls = [PROXY_URL, CAMS_URL];
    var lastErr = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var data = await res.json();
        var feats = data.features || [];
        var out = [];
        byId = {};
        for (var j = 0; j < feats.length; j++) {
          var cam = parseFeature(feats[j]);
          if (!cam) continue;
          out.push(cam);
          byId[cam.id] = cam;
        }
        cameras = out;
        var src = urls[i] === PROXY_URL ? "proxy" : "direct";
        setStatus(cameras.length + " SWVA cameras · " + src + " · " + new Date().toLocaleTimeString(), "ok");
        return true;
      } catch (err) {
        lastErr = err;
      }
    }
    setStatus("Could not load cameras" + (lastErr ? " (" + lastErr.message + ")" : "") + ". Is start.bat / serve.py running?", "err");
    return false;
  }

  function buildPresets() {
    var near = cameras.slice().sort(function (a, b) {
      return dist2(a, MARION) - dist2(b, MARION);
    }).slice(0, 4);

    function corridor(routeNeedle, center) {
      var list = cameras.filter(function (c) {
        return (c.route || "").toUpperCase().indexOf(routeNeedle) >= 0;
      });
      if (center) {
        list.sort(function (a, b) { return dist2(a, center) - dist2(b, center); });
      } else {
        list.sort(function (a, b) { return (a.description || "").localeCompare(b.description || ""); });
      }
      return list.slice(0, 4);
    }

    var i81 = corridor("I-81", MARION);
    var i77 = corridor("I-77", { lat: 36.9, lon: -81.0 });

    var recentIds = getRecentIds();
    var recent = [];
    for (var i = 0; i < recentIds.length && recent.length < 4; i++) {
      if (byId[recentIds[i]]) recent.push(byId[recentIds[i]]);
    }

    presetsBuilt = [
      { id: "near", label: "Near Marion", cams: near },
      { id: "i81", label: "I-81 corridor", cams: i81 },
      { id: "i77", label: "I-77 corridor", cams: i77 }
    ];
    if (recent.length) {
      presetsBuilt.push({ id: "recent", label: "Recent", cams: recent });
    }

    renderPresetButtons($("presets"), false);
    renderPresetButtons($("grid-presets"), true);
  }

  function renderPresetButtons(host, forGrid) {
    host.innerHTML = "";
    presetsBuilt.forEach(function (p) {
      if (!p.cams.length) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = p.label;
      b.addEventListener("click", function () {
        if (forGrid) {
          applyPresetToGrid(p.cams);
        } else {
          applyPresetToList(p);
        }
      });
      host.appendChild(b);
    });
  }

  function applyPresetToList(p) {
    if (p.id === "i81") {
      routeEl.value = findRouteOption("I-81");
      qEl.value = "";
    } else if (p.id === "i77") {
      routeEl.value = findRouteOption("I-77");
      qEl.value = "";
    } else {
      routeEl.value = "";
      qEl.value = "";
    }
    applyFilters();
    if (p.cams[0]) {
      focusCamera(p.cams[0].id, true);
      if (map && p.cams.length) {
        var g = L.latLngBounds(p.cams.map(function (c) { return [c.lat, c.lon]; }));
        map.fitBounds(g.pad(0.2));
      }
    }
  }

  function findRouteOption(needle) {
    var opts = routeEl.options;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value.toUpperCase().indexOf(needle) === 0) return opts[i].value;
    }
    return needle;
  }

  function applyPresetToGrid(cams) {
    for (var i = 0; i < 4; i++) {
      gridSlots[i] = cams[i] ? cams[i].id : null;
    }
    saveSlots();
    renderGrid();
  }


  function fillTowns() {
    if (!townEl) return;
    var set = {};
    cameras.forEach(function (c) { if (c.town) set[c.town] = true; });
    var towns = Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
    var cur = townEl.value;
    townEl.innerHTML = '<option value="">All towns</option>';
    towns.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      townEl.appendChild(o);
    });
    if (cur) townEl.value = cur;
  }

  function fillRoutes() {
    var set = {};
    cameras.forEach(function (c) {
      if (c.route) set[c.route] = true;
    });
    var routes = Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true });
    });
    var cur = routeEl.value;
    routeEl.innerHTML = '<option value="">All routes</option>';
    routes.forEach(function (r) {
      var o = document.createElement("option");
      o.value = r;
      o.textContent = r;
      routeEl.appendChild(o);
    });
    if (cur) routeEl.value = cur;
  }

  function applyFilters() {
    var q = (qEl.value || "").trim().toLowerCase();
    var route = routeEl.value || "";
    var town = townEl ? (townEl.value || "") : "";
    var sortMode = sortEl ? (sortEl.value || "town") : "town";
    filtered = cameras.filter(function (c) {
      if (route && c.route !== route) return false;
      if (town && c.town !== town) return false;
      if (!q) return true;
      var hay = (c.description + " " + c.name + " " + c.route + " " + c.direction + " " + c.jurisdiction + " " + (c.town || "") + " " + mapPinText(c)).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    filtered.sort(function (a, b) {
      if (sortMode === "route") {
        var ra = (a.route || "") + " " + (a.description || "");
        var rb = (b.route || "") + " " + (b.description || "");
        return ra.localeCompare(rb, undefined, { numeric: true });
      }
      if (sortMode === "marion") {
        var da = dist2(a, MARION);
        var db = dist2(b, MARION);
        if (da !== db) return da - db;
      } else {
        /* nearest town: group by town name, then by distance to that town, then MM */
        var ta = a.town || "zzz";
        var tb = b.town || "zzz";
        if (ta !== tb) return ta.localeCompare(tb);
        if ((a.townDist2 || 0) !== (b.townDist2 || 0)) return (a.townDist2 || 0) - (b.townDist2 || 0);
      }
      var ma = Number(a.mrm) || 0;
      var mb = Number(b.mrm) || 0;
      if (ma !== mb) return ma - mb;
      return (a.description || "").localeCompare(b.description || "");
    });
    renderList();
    renderMarkers();
  }

  function renderList() {
    listEl.innerHTML = "";
    var frag = document.createDocumentFragment();
    filtered.forEach(function (c) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cam-item" + (c.id === selectedId ? " active" : "");
      btn.dataset.id = c.id;
      var Lbl = label(c);
      btn.innerHTML = '<span class="t"></span><span class="d"></span>';
      btn.querySelector(".t").textContent = Lbl.title;
      btn.querySelector(".d").textContent = Lbl.detail;
      btn.addEventListener("click", function () {
        openViewer(c.id);
      });
      li.appendChild(btn);
      frag.appendChild(li);
    });
    listEl.appendChild(frag);
  }

  var PIN_BOX = 260; /* px — room for callout label around the camera */
  var PIN_MID = PIN_BOX / 2;
  var labelLayoutTimer = null;

  function estimateLabelSize(text) {
    var w = Math.min(200, Math.max(56, Math.round(String(text).length * 6.6 + 14)));
    return { w: w, h: 18 };
  }

  function labelCandidates(w, h) {
    /* Prefer right of pin, then alternate up/down/left/farther */
    return [
      { ox: 16, oy: -9 },
      { ox: 16, oy: 10 },
      { ox: 16, oy: -28 },
      { ox: 16, oy: 28 },
      { ox: 16, oy: -46 },
      { ox: 16, oy: 46 },
      { ox: -w - 16, oy: -9 },
      { ox: -w - 16, oy: 10 },
      { ox: -w - 16, oy: -28 },
      { ox: -w - 16, oy: 28 },
      { ox: 36, oy: -9 },
      { ox: 36, oy: 10 },
      { ox: 52, oy: -28 },
      { ox: 52, oy: 28 },
      { ox: -w - 36, oy: -9 },
      { ox: -w - 52, oy: 10 },
      { ox: 16, oy: -64 },
      { ox: 16, oy: 64 },
      { ox: 70, oy: -9 },
      { ox: 70, oy: 24 }
    ];
  }

  function boxesOverlap(a, b, pad) {
    pad = pad == null ? 3 : pad;
    return !(
      a.x + a.w + pad <= b.x ||
      b.x + b.w + pad <= a.x ||
      a.y + a.h + pad <= b.y ||
      b.y + b.h + pad <= a.y
    );
  }

  function renderMarkers() {
    if (!markersLayer) return;
    markersLayer.clearLayers();
    markerById = {};
    filtered.forEach(function (c) {
      var pin = mapPinText(c);
      var active = c.id === selectedId ? " active" : "";
      var icon = L.divIcon({
        className: "cam-marker-wrap",
        html:
          '<div class="cam-marker-root' + active + '" data-cam-id="' + escapeHtml(c.id) + '" title="' + escapeHtml(c.description) + '">' +
            '<svg class="cam-leader" width="' + PIN_BOX + '" height="' + PIN_BOX + '" aria-hidden="true">' +
              '<line class="cam-leader-line" x1="' + PIN_MID + '" y1="' + PIN_MID + '" x2="' + (PIN_MID + 16) + '" y2="' + (PIN_MID - 9) + '"></line>' +
            '</svg>' +
            '<span class="cam-dot"></span>' +
            '<span class="cam-pin-label">' + escapeHtml(pin) + '</span>' +
          '</div>',
        iconSize: [PIN_BOX, PIN_BOX],
        iconAnchor: [PIN_MID, PIN_MID]
      });
      var m = L.marker([c.lat, c.lon], {
        icon: icon,
        title: c.description + " · " + pin,
        keyboard: false,
        riseOnHover: true
      });
      m.on("click", function () { openViewer(c.id); });
      m.addTo(markersLayer);
      markerById[c.id] = m;
    });
    scheduleLabelLayout();
  }

  function scheduleLabelLayout() {
    if (labelLayoutTimer) clearTimeout(labelLayoutTimer);
    labelLayoutTimer = setTimeout(layoutPinLabels, 40);
  }

  function layoutPinLabels() {
    if (!map || !markersLayer) return;
    var z = map.getZoom();
    var showLabels = z >= 10;
    var maxLabels = z >= 12 ? 80 : (z >= 11 ? 50 : 28);
    var placed = [];
    var items = [];

    filtered.forEach(function (c) {
      var m = markerById[c.id];
      if (!m || !map.getBounds().pad(0.02).contains([c.lat, c.lon])) return;
      var pt = map.latLngToContainerPoint([c.lat, c.lon]);
      items.push({
        id: c.id,
        m: m,
        pt: pt,
        pin: mapPinText(c),
        dMarion: dist2(c, MARION)
      });
    });

    /* Prefer labeling cams near Marion / center of view when capped */
    var center = map.getCenter();
    items.sort(function (a, b) {
      var da = (a.pt.x - map.latLngToContainerPoint(center).x) * (a.pt.x - map.latLngToContainerPoint(center).x) +
               (a.pt.y - map.latLngToContainerPoint(center).y) * (a.pt.y - map.latLngToContainerPoint(center).y);
      var db = (b.pt.x - map.latLngToContainerPoint(center).x) * (b.pt.x - map.latLngToContainerPoint(center).x) +
               (b.pt.y - map.latLngToContainerPoint(center).y) * (b.pt.y - map.latLngToContainerPoint(center).y);
      return da - db;
    });

    var labeled = 0;
    items.forEach(function (item) {
      var el = item.m.getElement();
      if (!el) return;
      var root = el.querySelector(".cam-marker-root") || el;
      var label = root.querySelector(".cam-pin-label");
      var line = root.querySelector(".cam-leader-line");
      var svg = root.querySelector(".cam-leader");
      if (!label) return;

      if (!showLabels || labeled >= maxLabels) {
        label.style.visibility = "hidden";
        if (svg) svg.style.visibility = "hidden";
        return;
      }

      var size = estimateLabelSize(item.pin);
      var cands = labelCandidates(size.w, size.h);
      var chosen = null;
      for (var i = 0; i < cands.length; i++) {
        var cand = cands[i];
        var box = {
          x: item.pt.x + cand.ox,
          y: item.pt.y + cand.oy,
          w: size.w,
          h: size.h
        };
        var hit = false;
        for (var j = 0; j < placed.length; j++) {
          if (boxesOverlap(box, placed[j])) { hit = true; break; }
        }
        /* also keep clear of other camera dots */
        for (var k = 0; k < items.length; k++) {
          if (items[k].id === item.id) continue;
          var dotBox = { x: items[k].pt.x - 8, y: items[k].pt.y - 8, w: 16, h: 16 };
          if (boxesOverlap(box, dotBox, 2)) { hit = true; break; }
        }
        if (!hit) { chosen = cand; placed.push(box); break; }
      }
      if (!chosen) {
        /* last resort: stack farther right with vertical nudge by index */
        var fall = { ox: 20, oy: -9 + (labeled % 7) * 12 };
        chosen = fall;
        placed.push({
          x: item.pt.x + fall.ox,
          y: item.pt.y + fall.oy,
          w: size.w,
          h: size.h
        });
      }

      label.style.visibility = "visible";
      label.style.left = (PIN_MID + chosen.ox) + "px";
      label.style.top = (PIN_MID + chosen.oy) + "px";
      if (svg) svg.style.visibility = "visible";
      if (line) {
        /* line to mid-left or mid-right of label */
        var lx = PIN_MID + chosen.ox + (chosen.ox >= 0 ? 0 : size.w);
        var ly = PIN_MID + chosen.oy + size.h / 2;
        line.setAttribute("x1", String(PIN_MID));
        line.setAttribute("y1", String(PIN_MID));
        line.setAttribute("x2", String(lx));
        line.setAttribute("y2", String(ly));
      }
      labeled += 1;
    });
  }

  function focusCamera(id, pan) {
    selectedId = id;
    renderList();
    renderMarkers();
    if (pan && map && byId[id]) {
      map.setView([byId[id].lat, byId[id].lon], Math.max(map.getZoom(), 11));
    }
  }

  function initMap() {
    map = L.map("map", { zoomControl: true, attributionControl: true }).setView([MARION.lat, MARION.lon], 10);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Esri",
      maxZoom: 16
    }).addTo(map);
    L.circleMarker([MARION.lat, MARION.lon], {
      radius: 6,
      color: "#6dffb0",
      fillColor: "#6dffb0",
      fillOpacity: 0.9,
      weight: 2
    }).addTo(map).bindTooltip("Marion, VA", { permanent: false });
    markersLayer = L.layerGroup().addTo(map);
    map.on("zoomend moveend", scheduleLabelLayout);
    map.on("zoomstart movestart", function () {
      /* hide labels while moving for less flicker */
      Object.keys(markerById).forEach(function (id) {
        var m = markerById[id];
        var el = m && m.getElement();
        if (!el) return;
        var label = el.querySelector(".cam-pin-label");
        var svg = el.querySelector(".cam-leader");
        if (label) label.style.visibility = "hidden";
        if (svg) svg.style.visibility = "hidden";
      });
    });
    setTimeout(function () { map.invalidateSize(); scheduleLabelLayout(); }, 100);
  }

  /* ---------- HLS / snapshot players ---------- */

  function stopPlayer(p) {
    if (!p) return;
    try {
      if (p.timer) clearInterval(p.timer);
      if (p.hls) { p.hls.destroy(); }
      if (p.video) {
        p.video.removeAttribute("src");
        p.video.load();
        p.video.style.display = "none";
      }
      if (p.img) {
        p.img.removeAttribute("src");
        p.img.hidden = true;
      }
    } catch (e) {}
  }

  function startPlayer(cam, video, img, hintEl) {
    var state = { hls: null, timer: null, video: video, img: img };
    video.style.display = "block";
    img.hidden = true;
    if (hintEl) {
      hintEl.classList.add("hidden");
      hintEl.textContent = "";
    }

    function useSnapshot(reason) {
      stopPlayer(state);
      state.video = video;
      state.img = img;
      video.style.display = "none";
      img.hidden = false;
      if (hintEl) {
        hintEl.textContent = reason || "Snapshot mode (refreshing)";
        hintEl.classList.remove("hidden");
      }
      function tick() {
        if (!cam.image_url) return;
        img.src = cam.image_url + (cam.image_url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
      }
      tick();
      state.timer = setInterval(tick, SNAPSHOT_MS);
      return state;
    }

    if (!cam.https_url) {
      return useSnapshot("No live stream — snapshot");
    }

    if (window.Hls && Hls.isSupported()) {
      var hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      state.hls = hls;
      hls.loadSource(cam.https_url);
      hls.attachMedia(video);
      var failed = false;
      hls.on(Hls.Events.ERROR, function (_e, data) {
        if (!data.fatal || failed) return;
        failed = true;
        useSnapshot("Live stream unavailable — snapshot");
      });
      video.play().catch(function () {});
      return state;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = cam.https_url || cam.ios_url || "";
      video.addEventListener("error", function onErr() {
        video.removeEventListener("error", onErr);
        useSnapshot("Live stream unavailable — snapshot");
      });
      video.play().catch(function () {});
      return state;
    }

    return useSnapshot("HLS not supported — snapshot");
  }

  /* ---------- Single viewer ---------- */

  function openViewer(id) {
    var cam = byId[id];
    if (!cam) return;
    pushRecent(id);
    focusCamera(id, true);
    $("viewer").classList.remove("hidden");
    $("viewer").setAttribute("aria-hidden", "false");
    $("viewer-title").textContent = cam.description || cam.name;
    var Lbl = label(cam);
    $("viewer-meta").textContent = [Lbl.detail, cam.jurisdiction].filter(Boolean).join(" · ");
    stopPlayer(singlePlayer);
    singlePlayer = startPlayer(cam, $("viewer-video"), $("viewer-img"), $("viewer-hint"));
  }

  function closeViewer() {
    stopPlayer(singlePlayer);
    singlePlayer = null;
    $("viewer").classList.add("hidden");
    $("viewer").setAttribute("aria-hidden", "true");
    exitFs();
  }

  /* ---------- Grid ---------- */

  function openGrid() {
    $("grid").classList.remove("hidden");
    $("grid").setAttribute("aria-hidden", "false");
    renderGrid();
  }

  function closeGrid() {
    for (var i = 0; i < 4; i++) {
      stopPlayer(gridPlayers[i]);
      gridPlayers[i] = null;
    }
    $("grid").classList.add("hidden");
    $("grid").setAttribute("aria-hidden", "true");
    closePicker();
    exitFs();
  }

  function renderGrid() {
    for (var i = 0; i < 4; i++) {
      var body = document.querySelector('[data-body="' + i + '"]');
      stopPlayer(gridPlayers[i]);
      gridPlayers[i] = null;
      body.innerHTML = "";
      var id = gridSlots[i];
      var cam = id ? byId[id] : null;
      if (!cam) {
        var pick = document.createElement("button");
        pick.type = "button";
        pick.className = "slot-pick";
        pick.textContent = "Pick camera";
        pick.dataset.pick = String(i);
        pick.addEventListener("click", function (ev) {
          openPicker(Number(ev.currentTarget.dataset.pick));
        });
        body.appendChild(pick);
        continue;
      }
      var video = document.createElement("video");
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      var img = document.createElement("img");
      img.alt = cam.description;
      img.hidden = true;
      var cap = document.createElement("div");
      cap.className = "slot-cap";
      cap.textContent = cam.description;
      body.appendChild(video);
      body.appendChild(img);
      body.appendChild(cap);
      body.addEventListener("click", (function (camId) {
        return function () { openViewer(camId); };
      })(cam.id));
      gridPlayers[i] = startPlayer(cam, video, img, null);
    }
  }

  function clearSlot(i) {
    gridSlots[i] = null;
    saveSlots();
    renderGrid();
  }

  function matchTownQuery(q) {
    q = String(q || "").trim().toLowerCase();
    if (!q || q.length < 2) return null;
    var exact = null;
    var starts = null;
    var contains = null;
    for (var i = 0; i < TOWNS.length; i++) {
      var name = TOWNS[i].name;
      var low = name.toLowerCase();
      if (low === q) { exact = TOWNS[i]; break; }
      if (!starts && low.indexOf(q) === 0) starts = TOWNS[i];
      if (!contains && low.indexOf(q) >= 0) contains = TOWNS[i];
    }
    return exact || starts || contains;
  }

  function camsNearTown(townObj, limit) {
    limit = limit || 4;
    if (!townObj) return [];
    var list = cameras.slice().map(function (c) {
      return { cam: c, d: dist2(c, townObj) };
    });
    list.sort(function (a, b) { return a.d - b.d; });
    var out = [];
    for (var i = 0; i < list.length && out.length < limit; i++) {
      out.push(list[i].cam);
    }
    return out;
  }

  function fillGridFromTown(townObj) {
    var near = camsNearTown(townObj, 4);
    applyPresetToGrid(near);
    closePicker();
    openGrid();
    setStatus("4 cameras near " + townObj.name + " (" + near.length + " loaded)", "ok");
  }

  function openPicker(slot) {
    pickSlot = slot;
    $("picker").classList.remove("hidden");
    $("picker").setAttribute("aria-hidden", "false");
    $("picker-title").textContent = slot == null ? "Town → 4 cameras" : ("Pick for slot " + (slot + 1));
    $("picker-q").value = "";
    $("picker-q").placeholder = "Type a town: Marion, Chilhowie, Bristol…";
    renderPickerList();
    $("picker-q").focus();
  }

  function closePicker() {
    pickSlot = null;
    $("picker").classList.add("hidden");
    $("picker").setAttribute("aria-hidden", "true");
  }

  function renderPickerList() {
    var q = ($("picker-q").value || "").trim().toLowerCase();
    var host = $("picker-list");
    host.innerHTML = "";
    var townHit = matchTownQuery(q);
    var fillHost = $("picker-fill");
    if (fillHost) {
      fillHost.innerHTML = "";
      if (townHit) {
        var near4 = camsNearTown(townHit, 4);
        var fillBtn = document.createElement("button");
        fillBtn.type = "button";
        fillBtn.className = "btn primary fill-town-btn";
        fillBtn.textContent = "Fill 4 cameras near " + townHit.name;
        fillBtn.addEventListener("click", function () { fillGridFromTown(townHit); });
        fillHost.appendChild(fillBtn);
        var hint = document.createElement("p");
        hint.className = "picker-hint";
        hint.textContent = near4.length
          ? ("Nearest: " + near4.map(function (c) { return mapPinText(c); }).join(" · "))
          : "No cameras found near that town.";
        fillHost.appendChild(hint);
      } else if (q.length >= 2) {
        var tip = document.createElement("p");
        tip.className = "picker-hint";
        tip.textContent = "Keep typing a town name (Marion, Chilhowie, Bristol, Wytheville…)";
        fillHost.appendChild(tip);
      } else {
        var tip0 = document.createElement("p");
        tip0.className = "picker-hint";
        tip0.textContent = "Search a town to fill all 4 slots with the nearest cameras.";
        fillHost.appendChild(tip0);
      }
    }

    var list;
    if (townHit) {
      list = camsNearTown(townHit, 80);
    } else {
      list = cameras.filter(function (c) {
        if (!q) return true;
        var hay = (
          (c.town || "") + " " + c.description + " " + c.name + " " +
          c.route + " " + c.direction + " " + mapPinText(c)
        ).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
      list.sort(function (a, b) {
        return dist2(a, MARION) - dist2(b, MARION);
      });
      list = list.slice(0, 200);
    }

    list.forEach(function (c) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cam-item";
      var Lbl = label(c);
      btn.innerHTML = '<span class="t"></span><span class="d"></span>';
      btn.querySelector(".t").textContent = Lbl.title;
      btn.querySelector(".d").textContent = Lbl.detail;
      btn.addEventListener("click", function () {
        if (pickSlot == null) {
          /* town mode from grid bar: single tap still fills? prefer fill-4 button */
          return;
        }
        gridSlots[pickSlot] = c.id;
        saveSlots();
        closePicker();
        renderGrid();
      });
      li.appendChild(btn);
      host.appendChild(li);
    });
  }

  /* ---------- Fullscreen ---------- */

  function fsTarget() {
    if (!$("viewer").classList.contains("hidden")) return $("viewer-stage");
    if (!$("grid").classList.contains("hidden")) return $("grid");
    return null;
  }

  function toggleFs() {
    var t = fsTarget();
    if (!t) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      var req = t.requestFullscreen || t.webkitRequestFullscreen;
      if (req) req.call(t);
    } else {
      exitFs();
    }
  }

  function exitFs() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) ex.call(document);
    }
  }

  /* ---------- Wire UI ---------- */

  function wire() {
    $("btn-refresh").addEventListener("click", function () { reload(); });
    $("btn-grid").addEventListener("click", openGrid);
    if ($("btn-grid-town")) {
      $("btn-grid-town").addEventListener("click", function () {
        openGrid();
        openPicker(null);
      });
    }
    if ($("grid-town-btn")) {
      $("grid-town-btn").addEventListener("click", function () { openPicker(null); });
    }
    qEl.addEventListener("input", applyFilters);
    routeEl.addEventListener("change", applyFilters);
    if (sortEl) sortEl.addEventListener("change", applyFilters);
    if (townEl) townEl.addEventListener("change", applyFilters);
    $("viewer-back").addEventListener("click", closeViewer);
    $("viewer-fs").addEventListener("click", toggleFs);
    $("grid-back").addEventListener("click", closeGrid);
    $("grid-fs").addEventListener("click", toggleFs);
    $("picker-cancel").addEventListener("click", closePicker);
    $("picker-q").addEventListener("input", renderPickerList);

    document.querySelectorAll(".slot-clear").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        clearSlot(Number(btn.dataset.clear));
      });
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        if (!$("picker").classList.contains("hidden")) { closePicker(); return; }
        if (document.fullscreenElement || document.webkitFullscreenElement) { exitFs(); return; }
        if (!$("viewer").classList.contains("hidden")) { closeViewer(); return; }
        if (!$("grid").classList.contains("hidden")) { closeGrid(); return; }
      }
      if (ev.key === "f" || ev.key === "F") {
        var tag = (ev.target && ev.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (!$("viewer").classList.contains("hidden") || !$("grid").classList.contains("hidden")) {
          ev.preventDefault();
          toggleFs();
        }
      }
    });
  }

  async function reload() {
    var ok = await fetchCams();
    if (!ok) return;
    assignTowns(cameras);
    fillTowns();
    fillRoutes();
    buildPresets();
    // Prefer Near Marion view on first useful load
    var near = presetsBuilt.find(function (p) { return p.id === "near"; });
    applyFilters();
    if (near && near.cams.length && map) {
      var g = L.latLngBounds(near.cams.map(function (c) { return [c.lat, c.lon]; }));
      map.fitBounds(g.pad(0.35));
    }
    // Re-resolve saved slots against live data
    gridSlots = gridSlots.map(function (id) { return id && byId[id] ? id : null; });
    saveSlots();
  }

  loadSlots();
  initMap();
  wire();
  reload();
})();
