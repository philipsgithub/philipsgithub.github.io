/* In narrow mode each photo spans exactly from the top of the name to the bottom of the last text line. */
(() => {
  const narrow = window.matchMedia('(max-width: 860px)');
  const context = document.createElement('canvas').getContext('2d');
  const targets = [
    { photo: '.identity img', box: '.identity', text: '.identity > div', first: '.side h1', last: '.place', pin: '.place .icon' },
    { photo: '.compact-id img', box: '.compact-id', text: '.compact-id span', first: '.compact-id strong', last: '.compact-id small' },
  ].map((target) => Object.fromEntries(Object.entries(target).map(([key, selector]) => [key, document.querySelector(selector)])));
  if (targets.some(({ photo, box, text, first, last }) => !photo || !box || !text || !first || !last)) return;

  let frame = null;

  // The visible top and bottom of a text line, without the empty space of its line box.
  function ink(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent.trim()) node = walker.nextNode();
    if (!node) return element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    const style = getComputedStyle(node.parentElement);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = context.measureText(node.textContent.trim());
    const contentHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    const baseline = rect.top + (rect.height - contentHeight) / 2 + metrics.fontBoundingBoxAscent;
    return { top: baseline - metrics.actualBoundingBoxAscent, bottom: baseline + metrics.actualBoundingBoxDescent };
  }

  function clear({ photo }) {
    ['align-self', 'width', 'height', 'margin-top'].forEach((property) => photo.style.removeProperty(property));
  }

  function fit({ photo, box, first, last, pin }) {
    const scale = window.devicePixelRatio || 1;
    const snap = (value) => Math.round(value * scale) / scale;
    // A new photo width can rewrap the text, so the fit repeats until it is stable.
    for (let pass = 0; pass < 3; pass += 1) {
      const top = snap(ink(first).top);
      const bottom = snap(Math.max(ink(last).bottom, pin ? pin.getBoundingClientRect().bottom : -Infinity));
      const size = bottom - top;
      const boxTop = box.getBoundingClientRect().top + parseFloat(getComputedStyle(box).paddingTop);
      const margin = top - boxTop;
      const next = `${size}px ${margin}px`;
      if (photo.dataset.fit === next && photo.style.width) break;
      photo.dataset.fit = next;
      photo.style.alignSelf = 'flex-start';
      photo.style.width = `${size}px`;
      photo.style.height = `${size}px`;
      photo.style.marginTop = `${margin}px`;
    }
  }

  function update() {
    frame = null;
    const measure = () => targets.forEach((target) => {
      if (narrow.matches) fit(target);
      else {
        clear(target);
        delete target.photo.dataset.fit;
      }
    });
    // The scroll morph moves these elements, so they are measured in their resting position.
    if (window.headerMorph) window.headerMorph.measure(measure);
    else measure();
  }

  function schedule() {
    if (frame === null) frame = requestAnimationFrame(update);
  }

  window.addEventListener('resize', update);
  window.addEventListener('load', update);
  narrow.addEventListener('change', update);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    targets.forEach(({ text }) => observer.observe(text));
  }
  document.fonts?.ready.then(update);
  document.fonts?.addEventListener?.('loadingdone', update); // A late web font moves the text.
  update();
})();
