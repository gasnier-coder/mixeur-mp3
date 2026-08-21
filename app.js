let audioCtx;
let masterGainNode;

let playlist = [];
let overlapTime = 8;

let isPlaying = false;
let isPaused = false;
let pauseOffset = 0;
let isUserSeeking = false;

let draggedItemIndex = null;
const btnShuffle = document.getElementById('btn-shuffle');
const inputFiles = document.getElementById('audio-input');
const inputFolder = document.getElementById('folder-input'); // NOUVEAU BOUTON DOSSIER
const btnPlay = document.getElementById('btn-play-all');
const btnPause = document.getElementById('btn-pause');
const btnClear = document.getElementById('btn-clear-playlist');
const playlistUI = document.getElementById('playlist');
const crossfaderUI = document.getElementById('crossfader');

const fadeTimeInput = document.getElementById('fade-time');
const fadeValueDisplay = document.getElementById('fade-value');
const masterVolumeInput = document.getElementById('master-volume');
const volumeValueDisplay = document.getElementById('volume-value');

const decks = [
  { 
    id: 'a', 
    source: null, 
    gainNode: null, 
    buffer: null,
    startTime: 0,
    timer: null,
    nextTimeout: null,
    titleEl: document.getElementById('title-a'), 
    timeEl: document.getElementById('time-a'),
    seekEl: document.getElementById('seek-a')
  },
  { 
    id: 'b', 
    source: null, 
    gainNode: null, 
    buffer: null,
    startTime: 0,
    timer: null,
    nextTimeout: null,
    titleEl: document.getElementById('title-b'), 
    timeEl: document.getElementById('time-b'),
    seekEl: document.getElementById('seek-b')
  }
];

let activeDeckIndex = 0; // Platine en cours de lecture (0 = A, 1 = B)

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = parseFloat(masterVolumeInput.value);
    masterGainNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

fadeTimeInput.addEventListener('input', (e) => {
  overlapTime = parseInt(e.target.value);
  fadeValueDisplay.textContent = overlapTime;
});

masterVolumeInput.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  volumeValueDisplay.textContent = Math.round(val * 100);
  if (masterGainNode) {
    masterGainNode.gain.setValueAtTime(val, audioCtx.currentTime);
  }
});

// Importation de fichiers individuel
inputFiles.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    if (file.type.includes('audio') || file.name.endsWith('.mp3')) {
      playlist.push(file);
    }
  });
  updatePlaylistUI();
  updateStandbyDeckDisplay();
  if (playlist.length > 0 && !isPlaying) btnPlay.disabled = false;
});

// Importation de dossier complet
if (inputFolder) {
  inputFolder.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (file.type.includes('audio') || file.name.endsWith('.mp3')) {
        playlist.push(file);
      }
    });

    // Tri alphabétique par défaut des morceaux du dossier
    playlist.sort((a, b) => a.name.localeCompare(b.name));

    updatePlaylistUI();
    updateStandbyDeckDisplay();
    if (playlist.length > 0 && !isPlaying) btnPlay.disabled = false;
  });
}

btnClear.addEventListener('click', () => {
  playlist = [];
  isPlaying = false;
  isPaused = false;
  
  stopAllDecks();
  updatePlaylistUI();
  
  btnPlay.disabled = true;
  btnPause.disabled = true;
});
btnShuffle.addEventListener('click', () => {
  if (playlist.length <= 1) return;

  // Si un morceau est en cours de lecture, on conserve le premier (index 0) et on mélange le reste
  if (isPlaying) {
    const currentTrack = playlist[0];
    const remainingTracks = playlist.slice(1);
    
    // Mélange de Fisher-Yates sur le reste de la liste
    for (let i = remainingTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingTracks[i], remainingTracks[j]] = [remainingTracks[j], remainingTracks[i]];
    }
    
    playlist = [currentTrack, ...remainingTracks];
  } else {
    // Si la lecture est arrêtée, on mélange toute la liste
    for (let i = playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }
  }

  updatePlaylistUI();
  updateStandbyDeckDisplay();
});
function stopAllDecks() {
  decks.forEach(deck => {
    if (deck.source) { try { deck.source.stop(); } catch(e){} }
    clearTimeout(deck.nextTimeout);
    clearInterval(deck.timer);
    deck.timer = null;
    deck.titleEl.textContent = "Aucun morceau";
    deck.titleEl.classList.remove('standby');
    deck.timeEl.textContent = "-00:00 / 00:00";
    deck.seekEl.value = 0;
    deck.seekEl.disabled = true;
  });
}

function removeTrack(indexToRemove) {
  if (indexToRemove < 0 || indexToRemove >= playlist.length) return;
  playlist.splice(indexToRemove, 1);

  if (playlist.length === 0 && !isPlaying) {
    btnPlay.disabled = true;
  }
  updatePlaylistUI();
  updateStandbyDeckDisplay();
}

function updatePlaylistUI() {
  playlistUI.innerHTML = '';
  playlist.forEach((file, index) => {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.index = index;

    if (index === 0 && isPlaying) li.classList.add('active');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'track-title';
    titleSpan.textContent = `${index + 1}. ${file.name}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '✖';
    deleteBtn.title = 'Retirer de la file d\'attente';
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTrack(index);
    });

    li.appendChild(titleSpan);
    li.appendChild(deleteBtn);

    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('dragleave', handleDragLeave);
    li.addEventListener('drop', handleDropOnItem);
    li.addEventListener('dragend', handleDragEnd);

    playlistUI.appendChild(li);
  });
}

function handleDragStart(e) {
  draggedItemIndex = parseInt(this.dataset.index);
  this.classList.add('dragging');
  e.dataTransfer.setData('text/plain', draggedItemIndex);
}

function handleDragOver(e) {
  e.preventDefault();
  const rect = this.getBoundingClientRect();
  const midPoint = rect.top + rect.height / 2;

  if (e.clientY < midPoint) {
    this.classList.add('drag-over-top');
    this.classList.remove('drag-over-bottom');
  } else {
    this.classList.add('drag-over-bottom');
    this.classList.remove('drag-over-top');
  }
}

function handleDragLeave() {
  this.classList.remove('drag-over-top', 'drag-over-bottom');
}

function handleDropOnItem(e) {
  e.preventDefault();
  this.classList.remove('drag-over-top', 'drag-over-bottom');
  
  const targetIndex = parseInt(this.dataset.index);
  if (draggedItemIndex === null || draggedItemIndex === targetIndex) return;

  const rect = this.getBoundingClientRect();
  const midPoint = rect.top + rect.height / 2;
  const insertAfter = e.clientY >= midPoint;

  const [movedItem] = playlist.splice(draggedItemIndex, 1);
  
  let destinationIndex = targetIndex;
  if (draggedItemIndex < targetIndex) {
    destinationIndex = insertAfter ? targetIndex : targetIndex - 1;
  } else {
    destinationIndex = insertAfter ? targetIndex + 1 : targetIndex;
  }

  playlist.splice(destinationIndex, 0, movedItem);
  updatePlaylistUI();
  updateStandbyDeckDisplay();
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('#playlist li').forEach(li => {
    li.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  document.querySelectorAll('.deck').forEach(d => d.classList.remove('drag-over'));
}

/* --- Glisser-Déposer sur les Platines A / B --- */
document.querySelectorAll('.drop-zone').forEach(deckEl => {
  deckEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    deckEl.classList.add('drag-over');
  });

  deckEl.addEventListener('dragleave', () => {
    deckEl.classList.remove('drag-over');
  });

  deckEl.addEventListener('drop', (e) => {
    e.preventDefault();
    deckEl.classList.remove('drag-over');
    
    if (draggedItemIndex !== null) {
      const droppedOnDeckIdx = parseInt(deckEl.dataset.deck);
      const [movedItem] = playlist.splice(draggedItemIndex, 1);

      if (!isPlaying) {
        playlist.unshift(movedItem);
        activeDeckIndex = droppedOnDeckIdx;
        updatePlaylistUI();
        initAudioContext();
        isPlaying = true;
        btnPlay.disabled = true;
        btnPause.disabled = false;
        playTrackOnDeck(activeDeckIndex, 0);
      } else {
        if (droppedOnDeckIdx === activeDeckIndex) {
          playlist.unshift(movedItem);
          playTrackOnDeck(activeDeckIndex, 0);
        } else {
          playlist.splice(1, 0, movedItem);
          updatePlaylistUI();
          updateStandbyDeckDisplay();
        }
      }
    }
  });
});

btnPlay.addEventListener('click', () => {
  initAudioContext();
  if (isPaused) {
    isPaused = false;
    btnPlay.disabled = true;
    btnPause.disabled = false;
    playTrackOnDeck(activeDeckIndex, pauseOffset);
  } else if (!isPlaying && playlist.length > 0) {
    isPlaying = true;
    btnPlay.disabled = true;
    btnPause.disabled = false;
    playTrackOnDeck(activeDeckIndex, 0);
  }
});

btnPause.addEventListener('click', () => {
  if (isPlaying && !isPaused) {
    isPaused = true;
    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnPlay.textContent = "▶ Reprendre";

    const currentDeck = decks[activeDeckIndex];
    pauseOffset = audioCtx.currentTime - currentDeck.startTime;

    if (currentDeck.source) { try { currentDeck.source.stop(); } catch(e){} }
    clearTimeout(currentDeck.nextTimeout);
    if (currentDeck.timer) {
      clearInterval(currentDeck.timer);
      currentDeck.timer = null;
    }
  }
});

/* --- MISE À JOUR RIGOUREUSE DE LA PLATINE PASSIVE --- */
function updateStandbyDeckDisplay() {
  const standbyDeckIdx = activeDeckIndex === 0 ? 1 : 0;
  const standbyDeck = decks[standbyDeckIdx];

  const nextTrackIndex = isPlaying ? 1 : 0;

  if (playlist.length > nextTrackIndex) {
    standbyDeck.titleEl.textContent = `▶ Prochain : ${playlist[nextTrackIndex].name}`;
    standbyDeck.titleEl.classList.add('standby');
    standbyDeck.timeEl.textContent = "-00:00 / 00:00";
    standbyDeck.seekEl.value = 0;
    standbyDeck.seekEl.disabled = true;
  } else {
    standbyDeck.titleEl.textContent = "Aucun morceau";
    standbyDeck.titleEl.classList.remove('standby');
    standbyDeck.timeEl.textContent = "-00:00 / 00:00";
    standbyDeck.seekEl.value = 0;
    standbyDeck.seekEl.disabled = true;
  }
}

async function playTrackOnDeck(deckIdx, startOffset = 0) {
  if (playlist.length === 0) {
    isPlaying = false;
    btnPlay.disabled = false;
    btnPlay.textContent = "▶ Démarrer";
    btnPause.disabled = true;
    return;
  }

  activeDeckIndex = deckIdx;
  const deck = decks[deckIdx];
  const currentFile = playlist[0];

  if (deck.source) {
    try { deck.source.stop(); } catch(e){}
  }
  clearTimeout(deck.nextTimeout);
  if (deck.timer) {
    clearInterval(deck.timer);
    deck.timer = null;
  }

  const arrayBuffer = await currentFile.arrayBuffer();
  deck.buffer = await audioCtx.decodeAudioData(arrayBuffer);

  deck.source = audioCtx.createBufferSource();
  deck.source.buffer = deck.buffer;

  deck.gainNode = audioCtx.createGain();
  deck.source.connect(deck.gainNode);
  deck.gainNode.connect(masterGainNode);

  deck.titleEl.textContent = currentFile.name;
  deck.titleEl.classList.remove('standby');
  deck.seekEl.disabled = false;
  deck.seekEl.max = deck.buffer.duration;
  deck.seekEl.value = startOffset;
  
  updatePlaylistUI();
  updateStandbyDeckDisplay();

  const now = audioCtx.currentTime;
  const duration = deck.buffer.duration;
  const remainingTime = duration - startOffset;

  deck.startTime = now - startOffset;

  // --- GESTION DU VOLUME & FONDU (CORRIGÉE POUR ANDROID) ---
  const fadeInDuration = Math.min(2, remainingTime); 
  const fadeOutStart = Math.max(0, duration - overlapTime);

  if (startOffset > 0) {
    deck.gainNode.gain.setValueAtTime(1, now);
  } else {
    // Correction du "0,2" en "0.01" avec un point
    deck.gainNode.gain.setValueAtTime(0.01, now);
    deck.gainNode.gain.linearRampToValueAtTime(1, now + fadeInDuration);
  }

  if (startOffset < fadeOutStart) {
    const timeUntilFadeOut = fadeOutStart - startOffset;
    deck.gainNode.gain.setValueAtTime(1, now + timeUntilFadeOut);
    deck.gainNode.gain.linearRampToValueAtTime(0.001, now + remainingTime);
  } else if (startOffset >= fadeOutStart && startOffset > 0) {
    deck.gainNode.gain.linearRampToValueAtTime(0.001, now + remainingTime);
  }

  deck.source.start(now, startOffset);
  crossfaderUI.value = deckIdx === 0 ? 0 : 1;

  const triggerNextIn = Math.max(0, duration - startOffset - overlapTime) * 1000;

  deck.nextTimeout = setTimeout(() => {
    playlist.shift();

    const nextDeckIdx = deckIdx === 0 ? 1 : 0;

    if (playlist.length > 0) {
      playTrackOnDeck(nextDeckIdx, 0);
    } else {
      isPlaying = false;
      btnPlay.disabled = false;
      btnPlay.textContent = "▶ Démarrer";
      btnPause.disabled = true;
      
      stopAllDecks();
      updatePlaylistUI();
    }
  }, triggerNextIn);

  updateTrackUI(deck);
}

function updateTrackUI(deck) {
  if (deck.timer) {
    clearInterval(deck.timer);
  }

  deck.timer = setInterval(() => {
    if (!audioCtx || isPaused || isUserSeeking) return;
    const currentPos = audioCtx.currentTime - deck.startTime;
    const duration = deck.buffer ? deck.buffer.duration : 0;

    if (currentPos <= duration) {
      deck.seekEl.value = currentPos;
      const remainingSeconds = Math.max(0, duration - currentPos);
      deck.timeEl.textContent = `-${formatTime(remainingSeconds)} / ${formatTime(duration)}`;
    } else {
      clearInterval(deck.timer);
      deck.timer = null;
    }
  }, 250);
}

// Barre de recherche (Seek bar)
decks.forEach((deck, idx) => {
  deck.seekEl.addEventListener('mousedown', () => { isUserSeeking = true; });
  deck.seekEl.addEventListener('touchstart', () => { isUserSeeking = true; });

  deck.seekEl.addEventListener('change', (e) => {
    isUserSeeking = false;
    if (!isPlaying) return;
    const newTime = parseFloat(e.target.value);
    playTrackOnDeck(idx, newTime);
  });
});

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}