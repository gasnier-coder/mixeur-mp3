// --- 1. INITIALISATION AUDIO & VARIABLES GLOBALES ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let playlist = [];
let overlapTime = 8; // Correspond au slider (8s par défaut)
let isPlaying = false;
let currentDeckIdx = 0;

// Structure des deux platines
const decks = [
  { source: null, gainNode: audioCtx.createGain(), nextTimeout: null },
  { source: null, gainNode: audioCtx.createGain(), nextTimeout: null }
];

// Master Volume
const masterGain = audioCtx.createGain();
decks[0].gainNode.connect(masterGain);
decks[1].gainNode.connect(masterGain);
masterGain.connect(audioCtx.destination);

// --- 2. RÉCUPÉRATION DES ÉLÉMENTS HTML (IDS EXACTS DE TON HTML) ---
const audioInput = document.getElementById('audio-input');
const folderInput = document.getElementById('folder-input');
const btnPlayAll = document.getElementById('btn-play-all');
const btnPause = document.getElementById('btn-pause');
const btnClear = document.getElementById('btn-clear-playlist');
const fadeInput = document.getElementById('fade-time');
const fadeValueDisplay = document.getElementById('fade-value');
const masterVolumeInput = document.getElementById('master-volume');
const volumeValueDisplay = document.getElementById('volume-value');
const playlistUI = document.getElementById('playlist');
const crossfaderUI = document.getElementById('crossfader');

// --- 3. GESTION DE L'IMPORTATION (FICHIERS ET DOSSIERS) ---
async function handleFilesImport(files) {
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const audioFiles = Array.from(files).filter(file => 
    file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav')
  );

  for (const file of audioFiles) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      playlist.push({ name: file.name, buffer: audioBuffer });
    } catch (e) {
      console.error("Erreur de lecture sur " + file.name, e);
    }
  }

  updatePlaylistUI();

  if (playlist.length > 0 && btnPlayAll) {
    btnPlayAll.disabled = false;
  }
}

if (audioInput) {
  audioInput.addEventListener('change', (e) => handleFilesImport(e.target.files));
}
if (folderInput) {
  folderInput.addEventListener('change', (e) => handleFilesImport(e.target.files));
}

// --- 4. MISE À JOUR VISUELLE DE LA PLAYLIST ---
function updatePlaylistUI() {
  if (!playlistUI) return;
  playlistUI.innerHTML = '';
  
  playlist.forEach((track, index) => {
    const li = document.createElement('li');
    li.textContent = `${index + 1}. ${track.name}`;
    playlistUI.appendChild(li);
  });
}

// Clear Playlist
if (btnClear) {
  btnClear.addEventListener('click', () => {
    playlist = [];
    updatePlaylistUI();
    if (btnPlayAll) btnPlayAll.disabled = true;
  });
}

// --- 5. REGLAGES FONDU ET VOLUME ---
if (fadeInput) {
  fadeInput.addEventListener('input', (e) => {
    overlapTime = parseFloat(e.target.value);
    if (fadeValueDisplay) fadeValueDisplay.textContent = overlapTime;
  });
}

if (masterVolumeInput) {
  masterVolumeInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    masterGain.gain.setValueAtTime(val, audioCtx.currentTime);
    if (volumeValueDisplay) volumeValueDisplay.textContent = Math.round(val * 100);
  });
}

// --- 6. FONCTION DE LECTURE AVEC CROSSFADE ---
function playTrackOnDeck(deckIdx, startOffset = 0) {
  const deck = decks[deckIdx];
  const track = playlist[0];

  if (!track) return;

  // Affichage du titre sur le Deck actif
  const titleElem = document.getElementById(deckIdx === 0 ? 'title-a' : 'title-b');
  if (titleElem) titleElem.textContent = track.name;

  if (deck.source) {
    try { deck.source.stop(); } catch (e) {}
  }

  deck.source = audioCtx.createBufferSource();
  deck.source.buffer = track.buffer;
  deck.source.connect(deck.gainNode);

  const now = audioCtx.currentTime;
  const duration = track.buffer.duration;
  const remainingTime = duration - startOffset;
  const fadeOutStart = duration - overlapTime;

  deck.gainNode.gain.cancelScheduledValues(now);

  const fadeInDuration = Math.min(overlapTime, remainingTime);
  deck.gainNode.gain.setValueAtTime(0.001, now);
  deck.gainNode.gain.linearRampToValueAtTime(1, now + fadeInDuration);

  if (startOffset < fadeOutStart) {
    const timeUntilFadeOut = fadeOutStart - startOffset;
    deck.gainNode.gain.setValueAtTime(1, now + timeUntilFadeOut);
    deck.gainNode.gain.linearRampToValueAtTime(0.001, now + remainingTime);
  } else if (startOffset >= fadeOutStart && startOffset > 0) {
    deck.gainNode.gain.linearRampToValueAtTime(0.001, now + remainingTime);
  }

  deck.source.start(now, startOffset);

  if (crossfaderUI) {
    crossfaderUI.value = deckIdx === 0 ? 0 : 1;
  }

  if (deck.nextTimeout) clearTimeout(deck.nextTimeout);

  const triggerNextIn = Math.max(0, duration - startOffset - overlapTime) * 1000;

  deck.nextTimeout = setTimeout(() => {
    playlist.shift();
    updatePlaylistUI();

    const nextDeckIdx = deckIdx === 0 ? 1 : 0;

    if (playlist.length > 0) {
      playTrackOnDeck(nextDeckIdx, 0);
    } else {
      isPlaying = false;
      if (btnPlayAll) {
        btnPlayAll.disabled = false;
        btnPlayAll.textContent = "▶ Démarrer";
      }
      if (btnPause) btnPause.disabled = true;
    }
  }, triggerNextIn);
}

// --- 7. BOUTONS PLAY & PAUSE ---
if (btnPlayAll) {
  btnPlayAll.addEventListener('click', async () => {
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    if (playlist.length === 0) return;

    isPlaying = true;
    btnPlayAll.disabled = true;
    if (btnPause) btnPause.disabled = false;

    playTrackOnDeck(currentDeckIdx, 0);
  });
}