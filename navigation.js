/* Keeps long jumps between sections gentle and user-interruptible. */
(() => {
  let frame = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function cancelScroll() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  document.querySelectorAll('.side nav a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
          event.ctrlKey || event.shiftKey || event.altKey) return;

      const hash = link.getAttribute('href');
      const section = document.getElementById(hash.slice(1));
      if (!section) return;
      event.preventDefault();
      cancelScroll();

      const startY = window.scrollY;
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const targetY = Math.min(maxY, Math.max(0, startY + section.getBoundingClientRect().top - padding));
      const distance = targetY - startY;
      // The cosine curve starts and stops at zero speed. Long jumps finish within 1.8 seconds.
      const duration = Math.max(650, Math.min(1800, Math.abs(distance) * 0.6));
      const started = performance.now();

      function finish() {
        frame = null;
        if (window.location.hash !== hash) history.pushState(null, '', hash);
        section.setAttribute('tabindex', '-1');
        section.focus({ preventScroll: true });
      }

      if (reducedMotion.matches || Math.abs(distance) < 1) {
        window.scrollTo(0, targetY);
        finish();
        return;
      }

      function step(now) {
        const progress = Math.min(1, (now - started) / duration);
        const eased = (1 - Math.cos(Math.PI * progress)) / 2;
        window.scrollTo(0, startY + distance * eased);
        if (progress < 1) frame = requestAnimationFrame(step);
        else finish();
      }
      frame = requestAnimationFrame(step);
    });
  });

  ['wheel', 'touchstart', 'pointerdown', 'resize', 'popstate'].forEach((type) => {
    window.addEventListener(type, cancelScroll, { passive: true });
  });
  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Escape'].includes(event.key)) cancelScroll();
  });
  reducedMotion.addEventListener('change', cancelScroll);
})();
