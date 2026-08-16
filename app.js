// --- 1. INITIALISATION AUDIO & VARIABLES GLOBALES ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let playlist = [];
let overlapTime = 3; // Temps de fondu par défaut (en secondes)
let isPlaying = false;
let currentDeckIdx = 0;

// Structure des deux platines
const decks = [
  { source: null, gainNode: audioCtx.createGain(), nextTimeout: null },
  { source: null, gainNode: audioCtx.createGain(), nextTimeout: null }
];

// Connexion à la sortie audio
decks[0].gainNode.connect(audioCtx.destination);
decks[1].gainNode.connect(audioCtx.destination);

// Récupération des éléments HTML (Vérifie les ID dans ton HTML)
const fileInput = document.getElementById('fileInput');
const btnPlay = document.getElementById('btnPlay');
const btnPause = document.getElementById('btnPause');
const crossfaderUI = document.getElementById('crossfader');

// --- 2. GESTION DE L'IMPORTATION DES FICHIERS ---
if (fileInput) {
  fileInput.addEventListener('change', async (e) => {
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.type.startsWith('audio/') || file.name.endsWith('.mp3')) {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        playlist.push({ name: file.name, buffer: audioBuffer });
      }
    }

    if (files.length > 0) {
      alert(`${files.length} morceau(x) ajouté(s) à la playlist !`);
    }
  });
}

// --- 3. FONCTION DE LECTURE AVEC CROSSFADE ---
function playTrackOnDeck(deckIdx, startOffset = 0) {
  const deck = decks[deckIdx];
  const track = playlist[0];

  if (!track) return;

  if (deck.source) {
    try {
      deck.source.stop();
    } catch (e) {}
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
    const nextDeckIdx = deckIdx === 0 ? 1 : 0;

    if (playlist.length > 0) {
      playTrackOnDeck(nextDeckIdx, 0);
    } else {
      isPlaying = false;
      if (btnPlay) {
        btnPlay.disabled = false;
        btnPlay.textContent = "▶ Démarrer";
      }
      if (btnPause) btnPause.disabled = true;
    }
  }, triggerNextIn);
}

// --- 4. CONTROLES PLAY / PAUSE ---
if (btnPlay) {
  btnPlay.addEventListener('click', async () => {
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    if (playlist.length === 0) {
      alert("Veuillez d'abord importer des fichiers audio !");
      return;
    }
    isPlaying = true;
    btnPlay.disabled = true;
    if (btnPause) btnPause.disabled = false;
    playTrackOnDeck(currentDeckIdx, 0);
  });
}