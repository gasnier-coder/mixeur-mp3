// --- 1. INITIALISATION AUDIO & VARIABLES GLOBALES ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let playlist = []; // Contient { name, file, buffer }
let overlapTime = 8;
let isPlaying = false;

// Structure des deux platines
const decks = [
  { source: null, gainNode: audioCtx.createGain(), timeout: null, startTime: 0, duration: 0, animFrame: null },
  { source: null, gainNode: audioCtx.createGain(), timeout: null, startTime: 0, duration: 0, animFrame: null }
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

// --- 3. IMPORTATION ULTRA-RAPIDE ---
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

// --- 4. MISE À JOUR & DRAG/DROP DE LA PLAYLIST ---
function updatePlaylistUI() {
  if (!playlistUI) return;
  playlistUI.innerHTML = '';
  
  playlist.forEach((track, index) => {
    const li = document.createElement('li');
    li.textContent = `${index + 1}. ${track.name}`;
    li.draggable = true;

    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', index);
    });

    playlistUI.appendChild(li);
  });
}

document.querySelectorAll('.drop-zone').forEach(zone => {
  zone.addEventListener('dragover', (e) => e.preventDefault());
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    const trackIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const targetDeckIdx = parseInt(zone.dataset.deck, 10);

    if (!isNaN(trackIndex) && playlist[trackIndex]) {
      const track = playlist.splice(trackIndex, 1)[0];
      playlist.unshift(track);
      updatePlaylistUI();
      
      if (isPlaying) {
        await playTrackOnDeck(targetDeckIdx);
      }
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

// --- 6. GESTION DU TEMPS ET ANIMATION COMPTEURS ---
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
    const elapsed = audioCtx.currentTime - deck.startTime;
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

// --- 7. DÉCODAGE & LECTURE DES TITRES ---
async function getAudioBuffer(track) {
  if (track.buffer) return track.buffer;
  const arrayBuffer = await track.file.arrayBuffer();
  track.buffer = await audioCtx.decodeAudioData(arrayBuffer);
  return track.buffer;
}

async function playTrackOnDeck(deckIdx) {
  if (playlist.length === 0) return;

  const deck = decks[deckIdx];
  const track = playlist[0]; // Prends le morceau en tête de liste

  // Décodage
  const buffer = await getAudioBuffer(track);

  // Mettre à jour le nom
  const prefix = deckIdx === 0 ? 'a' : 'b';
  const titleElem = document.getElementById(`title-${prefix}`);
  if (titleElem) titleElem.textContent = track.name;

  // Arrêter l'ancienne source
  if (deck.source) {
    try { deck.source.stop(); } catch (e) {}
  }
  if (deck.animFrame) cancelAnimationFrame(deck.animFrame);

  deck.source = audioCtx.createBufferSource();
  deck.source.buffer = buffer;
  deck.source.connect(deck.gainNode);

  const now = audioCtx.currentTime;
  const duration = buffer.duration;
  deck.startTime = now;
  deck.duration = duration;

  const fadeInDuration = Math.min(overlapTime, duration);
  const fadeOutStart = Math.max(0, duration - overlapTime);

  deck.gainNode.gain.cancelScheduledValues(now);

  // Fondu d'entrée
  deck.gainNode.gain.setValueAtTime(0.001, now);
  deck.gainNode.gain.linearRampToValueAtTime(1, now + fadeInDuration);

  // Fondu de sortie
  deck.gainNode.gain.setValueAtTime(1, now + fadeOutStart);
  deck.gainNode.gain.linearRampToValueAtTime(0.001, now + duration);

  deck.source.start(now);

  // Lancement du compteur de temps
  startTimer(deckIdx);

  // Positionnement du Crossfader
  if (crossfaderUI) {
    crossfaderUI.value = deckIdx === 0 ? 0 : 1;
  }

  // Enchaînement sur le deck suivant
  if (deck.timeout) clearTimeout(deck.timeout);

  const triggerNextIn = Math.max(0, duration - overlapTime) * 1000;

  deck.timeout = setTimeout(() => {
    playlist.shift(); // Retire le morceau terminé
    updatePlaylistUI();

    const nextDeckIdx = deckIdx === 0 ? 1 : 0;

    if (playlist.length > 0) {
      playTrackOnDeck(nextDeckIdx);
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

// --- 8. BOUTONS CONTROLES ---
if (btnPlayAll) {
  btnPlayAll.addEventListener('click', async () => {
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    if (playlist.length === 0) return;

    isPlaying = true;
    btnPlayAll.disabled = true;
    if (btnPause) btnPause.disabled = false;

    playTrackOnDeck(0);
  });
}