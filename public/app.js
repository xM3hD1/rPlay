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

// --- Invidious Public Instances List (Public & No Auth Required) ---
const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://inv.us.projectsegfau.lt',
  'https://invidious.flokinet.to',
  'https://invidious.privacydev.net',
  'https://yt.drgnz.club'
];

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
let useInvidiousAudio = false; // Toggles HTML5 audio mode for YouTube background playback

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
    if (activeLocalElement && !useInvidiousAudio) activeLocalElement.pause();
    updateMediaMetadata(state.trackTitle || 'YouTube Video', 'YouTube');
  } else {
    tabLocal.classList.add('active');
    tabYt.classList.remove('active');
    sectionLocal.classList.add('active');
    sectionYt.classList.remove('active');
    localContainer.classList.remove('hidden');
    ytContainer.classList.add('hidden');
    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    useInvidiousAudio = false;
    updateMediaMetadata(state.trackTitle || 'Local Media File', 'Local Audio/Video');
  }
}

// --- Invidious Audio Stream Extractor ---
async function fetchYouTubeAudioStream(videoId) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      
      const data = await res.json();
      const audioStreams = data.adaptiveFormats.filter(f => f.type && f.type.startsWith('audio/'));
      
      if (audioStreams.length > 0) {
        // Pick best audio quality (highest bitrate)
        audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        return {
          url: audioStreams[0].url,
          title: data.title,
          author: data.author
        };
      }
    } catch (e) {
      console.warn(`Invidious instance ${instance} failed, trying next...`);
    }
  }
  return null;
}

async function loadInvidiousYouTubeStream(videoId) {
  const streamData = await fetchYouTubeAudioStream(videoId);
  if (streamData) {
    useInvidiousAudio = true;
    localAudio.src = streamData.url;
    localAudio.classList.remove('hidden');
    activeLocalElement = localAudio;
    
    updateMediaMetadata(streamData.title, streamData.author);
    playMedia();
    return true;
  }
  return false;
}

// --- Unified Media Controls ---
function playMedia() {
  if (state.activeSource === 'yt' && !useInvidiousAudio && ytPlayer && ytPlayer.playVideo) {
    ytPlayer.playVideo();
  } else if (activeLocalElement) {
    activeLocalElement.play();
  }
  syncMediaSessionState(true);
}

function pauseMedia() {
  if (state.activeSource === 'yt' && !useInvidiousAudio && ytPlayer && ytPlayer.pauseVideo) {
    ytPlayer.pauseVideo();
  } else if (activeLocalElement) {
    activeLocalElement.pause();
  }
  syncMediaSessionState(false);
}

function togglePlayPause() {
  if (state.activeSource === 'yt' && !useInvidiousAudio && ytPlayer && ytPlayer.getPlayerState) {
    const pState = ytPlayer.getPlayerState();
    pState === YT.PlayerState.PLAYING ? pauseMedia() : playMedia();
  } else if (activeLocalElement) {
    activeLocalElement.paused ? playMedia() : pauseMedia();
  }
}

function seekRelative(offset) {
  const targetTime = Math.max(0, getCurrentTime() + offset);
  setCurrentTime(targetTime);
}

// --- Silent Audio Anchor for Background PWA Keep-Alive ---
let silentAnchor = null;

function initSilentAnchor() {
  if (!silentAnchor) {
    silentAnchor = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    silentAnchor.loop = true;
  }
}

function syncMediaSessionState(isPlaying) {
  if (!('mediaSession' in navigator)) return;

  if (isPlaying) {
    navigator.mediaSession.playbackState = 'playing';
    initSilentAnchor();
    silentAnchor.play().catch(() => {});
  } else {
    navigator.mediaSession.playbackState = 'paused';
    if (silentAnchor) silentAnchor.pause();
  }
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
        { src: 'assets/favicon_io/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  }
}

// --- Keyboard Shortcuts Listener ---
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
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

  if (event.data === YT.PlayerState.ENDED) {
    setCurrentTime(state.abLoopEnabled ? state.pointA : 0);
    playMedia();
  }
}

document.getElementById('btn-load-yt').addEventListener('click', async () => {
  const urlVal = document.getElementById('yt-url').value.trim();
  const videoId = extractYouTubeID(urlVal);
  if (videoId) {
    state.ytVideoId = videoId;
    saveState();

    // Try background-capable Invidious stream first
    const loadedInvidious = await loadInvidiousYouTubeStream(videoId);
    
    // Fallback to IFrame Player if Invidious instances are unreachable
    if (!loadedInvidious && ytPlayer && ytPlayer.loadVideoById) {
      useInvidiousAudio = false;
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
  useInvidiousAudio = false;
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
  playMedia();
  
  activeLocalElement.onended = () => {
    activeLocalElement.currentTime = state.abLoopEnabled ? state.pointA : 0;
    playMedia();
  };
}

// --- Loop Engine ---
function getCurrentTime() {
  if (state.activeSource === 'yt' && !useInvidiousAudio && ytPlayer && ytPlayer.getCurrentTime) {
    return ytPlayer.getCurrentTime();
  } else if (activeLocalElement) {
    return activeLocalElement.currentTime;
  }
  return 0;
}

function setCurrentTime(seconds) {
  if (state.activeSource === 'yt' && !useInvidiousAudio && ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(seconds);
  } else if (activeLocalElement) {
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

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Reg Failed:', err));
  }
}

window.addEventListener('DOMContentLoaded', init);