(function () {
  const mapNode = document.querySelector("#visited-map");

  if (!mapNode || !window.L || !window.SHINEHOPE_VISITED_CITIES) {
    return;
  }

  const lang = mapNode.dataset.lang === "en" ? "en" : "zh";
  const data = window.SHINEHOPE_VISITED_CITIES.cities || [];
  const countNodes = document.querySelectorAll("[data-map-count]");

  countNodes.forEach((node) => {
    node.textContent = String(data.length);
  });

  const text = {
    zh: {
      city: "城市",
      province: "省级区域",
      days: "记录天数",
      period: "时间范围",
      points: "聚合点数",
      tileCredit: "底图",
      dataCredit: "标记为市级聚合结果"
    },
    en: {
      city: "City",
      province: "Province-level region",
      days: "Recorded days",
      period: "Period",
      points: "Aggregated points",
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
    const marker = L.circleMarker([item.lat, item.lng], {
      radius: 7,
      color: "#ffffff",
      weight: 1.5,
      fillColor: colorFor(index, data.length),
      fillOpacity: 0.92,
      className: "visited-city-marker"
    });

    const label = lang === "zh" ? item.city : item.city;
    marker.bindTooltip(label, {
      permanent: false,
      direction: "top",
      offset: [0, -8],
      className: "city-label"
    });

    marker.bindPopup(`
      <div class="map-popup">
        <strong>${item.city}</strong>
        <span>${text.province}: ${item.province}</span>
        <span>${text.days}: ${item.dayCount}</span>
        <span>${text.period}: ${item.firstDate} ~ ${item.lastDate}</span>
        <span>${text.points}: ${item.pointCount}</span>
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
})();
