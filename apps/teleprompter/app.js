(() => {
  const STORAGE_KEY = 'nianbai-prompter-v1';
  const sampleText = `很多人第一次仰望星空，都会问同一个问题。\n宇宙这么大，我们是不是孤独的？\n\n今天，就从一颗遥远的恒星说起。\n\n在夜空中，每一束抵达我们眼睛的光，都已经走了很远很远。它们穿过漫长的时间，带着宇宙深处的消息，来到此刻。\n\n当我们抬头时，看到的不只是星星，也是在寻找自己与这个宇宙之间的联系。`;
  const initialData = {
    scripts: [{ id: 'sample-universe', title: '宇宙与我们', text: sampleText }],
    selectedId: 'sample-universe',
    settings: { fontSize: 48, speed: 32, mirrored: false, countdown: true, countdownSeconds: 3, textColor: '#f0efed', lineHeight: 180, sideMargin: 6 }
  };

  const $ = (selector) => document.querySelector(selector);
  const app = $('#app');
  const elements = {
    activeTitle: $('#activeTitle'), scriptList: $('#scriptList'), scriptContent: $('#scriptContent'), scriptScroll: $('#scriptScroll'),
    readyLabel: $('#readyLabel'), startButton: $('#startButton'), fontSizeValue: $('#fontSizeValue'), fontSizeRange: $('#fontSizeRange'),
    speedRange: $('#speedRange'), speedName: $('#speedName'), mirrorToggle: $('#mirrorToggle'), countdownToggle: $('#countdownToggle'),
    speedUpButton: $('#speedUpButton'), speedDownButton: $('#speedDownButton'),
    countdownSelect: $('#countdownSelect'), countdownLayer: $('#countdownLayer'), countdownNumber: $('#countdownNumber'),
    progressSlider: $('#progressSlider'), progressValue: $('#progressValue'), emptyState: $('#emptyState'),
    lineHeightRange: $('#lineHeightRange'), lineHeightValue: $('#lineHeightValue'), sideMarginRange: $('#sideMarginRange'), sideMarginValue: $('#sideMarginValue'),
    textColorOptions: $('#textColorOptions'), presentationToolbar: $('#presentationToolbar'), presentationSpeedValue: $('#presentationSpeedValue'),
    presentationFontValue: $('#presentationFontValue'), presentationPlayButton: $('#presentationPlayButton'),
    voiceFollowButton: $('#voiceFollowButton'), pictureInPictureButton: $('#pictureInPictureButton'), cameraRecordButton: $('#cameraRecordButton'),
    recordingDialog: $('#recordingDialog'), cameraPreview: $('#cameraPreview'), cameraFrame: $('#cameraFrame'), cameraScriptContent: $('#cameraScriptContent'),
    cameraScriptWindow: $('#cameraScriptWindow'), cameraPlaceholder: $('#cameraPlaceholder'), cameraStatus: $('#cameraStatus'),
    switchCameraButton: $('#switchCameraButton'), recordScrollButton: $('#recordScrollButton'), startRecordingButton: $('#startRecordingButton'),
    stopRecordingButton: $('#stopRecordingButton'), recordingIndicator: $('#recordingIndicator'), recordingTimer: $('#recordingTimer'),
    recordingResult: $('#recordingResult'), recordingNote: $('#recordingNote'), downloadRecordingButton: $('#downloadRecordingButton'),
    shareRecordingButton: $('#shareRecordingButton'), recordingCanvas: $('#recordingCanvas'), pipCanvas: $('#pictureInPictureCanvas'), pipVideo: $('#pictureInPictureVideo'),
    editorDialog: $('#editorDialog'), editorForm: $('#editorForm'), editorTitle: $('#editorTitle'), titleInput: $('#scriptTitleInput'),
    presentationExitButton: $('#presentationExitButton'),
    textInput: $('#scriptTextInput'), characterCount: $('#characterCount'), saveStatus: $('#saveStatus'), toast: $('#toast')
  };

  let data = loadData();
  let isPlaying = false;
  let isPresenting = false;
  let countdownTimer = null;
  let rafId = null;
  let lastFrame = 0;
  let scrollPosition = 0;
  let toastTimer = null;
  let editingId = null;
  let newScriptMode = false;
  let lastSaved = 0;
  let wakeLock = null;
  let wakeLockRequest = null;
  let speechRecognizer = null;
  let isVoiceFollowing = false;
  let voiceRestartTimer = null;
  let voiceFollowFrame = 0;
  let voiceLastFrame = 0;
  let voiceTargetScroll = 0;
  let voiceParagraphs = [];
  let voiceParagraphIndex = 0;
  let voiceCharacterIndex = 0;
  let voiceHighlightedParagraphIndex = 0;
  let voiceHighlightedSourceEnd = 0;
  let voiceHighlightQueue = [];
  let voiceHighlightTimer = null;
  let voiceHighlightInterval = 105;
  let lastVoiceAnchor = null;
  let lastVoiceSpeedSave = 0;
  let voiceSpeedDirty = false;
  let pictureInPictureStream = null;
  let pictureInPictureFrame = 0;
  let cameraStream = null;
  let recordingStream = null;
  let mediaRecorder = null;
  let recordingChunks = [];
  let recordingTimerInterval = null;
  let recordingStartedAt = 0;
  let closeCameraAfterRecording = false;
  let cameraFacingMode = 'user';
  let recordingCanvasFrame = 0;
  let lastRecordingUrl = null;
  let lastRecordingFile = null;

  function loadData() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && Array.isArray(stored.scripts)) {
        return {
          ...initialData,
          ...stored,
          settings: { ...initialData.settings, ...(stored.settings || {}) },
          scripts: stored.scripts.map((item) => ({ id: String(item.id), title: String(item.title || '未命名稿件'), text: String(item.text || '') }))
        };
      }
    } catch (error) { console.info('本地稿件读取失败，将使用空白示例。', error); }
    return structuredClone(initialData);
  }

  function syncAppViewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      elements.saveStatus.innerHTML = '<i></i>已自动保存';
      lastSaved = Date.now();
    } catch {
      elements.saveStatus.innerHTML = '<i class="save-error"></i>保存失败';
      showToast('浏览器存储空间不可用，稿件暂未保存');
    }
  }

  function selectedScript() { return data.scripts.find((item) => item.id === data.selectedId) || data.scripts[0] || null; }

  function appendScriptCharacters(paragraph, text) {
    const segmenter = typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
      : null;
    const segments = segmenter
      ? Array.from(segmenter.segment(text), ({ segment, index }) => ({ segment, index }))
      : Array.from(text).reduce((result, segment) => {
        const index = result.length ? result[result.length - 1].index + result[result.length - 1].segment.length : 0;
        result.push({ segment, index });
        return result;
      }, []);
    const fragment = document.createDocumentFragment();
    segments.forEach(({ segment, index }) => {
      const character = document.createElement('span');
      character.className = 'script-char';
      character.dataset.start = String(index);
      character.dataset.end = String(index + segment.length);
      character.textContent = segment;
      fragment.append(character);
    });
    paragraph.append(fragment);
  }

  function renderScripts() {
    elements.scriptList.replaceChildren();
    data.scripts.forEach((script) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `script-item${script.id === data.selectedId ? ' is-selected' : ''}`;
      button.setAttribute('aria-current', script.id === data.selectedId ? 'page' : 'false');
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h5M8 13h8M8 17h8"/></svg>';
      const label = document.createElement('span');
      label.textContent = script.title;
      button.append(label);
      button.addEventListener('click', () => selectScript(script.id));
      elements.scriptList.append(button);
    });
  }

  function renderScript() {
    if (isVoiceFollowing) stopVoiceFollow({ silent: true });
    cancelAnimationFrame(voiceFollowFrame);
    clearTimeout(voiceHighlightTimer);
    voiceFollowFrame = 0;
    voiceHighlightTimer = null;
    voiceHighlightQueue = [];
    const script = selectedScript();
    const isEmpty = !script || !script.text.trim();
    elements.activeTitle.textContent = script?.title || '未命名稿件';
    elements.scriptContent.replaceChildren();
    if (script?.text.trim()) {
      script.text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).filter((part) => part.trim()).forEach((part) => {
        const p = document.createElement('p');
        appendScriptCharacters(p, part.trim());
        elements.scriptContent.append(p);
      });
    }
    elements.cameraScriptContent.replaceChildren(...Array.from(elements.scriptContent.children, (paragraph) => paragraph.cloneNode(true)));
    voiceParagraphs = Array.from(elements.scriptContent.querySelectorAll('p'), (element) => ({
      element,
      ...normalizeSpeechText(element.textContent)
    }));
    voiceParagraphIndex = 0;
    voiceCharacterIndex = 0;
    voiceHighlightedParagraphIndex = 0;
    voiceHighlightedSourceEnd = 0;
    voiceHighlightInterval = 105;
    lastVoiceAnchor = null;
    elements.emptyState.hidden = !isEmpty;
    elements.scriptContent.hidden = isEmpty;
    elements.scriptScroll.scrollTop = 0;
    scrollPosition = 0;
    updateProgress();
  }

  function selectScript(id) {
    if (isVoiceFollowing) stopVoiceFollow();
    if (isPlaying || countdownTimer) stopPlayback();
    data.selectedId = id;
    renderScripts();
    renderScript();
    saveData();
    closeMobileDrawers();
  }

  function closeMobileDrawers() {
    app.classList.remove('mobile-library-open', 'mobile-settings-open');
    $('#drawerBackdrop').hidden = true;
  }

  function openMobileDrawer(kind) {
    const isOpen = app.classList.contains(`mobile-${kind}-open`);
    closeMobileDrawers();
    if (isOpen) return;
    app.classList.add(`mobile-${kind}-open`);
    $('#drawerBackdrop').hidden = false;
  }

  function applySettings() {
    const { fontSize, speed, mirrored, countdown, countdownSeconds, textColor, lineHeight, sideMargin } = data.settings;
    elements.fontSizeValue.textContent = String(fontSize);
    elements.fontSizeRange.value = String(fontSize);
    elements.scriptContent.style.fontSize = `${fontSize}px`;
    document.documentElement.style.setProperty('--present-font-size', `${fontSize}px`);
    elements.speedRange.value = String(speed);
    elements.speedName.textContent = `${speed} px/秒`;
    elements.presentationSpeedValue.textContent = `${speed} px/秒`;
    elements.presentationFontValue.textContent = String(fontSize);
    elements.lineHeightRange.value = String(lineHeight);
    elements.lineHeightValue.textContent = `${lineHeight}%`;
    elements.sideMarginRange.value = String(sideMargin);
    elements.sideMarginValue.textContent = `${sideMargin}%`;
    elements.scriptContent.style.color = textColor;
    elements.scriptContent.style.lineHeight = String(Number(lineHeight) / 100);
    elements.scriptContent.style.width = `min(${100 - Number(sideMargin) * 2}%, 890px)`;
    document.documentElement.style.setProperty('--record-text-color', textColor);
    document.documentElement.style.setProperty('--record-line-height', String(Number(lineHeight) / 100));
    elements.textColorOptions.querySelectorAll('.color-option').forEach((button) => {
      const selected = button.dataset.color === textColor;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    elements.mirrorToggle.classList.toggle('is-on', mirrored);
    elements.mirrorToggle.setAttribute('aria-checked', String(mirrored));
    app.classList.toggle('is-mirrored', mirrored);
    elements.countdownToggle.classList.toggle('is-on', countdown);
    elements.countdownToggle.setAttribute('aria-checked', String(countdown));
    elements.countdownSelect.value = String(countdownSeconds);
    styleRange(elements.speedRange);
  }

  function styleRange(input) {
    const min = Number(input.min), max = Number(input.max), value = Number(input.value);
    input.style.setProperty('--range-progress', `${((value - min) / (max - min)) * 100}%`);
  }

  function updateProgress() {
    const max = Math.max(0, elements.scriptScroll.scrollHeight - elements.scriptScroll.clientHeight);
    const percent = max === 0 ? 0 : Math.round((elements.scriptScroll.scrollTop / max) * 100);
    elements.progressSlider.value = String(Math.round(percent * 10));
    elements.progressValue.textContent = `${percent}%`;
    styleRange(elements.progressSlider);
    syncCameraScriptPosition();
  }

  function openEditor({ script = selectedScript(), isNew = false } = {}) {
    editingId = script?.id || null;
    newScriptMode = isNew;
    elements.editorTitle.textContent = isNew ? '新建稿件' : '编辑稿件';
    elements.titleInput.value = isNew ? '' : (script?.title || '');
    elements.textInput.value = isNew ? '' : (script?.text || '');
    updateCharacterCount();
    elements.editorDialog.showModal();
    elements.titleInput.focus();
  }

  function updateCharacterCount() {
    const count = elements.textInput.value.replace(/\s/g, '').length;
    elements.characterCount.textContent = `${count.toLocaleString('zh-CN')} 字`;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2200);
  }

  function setPlaying(value) {
    isPlaying = value;
    elements.startButton.classList.toggle('is-active', value);
    elements.startButton.innerHTML = value
      ? '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></svg><span>暂停提词</span>'
      : '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg><span>开始提词</span>';
    elements.readyLabel.classList.toggle('is-playing', value);
    elements.readyLabel.lastElementChild.textContent = value ? '正在提词' : '准备就绪';
    syncPresentationPlayButton();
    syncWakeLock();
  }

  function syncPresentationPlayButton() {
    const isCancellingCountdown = Boolean(countdownTimer) && !isPlaying;
    const shouldPause = isPlaying || isCancellingCountdown;
    elements.presentationPlayButton.setAttribute('aria-label', isCancellingCountdown ? '取消倒计时' : shouldPause ? '暂停提词' : '开始提词');
    elements.presentationPlayButton.innerHTML = isCancellingCountdown
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
      : shouldPause
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>';
  }

  async function syncWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (!isPlaying || document.visibilityState !== 'visible') {
      if (wakeLock) { await wakeLock.release().catch(() => {}); wakeLock = null; }
      return;
    }
    if (wakeLock || wakeLockRequest) return;
    wakeLockRequest = navigator.wakeLock.request('screen').then((lock) => {
      if (!isPlaying || document.visibilityState !== 'visible') {
        void lock.release().catch(() => {});
        return;
      }
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    }).catch(() => { /* Screen Wake Lock is optional and browser-dependent. */ })
      .finally(() => { wakeLockRequest = null; });
    await wakeLockRequest;
  }

  function startPlayback() {
    if (countdownTimer || isPlaying) { pausePlayback(); return; }
    if (isVoiceFollowing) stopVoiceFollow({ silent: true });
    if (!selectedScript()?.text.trim()) { showToast('先添加一段稿件内容，再开始提词'); return; }
    if (elements.scriptScroll.scrollTop >= elements.scriptScroll.scrollHeight - elements.scriptScroll.clientHeight - 2) elements.scriptScroll.scrollTop = 0;
    if (data.settings.countdown) runCountdown(Number(data.settings.countdownSeconds));
    else beginScrolling();
  }

  function runCountdown(seconds) {
    clearInterval(countdownTimer);
    let remaining = seconds;
    elements.startButton.classList.add('is-active');
    elements.startButton.innerHTML = '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg><span>取消倒计时</span>';
    elements.countdownNumber.textContent = String(remaining);
    elements.countdownLayer.hidden = false;
    syncPresentationPlayButton();
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        elements.countdownLayer.hidden = true;
        beginScrolling();
      } else {
        elements.countdownNumber.textContent = String(remaining);
        elements.countdownNumber.style.animation = 'none';
        requestAnimationFrame(() => { elements.countdownNumber.style.animation = ''; });
      }
    }, 1000);
  }

  function beginScrolling() {
    setPlaying(true);
    lastFrame = 0;
    scrollPosition = elements.scriptScroll.scrollTop;
    rafId = requestAnimationFrame(scrollFrame);
  }

  function scrollFrame(timestamp) {
    if (!isPlaying) return;
    if (lastFrame) {
      const delta = Math.min(48, timestamp - lastFrame);
      const maxScroll = Math.max(0, elements.scriptScroll.scrollHeight - elements.scriptScroll.clientHeight);
      scrollPosition = Math.min(maxScroll, scrollPosition + (Number(data.settings.speed) * delta) / 1000);
      elements.scriptScroll.scrollTop = scrollPosition;
      updateProgress();
      if (elements.scriptScroll.scrollTop >= maxScroll - 1) {
        stopPlayback();
        showToast('稿件播放完毕');
        return;
      }
    }
    lastFrame = timestamp;
    rafId = requestAnimationFrame(scrollFrame);
  }

  function pausePlayback() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      elements.countdownLayer.hidden = true;
      if (!isPlaying) setPlaying(false);
      showToast('倒计时已取消');
    }
    if (!isPlaying) return;
    setPlaying(false);
    cancelAnimationFrame(rafId);
  }

  function stopPlayback() { pausePlayback(); }

  async function togglePresentation() {
    if (!isPresenting) {
      isPresenting = true;
      app.classList.add('is-presenting');
      elements.presentationExitButton.hidden = false;
      elements.presentationToolbar.hidden = false;
      syncPresentationPlayButton();
      if (!document.fullscreenElement && app.requestFullscreen) {
        try { await app.requestFullscreen(); } catch { showToast('浏览器未允许全屏，请按 F11'); }
      }
      elements.scriptScroll.focus({ preventScroll: true });
    } else {
      isPresenting = false;
      app.classList.remove('is-presenting');
      elements.presentationExitButton.hidden = true;
      elements.presentationToolbar.hidden = true;
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      if (isPlaying || countdownTimer) stopPlayback();
    }
  }

  function exportScript() {
    const script = selectedScript();
    if (!script) { showToast('请先创建一份稿件'); return; }
    const blob = new Blob([script.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${script.title || '未命名稿件'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('已导出为 TXT 文件');
  }

  async function readTextFile(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('文件读取失败，请重试'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  function markdownToScript(source) {
    let text = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    text = text.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1').replace(/~~~[^\n]*\n?([\s\S]*?)~~~/g, '$1');
    text = text.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '');
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
    text = text.replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s{0,3}>\s?/gm, '');
    text = text.replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, '');
    text = text.replace(/^\s*(?:\*{3,}|-{3,}|_{3,})\s*$/gm, '');
    text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    text = text.replace(/(\*\*|__)(.*?)\1/gs, '$2').replace(/~~(.*?)~~/gs, '$1').replace(/(\*|_)(.*?)\1/gs, '$2').replace(/`([^`]*)`/g, '$1');
    text = text.replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
    text = text.split('\n').map((line) => {
      const trimmed = line.trim();
      if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) return '';
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) return trimmed.slice(1, -1).split('|').map((cell) => cell.trim()).filter(Boolean).join('，');
      return line.replace(/[ \t]+$/, '');
    }).join('\n');
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  function extractWordParagraph(paragraph) {
    const parts = [];
    function visit(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const name = node.localName;
      if (name === 'pPr' || name === 'rPr') return;
      if (name === 't') { parts.push(node.textContent || ''); return; }
      if (name === 'tab') { parts.push('\t'); return; }
      if (name === 'br' || name === 'cr') { parts.push('\n'); return; }
      for (const child of node.childNodes) visit(child);
    }
    visit(paragraph);
    return parts.join('').replace(/\u00a0/g, ' ').trim();
  }

  function decodeWordXml(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('Word 文档正文无法解析。');
    const paragraphs = Array.from(xml.getElementsByTagNameNS('*', 'p'));
    const text = paragraphs.map(extractWordParagraph).filter((paragraph) => paragraph.length > 0).join('\n\n').trim();
    if (!text) throw new Error('Word 文档中没有可导入的正文文字。');
    return text;
  }

  function extractDocxDocumentXml(bytes) {
    if (!window.fflate?.Unzip || !window.fflate?.UnzipInflate || !window.fflate?.strFromU8) {
      return Promise.reject(new Error('Word 导入组件未加载，请刷新页面后重试。'));
    }
    return new Promise((resolve, reject) => {
      const chunks = [];
      const maxXmlBytes = 20 * 1024 * 1024;
      let totalBytes = 0;
      let foundDocument = false;
      let settled = false;
      const finishError = (error) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error('Word 文档解压失败。'));
      };
      const unzip = new window.fflate.Unzip();
      unzip.register(window.fflate.UnzipInflate);
      unzip.onfile = (entry) => {
        if (entry.name !== 'word/document.xml') return;
        foundDocument = true;
        if (entry.originalSize > maxXmlBytes) {
          finishError(new Error('Word 正文过大，无法导入。'));
          return;
        }
        entry.ondata = (error, chunk, final) => {
          if (error) { finishError(new Error('Word 文档解压失败，请确认文件是有效的 .docx 格式。')); return; }
          if (chunk?.length) {
            totalBytes += chunk.length;
            if (totalBytes > maxXmlBytes) { entry.terminate(); finishError(new Error('Word 正文过大，无法导入。')); return; }
            chunks.push(chunk);
          }
          if (final && !settled) {
            settled = true;
            const xmlBytes = new Uint8Array(totalBytes);
            let offset = 0;
            for (const part of chunks) { xmlBytes.set(part, offset); offset += part.length; }
            resolve(window.fflate.strFromU8(xmlBytes));
          }
        };
        try { entry.start(); } catch { finishError(new Error('无法读取 Word 正文的压缩内容。')); }
      };
      try {
        unzip.push(bytes, true);
        if (!foundDocument && !settled) finishError(new Error('文件中没有找到 Word 正文，请选择 .docx 文件。'));
      } catch {
        finishError(new Error('文件无法解压，请确认它是有效的 .docx 文件。'));
      }
    });
  }

  async function readDocxFile(file) {
    const maxFileBytes = 200 * 1024 * 1024;
    if (file.size > maxFileBytes) throw new Error('Word 文件超过 200 MB，暂不支持导入。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return decodeWordXml(await extractDocxDocumentXml(bytes));
  }

  async function handleImport(file) {
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    const title = file.name.replace(/\.(?:txt|md|markdown|docx)$/i, '').trim() || '导入的稿件';
    try {
      let text;
      if (extension === 'txt') text = await readTextFile(file);
      else if (extension === 'md' || extension === 'markdown') text = markdownToScript(await readTextFile(file));
      else if (extension === 'docx') text = await readDocxFile(file);
      else throw new Error('目前支持 TXT、Markdown（.md / .markdown）和 Word（.docx）文件。');
      if (!text.trim()) throw new Error('文件中没有可导入的文字。');
      const script = { id: crypto.randomUUID(), title, text };
      data.scripts.unshift(script);
      data.selectedId = script.id;
      saveData();
      renderScripts();
      renderScript();
      showToast(`已导入「${title}」`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '文件读取失败，请重试');
    }
  }

  function adjustSpeed(step) {
    data.settings.speed = Math.max(1, Math.min(240, Number(data.settings.speed) + step));
    applySettings();
    saveData();
  }

  function adjustFont(step) {
    data.settings.fontSize = Math.max(28, Math.min(96, Number(data.settings.fontSize) + step));
    applySettings();
    saveData();
  }

  $('#newScriptButton').addEventListener('click', () => openEditor({ isNew: true }));
  $('#editButton').addEventListener('click', () => openEditor());
  $('#renameButton').addEventListener('click', () => openEditor());
  $('#startButton').addEventListener('click', startPlayback);
  $('#fullscreenButton').addEventListener('click', togglePresentation);
  elements.presentationExitButton.addEventListener('click', togglePresentation);
  elements.speedUpButton.addEventListener('click', () => adjustSpeed(3));
  elements.speedDownButton.addEventListener('click', () => adjustSpeed(-3));
  $('#presentationSpeedUp').addEventListener('click', () => adjustSpeed(5));
  $('#presentationSpeedDown').addEventListener('click', () => adjustSpeed(-5));
  $('#presentationFontUp').addEventListener('click', () => adjustFont(2));
  $('#presentationFontDown').addEventListener('click', () => adjustFont(-2));
  elements.presentationPlayButton.addEventListener('click', startPlayback);
  elements.voiceFollowButton.addEventListener('click', toggleVoiceFollow);
  elements.pictureInPictureButton.addEventListener('click', togglePictureInPicture);
  elements.cameraRecordButton.addEventListener('click', openRecordingDialog);
  $('#closeRecordingButton').addEventListener('click', closeRecordingDialog);
  elements.recordingDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeRecordingDialog(); });
  elements.recordingDialog.addEventListener('click', (event) => { if (event.target === elements.recordingDialog) closeRecordingDialog(); });
  elements.switchCameraButton.addEventListener('click', switchCamera);
  elements.recordScrollButton.addEventListener('click', startRecordingScroll);
  elements.startRecordingButton.addEventListener('click', startRecording);
  elements.stopRecordingButton.addEventListener('click', stopRecording);
  elements.shareRecordingButton.addEventListener('click', shareRecording);
  elements.pipVideo.addEventListener('leavepictureinpicture', releasePictureInPicture);
  elements.pipVideo.addEventListener('webkitpresentationmodechanged', () => {
    if (elements.pipVideo.webkitPresentationMode !== 'picture-in-picture' && pictureInPictureStream) releasePictureInPicture();
  });
  $('#mobileLibraryButton').addEventListener('click', () => openMobileDrawer('library'));
  $('#mobileSettingsButton').addEventListener('click', () => openMobileDrawer('settings'));
  $('#drawerBackdrop').addEventListener('click', closeMobileDrawers);
  $('#exportButton').addEventListener('click', exportScript);
  $('#importButton').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', async (event) => {
    await handleImport(event.target.files?.[0]);
    event.target.value = '';
  });
  $('#fontDown').addEventListener('click', () => {
    adjustFont(-2);
  });
  $('#fontUp').addEventListener('click', () => {
    adjustFont(2);
  });
  elements.fontSizeRange.addEventListener('input', (event) => {
    data.settings.fontSize = Number(event.target.value);
    applySettings();
  });
  elements.fontSizeRange.addEventListener('change', saveData);
  elements.speedRange.addEventListener('input', (event) => {
    data.settings.speed = Number(event.target.value);
    applySettings();
  });
  elements.speedRange.addEventListener('change', saveData);
  elements.lineHeightRange.addEventListener('input', (event) => {
    data.settings.lineHeight = Number(event.target.value);
    applySettings();
  });
  elements.lineHeightRange.addEventListener('change', saveData);
  elements.sideMarginRange.addEventListener('input', (event) => {
    data.settings.sideMargin = Number(event.target.value);
    applySettings();
  });
  elements.sideMarginRange.addEventListener('change', saveData);
  elements.textColorOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.color-option');
    if (!button) return;
    data.settings.textColor = button.dataset.color;
    applySettings();
    saveData();
  });
  elements.mirrorToggle.addEventListener('click', () => {
    data.settings.mirrored = !data.settings.mirrored;
    applySettings(); saveData();
  });
  elements.countdownToggle.addEventListener('click', () => {
    data.settings.countdown = !data.settings.countdown;
    applySettings(); saveData();
  });
  elements.countdownSelect.addEventListener('change', (event) => {
    data.settings.countdownSeconds = Number(event.target.value);
    saveData();
  });
  elements.progressSlider.addEventListener('input', (event) => {
    const max = Math.max(0, elements.scriptScroll.scrollHeight - elements.scriptScroll.clientHeight);
    scrollPosition = max * (Number(event.target.value) / 1000);
    elements.scriptScroll.scrollTop = scrollPosition;
    updateProgress();
  });
  elements.scriptScroll.addEventListener('scroll', updateProgress, { passive: true });
  elements.textInput.addEventListener('input', updateCharacterCount);
  $('#cancelEdit').addEventListener('click', () => elements.editorDialog.close('cancel'));
  elements.editorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = elements.titleInput.value.trim() || '未命名稿件';
    const text = elements.textInput.value.trim();
    if (newScriptMode) {
      const script = { id: crypto.randomUUID(), title, text };
      data.scripts.unshift(script);
      data.selectedId = script.id;
    } else {
      const script = data.scripts.find((item) => item.id === editingId);
      if (script) { script.title = title; script.text = text; }
    }
    elements.editorDialog.close('saved');
    closeMobileDrawers();
    saveData(); renderScripts(); renderScript();
    showToast(newScriptMode ? '稿件已创建' : '稿件已保存');
  });
  elements.editorDialog.addEventListener('click', (event) => {
    if (event.target === elements.editorDialog) elements.editorDialog.close('cancel');
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (event.code === 'Escape' && isPresenting && !document.fullscreenElement) {
      isPresenting = false;
      app.classList.remove('is-presenting');
      elements.presentationExitButton.hidden = true;
      stopPlayback();
    }
    if (event.code === 'Escape' && countdownTimer) pausePlayback();
    if (isTyping || elements.editorDialog.open) return;
    if (event.code === 'Space' && !(target instanceof HTMLElement && target.closest('button, a'))) { event.preventDefault(); startPlayback(); }
    if (event.code === 'ArrowUp') { event.preventDefault(); adjustSpeed(3); }
    if (event.code === 'ArrowDown') { event.preventDefault(); adjustSpeed(-3); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); adjustFont(2); }
    if (event.key === '-' || event.key === '_') { event.preventDefault(); adjustFont(-2); }
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); togglePresentation(); }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isPresenting) {
      isPresenting = false;
      app.classList.remove('is-presenting');
      elements.presentationExitButton.hidden = true;
      elements.presentationToolbar.hidden = true;
      if (isPlaying || countdownTimer) stopPlayback();
    }
  });

  function normalizeSpeechText(value) {
    let normalized = '';
    const offsets = [];
    const source = String(value || '');
    for (let index = 0; index < source.length;) {
      const point = String.fromCodePoint(source.codePointAt(index));
      for (const character of point.normalize('NFKC').toLocaleLowerCase('zh-CN')) {
        if (/[\p{L}\p{N}]/u.test(character)) {
          normalized += character;
          offsets.push(index);
        }
      }
      index += point.length;
    }
    return { normalized, offsets };
  }

  function findSpokenAnchor(transcript) {
    const spoken = normalizeSpeechText(transcript).normalized;
    if (spoken.length < 2) return null;
    const candidates = [spoken];
    for (let length = Math.min(12, spoken.length - 1); length >= 1; length -= 1) {
      candidates.push(spoken.slice(-length));
    }
    for (let paragraphIndex = Math.min(voiceParagraphIndex, Math.max(0, voiceParagraphs.length - 1)); paragraphIndex < voiceParagraphs.length; paragraphIndex += 1) {
      const paragraph = voiceParagraphs[paragraphIndex];
      const minimumOffset = paragraphIndex === voiceParagraphIndex ? Math.max(0, voiceCharacterIndex - 2) : 0;
      for (const candidate of candidates) {
        let normalizedOffset = paragraph.normalized.indexOf(candidate, minimumOffset);
        while (normalizedOffset >= 0) {
          if (paragraphIndex !== voiceParagraphIndex || normalizedOffset + candidate.length > voiceCharacterIndex) {
            return { ...paragraph, paragraphIndex, normalizedOffset, matchedLength: candidate.length };
          }
          normalizedOffset = paragraph.normalized.indexOf(candidate, normalizedOffset + 1);
        }
      }
    }
    return null;
  }

  function updateVoiceFollowButton() {
    elements.voiceFollowButton.classList.toggle('is-active', isVoiceFollowing);
    elements.voiceFollowButton.setAttribute('aria-pressed', String(isVoiceFollowing));
    elements.voiceFollowButton.setAttribute('aria-label', isVoiceFollowing ? '停止口播跟随' : '开始口播跟随');
    elements.voiceFollowButton.title = isVoiceFollowing ? '停止口播跟随' : '逐字口播跟随（需麦克风与语音识别支持）';
  }

  function stopVoiceFollow({ silent = false } = {}) {
    isVoiceFollowing = false;
    clearTimeout(voiceRestartTimer);
    voiceRestartTimer = null;
    cancelAnimationFrame(voiceFollowFrame);
    voiceFollowFrame = 0;
    voiceLastFrame = 0;
    const recognizer = speechRecognizer;
    speechRecognizer = null;
    if (recognizer) {
      recognizer.onend = null;
      try { recognizer.stop(); } catch { try { recognizer.abort(); } catch {} }
    }
    updateVoiceFollowButton();
    if (voiceSpeedDirty) {
      saveData();
      voiceSpeedDirty = false;
    }
    if (!isPlaying) {
      elements.readyLabel.classList.remove('is-playing');
      elements.readyLabel.lastElementChild.textContent = '准备就绪';
    }
    if (!silent) showToast('口播跟随已停止');
  }

  function applyVoiceAnchor(transcript) {
    const anchor = findSpokenAnchor(transcript);
    if (!anchor) return;
    const now = performance.now();
    const matchedEnd = anchor.normalizedOffset + anchor.matchedLength;
    const text = anchor.element.textContent || '';
    const sourceStart = anchor.offsets[anchor.normalizedOffset] ?? 0;
    const lastCharacterStart = anchor.offsets[matchedEnd - 1] ?? sourceStart;
    const lastCharacterLength = text.codePointAt(lastCharacterStart) > 0xFFFF ? 2 : 1;
    const anchorSpan = Array.from(anchor.element.querySelectorAll('.script-char')).find((span) => {
      const start = Number(span.dataset.start), end = Number(span.dataset.end);
      return start <= lastCharacterStart && end > lastCharacterStart;
    });
    const sourceEnd = matchedEnd >= anchor.normalized.length
      ? text.length
      : (anchorSpan ? Number(anchorSpan.dataset.end) : Math.min(text.length, lastCharacterStart + lastCharacterLength));
    const anchorRect = anchorSpan?.getBoundingClientRect();
    const anchorCenter = anchorRect?.height
      ? anchorRect.top + anchorRect.height / 2
      : anchor.element.getBoundingClientRect().top;

    const paragraphElements = elements.scriptContent.querySelectorAll('p');
    let advancedCharacters = 0;
    for (let paragraphIndex = voiceParagraphIndex; paragraphIndex <= anchor.paragraphIndex; paragraphIndex += 1) {
      const paragraph = paragraphElements[paragraphIndex];
      if (!paragraph) continue;
      const start = paragraphIndex === voiceParagraphIndex ? voiceCharacterIndex : 0;
      const end = paragraphIndex < anchor.paragraphIndex ? (voiceParagraphs[paragraphIndex]?.normalized.length || 0) : matchedEnd;
      advancedCharacters += Math.max(0, end - start);
    }
    const priorAnchor = lastVoiceAnchor;
    for (let paragraphIndex = voiceHighlightedParagraphIndex; paragraphIndex <= anchor.paragraphIndex; paragraphIndex += 1) {
      const paragraph = paragraphElements[paragraphIndex];
      if (!paragraph) continue;
      const previousEnd = paragraphIndex === voiceHighlightedParagraphIndex ? voiceHighlightedSourceEnd : 0;
      const spokenEnd = paragraphIndex < anchor.paragraphIndex ? Number.POSITIVE_INFINITY : sourceEnd;
      paragraph.querySelectorAll('.script-char').forEach((span) => {
        const start = Number(span.dataset.start), end = Number(span.dataset.end);
        if (end > previousEnd && end <= spokenEnd && !span.classList.contains('is-spoken') && !span.dataset.highlightQueued) {
          span.dataset.highlightQueued = 'true';
          voiceHighlightQueue.push(span);
        }
      });
    }
    if (priorAnchor && advancedCharacters > 0) {
      const elapsedSeconds = (now - priorAnchor.time) / 1000;
      if (elapsedSeconds >= 0.12 && elapsedSeconds <= 4) {
        const estimatedInterval = elapsedSeconds * 1000 / advancedCharacters;
        voiceHighlightInterval = Math.max(58, Math.min(260, voiceHighlightInterval * 0.55 + estimatedInterval * 0.45));
      }
    }
    voiceHighlightedParagraphIndex = anchor.paragraphIndex;
    voiceHighlightedSourceEnd = sourceEnd;
    if (!voiceHighlightTimer) advanceSpokenHighlight();

    const scrollTarget = getVoiceScrollTarget(anchorCenter);

    if (lastVoiceAnchor) {
      const elapsedSeconds = (now - lastVoiceAnchor.time) / 1000;
      const distance = scrollTarget - lastVoiceAnchor.scrollTop;
      if (elapsedSeconds >= 0.35 && elapsedSeconds <= 12 && distance > 3) {
        const measuredSpeed = Math.max(1, Math.min(240, distance / elapsedSeconds));
        data.settings.speed = Math.round(Number(data.settings.speed) * 0.45 + measuredSpeed * 0.55);
        voiceSpeedDirty = true;
        applySettings();
        if (now - lastVoiceSpeedSave > 2500) {
          saveData();
          lastVoiceSpeedSave = now;
        }
      }
    }
    lastVoiceAnchor = { time: now, scrollTop: scrollTarget };
    voiceParagraphIndex = anchor.paragraphIndex;
    voiceCharacterIndex = matchedEnd;
    elements.readyLabel.classList.add('is-playing');
    elements.readyLabel.lastElementChild.textContent = '正在口播跟随';
  }

  function getVoiceScrollTarget(anchorCenter) {
    const scrollRect = elements.scriptScroll.getBoundingClientRect();
    const guideRect = $('.reading-guide').getBoundingClientRect();
    const guideOffset = guideRect.top - scrollRect.top;
    const maxScroll = Math.max(0, elements.scriptScroll.scrollHeight - elements.scriptScroll.clientHeight);
    return Math.max(0, Math.min(maxScroll, elements.scriptScroll.scrollTop + anchorCenter - scrollRect.top - guideOffset));
  }

  function advanceSpokenHighlight() {
    if (!voiceHighlightQueue.length) return;
    const character = voiceHighlightQueue.shift();
    delete character.dataset.highlightQueued;
    character.classList.add('is-spoken');
    const rect = character.getBoundingClientRect();
    if (rect.height && isVoiceFollowing) {
      voiceTargetScroll = getVoiceScrollTarget(rect.top + rect.height / 2);
      if (!voiceFollowFrame) {
        voiceLastFrame = 0;
        voiceFollowFrame = requestAnimationFrame(animateVoiceScroll);
      }
    }
    if (voiceHighlightQueue.length) {
      voiceHighlightTimer = setTimeout(() => {
        voiceHighlightTimer = null;
        advanceSpokenHighlight();
      }, voiceHighlightInterval);
    }
  }

  function animateVoiceScroll(timestamp) {
    if (!isVoiceFollowing) { voiceFollowFrame = 0; return; }
    const elapsed = voiceLastFrame ? Math.min(50, timestamp - voiceLastFrame) : 16;
    voiceLastFrame = timestamp;
    const current = elements.scriptScroll.scrollTop;
    const difference = voiceTargetScroll - current;
    const next = Math.abs(difference) < 0.65
      ? voiceTargetScroll
      : current + difference * (1 - Math.exp(-elapsed / 145));
    elements.scriptScroll.scrollTop = next;
    scrollPosition = next;
    updateProgress();
    if (Math.abs(voiceTargetScroll - next) < 0.65) {
      voiceFollowFrame = 0;
      voiceLastFrame = 0;
      return;
    }
    voiceFollowFrame = requestAnimationFrame(animateVoiceScroll);
  }

  function startVoiceFollow() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      showToast('当前浏览器没有语音识别功能，可用 Safari 或 Chrome 打开');
      return;
    }
    if (!selectedScript()?.text.trim()) {
      showToast('先添加一段稿件内容，再开始口播跟随');
      return;
    }
    if (isPlaying || countdownTimer) stopPlayback();
    const recognizer = new Recognition();
    recognizer.lang = 'zh-CN';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result[0]?.transcript) applyVoiceAnchor(result[0].transcript);
      }
    };
    recognizer.onerror = (event) => {
      if (!isVoiceFollowing || event.error === 'aborted' || event.error === 'no-speech') return;
      const messages = {
        'not-allowed': '请在浏览器中允许麦克风访问后重试',
        'service-not-allowed': '系统语音识别不可用，请检查 Siri 或语音识别设置',
        'language-not-supported': '当前设备暂不支持中文语音识别',
        network: '语音识别服务连接失败，请检查网络'
      };
      isVoiceFollowing = false;
      speechRecognizer = null;
      stopVoiceFollow({ silent: true });
      showToast(messages[event.error] || '语音识别暂时不可用，请改用手动提词');
    };
    recognizer.onend = () => {
      if (!isVoiceFollowing || speechRecognizer !== recognizer) return;
      voiceRestartTimer = setTimeout(() => {
        if (!isVoiceFollowing || speechRecognizer !== recognizer) return;
        try { recognizer.start(); } catch {
          voiceRestartTimer = setTimeout(() => {
            if (isVoiceFollowing && speechRecognizer === recognizer) {
              try { recognizer.start(); } catch { stopVoiceFollow({ silent: true }); }
            }
          }, 700);
        }
      }, 250);
    };
    speechRecognizer = recognizer;
    isVoiceFollowing = true;
    lastVoiceAnchor = null;
    voiceTargetScroll = elements.scriptScroll.scrollTop;
    updateVoiceFollowButton();
    elements.readyLabel.classList.add('is-playing');
    elements.readyLabel.lastElementChild.textContent = '正在听取口播';
    try {
      recognizer.start();
      showToast('开始口播，已念文字会逐字变色并平滑跟随');
    } catch {
      stopVoiceFollow({ silent: true });
      showToast('无法启动语音识别，请重试或检查浏览器权限');
    }
  }

  function toggleVoiceFollow() {
    if (isVoiceFollowing) stopVoiceFollow();
    else startVoiceFollow();
  }

  function getProgressRatio() {
    const max = Math.max(0, elements.scriptScroll.scrollHeight - elements.scriptScroll.clientHeight);
    return max ? Math.max(0, Math.min(1, elements.scriptScroll.scrollTop / max)) : 0;
  }

  function wrapCanvasText(context, text, maxWidth) {
    const lines = [];
    for (const paragraph of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
      if (!paragraph) { lines.push(''); continue; }
      let line = '';
      for (const character of paragraph) {
        const candidate = line + character;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = character;
        } else line = candidate;
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function drawPictureInPictureFrame() {
    const canvas = elements.pipCanvas;
    const context = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    const fontSize = Math.max(28, Math.min(46, Number(data.settings.fontSize)));
    const lineHeight = fontSize * (Number(data.settings.lineHeight) / 100);
    context.fillStyle = '#101214';
    context.fillRect(0, 0, width, height);
    context.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    context.fillStyle = data.settings.textColor || '#f0efed';
    context.textBaseline = 'middle';
    const margin = width * Math.max(.06, Number(data.settings.sideMargin) / 100);
    const lines = wrapCanvasText(context, selectedScript()?.text || '', width - margin * 2);
    const visibleHeight = height * .7;
    const maxOffset = Math.max(0, lines.length * lineHeight - visibleHeight);
    const offset = getProgressRatio() * maxOffset;
    const guideY = height * .56;
    const startY = guideY - offset;
    lines.forEach((line, index) => {
      const y = startY + index * lineHeight;
      if (y > height * .08 && y < height * .94) context.fillText(line, margin, y, width - margin * 2);
    });
    context.fillStyle = '#f28c55cc';
    context.fillRect(width * .07, guideY, width * .86, 2);
    pictureInPictureFrame = requestAnimationFrame(drawPictureInPictureFrame);
  }

  function supportsPictureInPicture() {
    const video = elements.pipVideo;
    const standard = document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function';
    const safari = typeof video.webkitSupportsPresentationMode === 'function' && video.webkitSupportsPresentationMode('picture-in-picture');
    return Boolean(standard || safari);
  }

  async function togglePictureInPicture() {
    const video = elements.pipVideo;
    const alreadyOpen = document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture';
    if (alreadyOpen) {
      try {
        if (document.pictureInPictureElement === video && document.exitPictureInPicture) await document.exitPictureInPicture();
        else if (typeof video.webkitSetPresentationMode === 'function') video.webkitSetPresentationMode('inline');
      } catch { showToast('无法关闭画中画窗口，请使用窗口上的关闭按钮'); }
      return;
    }
    if (!supportsPictureInPicture() || typeof elements.pipCanvas.captureStream !== 'function') {
      showToast('当前 Safari 运行方式不支持画中画；请在 Safari 标签页中尝试');
      return;
    }
    try {
      cancelAnimationFrame(pictureInPictureFrame);
      drawPictureInPictureFrame();
      pictureInPictureStream = elements.pipCanvas.captureStream(24);
      video.srcObject = pictureInPictureStream;
      await video.play();
      if (typeof video.webkitSetPresentationMode === 'function' && video.webkitSupportsPresentationMode?.('picture-in-picture')) {
        video.webkitSetPresentationMode('picture-in-picture');
      } else {
        await video.requestPictureInPicture();
      }
      elements.pictureInPictureButton.classList.add('is-active');
      showToast('画中画已打开，可切换到其他 App 查看提词');
    } catch (error) {
      releasePictureInPicture();
      const message = error?.name === 'NotSupportedError'
        ? '此 Safari 模式暂不允许画中画；请从 Safari 标签页打开网页'
        : '画中画未能启动，请检查浏览器是否支持视频画中画';
      showToast(message);
    }
  }

  function releasePictureInPicture() {
    cancelAnimationFrame(pictureInPictureFrame);
    pictureInPictureFrame = 0;
    pictureInPictureStream?.getTracks().forEach((track) => track.stop());
    pictureInPictureStream = null;
    elements.pipVideo.pause();
    elements.pipVideo.srcObject = null;
    elements.pictureInPictureButton.classList.remove('is-active');
  }

  function syncCameraScriptPosition() {
    const max = Math.max(0, elements.cameraScriptWindow.scrollHeight - elements.cameraScriptWindow.clientHeight);
    if (max > 0) elements.cameraScriptWindow.scrollTop = getProgressRatio() * max;
  }

  async function startCameraStream(facingMode = cameraFacingMode) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器无法调用相机，请使用支持相机权限的 HTTPS 页面');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 1920 } },
      audio: true
    });
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = stream;
    cameraFacingMode = facingMode;
    elements.cameraPreview.srcObject = stream;
    await elements.cameraPreview.play();
    const portrait = window.innerHeight >= window.innerWidth;
    elements.cameraFrame.classList.toggle('is-portrait', portrait);
    elements.cameraPlaceholder.hidden = true;
    elements.startRecordingButton.disabled = false;
    elements.switchCameraButton.textContent = facingMode === 'user' ? '切换后摄' : '切换前摄';
    const canvas = elements.recordingCanvas;
    canvas.width = portrait ? 720 : 1280;
    canvas.height = portrait ? 1280 : 720;
    elements.cameraStatus.textContent = '相机已就绪';
    syncCameraScriptPosition();
  }

  async function openRecordingDialog() {
    if (!selectedScript()?.text.trim()) {
      showToast('先添加一段稿件内容，再开始摄像录制');
      return;
    }
    if (!window.MediaRecorder || !elements.recordingCanvas.captureStream) {
      showToast('当前浏览器暂不支持网页视频录制');
      return;
    }
    if (!elements.recordingDialog.open) elements.recordingDialog.showModal();
    elements.cameraPlaceholder.hidden = false;
    elements.cameraStatus.textContent = '正在连接相机和麦克风…';
    elements.startRecordingButton.disabled = true;
    elements.recordingResult.hidden = true;
    elements.recordingNote.textContent = '相机预览已启动；开始录制后，提词文字会与画面合成为一个视频文件。';
    try {
      await startCameraStream('user');
    } catch (error) {
      elements.cameraPlaceholder.hidden = false;
      elements.cameraStatus.textContent = error?.name === 'NotAllowedError' ? '请允许浏览器使用相机和麦克风' : (error?.message || '相机启动失败');
      elements.recordingNote.textContent = '录制需要 HTTPS 页面，并需在浏览器提示时允许相机与麦克风权限。';
      showToast(elements.cameraStatus.textContent);
    }
  }

  async function switchCamera() {
    if (mediaRecorder?.state === 'recording') return;
    const nextMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    elements.cameraPreview.srcObject = null;
    elements.cameraPlaceholder.hidden = false;
    elements.cameraStatus.textContent = '正在切换摄像头…';
    elements.startRecordingButton.disabled = true;
    try { await startCameraStream(nextMode); }
    catch (error) {
      elements.cameraStatus.textContent = error?.message || '无法切换摄像头';
      showToast(elements.cameraStatus.textContent);
    }
  }

  function drawRecordingFrame() {
    if (!cameraStream || elements.cameraPreview.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      recordingCanvasFrame = requestAnimationFrame(drawRecordingFrame);
      return;
    }
    const canvas = elements.recordingCanvas;
    const context = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    const sourceWidth = elements.cameraPreview.videoWidth || width;
    const sourceHeight = elements.cameraPreview.videoHeight || height;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale;
    context.fillStyle = '#08090b';
    context.fillRect(0, 0, width, height);
    context.drawImage(elements.cameraPreview, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);

    const panelHeight = Math.round(height * .43);
    const gradient = context.createLinearGradient(0, 0, 0, panelHeight + 70);
    gradient.addColorStop(0, 'rgba(9,10,12,.9)');
    gradient.addColorStop(.78, 'rgba(9,10,12,.72)');
    gradient.addColorStop(1, 'rgba(9,10,12,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, panelHeight + 70);

    const fontSize = Math.max(38, Math.min(66, width * .056));
    const lineHeight = fontSize * Math.max(1.35, Math.min(2.1, Number(data.settings.lineHeight) / 100));
    context.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    context.fillStyle = data.settings.textColor || '#f0efed';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = '#000';
    context.shadowBlur = 5;
    const margin = width * Math.max(.06, Number(data.settings.sideMargin) / 100);
    const lines = wrapCanvasText(context, selectedScript()?.text || '', width - margin * 2);
    const maxOffset = Math.max(0, lines.length * lineHeight - panelHeight * .7);
    const centerLine = panelHeight * .7;
    const offset = getProgressRatio() * maxOffset;
    lines.forEach((line, index) => {
      const y = centerLine - offset + index * lineHeight;
      if (y > 20 && y < panelHeight) context.fillText(line, width / 2, y, width - margin * 2);
    });
    context.shadowBlur = 0;
    context.fillStyle = '#f28c55cc';
    context.fillRect(width * .08, centerLine + lineHeight * .48, width * .84, Math.max(2, width / 500));
    recordingCanvasFrame = requestAnimationFrame(drawRecordingFrame);
  }

  function startRecordingScroll() {
    if (isVoiceFollowing) stopVoiceFollow({ silent: true });
    if (isPlaying) pausePlayback();
    else if (countdownTimer) pausePlayback();
    else beginScrolling();
    elements.recordScrollButton.textContent = isPlaying ? '暂停提词' : '继续提词';
  }

  function startRecording() {
    if (!cameraStream || mediaRecorder?.state === 'recording') return;
    if (isVoiceFollowing) {
      stopVoiceFollow({ silent: true });
      showToast('录制期间暂时关闭口播跟随；提词仍会按当前速度滚动');
    }
    try {
      cancelAnimationFrame(recordingCanvasFrame);
      drawRecordingFrame();
      const canvasStream = elements.recordingCanvas.captureStream(30);
      recordingStream = new MediaStream([...canvasStream.getVideoTracks(), ...cameraStream.getAudioTracks()]);
      const mimeTypes = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
      const mimeType = mimeTypes.find((candidate) => MediaRecorder.isTypeSupported?.(candidate));
      mediaRecorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
      recordingChunks = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data?.size) recordingChunks.push(event.data); };
      mediaRecorder.onstop = () => {
        cancelAnimationFrame(recordingCanvasFrame);
        recordingCanvasFrame = 0;
        if (recordingTimerInterval) clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
        recordingStream?.getTracks().forEach((track) => track.stop());
        recordingStream = null;
        elements.startRecordingButton.disabled = false;
        if (isPlaying) pausePlayback();
        elements.recordScrollButton.textContent = '开始提词';
        if (closeCameraAfterRecording) {
          closeCameraAfterRecording = false;
          cleanupCamera();
        }
        const type = mediaRecorder?.mimeType || recordingChunks[0]?.type || 'video/mp4';
        const blob = new Blob(recordingChunks, { type });
        if (!blob.size) {
          showToast('没有录到视频内容，请重试');
          return;
        }
        if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
        lastRecordingUrl = URL.createObjectURL(blob);
        const extension = type.includes('mp4') ? 'mp4' : 'webm';
        const title = selectedScript()?.title || '念白提词录制';
        const fileName = `${title}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
        lastRecordingFile = typeof File === 'function' ? new File([blob], fileName, { type }) : null;
        elements.downloadRecordingButton.href = lastRecordingUrl;
        elements.downloadRecordingButton.download = fileName;
        elements.recordingResult.hidden = false;
        elements.recordingNote.textContent = '视频已生成；可保存到设备或通过系统分享发送。';
      };
      mediaRecorder.start(1000);
      if (!isPlaying) beginScrolling();
      elements.recordScrollButton.textContent = '暂停提词';
      elements.recordingIndicator.hidden = false;
      elements.recordingResult.hidden = true;
      elements.startRecordingButton.hidden = true;
      elements.stopRecordingButton.hidden = false;
      elements.switchCameraButton.disabled = true;
      recordingStartedAt = Date.now();
      recordingTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartedAt) / 1000);
        const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        elements.recordingTimer.textContent = `${minutes}:${seconds}`;
      }, 500);
      elements.recordingNote.textContent = '正在录制相机画面与麦克风声音；关闭窗口或点停止结束。';
    } catch (error) {
      recordingStream?.getTracks().forEach((track) => track.stop());
      recordingStream = null;
      cancelAnimationFrame(recordingCanvasFrame);
      showToast(error?.message || '无法开始录制，请检查浏览器编码支持');
    }
  }

  function stopRecording() {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
      elements.recordingIndicator.hidden = true;
      elements.startRecordingButton.hidden = false;
      elements.stopRecordingButton.hidden = true;
      elements.startRecordingButton.disabled = true;
      elements.switchCameraButton.disabled = false;
    }
  }

  function cleanupCamera() {
    if (mediaRecorder?.state === 'recording') stopRecording();
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    elements.cameraPreview.pause();
    elements.cameraPreview.srcObject = null;
    elements.cameraPlaceholder.hidden = false;
    elements.cameraStatus.textContent = '相机已关闭';
    elements.startRecordingButton.disabled = true;
  }

  function closeRecordingDialog() {
    if (mediaRecorder?.state === 'recording') {
      closeCameraAfterRecording = true;
      stopRecording();
    } else cleanupCamera();
    if (elements.recordingDialog.open) elements.recordingDialog.close();
  }

  async function shareRecording() {
    if (!lastRecordingFile || !navigator.canShare?.({ files: [lastRecordingFile] }) || !navigator.share) {
      showToast('当前浏览器不支持直接分享视频，请先保存文件');
      return;
    }
    try { await navigator.share({ files: [lastRecordingFile], title: lastRecordingFile.name }); }
    catch (error) { if (error?.name !== 'AbortError') showToast('分享失败，请保存视频后重试'); }
  }

  document.addEventListener('visibilitychange', () => { if (isPlaying) syncWakeLock(); });
  window.addEventListener('resize', () => {
    if (elements.recordingDialog.open && cameraStream) {
      const portrait = window.innerHeight >= window.innerWidth;
      elements.cameraFrame.classList.toggle('is-portrait', portrait);
      elements.recordingCanvas.width = portrait ? 720 : 1280;
      elements.recordingCanvas.height = portrait ? 1280 : 720;
    }
  }, { passive: true });
  window.addEventListener('beforeunload', () => {
    stopVoiceFollow({ silent: true });
    releasePictureInPicture();
    cleanupCamera();
    if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
  });
  syncAppViewportHeight();
  window.addEventListener('resize', () => { syncAppViewportHeight(); updateProgress(); }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { syncAppViewportHeight(); updateProgress(); }, { passive: true });

  renderScripts();
  renderScript();
  applySettings();
  updateVoiceFollowButton();
  syncPresentationPlayButton();
  try {
    if (!lastSaved && !localStorage.getItem(STORAGE_KEY)) saveData();
  } catch {
    saveData();
  }
})();
