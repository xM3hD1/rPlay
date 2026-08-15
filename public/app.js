// --- Application State ---
const state = {
  activeSource: 'yt', // 'yt' or 'local'
  ytVideoId: '5qap5aO4i9A',
  localFile: null,
  abLoopEnabled: false,
  pointA: 0,
  pointB: 0,
  trackTitle: 'rPlay Media',
  trackArtist: 'Infinite Looper'
};

// --- DOM Elements ---
const tabYt = document.getElementById('tab-yt');
const tabLocal = document.getElementById('tab-local');
const sectionYt = document.getElementById('section-yt');
const sectionLocal = document.getElementById('section-local');
const ytContainer = document.getElementById('yt-player-container');
const localContainer = document.getElementById('local-player-container');
const localVideo = document.getElementById('local-video');
const localAudio = document.getElementById('local-audio');
const dropzone = document.getElementById('dropzone');
const localFileInput = document.getElementById('local-file-input');

const abToggle = document.getElementById('ab-toggle');
const btnSetA = document.getElementById('btn-set-a');
const btnSetB = document.getElementById('btn-set-b');
const btnResetAB = document.getElementById('btn-reset-ab');
const valPointA = document.getElementById('val-point-a');
const valPointB = document.getElementById('val-point-b');

let ytPlayer = null;
let activeLocalElement = null;
let loopInterval = null;

// --- Initialize App ---
function init() {
  loadSavedState();
  setupTabs();
  setupEvents();
  setupKeyboardShortcuts();
  setupMediaSession();
  registerSW();
}

function loadSavedState() {
  const saved = localStorage.getItem('rplay_state');
  if (saved) {
    const parsed = JSON.parse(saved);
    state.ytVideoId = parsed.ytVideoId || state.ytVideoId;
    state.pointA = parsed.pointA || 0;
    state.pointB = parsed.pointB || 0;
    state.abLoopEnabled = parsed.abLoopEnabled || false;
    
    abToggle.checked = state.abLoopEnabled;
    updateABDisplay();
  }
}

function saveState() {
  localStorage.setItem('rplay_state', JSON.stringify({
    ytVideoId: state.ytVideoId,
    pointA: state.pointA,
    pointB: state.pointB,
    abLoopEnabled: state.abLoopEnabled
  }));
}

// --- Tab Controls ---
function setupTabs() {
  tabYt.addEventListener('click', () => switchTab('yt'));
  tabLocal.addEventListener('click', () => switchTab('local'));
}

function switchTab(source) {
  state.activeSource = source;
  if (source === 'yt') {
    tabYt.classList.add('active');
    tabLocal.classList.remove('active');
    sectionYt.classList.add('active');
    sectionLocal.classList.remove('active');
    ytContainer.classList.remove('hidden');
    localContainer.classList.add('hidden');
    if (activeLocalElement) activeLocalElement.pause();
    updateMediaMetadata(state.trackTitle || 'YouTube Video', 'YouTube');
  } else {
    tabLocal.classList.add('active');
    tabYt.classList.remove('active');
    sectionLocal.classList.add('active');
    sectionYt.classList.remove('active');
    localContainer.classList.remove('hidden');
    ytContainer.classList.add('hidden');
    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    updateMediaMetadata(state.trackTitle || 'Local Media File', 'Local Audio/Video');
  }
}

// --- Unified Media Controls ---
function playMedia() {
  if (state.activeSource === 'yt' && ytPlayer && ytPlayer.playVideo) {
    ytPlayer.playVideo();
  } else if (state.activeSource === 'local' && activeLocalElement) {
    activeLocalElement.play();
  }
}

function pauseMedia() {
  if (state.activeSource === 'yt' && ytPlayer && ytPlayer.pauseVideo) {
    ytPlayer.pauseVideo();
  } else if (state.activeSource === 'local' && activeLocalElement) {
    activeLocalElement.pause();
  }
}

function togglePlayPause() {
  if (state.activeSource === 'yt' && ytPlayer && ytPlayer.getPlayerState) {
    const pState = ytPlayer.getPlayerState();
    pState === YT.PlayerState.PLAYING ? pauseMedia() : playMedia();
  } else if (state.activeSource === 'local' && activeLocalElement) {
    activeLocalElement.paused ? playMedia() : pauseMedia();
  }
}

function seekRelative(offset) {
  const targetTime = Math.max(0, getCurrentTime() + offset);
  setCurrentTime(targetTime);
}

// --- Media Session API ---
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;

  updateMediaMetadata('rPlay Looper', 'Active Player');

  navigator.mediaSession.setActionHandler('play', () => playMedia());
  navigator.mediaSession.setActionHandler('pause', () => pauseMedia());
  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    seekRelative(-(details.seekOffset || 5));
  });
  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    seekRelative(details.seekOffset || 5);
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    setCurrentTime(state.abLoopEnabled ? state.pointA : 0);
  });
  navigator.mediaSession.setActionHandler('nexttrack', () => {
    setCurrentTime(state.abLoopEnabled ? state.pointA : 0);
  });
}

function updateMediaMetadata(title, artist) {
  state.trackTitle = title;
  state.trackArtist = artist;

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: artist,
      album: 'rPlay Infinite Looper',
      artwork: [
        { src: 'https://img.icons8.com/isometric-folders/512/play.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  }
}

// --- Keyboard Shortcuts Listener ---
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore input typing focus
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seekRelative(-5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        seekRelative(5);
        break;
      case 'KeyA':
        e.preventDefault();
        btnSetA.click();
        break;
      case 'KeyB':
        e.preventDefault();
        btnSetB.click();
        break;
      case 'KeyR':
        e.preventDefault();
        btnResetAB.click();
        break;
      case 'KeyL':
        e.preventDefault();
        abToggle.click();
        break;
    }
  });
}

// --- YouTube Integration ---
window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('yt-player', {
    videoId: state.ytVideoId,
    playerVars: { 'autoplay': 0, 'controls': 1, 'rel': 0 },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
};

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    if (ytPlayer.getVideoData) {
      const data = ytPlayer.getVideoData();
      updateMediaMetadata(data.title || 'YouTube Video', data.author || 'YouTube Channel');
    }
  }

  // Instant loop trigger
  if (event.data === YT.PlayerState.ENDED) {
    setCurrentTime(state.abLoopEnabled ? state.pointA : 0);
    playMedia();
  }
}

document.getElementById('btn-load-yt').addEventListener('click', () => {
  const urlVal = document.getElementById('yt-url').value.trim();
  const videoId = extractYouTubeID(urlVal);
  if (videoId) {
    state.ytVideoId = videoId;
    saveState();
    if (ytPlayer && ytPlayer.loadVideoById) {
      ytPlayer.loadVideoById(videoId);
    }
  }
});

function extractYouTubeID(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : url;
}

// --- Local File Integration ---
dropzone.addEventListener('click', () => localFileInput.click());
localFileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

dropzone.addEventListener('dragover', (e) => e.preventDefault());
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

function handleFile(file) {
  if (!file) return;
  const fileURL = URL.createObjectURL(file);
  const isVideo = file.type.startsWith('video');

  if (isVideo) {
    localVideo.src = fileURL;
    localVideo.classList.remove('hidden');
    localAudio.classList.add('hidden');
    activeLocalElement = localVideo;
  } else {
    localAudio.src = fileURL;
    localAudio.classList.remove('hidden');
    localVideo.classList.add('hidden');
    activeLocalElement = localAudio;
  }

  updateMediaMetadata(file.name.replace(/\.[^/.]+$/, ""), "Local File");

  activeLocalElement.loop = !state.abLoopEnabled;
  activeLocalElement.play();
  
  activeLocalElement.onended = () => {
    activeLocalElement.currentTime = state.abLoopEnabled ? state.pointA : 0;
    activeLocalElement.play();
  };
}

// --- Loop Engine ---
function getCurrentTime() {
  if (state.activeSource === 'yt' && ytPlayer && ytPlayer.getCurrentTime) {
    return ytPlayer.getCurrentTime();
  } else if (state.activeSource === 'local' && activeLocalElement) {
    return activeLocalElement.currentTime;
  }
  return 0;
}

function setCurrentTime(seconds) {
  if (state.activeSource === 'yt' && ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(seconds);
  } else if (state.activeSource === 'local' && activeLocalElement) {
    activeLocalElement.currentTime = seconds;
  }
}

function startLoopEngine() {
  if (loopInterval) clearInterval(loopInterval);
  loopInterval = setInterval(() => {
    if (!state.abLoopEnabled || state.pointB <= state.pointA) return;
    
    const now = getCurrentTime();
    if (now >= state.pointB) {
      setCurrentTime(state.pointA);
    }
  }, 200);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateABDisplay() {
  valPointA.textContent = formatTime(state.pointA);
  valPointB.textContent = formatTime(state.pointB);
}

function setupEvents() {
  abToggle.addEventListener('change', (e) => {
    state.abLoopEnabled = e.target.checked;
    if (activeLocalElement) activeLocalElement.loop = !state.abLoopEnabled;
    saveState();
  });

  btnSetA.addEventListener('click', () => {
    state.pointA = getCurrentTime();
    updateABDisplay();
    saveState();
  });

  btnSetB.addEventListener('click', () => {
    state.pointB = getCurrentTime();
    updateABDisplay();
    saveState();
  });

  btnResetAB.addEventListener('click', () => {
    state.pointA = 0;
    state.pointB = 0;
    updateABDisplay();
    saveState();
  });

  startLoopEngine();
}

// --- Silent Audio Anchor for Background PWA Keep-Alive ---
let silentAnchor = null;

function initSilentAnchor() {
  if (!silentAnchor) {
    // 1-second silent WAV data URI to trick Chrome Mobile into maintaining background audio focus
    silentAnchor = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    silentAnchor.loop = true;
  }
}

// --- Sync MediaSession Playback State ---
function syncMediaSessionState(isPlaying) {
  if (!('mediaSession' in navigator)) return;

  if (isPlaying) {
    navigator.mediaSession.playbackState = 'playing';
    
    // Play silent anchor on user gesture to claim Android Background Audio Focus
    initSilentAnchor();
    silentAnchor.play().catch(() => {});
  } else {
    navigator.mediaSession.playbackState = 'paused';
    if (silentAnchor) silentAnchor.pause();
  }
}

// --- Hook Sync into Play/Pause Functions ---
function playMedia() {
  if (state.activeSource === 'yt' && ytPlayer && ytPlayer.playVideo) {
    ytPlayer.playVideo();
  } else if (state.activeSource === 'local' && activeLocalElement) {
    activeLocalElement.play();
  }
  syncMediaSessionState(true);
}

function pauseMedia() {
  if (state.activeSource === 'yt' && ytPlayer && ytPlayer.pauseVideo) {
    ytPlayer.pauseVideo();
  } else if (state.activeSource === 'local' && activeLocalElement) {
    activeLocalElement.pause();
  }
  syncMediaSessionState(false);
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Reg Failed:', err));
  }
}

window.addEventListener('DOMContentLoaded', init);