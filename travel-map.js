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
      photos: "照片",
      photoHint: "上下滚动预览，点击查看大图",
      close: "关闭",
      previous: "上一张",
      next: "下一张",
      tileCredit: "底图",
      dataCredit: "标记为市级聚合结果"
    },
    en: {
      city: "City",
      province: "Province-level region",
      photos: "Photos",
      photoHint: "Scroll to preview; click to view larger",
      close: "Close",
      previous: "Previous",
      next: "Next",
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

    marker.bindTooltip(escapeHtml(item.city), {
      permanent: false,
      direction: "top",
      offset: [0, -8],
      className: hasPhotos ? "city-label has-photos" : "city-label"
    });

    marker.bindPopup(`
      <div class="map-popup">
        <strong>${escapeHtml(item.city)}</strong>
        <span>${text.province}: ${escapeHtml(item.province)}</span>
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
  createLightbox();
  document.addEventListener("click", handleGalleryClick);
  document.addEventListener("keydown", handleLightboxKeydown);

  function colorFor(index, total) {
    const hue = Math.round((index / Math.max(total, 1)) * 290 + 10);
    return `hsl(${hue} 82% 48%)`;
  }

  function photoGallery(photos, city) {
    if (!photos.length) {
      return "";
    }

    const images = photos.map((photo, photoIndex) => `
      <button type="button" data-gallery-city="${escapeHtml(city)}" data-gallery-index="${photoIndex}" aria-label="${escapeHtml(city)} ${text.photos} ${photoIndex + 1}">
        <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt || city)}" loading="lazy" width="${photo.width || 180}" height="${photo.height || 120}">
      </button>
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

  function createLightbox() {
    const lightbox = document.createElement("div");
    lightbox.className = "photo-lightbox";
    lightbox.hidden = true;
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", text.photos);
    lightbox.innerHTML = `
      <div class="photo-lightbox-backdrop" data-lightbox-close></div>
      <div class="photo-lightbox-panel">
        <button type="button" class="photo-lightbox-close" data-lightbox-close aria-label="${text.close}">${text.close}</button>
        <button type="button" class="photo-lightbox-nav prev" data-lightbox-prev aria-label="${text.previous}">&lt;</button>
        <img data-lightbox-image alt="">
        <button type="button" class="photo-lightbox-nav next" data-lightbox-next aria-label="${text.next}">&gt;</button>
        <div class="photo-lightbox-caption" data-lightbox-caption></div>
      </div>
    `;
    document.body.appendChild(lightbox);
  }

  function handleGalleryClick(event) {
    const galleryButton = event.target.closest("[data-gallery-city]");
    if (galleryButton) {
      event.preventDefault();
      openLightbox(galleryButton.dataset.galleryCity, Number(galleryButton.dataset.galleryIndex || 0));
      return;
    }

    if (event.target.closest("[data-lightbox-close]")) {
      closeLightbox();
      return;
    }

    if (event.target.closest("[data-lightbox-prev]")) {
      moveLightbox(-1);
      return;
    }

    if (event.target.closest("[data-lightbox-next]")) {
      moveLightbox(1);
    }
  }

  function handleLightboxKeydown(event) {
    const lightbox = document.querySelector(".photo-lightbox");
    if (!lightbox || lightbox.hidden) {
      return;
    }

    if (event.key === "Escape") {
      closeLightbox();
    } else if (event.key === "ArrowLeft") {
      moveLightbox(-1);
    } else if (event.key === "ArrowRight") {
      moveLightbox(1);
    }
  }

  function openLightbox(city, index) {
    const lightbox = document.querySelector(".photo-lightbox");
    if (!lightbox || !photoCities[city]) {
      return;
    }

    lightbox.dataset.city = city;
    lightbox.dataset.index = String(index);
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    renderLightbox();
  }

  function closeLightbox() {
    const lightbox = document.querySelector(".photo-lightbox");
    if (!lightbox) {
      return;
    }

    lightbox.hidden = true;
    document.body.classList.remove("lightbox-open");
  }

  function moveLightbox(delta) {
    const lightbox = document.querySelector(".photo-lightbox");
    if (!lightbox || lightbox.hidden) {
      return;
    }

    const photos = photoCities[lightbox.dataset.city] || [];
    if (!photos.length) {
      return;
    }

    const nextIndex = (Number(lightbox.dataset.index || 0) + delta + photos.length) % photos.length;
    lightbox.dataset.index = String(nextIndex);
    renderLightbox();
  }

  function renderLightbox() {
    const lightbox = document.querySelector(".photo-lightbox");
    const city = lightbox.dataset.city;
    const photos = photoCities[city] || [];
    const index = Math.min(Number(lightbox.dataset.index || 0), photos.length - 1);
    const photo = photos[index];

    if (!photo) {
      return;
    }

    const image = lightbox.querySelector("[data-lightbox-image]");
    const caption = lightbox.querySelector("[data-lightbox-caption]");
    image.src = photo.src;
    image.alt = photo.alt || city;
    caption.textContent = `${city} ${index + 1} / ${photos.length}`;
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
