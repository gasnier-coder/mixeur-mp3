// --- 1. INITIALISATION AUDIO & VARIABLES GLOBALES ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let playlist = []; // Contient { name, file, buffer }
let overlapTime = 8;
let isPlaying = false;
let currentDeckIdx = 0;

// Structure des deux platines
const decks = [
  { source: null, gainNode: audioCtx.createGain(), timeout: null, trackName: "" },
  { source: null, gainNode: audioCtx.createGain(), timeout: null, trackName: "" }
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

// --- 3. IMPORTATION RAPIDE (SANS PRÉ-DÉCODAGE LOURD) ---
function handleFilesImport(files) {
  const audioFiles = Array.from(files).filter(file => 
    file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav')
  );

  for (const file of audioFiles) {
    playlist.push({
      name: file.name,
      file: file,
      buffer: null // Sera décodé au moment d'être joué
    });
  }

  updatePlaylistUI();

  if (playlist.length > 0 && btnPlayAll) {
    btnPlayAll.disabled = false;
  }
}

if (audioInput) audioInput.addEventListener('change', (e) => handleFilesImport(e.target.files));
if (folderInput) folderInput.addEventListener('change', (e) => handleFilesImport(e.target.files));

// --- 4. MISE À JOUR ET DRAG & DROP DE LA PLAYLIST ---
function updatePlaylistUI() {
  if (!playlistUI) return;
  playlistUI.innerHTML = '';
  
  playlist.forEach((track, index) => {
    const li = document.createElement('li');
    li.textContent = `${index + 1}. ${track.name}`;
    li.draggable = true;
    li.dataset.index = index;

    // Événement pour glisser un morceau
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', index);
    });

    playlistUI.appendChild(li);
  });
}

// Configuration des zones de drop (Deck A et Deck B)
document.querySelectorAll('.drop-zone').forEach(zone => {
  zone.addEventListener('dragover', (e) => e.preventDefault());
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    const trackIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const targetDeckIdx = parseInt(zone.dataset.deck, 10);

    if (!isNaN(trackIndex) && playlist[trackIndex]) {
      const track = playlist.splice(trackIndex, 1)[0];
      playlist.unshift(track); // Place le morceau sélectionné en tête de liste
      updatePlaylistUI();
      
      if (isPlaying) {
        await playTrackOnDeck(targetDeckIdx);
      }
    }
  });
});

// Vider la playlist
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

// --- 6. DÉCODAGE À LA VOLÉE ET LECTURE FLUIDE ---
async function getAudioBuffer(track) {
  if (track.buffer) return track.buffer;
  const arrayBuffer = await track.file.arrayBuffer();
  track.buffer = await audioCtx.decodeAudioData(arrayBuffer);
  return track.buffer;
}

async function playTrackOnDeck(deckIdx) {
  if (playlist.length === 0) return;

  const deck = decks[deckIdx];
  const track = playlist[0]; // Prend le premier morceau disponible

  // Décodage rapide juste avant de jouer
  const buffer = await getAudioBuffer(track);

  // Mettre à jour le nom sur le Deck
  const titleElem = document.getElementById(deckIdx === 0 ? 'title-a' : 'title-b');
  if (titleElem) titleElem.textContent = track.name;

  // Stopper la source précédente du deck si existante
  if (deck.source) {
    try { deck.source.stop(); } catch (e) {}
  }

  deck.source = audioCtx.createBufferSource();
  deck.source.buffer = buffer;
  deck.source.connect(deck.gainNode);

  const now = audioCtx.currentTime;
  const duration = buffer.duration;
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

  // Déplacer visuellement le Crossfader vers le deck actif
  if (crossfaderUI) {
    crossfaderUI.value = deckIdx === 0 ? 0 : 1;
  }

  // Programmation du morceau suivant sur l'autre deck
  if (deck.timeout) clearTimeout(deck.timeout);

  const triggerNextIn = Math.max(0, duration - overlapTime) * 1000;

  deck.timeout = setTimeout(() => {
    playlist.shift(); // Enlève le morceau terminé
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

// --- 7. BOUTONS CONTROLES ---
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