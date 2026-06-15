(function () {
  const mapNode = document.querySelector("#visited-map");

  if (!mapNode || !window.L || !window.SHINEHOPE_VISITED_CITIES) {
    return;
  }

  const lang = mapNode.dataset.lang === "en" ? "en" : "zh";
  const data = window.SHINEHOPE_VISITED_CITIES.cities || [];
  const photoCities = (window.SHINEHOPE_TRAVEL_PHOTOS && window.SHINEHOPE_TRAVEL_PHOTOS.cities) || {};
  const countNodes = document.querySelectorAll("[data-map-count]");
  const photoCountNodes = document.querySelectorAll("[data-photo-city-count]");

  countNodes.forEach((node) => {
    node.textContent = String(data.length);
  });

  photoCountNodes.forEach((node) => {
    node.textContent = String(Object.keys(photoCities).length);
  });

  const text = {
    zh: {
      city: "城市",
      province: "省级区域",
      days: "记录天数",
      period: "时间范围",
      points: "聚合点数",
      photos: "照片",
      photoHint: "点击照片可打开大图",
      tileCredit: "底图",
      dataCredit: "标记为市级聚合结果"
    },
    en: {
      city: "City",
      province: "Province-level region",
      days: "Recorded days",
      period: "Period",
      points: "Aggregated points",
      photos: "Photos",
      photoHint: "Click a photo to open the larger image",
      tileCredit: "Tiles",
      dataCredit: "Markers are aggregated to city level"
    }
  }[lang];

  const map = L.map(mapNode, {
    zoomControl: true,
    scrollWheelZoom: true,
    worldCopyJump: false
  }).setView([34.6, 108.9], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    minZoom: 3,
    attribution: `${text.tileCredit} &copy; OpenStreetMap contributors | ${text.dataCredit}`
  }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  const markers = [];
  const bounds = [];

  data.forEach((item, index) => {
    const photos = photoCities[item.city] || [];
    const hasPhotos = photos.length > 0;
    const marker = L.circleMarker([item.lat, item.lng], {
      radius: hasPhotos ? 9 : 7,
      color: hasPhotos ? "#ffcf4a" : "#ffffff",
      weight: hasPhotos ? 3 : 1.5,
      fillColor: colorFor(index, data.length),
      fillOpacity: 0.92,
      className: hasPhotos ? "visited-city-marker has-photos" : "visited-city-marker"
    });

    const label = hasPhotos
      ? `${item.city}${lang === "zh" ? " · 有照片" : " · photos"}`
      : item.city;
    marker.bindTooltip(escapeHtml(label), {
      permanent: false,
      direction: "top",
      offset: [0, -8],
      className: hasPhotos ? "city-label has-photos" : "city-label"
    });

    marker.bindPopup(`
      <div class="map-popup">
        <strong>${escapeHtml(item.city)}</strong>
        <span>${text.province}: ${escapeHtml(item.province)}</span>
        <span>${text.days}: ${item.dayCount}</span>
        <span>${text.period}: ${item.firstDate} ~ ${item.lastDate}</span>
        <span>${text.points}: ${item.pointCount}</span>
        ${photoGallery(photos, item.city)}
      </div>
    `);

    marker.addTo(markerLayer);
    markers.push(marker);
    bounds.push([item.lat, item.lng]);
  });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 5 });
  }

  function updateLabels() {
    const showLabels = map.getZoom() >= 5;

    markers.forEach((marker) => {
      if (showLabels) {
        marker.openTooltip();
      } else {
        marker.closeTooltip();
      }
    });
  }

  map.on("zoomend", updateLabels);
  updateLabels();

  function colorFor(index, total) {
    const hue = Math.round((index / Math.max(total, 1)) * 290 + 10);
    return `hsl(${hue} 82% 48%)`;
  }

  function photoGallery(photos, city) {
    if (!photos.length) {
      return "";
    }

    const images = photos.map((photo, photoIndex) => `
      <a href="${escapeHtml(photo.src)}" target="_blank" rel="noopener" aria-label="${escapeHtml(city)} ${text.photos} ${photoIndex + 1}">
        <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt || city)}" loading="lazy" width="${photo.width || 180}" height="${photo.height || 120}">
      </a>
    `).join("");

    return `
      <div class="map-photo-gallery">
        <div class="map-photo-heading">
          <span>${text.photos} (${photos.length})</span>
          <small>${text.photoHint}</small>
        </div>
        <div class="map-photo-strip">${images}</div>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }
})();
