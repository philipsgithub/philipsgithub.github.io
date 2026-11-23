/* Narrow screens: scrolling morphs the full header into the small top bar.
   The section row stays the same element, the photo, name, and role scale into the positions
   of the hidden compact bar, and everything else fades out. All motion follows the scroll position. */
(() => {
  const SAMPLES = 32; // Points along each eased path.
  const FADE_END = 0.38; // Share of the morph after which the secondary text is gone.
  const LINKS_FADE_END = 0.18; // The profile links leave first, before the section row reaches them.

  const root = document.documentElement;
  const side = document.querySelector('.side');
  const nav = side?.querySelector('nav');
  const photo = side?.querySelector('.identity img');
  const name = side?.querySelector('h1');
  const role = side?.querySelector('.role-title');
  const bar = document.querySelector('.compact-bar');
  const barId = bar?.querySelector('.compact-id');
  const barNav = bar?.querySelector('nav');
  const barPhoto = barId?.querySelector('img');
  const barName = barId?.querySelector('strong');
  const barRole = barId?.querySelector('small');
  const degree = side?.querySelector('.degree');
  const focus = side?.querySelector('.role-focus');
  const location = side?.querySelector('.place');
  const profileLinks = side?.querySelector('.links');
  if ([nav, photo, name, role, bar, barId, barNav, barPhoto, barName, barRole, degree, focus, location, profileLinks].some((element) => !element)) return;

  const narrow = window.matchMedia('(max-width: 860px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timeline = null;
  try {
    if ('ScrollTimeline' in window) timeline = new window.ScrollTimeline({ source: root, axis: 'block' });
  } catch {
    timeline = null;
  }

  let animations = [];
  let manual = !timeline;
  let maxScroll = 1;
  let buildFrame = null;
  let syncFrame = null;
  let builtFor = '';

  const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  function textRect(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect();
  }

  function relative(rect, origin) {
    return { left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width };
  }

  // The move that puts `reference` (part of `element`) onto `target`, scaling from the element's corner.
  function solve(element, reference, target) {
    const scale = target.width / reference.width;
    return {
      x: target.left - element.left - scale * (reference.left - element.left),
      y: target.top - element.top - scale * (reference.top - element.top),
      scale,
    };
  }

  function play(element, frames) {
    const options = timeline && !manual ? { timeline, fill: 'both' } : { duration: 1000, fill: 'both' };
    const animation = element.animate(frames, options);
    if (timeline && !manual && animation.timeline !== timeline) {
      // This browser ignored the scroll timeline, so the scroll handler drives the morph instead.
      manual = true;
      animation.cancel();
      return play(element, frames);
    }
    if (manual) animation.pause();
    animations.push(animation);
    return animation;
  }

  // The move of an element that stays rigidly attached to `anchor` while the anchor moves and scales.
  function follow(element, anchor, move, origin) {
    const box = relative(element.getBoundingClientRect(), origin);
    const base = relative(anchor.getBoundingClientRect(), origin);
    return {
      x: move.x + (move.scale - 1) * (box.left - base.left),
      y: move.y + (move.scale - 1) * (box.top - base.top),
      scale: move.scale,
    };
  }

  function moveFrames(move, distance, end, { fromColor, toColor, fade } = {}) {
    const frames = [];
    for (let i = 0; i <= SAMPLES; i += 1) {
      const progress = i / SAMPLES;
      const eased = smooth(progress);
      // The header itself travels up by `distance`, so that travel is added back here.
      const x = move.x * eased;
      const y = progress * distance + move.y * eased;
      const scale = 1 + (move.scale - 1) * eased;
      const frame = { offset: end * progress, transform: `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) scale(${scale.toFixed(5)})` };
      if (fromColor) {
        frame.color = i === 0 ? fromColor : i === SAMPLES ? toColor : `color-mix(in oklab, ${toColor} ${(eased * 100).toFixed(1)}%, ${fromColor})`;
      }
      if (fade) {
        const faded = Math.min(1, progress / fade);
        frame.opacity = (1 - smooth(faded)).toFixed(4);
        frame.visibility = faded < 1 ? 'visible' : 'hidden';
      }
      frames.push(frame);
    }
    if (end < 1) frames.push({ ...frames[frames.length - 1], offset: 1 });
    return frames;
  }

  function cancelAll() {
    animations.forEach((animation) => animation.cancel());
    animations = [];
  }

  function sync() {
    syncFrame = null;
    if (!manual) return;
    const time = Math.max(0, Math.min(1, window.scrollY / maxScroll)) * 1000;
    animations.forEach((animation) => { animation.currentTime = time; });
  }

  function build() {
    buildFrame = null;
    cancelAll();
    const active = narrow.matches && !reducedMotion.matches;
    root.classList.toggle('has-header-morph', active);
    if (!active) {
      root.style.removeProperty('--morph-full');
      root.style.removeProperty('--morph-bar');
      builtFor = '';
      return;
    }

    const scale = window.devicePixelRatio || 1;
    const sideRect = side.getBoundingClientRect();
    const full = sideRect.height;
    root.style.setProperty('--morph-full', `${full}px`);

    const barRect = bar.getBoundingClientRect();
    const idRect = barId.getBoundingClientRect();
    const barNavRect = barNav.getBoundingClientRect();
    const navHeight = nav.getBoundingClientRect().height;
    const border = parseFloat(getComputedStyle(side).borderBottomWidth) || 0;
    const oneRow = barNavRect.left >= idRect.right - 1;
    const small = oneRow ? Math.max(barRect.height, navHeight + border) : idRect.height + navHeight + border;
    // A whole number of device pixels keeps the bar's bottom line sharp at the end of the morph.
    const distance = Math.max(0, Math.round((full - small) * scale) / scale);
    root.style.setProperty('--morph-bar', `${full - distance}px`);

    maxScroll = Math.max(1, root.scrollHeight - root.clientHeight);
    builtFor = `${root.clientWidth} ${root.clientHeight} ${root.scrollHeight} ${full}`;
    if (distance <= 0) return;
    const end = Math.min(1, distance / maxScroll);

    const place = (element, reference, target) => {
      const box = relative(element.getBoundingClientRect(), sideRect);
      return solve(box, relative(reference, sideRect), relative(target, barRect));
    };
    const photoMove = place(photo, photo.getBoundingClientRect(), barPhoto.getBoundingClientRect());
    const nameMove = place(name, textRect(name), textRect(barName));
    const roleMove = place(role, textRect(role), textRect(barRole));

    const headerFrames = [{ offset: 0, transform: 'translateY(0px)' }, { offset: end, transform: `translateY(${-distance}px)` }];
    if (end < 1) headerFrames.push({ offset: 1, transform: `translateY(${-distance}px)` });
    play(side, headerFrames);
    play(photo, moveFrames(photoMove, distance, end));
    // Measured before the name and role start to animate, while everything is at rest.
    const degreeMove = follow(degree, name, nameMove, sideRect);
    const focusMove = follow(focus, role, roleMove, sideRect);
    const locationMove = follow(location, role, roleMove, sideRect);
    const nameColor = { fromColor: getComputedStyle(name).color, toColor: getComputedStyle(barName).color };
    const roleColor = { fromColor: getComputedStyle(role).color, toColor: getComputedStyle(barRole).color };
    const dividerColor = getComputedStyle(nav).borderTopColor;

    play(name, moveFrames(nameMove, distance, end, nameColor));
    play(role, moveFrames(roleMove, distance, end, roleColor));
    play(degree, moveFrames(degreeMove, distance, end, { fade: FADE_END }));
    play(focus, moveFrames(focusMove, distance, end, { fade: FADE_END }));
    play(location, moveFrames(locationMove, distance, end, { fade: FADE_END }));
    // The profile links simply travel up with the header while they fade.
    play(profileLinks, moveFrames({ x: 0, y: 0, scale: 1 }, 0, end, { fade: LINKS_FADE_END }));
    play(nav, [
      { offset: 0, borderTopColor: dividerColor },
      { offset: end * FADE_END, borderTopColor: 'transparent' },
      { offset: 1, borderTopColor: 'transparent' },
    ]);
    sync();
  }

  function scheduleBuild() {
    if (buildFrame !== null) return;
    buildFrame = requestAnimationFrame(() => {
      buildFrame = null;
      const active = narrow.matches && !reducedMotion.matches;
      const key = active ? `${root.clientWidth} ${root.clientHeight} ${root.scrollHeight} ${side.getBoundingClientRect().height}` : '';
      if (key !== builtFor || active !== root.classList.contains('has-header-morph')) build();
    });
  }

  // Runs code that measures header elements while they are in their resting position.
  window.headerMorph = {
    measure(callback) {
      cancelAll();
      callback();
      build();
    },
  };

  window.addEventListener('scroll', () => {
    if (manual && syncFrame === null) syncFrame = requestAnimationFrame(sync);
  }, { passive: true });
  window.addEventListener('resize', scheduleBuild);
  window.addEventListener('load', build);
  narrow.addEventListener('change', build);
  reducedMotion.addEventListener('change', build);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleBuild);
    observer.observe(document.body);
    observer.observe(nav);
  }
  document.fonts?.ready.then(build);
  document.fonts?.addEventListener?.('loadingdone', build);
  build();
})();
