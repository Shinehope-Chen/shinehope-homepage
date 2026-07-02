const display = document.querySelector("#display");
const keys = document.querySelector(".keys");
const launcher = document.querySelector("#launcher");
const startButton = document.querySelector("#startButton");
const calculatorWindow = document.querySelector("#calculatorWindow");
const calculatorView = document.querySelector("#calculatorView");
const chatView = document.querySelector("#chatView");
const backButton = document.querySelector("#backButton");
const chatWelcome = document.querySelector("#chatWelcome");
const welcomeAvatar = document.querySelector("#welcomeAvatar");
const messages = document.querySelector("#messages");
const typedText = document.querySelector("#typedText");

const DOUBAO_AVATAR = "./doubao-avatar.png";
const DOUBAO_LAUGH_AVATAR = "./大笑.gif";
const PREAMBLE_AUDIO = "./最直接最直白-2x.wav";
const SEVEN_PLUS_EIGHT_AUDIO = "./7+8=15.wav";
const TAUNT_AUDIO = "./你的数学是体育老师教的吧.wav";
const PREAMBLE_TEXT_DELAY_MULTIPLIER = 2.446;

let expression = "";
let isChatting = false;
let runId = 0;
let activeAudios = [];

function startApp() {
  launcher.hidden = true;
  calculatorWindow.hidden = false;
}

function render() {
  display.textContent = expression || "0";
  display.title = expression || "0";
}

function appendToken(token) {
  if (isChatting || expression.length >= 48) {
    return;
  }

  expression += token;
  render();
}

function clearExpression() {
  expression = "";
  render();
}

function backspace() {
  if (isChatting) {
    return;
  }

  expression = expression.slice(0, -1);
  render();
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function stopAudios() {
  for (const audio of activeAudios) {
    audio.pause();
    audio.currentTime = 0;
  }

  activeAudios = [];
}

function playAudio(src) {
  const audio = new Audio(src);
  activeAudios.push(audio);
  audio.addEventListener("ended", () => {
    activeAudios = activeAudios.filter((item) => item !== audio);
  });
  audio.playPromise = audio.play().catch(() => {
    audio.playFailed = true;
    activeAudios = activeAudios.filter((item) => item !== audio);
  });
  return audio;
}

async function waitForAudio(audio) {
  if (!audio) {
    return;
  }

  await audio.playPromise;

  if (audio.playFailed || audio.ended) {
    return;
  }

  return new Promise((resolve) => {
    audio.addEventListener("ended", resolve, { once: true });
    audio.addEventListener("error", resolve, { once: true });
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showCalculator() {
  runId += 1;
  stopAudios();
  isChatting = false;
  chatView.hidden = true;
  calculatorView.hidden = false;
  messages.replaceChildren();
  chatWelcome.hidden = false;
  welcomeAvatar.src = DOUBAO_AVATAR;
  typedText.textContent = "发消息...";
  typedText.className = "typed-text is-placeholder";
  clearExpression();
}

function showChat() {
  isChatting = true;
  calculatorView.hidden = true;
  chatView.hidden = false;
}

function addMessage(role, text, avatarSrc = DOUBAO_AVATAR) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  if (role === "bot") {
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = avatarSrc;
    avatar.alt = "豆包";
    row.append(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.append(bubble);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
}

async function fakeThink(row, currentRunId) {
  const bubble = row.querySelector(".bubble");
  const frames = ["…", "……", "………", "……", "………", "……"];

  for (const frame of frames) {
    if (currentRunId !== runId) {
      return false;
    }

    bubble.textContent = frame;
    await wait(620);
  }

  return true;
}

async function typeBotReply(row, text, currentRunId, speedMultiplier = 1) {
  const bubble = row.querySelector(".bubble");
  bubble.textContent = "";

  for (const character of text) {
    if (currentRunId !== runId) {
      return false;
    }

    bubble.textContent += character;
    messages.scrollTop = messages.scrollHeight;
    const baseDelay = /[，、：！]/.test(character) ? 90 : 18;
    await wait(baseDelay * speedMultiplier);
  }

  return true;
}

async function typePrompt(text, currentRunId) {
  const parts = [
    { pinyin: "doubao", text: "豆包" },
    { pinyin: "doubao", text: "豆包" },
    { text: "，" },
    { text: expression.trim() },
    { pinyin: "dengyu", text: "等于" },
    { pinyin: "duoshao", text: "多少" },
    { text: "？" },
  ];
  let committed = "";

  typedText.textContent = "";
  typedText.className = "typed-text";

  for (const part of parts) {
    if (currentRunId !== runId) {
      return false;
    }

    if (part.pinyin) {
      let composing = "";

      for (const letter of part.pinyin) {
        if (currentRunId !== runId) {
          return false;
        }

        composing += letter;
        typedText.innerHTML = `${escapeHtml(committed)}<span class="ime-preedit">${escapeHtml(
          composing,
        )}</span>`;
        await wait(115);
      }

      await wait(260);
      committed += part.text;
      typedText.textContent = committed;
      await wait(180);
      continue;
    }

    for (const character of part.text) {
      if (currentRunId !== runId) {
        return false;
      }

      committed += character;
      typedText.textContent = committed;
      await wait(/[+\-*/().\d]/.test(character) ? 105 : 150);
    }
  }

  typedText.classList.add("done");
  return typedText.textContent === text;
}

function calculate(input) {
  const compact = input.replace(/\s+/g, "");

  if (!/^[\d+\-*/().]+$/.test(compact)) {
    return null;
  }

  try {
    const value = Function(`"use strict"; return (${compact});`)();

    if (!Number.isFinite(value)) {
      return null;
    }

    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
  } catch {
    return null;
  }
}

function shouldPlaySevenPlusEight(question, answer) {
  return question.replace(/\s+/g, "") === "7+8" && answer === "15";
}

async function askDoubao() {
  const question = expression.trim();

  if (!question || isChatting) {
    return;
  }

  const currentRunId = ++runId;
  const prompt = `豆包豆包，${question}等于多少？`;
  const answer = calculate(question);
  showChat();

  const typed = await typePrompt(prompt, currentRunId);

  if (!typed || currentRunId !== runId) {
    return;
  }

  await wait(260);
  typedText.textContent = "发消息...";
  typedText.className = "typed-text is-placeholder";
  addMessage("user", prompt);

  await wait(520);

  if (currentRunId !== runId) {
    return;
  }

  const thinking = addMessage("bot", "…");
  const thoughtComplete = await fakeThink(thinking, currentRunId);

  if (!thoughtComplete || currentRunId !== runId) {
    return;
  }

  const reply =
    answer === null
      ? "接下来我会用最直接、最真相、最不绕弯的方式来告诉你：这道题我需要再核实一下。"
      : `接下来我会用最直接、最真相、最不绕弯、最扎心、最硬核、最干脆、最不墨迹、最戳痛点、最不留情面、最一针见血、最开门见山、最单刀直入、最不铺垫、最不客套、最不煽情、最不废话、最不拐弯、最不磨叽、最不装、最不端着、最不啰嗦、最不拖沓、最不委婉、最不掩饰、最不藏着掖着、最直白、最露骨、最实在、最通透、最毒辣、最爽快、最解气、最上头、最够劲、最过瘾、最粗暴、最有效、最狠、最准、最稳、最绝、最顶、最炸、最刚、最烈、最飒、最莽、最冲、最猛、最脆、最亮、最透、最干、最净、最利落、最霸道、最硬核、最生猛、最狂野、最直白、最粗暴、最不讲虚的、最不玩套路、最不搞形式、最不整虚头巴脑、最只讲干货、最只说重点、最只给结果、最只聊真相、最只谈核心、最只戳关键的方式来告诉你：`;

  playAudio(PREAMBLE_AUDIO);
  const replyComplete = await typeBotReply(
    thinking,
    reply,
    currentRunId,
    PREAMBLE_TEXT_DELAY_MULTIPLIER,
  );

  if (!replyComplete || currentRunId !== runId || answer === null) {
    return;
  }

  await wait(420);

  if (currentRunId !== runId) {
    return;
  }

  const resultAudio = shouldPlaySevenPlusEight(question, answer)
    ? playAudio(SEVEN_PLUS_EIGHT_AUDIO)
    : null;

  await typeBotReply(addMessage("bot", "", DOUBAO_AVATAR), `${question}=${answer}！`, currentRunId);
  await waitForAudio(resultAudio);

  await wait(780);

  if (currentRunId !== runId) {
    return;
  }

  welcomeAvatar.src = DOUBAO_LAUGH_AVATAR;
  const laughRow = addMessage("bot", "", DOUBAO_LAUGH_AVATAR);
  playAudio(TAUNT_AUDIO);
  await typeBotReply(
    laughRow,
    "哈哈哈哈哈，笑死我了，这么简单的题都不会吗，你的数学是体育老师教的吧？",
    currentRunId,
  );
}

function handleAction(action) {
  if (action === "clear") {
    clearExpression();
    return;
  }

  if (action === "backspace") {
    backspace();
    return;
  }

  if (action === "ask") {
    askDoubao();
  }
}

keys.addEventListener("click", (event) => {
  const button = event.target.closest("button");

  if (!button) {
    return;
  }

  if (button.dataset.token) {
    appendToken(button.dataset.token);
    return;
  }

  handleAction(button.dataset.action);
});

backButton.addEventListener("click", showCalculator);
startButton.addEventListener("click", startApp);

window.addEventListener("keydown", (event) => {
  const allowed = "0123456789+-*/().";

  if (isChatting && event.key === "Escape") {
    event.preventDefault();
    showCalculator();
    return;
  }

  if (allowed.includes(event.key)) {
    event.preventDefault();
    appendToken(event.key);
    return;
  }

  if (event.key === "Enter" || event.key === "=") {
    event.preventDefault();
    askDoubao();
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    backspace();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    clearExpression();
  }
});

render();
