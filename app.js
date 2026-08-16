// --- 1. INITIALISATION AUDIO & VARIABLES GLOBALES ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let playlist = []; // Contient { name, file, buffer }
let overlapTime = 8;
let isPlaying = false;

// Structure des deux platines
const decks = [
  { source: null, gainNode: audioCtx.createGain(), timeout: null, startTime: 0, startOffset: 0, duration: 0, animFrame: null, track: null },
  { source: null, gainNode: audioCtx.createGain(), timeout: null, startTime: 0, startOffset: 0, duration: 0, animFrame: null, track: null }
];

// Master Volume
const masterGain = audioCtx.createGain();
decks[0].gainNode.connect(masterGain);
decks[1].gainNode.connect(masterGain);
masterGain.connect(audioCtx.destination);

// --- 2. RÉCUPÉRATION DES ÉLÉMENTS HTML ---
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

// --- 3. IMPORTATION RAPIDE ---
function handleFilesImport(files) {
  const audioFiles = Array.from(files).filter(file => 
    file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav')
  );

  for (const file of audioFiles) {
    playlist.push({
      name: file.name,
      file: file,
      buffer: null
    });
  }

  updatePlaylistUI();

  if (playlist.length > 0 && btnPlayAll) {
    btnPlayAll.disabled = false;
  }
}

if (audioInput) audioInput.addEventListener('change', (e) => handleFilesImport(e.target.files));
if (folderInput) folderInput.addEventListener('change', (e) => handleFilesImport(e.target.files));

// --- 4. PLAYLIST & GLISSER-DÉPOSER (DRAG & DROP) ---
function updatePlaylistUI() {
  if (!playlistUI) return;
  playlistUI.innerHTML = '';
  
  playlist.forEach((track, index) => {
    const li = document.createElement('li');
    li.textContent = `${index + 1}. ${track.name}`;
    li.draggable = true;

    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', index.toString());
      e.dataTransfer.effectAllowed = 'move';
    });

    playlistUI.appendChild(li);
  });
}

// Configuration des zones d'atterrissage sur les Platines (Deck A / Deck B)
document.querySelectorAll('.deck.drop-zone').forEach(zone => {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    const trackIndexStr = e.dataTransfer.getData('text/plain');
    const trackIndex = parseInt(trackIndexStr, 10);
    const targetDeckIdx = parseInt(zone.dataset.deck, 10);

    if (!isNaN(trackIndex) && playlist[trackIndex]) {
      // Extraire le morceau de la liste et le charger sur le deck choisi
      const selectedTrack = playlist.splice(trackIndex, 1)[0];
      updatePlaylistUI();

      // Jouer ou charger sur la platine ciblée
      await playTrackOnDeck(targetDeckIdx, 0, selectedTrack);
    }
  });
});

if (btnClear) {
  btnClear.addEventListener('click', () => {
    playlist = [];
    updatePlaylistUI();
    if (btnPlayAll) btnPlayAll.disabled = true;
  });
}

// --- 5. RÉGLAGES FONDU ET VOLUME ---
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

// --- 6. BARRE DE NAVIGATION & TIMERS ---
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function startTimer(deckIdx) {
  const deck = decks[deckIdx];
  const prefix = deckIdx === 0 ? 'a' : 'b';
  const timeElem = document.getElementById(`time-${prefix}`);
  const seekElem = document.getElementById(`seek-${prefix}`);

  if (seekElem) {
    seekElem.max = deck.duration;
    seekElem.disabled = false;
  }

  function update() {
    const elapsed = (audioCtx.currentTime - deck.startTime) + deck.startOffset;
    const remaining = Math.max(0, deck.duration - elapsed);

    if (timeElem) {
      timeElem.textContent = `-${formatTime(remaining)} / ${formatTime(deck.duration)}`;
    }
    if (seekElem) {
      seekElem.value = Math.min(elapsed, deck.duration);
    }

    if (elapsed < deck.duration && isPlaying) {
      deck.animFrame = requestAnimationFrame(update);
    }
  }

  if (deck.animFrame) cancelAnimationFrame(deck.animFrame);
  deck.animFrame = requestAnimationFrame(update);
}

// Configuration des événements de la barre de défilement (Seek Bar)
['a', 'b'].forEach((prefix, idx) => {
  const seekElem = document.getElementById(`seek-${prefix}`);
  if (seekElem) {
    seekElem.addEventListener('change', (e) => {
      const newOffset = parseFloat(e.target.value);
      if (decks[idx].track) {
        playTrackOnDeck(idx, newOffset, decks[idx].track);
      }
    });
  }
});

// --- 7. DÉCODAGE ET LECTURE AVEC ENCHAÎNEMENT ---
async function getAudioBuffer(track) {
  if (track.buffer) return track.buffer;
  const arrayBuffer = await track.file.arrayBuffer();
  track.buffer = await audioCtx.decodeAudioData(arrayBuffer);
  return track.buffer;
}

async function playTrackOnDeck(deckIdx, startOffset = 0, trackToPlay = null) {
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  // Sélectionner le morceau passé ou prendre le premier de la file d'attente
  const track = trackToPlay || playlist.shift();
  if (!track) return;

  updatePlaylistUI();

  const deck = decks[deckIdx];
  deck.track = track;

  // Décodage du fichier audio
  const buffer = await getAudioBuffer(track);

  // Mise à jour de l'affichage du titre
  const prefix = deckIdx === 0 ? 'a' : 'b';
  const titleElem = document.getElementById(`title-${prefix}`);
  if (titleElem) titleElem.textContent = track.name;

  // Arrêt propre de l'ancienne source si elle jouait
  if (deck.source) {
    try { deck.source.stop(); } catch (e) {}
  }
  if (deck.animFrame) cancelAnimationFrame(deck.animFrame);

  deck.source = audioCtx.createBufferSource();
  deck.source.buffer = buffer;
  deck.source.connect(deck.gainNode);

  const now = audioCtx.currentTime;
  const duration = buffer.duration;
  const remainingTime = duration - startOffset;

  deck.startTime = now;
  deck.startOffset = startOffset;
  deck.duration = duration;

  // Configuration des fondus (Fade In / Fade Out)
  const fadeInDuration = Math.min(overlapTime, remainingTime);
  const fadeOutStart = Math.max(0, duration - overlapTime - startOffset);

  deck.gainNode.gain.cancelScheduledValues(now);

  // Transition en entrée
  deck.gainNode.gain.setValueAtTime(0.001, now);
  deck.gainNode.gain.linearRampToValueAtTime(1, now + fadeInDuration);

  // Transition en sortie
  if (fadeOutStart > 0) {
    deck.gainNode.gain.setValueAtTime(1, now + fadeOutStart);
    deck.gainNode.gain.linearRampToValueAtTime(0.001, now + remainingTime);
  }

  // Démarrer la lecture au point désiré
  deck.source.start(now, startOffset);
  isPlaying = true;

  // Lancer le timer d'affichage
  startTimer(deckIdx);

  // Placer le crossfader du bon côté
  if (crossfaderUI) {
    crossfaderUI.value = deckIdx === 0 ? 0 : 1;
  }

  // Programmer le démarrage automatique du morceau suivant sur l'autre platine
  if (deck.timeout) clearTimeout(deck.timeout);

  const timeUntilNext = Math.max(0, remainingTime - overlapTime) * 1000;

  deck.timeout = setTimeout(() => {
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
  }, timeUntilNext);
}

// --- 8. CONTROLES PLAY ET PAUSE ---
if (btnPlayAll) {
  btnPlayAll.addEventListener('click', async () => {
    if (playlist.length === 0) return;

    btnPlayAll.disabled = true;
    if (btnPause) btnPause.disabled = false;

    await playTrackOnDeck(0, 0);
  });
}