document.documentElement.classList.add('js');

const buttons = [...document.querySelectorAll('.filter button')];
const publications = [...document.querySelectorAll('.pubs li')];

buttons.forEach((button) => {
  button.addEventListener('click', () => {
    const firstOnly = button.dataset.filter === 'first';
    buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    publications.forEach((item) => { item.hidden = firstOnly && !item.hasAttribute('data-first'); });
  });
});

const navLinks = [...document.querySelectorAll('.side nav a')];
const sections = navLinks.map((link) => document.querySelector(link.getAttribute('href')));

// The reading position sits 30% down the window, then moves to the page end
// during the last screen of scrolling so the final section can always be reached.
function readingLine() {
  const viewport = window.innerHeight;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewport);
  const range = Math.min(viewport, maxScroll);
  const nearEnd = range ? Math.max(0, Math.min(1, (window.scrollY - (maxScroll - range)) / range)) : 0;
  return window.scrollY + viewport * (0.3 + 0.7 * nearEnd);
}

function updateActiveLink() {
  const marker = readingLine();
  let active = 0;
  sections.forEach((section, index) => {
    if (section.offsetTop <= marker) active = index;
  });
  navLinks.forEach((link, index) => {
    const isActive = index === active;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

window.addEventListener('scroll', updateActiveLink, { passive: true });
window.addEventListener('resize', updateActiveLink);
updateActiveLink();
