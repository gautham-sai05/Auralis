const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const artEl = document.getElementById('art');
const playBtn = document.getElementById('playBtn');

window.miniPlayer.onUpdate((data) => {
  titleEl.textContent = data.title || 'Nothing playing';
  artistEl.textContent = data.artist || '';
  artEl.style.backgroundImage = data.artwork ? `url("${data.artwork}")` : 'none';
  playBtn.textContent = data.playing ? '⏸' : '▶';
});

playBtn.addEventListener('click', () => window.miniPlayer.playPause());
document.getElementById('prevBtn').addEventListener('click', () => window.miniPlayer.previous());
document.getElementById('nextBtn').addEventListener('click', () => window.miniPlayer.next());
document.getElementById('closeBtn').addEventListener('click', () => window.miniPlayer.close());
