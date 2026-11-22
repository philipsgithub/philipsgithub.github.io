/* Keeps the compact bar in step with the full header and shared section navigation. */
(() => {
  const bar = document.querySelector('.compact-bar');
  const sideNav = document.querySelector('.side nav');
  if (!bar || !sideNav) return;

  const root = document.documentElement;
  const narrow = window.matchMedia('(max-width: 860px)');
  const sideLinks = new Map([...sideNav.querySelectorAll('a')].map((link) => [link.getAttribute('href'), link]));
  const barLinks = [...bar.querySelectorAll('a[href^="#"]')];
  let frame = null;

  function syncActive() {
    barLinks.forEach((link) => {
      if (link.classList.contains('compact-id')) return;
      const active = Boolean(sideLinks.get(link.getAttribute('href'))?.classList.contains('active'));
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function update() {
    frame = null;
    root.classList.toggle('has-compact-bar', narrow.matches);
    if (narrow.matches) root.style.setProperty('--compact-height', `${bar.offsetHeight}px`);
    // A small dead zone prevents flicker when scrolling slowly around the switch point.
    const navBottom = sideNav.getBoundingClientRect().bottom;
    const threshold = bar.classList.contains('is-visible') ? 12 : -12;
    bar.classList.toggle('is-visible', narrow.matches && navBottom <= threshold);
  }

  function schedule() {
    if (frame === null) frame = requestAnimationFrame(update);
  }

  barLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const source = sideLinks.get(link.getAttribute('href'));
      if (!source) return;
      event.preventDefault();
      source.click();
    });
  });

  new MutationObserver(syncActive).observe(sideNav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  narrow.addEventListener('change', schedule);
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(bar);

  update();
  syncActive();
  if (narrow.matches && window.location.hash) {
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    update();
  }
  // Enable motion after the first paint so a restored scroll position does not animate.
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('is-ready')));
})();
