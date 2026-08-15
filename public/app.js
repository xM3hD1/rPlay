// --- Application State ---
const state = {
  activeSource: 'yt', // 'yt' or 'local'
  ytVideoId: '5qap5aO4i9A',
  trackTitle: 'rPlay Media',
  trackArtist: 'Infinite Looper'
};

// --- Invidious Public Instances List ---
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

let ytPlayer = null;
let activeLocalElement = null;
let useInvidiousAudio = false;

// --- Initialize App ---
function init() {
  setupTabs();
  setupEvents();
  setupKeyboardShortcuts();
  setupMediaSession();
  setupNativeLooping();
  registerSW();
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
  } else {
    tabLocal.classList.add('active');
    tabYt.classList.remove('active');
    sectionLocal.classList.add('active');
    sectionYt.classList.remove('active');
    localContainer.classList.remove('hidden');
    ytContainer.classList.add('hidden');
    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    useInvidiousAudio = false;
  }
}

// --- Configure Native OS-Level Looping ---
function setupNativeLooping() {
  // Enables hardware/OS level background looping
  localAudio.loop = true;
  localVideo.loop = true;

  // Fallback listener in case OS overrides loop flag
  localAudio.addEventListener('ended', () => {
    localAudio.currentTime = 0;
    localAudio.play();
  });
  
  localVideo.addEventListener('ended', () => {
    localVideo.currentTime = 0;
    localVideo.play();
  });
}

// --- Invidious Audio Stream Extractor ---
async function fetchYouTubeAudioStream(videoId) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, { 
        signal: AbortSignal.timeout(3500) 
      });
      if (!res.ok) continue;
      
      const data = await res.json();
      const audioStreams = data.adaptiveFormats?.filter(f => f.type && f.type.startsWith('audio/')) || [];
      
      if (audioStreams.length > 0) {
        audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        return {
          url: audioStreams[0].url,
          title: data.title,
          author: data.author
        };
      }
    } catch (e) {
      console.warn(`Invidious instance ${instance} unreachable, trying next...`);
    }
  }
  return null;
}

async function loadInvidiousYouTubeStream(videoId) {
  const streamData = await fetchYouTubeAudioStream(videoId);
  if (streamData) {
    useInvidiousAudio = true;
    localAudio.crossOrigin = "anonymous";
    localAudio.src = streamData.url;
    localAudio.loop = true; // Native background loop
    localAudio.classList.remove('hidden');
    activeLocalElement = localAudio;
    
    updateMediaMetadata(streamData.title, streamData.author);
    playMedia();
    return true;
  }
  return false;
}

// --- Unified Media Playback ---
function playMedia() {
  if (state.activeSource === 'yt' && !useInvidiousAudio && ytPlayer && ytPlayer.playVideo) {
    ytPlayer.playVideo();
  } else if (activeLocalElement) {
    activeLocalElement.play().catch(e => console.warn('Autoplay prevented:', e));
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
  if (activeLocalElement) {
    activeLocalElement.currentTime = Math.max(0, activeLocalElement.currentTime + offset);
  } else if (ytPlayer && ytPlayer.getCurrentTime) {
    ytPlayer.seekTo(Math.max(0, ytPlayer.getCurrentTime() + offset));
  }
  updatePositionState();
}

// --- Lock Screen & MediaSession API ---
function syncMediaSessionState(isPlaying) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  updatePositionState();
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;

  let duration = 0;
  let currentTime = 0;

  if (activeLocalElement && !isNaN(activeLocalElement.duration)) {
    duration = activeLocalElement.duration;
    currentTime = activeLocalElement.currentTime;
  } else if (ytPlayer && ytPlayer.getDuration) {
    duration = ytPlayer.getDuration();
    currentTime = ytPlayer.getCurrentTime();
  }

  if (duration > 0 && currentTime <= duration) {
    try {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: 1.0,
        position: currentTime
      });
    } catch (e) {
      // Ignore transient position sync errors
    }
  }
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;

  updateMediaMetadata('rPlay Infinite Player', 'Ready');

  navigator.mediaSession.setActionHandler('play', () => playMedia());
  navigator.mediaSession.setActionHandler('pause', () => pauseMedia());
  navigator.mediaSession.setActionHandler('seekbackward', (details) => seekRelative(-(details.seekOffset || 5)));
  navigator.mediaSession.setActionHandler('seekforward', (details) => seekRelative(details.seekOffset || 5));
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    if (activeLocalElement) activeLocalElement.currentTime = 0;
  });
  navigator.mediaSession.setActionHandler('nexttrack', () => {
    if (activeLocalElement) activeLocalElement.currentTime = 0;
  });
}

function updateMediaMetadata(title, artist) {
  state.trackTitle = title;
  state.trackArtist = artist;

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: artist,
      album: 'rPlay Looper',
      artwork: [
        { src: 'assets/favicon_io/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'assets/favicon_io/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  }
}

// --- YouTube API ---
window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('yt-player', {
    videoId: state.ytVideoId,
    playerVars: { 'autoplay': 0, 'controls': 1, 'rel': 0, 'playsinline': 1 },
    events: {
      'onStateChange': (e) => {
        if (e.data === YT.PlayerState.PLAYING) syncMediaSessionState(true);
        if (e.data === YT.PlayerState.PAUSED) syncMediaSessionState(false);
        if (e.data === YT.PlayerState.ENDED) ytPlayer.playVideo(); // Infinite loop for iframe mode
      }
    }
  });
};

document.getElementById('btn-load-yt').addEventListener('click', async () => {
  const urlVal = document.getElementById('yt-url').value.trim();
  const videoId = extractYouTubeID(urlVal);
  if (videoId) {
    state.ytVideoId = videoId;

    // Load Invidious direct stream (Required for mobile background lockscreen playback)
    const loadedInvidious = await loadInvidiousYouTubeStream(videoId);
    
    // Fallback to Iframe if Invidious public instances fail
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

  activeLocalElement.loop = true; // Hardcoded native background loop
  updateMediaMetadata(file.name.replace(/\.[^/.]+$/, ""), "Local File");
  playMedia();
}

function setupEvents() {
  // UI Event hooks reserved for future controls
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); seekRelative(-5); }
    if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(5); }
  });
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Reg Failed:', err));
  }
}

window.addEventListener('DOMContentLoaded', init);