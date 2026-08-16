function playTrackOnDeck(deckIdx, startOffset = 0) {
  const deck = decks[deckIdx];
  const track = playlist[0]; // Ou la piste en cours selon ton tableau

  if (!track) return;

  // 1. Stopper la source précédente si elle existe
  if (deck.source) {
    try {
      deck.source.stop();
    } catch (e) {
      // Ignore si déjà stoppé
    }
  }

  // 2. Préparation du Web Audio Node
  deck.source = audioCtx.createBufferSource();
  deck.source.buffer = track.buffer;
  deck.source.connect(deck.gainNode);

  const now = audioCtx.currentTime;
  const duration = track.buffer.duration;
  const remainingTime = duration - startOffset;
  const fadeOutStart = duration - overlapTime;

  // --- NETTOYAGE DES AUTOMATISATIONS PRÉCÉDENTES ---
  deck.gainNode.gain.cancelScheduledValues(now);

  // --- FADE IN (Fondu d'entrée) ---
  // On force le volume à 0 immédiatement, puis on monte à 1 pendant le temps d'overlap
  const fadeInDuration = Math.min(overlapTime, remainingTime);
  deck.gainNode.gain.setValueAtTime(0.001, now);
  deck.gainNode.gain.linearRampToValueAtTime(1, now + fadeInDuration);

  // --- FADE OUT (Fondu de sortie) ---
  if (startOffset < fadeOutStart) {
    const timeUntilFadeOut = fadeOutStart - startOffset;
    deck.gainNode.gain.setValueAtTime(1, now + timeUntilFadeOut);
    deck.gainNode.gain.linearRampToValueAtTime(0.001, now + remainingTime);
  } else if (startOffset >= fadeOutStart && startOffset > 0) {
    deck.gainNode.gain.linearRampToValueAtTime(0.001, now + remainingTime);
  }

  // --- DÉMARRAGE DU SON ---
  deck.source.start(now, startOffset);

  // Mise à jour visuelle du Crossfader
  if (typeof crossfaderUI !== 'undefined') {
    crossfaderUI.value = deckIdx === 0 ? 0 : 1;
  }

  // --- PROGRAMMATION DU PROCHAIN MORCEAU ---
  // Nettoyage du timeout précédent si existant
  if (deck.nextTimeout) clearTimeout(deck.nextTimeout);

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
    }
  }, triggerNextIn);
}