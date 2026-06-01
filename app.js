const STORAGE_KEYS = {
  apiKeys: "blst_api_keys_v1",
  settings: "blst_settings_v1",
  progress: "blst_progress_v1"
};

const languageList = [
  "Sinhala", "English", "Hindi", "Tamil", "Arabic", "Indonesian", "Filipino", "Spanish", "French", "Korean", "Japanese", "Chinese", "Thai", "Vietnamese", "Malay", "Bengali", "Urdu", "Portuguese", "German", "Italian", "Russian", "Turkish"
];
const geminiModels = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash"
];

const DEFAULT_MODEL = "gemini-2.5-flash";


const stylePrompts = {
  normal: "Use clear, natural, subtitle-friendly language for native {TARGET_LANGUAGE} speakers. Avoid robotic or overly literal translation.",
  kdrama: "Use a natural Korean drama subtitle style for {TARGET_LANGUAGE} viewers. Preserve emotional tone, honorific feeling, romance, family tension, and soft dramatic expressions where appropriate.",
  koreanHistorical: "Use a historical drama style for {TARGET_LANGUAGE} viewers. Preserve royal, palace, noble, king, queen, prince, princess, minister, servant, and respectful ranking tone. Avoid modern slang.",
  chineseWuxia: "Use an ancient fantasy, martial arts, Wuxia or Xianxia subtitle style for {TARGET_LANGUAGE} viewers. Preserve sect, clan, master-disciple, cultivation, spiritual energy, immortal, demon, heavenly realm, and martial arts concepts consistently.",
  actionCrime: "Use a strong cinematic action/crime/thriller subtitle style for {TARGET_LANGUAGE} viewers. Keep tension, threats, anger, fear, revenge, police, investigation, and gangster tone punchy and natural.",
  comedy: "Use a natural comedy subtitle style for {TARGET_LANGUAGE} viewers. Make jokes sound natural, preserve funny timing, and avoid overly literal translations that ruin humor.",
  animeFantasy: "Use an energetic anime/fantasy subtitle style for {TARGET_LANGUAGE} viewers. Preserve dramatic reactions, adventure, magic, friendship, battles, and emotional intensity."
};

const profanityPrompts = {
  noProfanity: "Remove or soften all profanity and vulgar expressions. Keep the original meaning, anger, emotion, and context, but make it safe for family viewing in {TARGET_LANGUAGE}.",
  softClean: "Soften strong bad words into mild natural expressions in {TARGET_LANGUAGE}. Keep anger and emotional meaning without vulgar wording.",
  keepMeaning: "Preserve the original meaning, anger, slang, street tone, and emotional intensity. Translate insults and strong expressions naturally in {TARGET_LANGUAGE}. Do not add stronger profanity than the original.",
  strongAdult: "Preserve strong adult language when it exists in the original. Keep aggressive, vulgar, gangster, or street dialogue tone. Do not add profanity where the original does not contain it."
};

let apiKeys = [];
let activeKeyIndex = 0;
let selectedFile = null;
let selectedFileText = "";
let selectedFileExt = "txt";
let isPaused = false;
let isTranslating = false;
let translatedChunks = [];
let chunks = [];

const $ = (id) => document.getElementById(id);

function init() {
  loadState();
  populateLanguages();
  populateModels();
  renderKeys();
  bindEvents();
  restoreProgressIfAny();
}

document.addEventListener("DOMContentLoaded", init);

function loadState() {
  apiKeys = safeJsonParse(localStorage.getItem(STORAGE_KEYS.apiKeys), []);
  const settings = safeJsonParse(localStorage.getItem(STORAGE_KEYS.settings), {});
  activeKeyIndex = Number(settings.activeKeyIndex || 0);
  if (activeKeyIndex >= apiKeys.length) activeKeyIndex = 0;
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.apiKeys, JSON.stringify(apiKeys));
  const settings = getSettings();
  settings.activeKeyIndex = activeKeyIndex;
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function getSettings() {
  return {
    sourceLanguage: $("sourceLanguage").value,
    targetLanguage: $("targetLanguage").value,
    translationStyle: $("translationStyle").value,
    profanityMode: $("profanityMode").value,
    modelName: $("modelName").value,
    chunkSize: Number($("chunkSize").value || 20)
  };
}

function populateModels() {
  const select = $("modelName");
  if (!select) return;

  const settings = safeJsonParse(localStorage.getItem(STORAGE_KEYS.settings), {});
  const savedModel = settings.modelName;

  select.innerHTML = "";
  geminiModels.forEach((model) => {
    const opt = document.createElement("option");
    opt.value = model;
    opt.textContent = model;
    select.appendChild(opt);
  });

  select.value = geminiModels.includes(savedModel) ? savedModel : DEFAULT_MODEL;
}

function populateLanguages() {
  const target = $("targetLanguage");
  target.innerHTML = "";
  languageList.forEach((lang) => {
    const opt = document.createElement("option");
    opt.value = lang;
    opt.textContent = lang;
    target.appendChild(opt);
  });
  target.value = "Sinhala";

  const settings = safeJsonParse(localStorage.getItem(STORAGE_KEYS.settings), {});
  for (const [key, value] of Object.entries(settings)) {
    if ($(key) && key !== "activeKeyIndex" && key !== "modelName") $(key).value = value;
  }
}

function bindEvents() {
  $("toggleKeyBtn").addEventListener("click", toggleKeyVisibility);
  $("addKeyBtn").addEventListener("click", addApiKey);
  $("exportKeysBtn").addEventListener("click", exportBackup);
  $("importKeysFile").addEventListener("change", importBackup);
  $("chooseFileBtn").addEventListener("click", () => $("subtitleFile").click());
  $("subtitleFile").addEventListener("change", handleFileSelect);
  $("startBtn").addEventListener("click", startTranslation);
  $("pauseBtn").addEventListener("click", pauseTranslation);
  $("resumeBtn").addEventListener("click", resumeTranslation);
  $("downloadBtn").addEventListener("click", () => downloadOutput(false));
  $("downloadPartialBtn").addEventListener("click", () => downloadOutput(true));
  $("clearProgressBtn").addEventListener("click", clearProgress);

  ["sourceLanguage", "targetLanguage", "translationStyle", "profanityMode", "modelName", "chunkSize"].forEach((id) => {
    $(id).addEventListener("change", saveState);
  });

  const uploadBox = $("uploadBox");
  uploadBox.addEventListener("dragover", (e) => { e.preventDefault(); uploadBox.classList.add("dragover"); });
  uploadBox.addEventListener("dragleave", () => uploadBox.classList.remove("dragover"));
  uploadBox.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadBox.classList.remove("dragover");
    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  });
}

function toggleKeyVisibility() {
  const input = $("apiKey");
  input.type = input.type === "password" ? "text" : "password";
  $("toggleKeyBtn").textContent = input.type === "password" ? "Show" : "Hide";
}

function addApiKey() {
  const key = $("apiKey").value.trim();
  const name = $("keyName").value.trim() || `Gemini Key ${apiKeys.length + 1}`;
  if (!key || key.length < 20) return showStatus("Please enter a valid Gemini API key.", true);
  if (apiKeys.some((item) => item.key === key)) return showStatus("This API key is already added.", true);

  apiKeys.push({ name, key, status: "ready", createdAt: new Date().toISOString() });
  if (apiKeys.length === 1) activeKeyIndex = 0;
  $("apiKey").value = "";
  $("keyName").value = "";
  saveState();
  renderKeys();
  showStatus("API key added.");
}

function renderKeys() {
  const list = $("keysList");
  list.innerHTML = "";
  if (!apiKeys.length) {
    list.innerHTML = `<div class="privacy-note">No API keys added yet.</div>`;
    return;
  }

  apiKeys.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = `key-item ${index === activeKeyIndex ? "active" : ""}`;
    row.innerHTML = `
      <div>
        <div class="key-name">${escapeHtml(item.name)} ${index === activeKeyIndex ? "• Active" : ""}</div>
        <div class="key-mask">${maskKey(item.key)} • ${item.status || "ready"}</div>
      </div>
      <div class="key-actions">
        <button class="btn" data-action="set" data-index="${index}">Set</button>
        <button class="btn danger" data-action="delete" data-index="${index}">Delete</button>
      </div>`;
    list.appendChild(row);
  });

  list.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      if (btn.dataset.action === "set") {
        activeKeyIndex = index;
        saveState();
        renderKeys();
      }
      if (btn.dataset.action === "delete") {
        apiKeys.splice(index, 1);
        if (activeKeyIndex >= apiKeys.length) activeKeyIndex = 0;
        saveState();
        renderKeys();
      }
    });
  });
}

function exportBackup() {
  const backup = {
    app: "Black Lion Subtitle Translator Pro",
    version: "1.0.0-static",
    exportedAt: new Date().toISOString(),
    apiKeys,
    settings: getSettings()
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  downloadBlob(blob, `blacklion-api-keys-backup-${Date.now()}.json`);
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      if (!backup || !Array.isArray(backup.apiKeys)) throw new Error("Invalid backup file.");
      apiKeys = backup.apiKeys.filter((item) => item && item.key);
      activeKeyIndex = 0;
      if (backup.settings) {
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ ...backup.settings, activeKeyIndex }));
        populateLanguages();
      }
      saveState();
      renderKeys();
      showStatus("Backup imported successfully.");
    } catch (error) {
      showStatus("Backup import failed: " + error.message, true);
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["srt", "vtt", "txt"].includes(ext)) return showStatus("Only SRT, VTT and TXT files are supported in this version.", true);

  const reader = new FileReader();
  reader.onload = () => {
    selectedFile = file;
    selectedFileText = String(reader.result || "");
    selectedFileExt = ext;
    $("fileInfo").textContent = `${file.name} • ${(file.size / 1024).toFixed(1)} KB`;
    $("previewBox").value = selectedFileText.slice(0, 50000);
    $("outputBox").value = "";
    clearProgress(false);
    showStatus("File loaded. Ready to translate.");
  };
  reader.readAsText(file);
}

async function startTranslation() {
  if (!apiKeys.length) return showStatus("Please add at least one Gemini API key first.", true);
  if (!selectedFileText) return showStatus("Please choose a subtitle file first.", true);
  if (isTranslating) return;

  const settings = getSettings();
  chunks = createChunks(selectedFileText, selectedFileExt, settings.chunkSize);
  translatedChunks = new Array(chunks.length).fill(null);
  isPaused = false;
  isTranslating = true;
  setButtonsForTranslation(true);
  await translateLoop(0);
}

function pauseTranslation() {
  isPaused = true;
  showStatus("Paused. You can resume later.");
  $("pauseBtn").disabled = true;
  $("resumeBtn").disabled = false;
}

async function resumeTranslation() {
  if (isTranslating && !isPaused) return;
  const progress = safeJsonParse(localStorage.getItem(STORAGE_KEYS.progress), null);
  if (progress && progress.chunks && progress.translatedChunks) {
    chunks = progress.chunks;
    translatedChunks = progress.translatedChunks;
    selectedFileExt = progress.selectedFileExt || selectedFileExt;
  }
  if (!chunks.length) return showStatus("No saved progress found.", true);
  isPaused = false;
  isTranslating = true;
  setButtonsForTranslation(true);
  const startIndex = translatedChunks.findIndex((item) => item === null);
  await translateLoop(startIndex === -1 ? chunks.length : startIndex);
}

async function translateLoop(startIndex) {
  try {
    for (let i = startIndex; i < chunks.length; i++) {
      if (isPaused) {
        saveProgress();
        isTranslating = false;
        return;
      }
      if (translatedChunks[i] !== null) continue;
      updateProgress(i, chunks.length, `Translating chunk ${i + 1}/${chunks.length}...`);
      const translated = await callGeminiWithRotation(chunks[i]);
      translatedChunks[i] = translated.trim();
      saveProgress();
      updateOutput();
      await sleep(600);
    }
    updateProgress(chunks.length, chunks.length, "Translation complete.");
    localStorage.removeItem(STORAGE_KEYS.progress);
    $("downloadBtn").disabled = false;
    $("downloadPartialBtn").disabled = false;
  } catch (error) {
    saveProgress();
    showStatus(`Translation paused: ${error.message}`, true);
    $("resumeBtn").disabled = false;
  } finally {
    isTranslating = false;
    setButtonsForTranslation(false);
  }
}

async function callGeminiWithRotation(content) {
  let attempts = 0;
  let lastError = null;
  while (attempts < Math.max(apiKeys.length, 1)) {
    const activeKey = apiKeys[activeKeyIndex];
    if (!activeKey) throw new Error("No active API key available.");
    try {
      return await callGemini(activeKey.key, content);
    } catch (error) {
      lastError = error;
      const lower = error.message.toLowerCase();
      const shouldSwitch = lower.includes("quota") || lower.includes("rate") || lower.includes("429") || lower.includes("resource exhausted") || lower.includes("invalid api key") || lower.includes("403") || lower.includes("401");
      if (shouldSwitch) {
        activeKey.status = "limited/error";
        const switched = switchToNextUsableKey();
        saveState();
        renderKeys();
        if (!switched) break;
        attempts++;
        showStatus(`Switched to ${apiKeys[activeKeyIndex].name}. Continuing...`);
        continue;
      }
      await sleep(1800);
      attempts++;
    }
  }
  throw lastError || new Error("All API keys failed.");
}

async function callGemini(apiKey, content) {
  const settings = getSettings();
  const prompt = buildPrompt(content, settings);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35 }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini API error ${response.status}`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned empty response.");
  return cleanModelOutput(text);
}

function buildPrompt(content, settings) {
  const style = replaceVars(stylePrompts[settings.translationStyle] || stylePrompts.normal, settings);
  const profanity = replaceVars(profanityPrompts[settings.profanityMode] || profanityPrompts.noProfanity, settings);

  return `You are a professional subtitle translator.\n\nTranslate the subtitle content from ${settings.sourceLanguage} to ${settings.targetLanguage}.\n\nTranslation style:\n${style}\n\nProfanity handling:\n${profanity}\n\nFormat rules:\n- Output must be in ${settings.targetLanguage}.\n- Preserve subtitle numbers exactly.\n- Preserve timestamps exactly.\n- Translate only dialogue/text lines.\n- Do not translate timestamps.\n- Do not remove blank lines.\n- Do not merge subtitle blocks.\n- Do not split subtitle blocks.\n- Keep the original subtitle format.\n- Preserve HTML tags like <i>, <b>, <u>.\n- Keep names, places, brands, and proper nouns unchanged when appropriate.\n- Do not add explanations.\n- Do not add notes.\n- Do not add markdown.\n- Output only the translated subtitle content.\n\nSubtitle content:\n${content}`;
}

function replaceVars(text, settings) {
  return text.replaceAll("{TARGET_LANGUAGE}", settings.targetLanguage).replaceAll("{SOURCE_LANGUAGE}", settings.sourceLanguage);
}

function createChunks(text, ext, blockCount) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (ext === "txt") return chunkPlainText(normalized, 3500);
  const blocks = normalized.split(/\n{2,}/g).filter((block) => block.trim());
  const result = [];
  for (let i = 0; i < blocks.length; i += blockCount) {
    result.push(blocks.slice(i, i + blockCount).join("\n\n"));
  }
  return result.length ? result : chunkPlainText(normalized, 3500);
}

function chunkPlainText(text, maxChars) {
  const result = [];
  for (let i = 0; i < text.length; i += maxChars) result.push(text.slice(i, i + maxChars));
  return result;
}

function switchToNextUsableKey() {
  if (apiKeys.length < 2) return false;
  for (let step = 1; step <= apiKeys.length; step++) {
    const nextIndex = (activeKeyIndex + step) % apiKeys.length;
    if (apiKeys[nextIndex].status !== "limited/error") {
      activeKeyIndex = nextIndex;
      apiKeys[nextIndex].status = "ready";
      return true;
    }
  }
  return false;
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({
    chunks,
    translatedChunks,
    selectedFileExt,
    fileName: selectedFile?.name || "subtitle"
  }));
  $("downloadPartialBtn").disabled = false;
}

function restoreProgressIfAny() {
  const progress = safeJsonParse(localStorage.getItem(STORAGE_KEYS.progress), null);
  if (!progress) return;
  showStatus("Saved progress found. Click Resume to continue.");
  $("resumeBtn").disabled = false;
  chunks = progress.chunks || [];
  translatedChunks = progress.translatedChunks || [];
  selectedFileExt = progress.selectedFileExt || "txt";
  updateOutput();
}

function clearProgress(show = true) {
  localStorage.removeItem(STORAGE_KEYS.progress);
  chunks = [];
  translatedChunks = [];
  updateProgress(0, 1, "Progress cleared.");
  $("downloadBtn").disabled = true;
  $("downloadPartialBtn").disabled = true;
  if (show) showStatus("Progress cleared.");
}

function updateOutput() {
  const output = translatedChunks.filter((item) => item !== null).join("\n\n");
  $("outputBox").value = output;
}

function updateProgress(done, total, status) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  $("progressFill").style.width = `${percent}%`;
  $("progressText").textContent = `Progress: ${percent}%`;
  $("statusText").textContent = status;
}

function showStatus(message, isError = false) {
  $("statusText").textContent = message;
  $("statusText").style.color = isError ? "#ff8a8a" : "#aeb2c2";
}

function setButtonsForTranslation(active) {
  $("startBtn").disabled = active;
  $("pauseBtn").disabled = !active;
  if (!active && !isPaused) $("pauseBtn").disabled = true;
}

function downloadOutput(partial) {
  const output = $("outputBox").value.trim();
  if (!output) return showStatus("No translated output to download.", true);
  const originalName = selectedFile?.name?.replace(/\.[^.]+$/, "") || "translated-subtitle";
  const suffix = partial ? "partial" : "translated";
  const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, `${originalName}-${suffix}.${selectedFileExt}`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeJsonParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 12) return "••••••";
  return `${key.slice(0, 6)}••••••••${key.slice(-6)}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function cleanModelOutput(text) {
  return text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
