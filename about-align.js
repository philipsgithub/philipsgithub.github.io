/* Ends the About header on the photo's bottom edge. The photo can shrink in shorter windows. */
(() => {
  const photo = document.querySelector('.identity img');
  const heading = document.querySelector('.intro-heading');
  const copy = document.querySelector('.intro-copy');
  const shell = document.querySelector('.shell');
  const intro = heading?.closest('.intro');
  const name = document.querySelector('.side h1');
  const firstParagraph = copy?.querySelector('p');
  if (!photo || !heading || !copy || !shell || !intro || !name || !firstParagraph) return;

  const stacked = window.matchMedia('(min-width: 861px) and (min-height: 661px)');
  const MIN_TEXT_GAP = 4; // Smallest space in px above the text. Below this, the default spacing stays.

  // Keeps the gradient's geometry tied to the header, however tall the whole box is.
  function syncGradient() {
    const box = intro.getBoundingClientRect();
    intro.style.setProperty('--about-w', `${box.width}px`);
    intro.style.setProperty('--about-h', `${heading.getBoundingClientRect().height}px`);
  }

  function fitHeading() {
    if (!stacked.matches) {
      heading.style.minHeight = '';
      return;
    }
    const side = photo.closest('.side');
    // Measured from the top of each column, so the result does not depend on the scroll position.
    const photoBottom = photo.getBoundingClientRect().bottom - side.getBoundingClientRect().top;
    const headingTop = heading.getBoundingClientRect().top - shell.getBoundingClientRect().top;
    // The divider below the header lands on the photo's bottom border.
    const divider = parseFloat(getComputedStyle(copy).borderTopWidth) || 0;
    heading.style.minHeight = `${Math.max(0, photoBottom - headingTop - divider)}px`;
  }

  // The bottom of an empty inline box sits exactly on the first line's baseline.
  function baseline(element) {
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0';
    element.prepend(probe);
    const value = probe.getBoundingClientRect().bottom;
    probe.remove();
    return value;
  }

  // Puts the first line of the About text on the same baseline as the name in the sidebar.
  function alignFirstLine() {
    copy.style.removeProperty('padding-top');
    if (!stacked.matches) return;
    const nameLine = baseline(name) - photo.closest('.side').getBoundingClientRect().top;
    const textLine = baseline(firstParagraph) - shell.getBoundingClientRect().top;
    const padding = parseFloat(getComputedStyle(copy).paddingTop) + nameLine - textLine;
    if (padding >= MIN_TEXT_GAP) copy.style.paddingTop = `${padding}px`;
  }

  function align() {
    fitHeading();
    alignFirstLine();
    syncGradient();
  }

  window.addEventListener('resize', align);
  window.addEventListener('load', align);
  stacked.addEventListener('change', align);
  if ('ResizeObserver' in window) {
    new ResizeObserver(align).observe(photo);
    const gradientObserver = new ResizeObserver(syncGradient);
    gradientObserver.observe(heading);
    gradientObserver.observe(intro);
  }
  document.fonts?.ready.then(align);
  document.fonts?.addEventListener?.('loadingdone', align); // A late web font moves the text.
  align();
})();
