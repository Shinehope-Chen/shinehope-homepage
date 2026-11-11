(() => {
  const STORAGE_KEY = 'nianbai-prompter-v1';
  const sampleText = `很多人第一次仰望星空，都会问同一个问题。\n宇宙这么大，我们是不是孤独的？\n\n今天，就从一颗遥远的恒星说起。\n\n在夜空中，每一束抵达我们眼睛的光，都已经走了很远很远。它们穿过漫长的时间，带着宇宙深处的消息，来到此刻。\n\n当我们抬头时，看到的不只是星星，也是在寻找自己与这个宇宙之间的联系。`;
  const initialData = {
    scripts: [{ id: 'sample-universe', title: '宇宙与我们', text: sampleText }],
    selectedId: 'sample-universe',
    settings: { fontSize: 48, speed: 32, mirrored: false, countdown: true, countdownSeconds: 3 }
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
    editorDialog: $('#editorDialog'), editorForm: $('#editorForm'), editorTitle: $('#editorTitle'), titleInput: $('#scriptTitleInput'),
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
    const script = selectedScript();
    const isEmpty = !script || !script.text.trim();
    elements.activeTitle.textContent = script?.title || '未命名稿件';
    elements.scriptContent.replaceChildren();
    if (script?.text.trim()) {
      script.text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).filter((part) => part.trim()).forEach((part) => {
        const p = document.createElement('p');
        p.textContent = part.trim();
        elements.scriptContent.append(p);
      });
    }
    elements.emptyState.hidden = !isEmpty;
    elements.scriptContent.hidden = isEmpty;
    elements.scriptScroll.scrollTop = 0;
    scrollPosition = 0;
    updateProgress();
  }

  function selectScript(id) {
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
    const { fontSize, speed, mirrored, countdown, countdownSeconds } = data.settings;
    elements.fontSizeValue.textContent = String(fontSize);
    elements.fontSizeRange.value = String(fontSize);
    elements.scriptContent.style.fontSize = `${fontSize}px`;
    document.documentElement.style.setProperty('--present-font-size', `${fontSize}px`);
    elements.speedRange.value = String(speed);
    elements.speedName.textContent = `${speed} px/秒`;
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
  }

  function startPlayback() {
    if (countdownTimer || isPlaying) { pausePlayback(); return; }
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
      if (!document.fullscreenElement && app.requestFullscreen) {
        try { await app.requestFullscreen(); } catch { showToast('浏览器未允许全屏，请按 F11'); }
      }
      elements.scriptScroll.focus({ preventScroll: true });
    } else {
      isPresenting = false;
      app.classList.remove('is-presenting');
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
    data.settings.speed = Math.max(5, Math.min(80, Number(data.settings.speed) + step));
    applySettings();
    saveData();
  }

  $('#newScriptButton').addEventListener('click', () => openEditor({ isNew: true }));
  $('#editButton').addEventListener('click', () => openEditor());
  $('#renameButton').addEventListener('click', () => openEditor());
  $('#startButton').addEventListener('click', startPlayback);
  $('#fullscreenButton').addEventListener('click', togglePresentation);
  elements.speedUpButton.addEventListener('click', () => adjustSpeed(3));
  elements.speedDownButton.addEventListener('click', () => adjustSpeed(-3));
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
    data.settings.fontSize = Math.max(28, Number(data.settings.fontSize) - 2);
    applySettings(); saveData();
  });
  $('#fontUp').addEventListener('click', () => {
    data.settings.fontSize = Math.min(76, Number(data.settings.fontSize) + 2);
    applySettings(); saveData();
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
      stopPlayback();
    }
    if (event.code === 'Escape' && countdownTimer) pausePlayback();
    if (isTyping || elements.editorDialog.open) return;
    if (event.code === 'Space' && !(target instanceof HTMLElement && target.closest('button, a'))) { event.preventDefault(); startPlayback(); }
    if (event.code === 'ArrowUp') { event.preventDefault(); adjustSpeed(3); }
    if (event.code === 'ArrowDown') { event.preventDefault(); adjustSpeed(-3); }
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); togglePresentation(); }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isPresenting) {
      isPresenting = false;
      app.classList.remove('is-presenting');
      if (isPlaying || countdownTimer) stopPlayback();
    }
  });
  window.addEventListener('resize', updateProgress);

  renderScripts();
  renderScript();
  applySettings();
  try {
    if (!lastSaved && !localStorage.getItem(STORAGE_KEY)) saveData();
  } catch {
    saveData();
  }
})();
