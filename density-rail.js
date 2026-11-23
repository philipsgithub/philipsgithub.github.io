/* Draws one translucent normal curve per section on the sidebar rail, so overlaps blend.
   A section's sigma peaks at its center and falls linearly to EDGE_SIGMA at its edges, at a
   rate scaled to the section's length, so a curve keeps changing even in a very long section.
   Outside the section it falls on to exactly zero at THRESHOLD and stays there.
   The peak scales with sigma, so a curve fades into
   the rail instead of becoming the infinitely tall spike of a true density at sigma = 0.
   The same closeness moves the curve's color from the rail color to the highlight color.
   The reading position and each sigma pass through a low-pass filter, so curves never jump.
   On narrow screens the same curves rise from the bottom line of both section rows. */
(() => {
  const THRESHOLD = 0.5; // Distance at which sigma reaches zero, as a share of the window height.
  const MAX_SIGMA = 0.34; // Largest sigma, as a share of the spacing between labels.
  const EDGE_SIGMA = 0.62; // Relative sigma and height at a section's edge. Its center reaches 1.
  const READING_START = 0.3; // Where the reading position sits in the window at the top of the page.
  const LABEL_GAP = 6; // Space in px kept between the highest peak and the label text.
  const SMOOTHING = 0.07; // Low-pass time constant in seconds. Larger values feel slower and softer.
  const MAX_STEP = 0.05; // Longest time step in seconds, so a stalled frame cannot cause a visible jump.
  const ROW_SIGMA = 0.26; // Largest sigma in the narrow rows, as a share of a label's width plus gap.
  const ROW_HEIGHT = 9; // Tallest curve in the narrow rows, in px.
  const ROW_GAP = 3; // Space in px kept between the highest peak and the label text.

  const nav = document.querySelector('.side nav');
  if (!nav) return;
  const links = [...nav.querySelectorAll('a')];
  const sections = links.map((link) => document.querySelector(link.getAttribute('href')));
  if (sections.some((section) => !section)) return;

  const desktop = window.matchMedia('(min-width: 861px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canMixColors = window.CSS?.supports?.('color', 'color-mix(in oklab, red 50%, blue)');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const base = document.createElementNS(ns, 'path');
  const curves = links.map(() => {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('class', 'density-curve');
    return path;
  });
  svg.setAttribute('class', 'density-rail');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  base.setAttribute('class', 'density-base');
  const group = document.createElementNS(ns, 'g');
  group.append(...curves, base); // The line is painted last, so a curve can never change its look.
  svg.append(group);
  nav.append(svg);
  nav.classList.add('has-density');

  // The narrow page header and the fixed bar each get their own horizontal row of curves.
  const rows = [['.side nav', '.side'], ['.compact-bar nav', '.compact-bar']].flatMap(([navSelector, boxSelector]) => {
    const rowNav = document.querySelector(navSelector);
    const box = document.querySelector(boxSelector);
    if (!rowNav || !box) return [];
    const rowLinks = links.map((link) => rowNav.querySelector(`a[href="${link.getAttribute('href')}"]`));
    if (rowLinks.some((link) => !link)) return [];
    const rowSvg = document.createElementNS(ns, 'svg');
    const rowGroup = document.createElementNS(ns, 'g');
    const rowBase = document.createElementNS(ns, 'path');
    const rowCurves = rowLinks.map(() => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('class', 'density-row-curve');
      return path;
    });
    rowSvg.setAttribute('class', 'density-row');
    rowSvg.setAttribute('aria-hidden', 'true');
    rowSvg.setAttribute('focusable', 'false');
    rowBase.setAttribute('class', 'density-row-base');
    rowGroup.append(...rowCurves, rowBase);
    rowSvg.append(rowGroup);
    box.append(rowSvg); // The bar's corner is on the pixel grid, unlike the vertically centered row.
    rowNav.classList.add('has-density-row');
    return [{ nav: rowNav, box, links: rowLinks, base: rowBase, curves: rowCurves }];
  });

  const position = { value: 0, velocity: 0 };
  const sigmaStates = links.map(() => ({ value: 0, velocity: 0 }));
  let frame = null;
  let lastTime = null;
  let pixelOffset = '';
  const px = (value) => value.toFixed(3);

  // Relative sigma per section: 1 at its peak, EDGE_SIGMA at its edges, 0 at or beyond the threshold.
  function relativeSigmas(rawReading) {
    const viewport = window.innerHeight;
    const limit = viewport * THRESHOLD;
    const tops = sections.map((section) => section.getBoundingClientRect().top + window.scrollY);
    const pageEnd = document.documentElement.scrollHeight;
    // Scroll rounding can land a fraction of a pixel past the end, which still counts as the last section.
    const reading = Math.min(rawReading, pageEnd);
    const lastIndex = tops.length - 1;
    return tops.map((top, index) => {
      const start = index === 0 ? 0 : top;
      const end = index === lastIndex ? pageEnd : tops[index + 1];
      if (reading < start || reading > end) {
        const distance = reading < start ? start - reading : reading - end;
        return EDGE_SIGMA * Math.max(0, 1 - distance / limit);
      }
      // The first and last sections peak where the page starts and ends, since nothing lies beyond them.
      const peak = index === 0 ? Math.min(end, viewport * READING_START) : index === lastIndex ? end : (start + end) / 2;
      const reach = reading < peak ? peak - start : end - peak;
      const offset = reach > 0 ? Math.abs(reading - peak) / reach : 0;
      return 1 - (1 - EDGE_SIGMA) * offset;
    });
  }

  // Critically damped low-pass step. It is exact for any frame rate and starts without a velocity jump.
  function damp(state, target, dt) {
    const rate = 1 / SMOOTHING;
    const offset = state.value - target;
    const drift = state.velocity + rate * offset;
    const decay = Math.exp(-rate * dt);
    state.value = target + (offset + drift * dt) * decay;
    state.velocity = (state.velocity - rate * drift * dt) * decay;
  }

  function isSettled(state, target, tolerance) {
    return Math.abs(state.value - target) < tolerance && Math.abs(state.velocity) < tolerance * 10;
  }

  // Stays near 1 across the bell and only pulls the last bit of its tail onto the rail end.
  function closing(value) {
    return 1 - (1 - Math.max(0, Math.min(1, value))) ** 4;
  }

  function curvePath(mean, weight, sigma, rail) {
    const step = Math.max(0.25, Math.min(1, sigma / 2));
    const samples = Math.ceil((4 * sigma) / step);
    const points = [];
    for (let k = -samples; k <= samples; k += 1) {
      const y = mean + k * step;
      if (y < rail.top || y > rail.bottom) continue;
      const taper = closing((y - rail.top) / rail.reach) * closing((rail.bottom - y) / rail.reach);
      const value = weight * Math.exp(-0.5 * ((y - mean) / sigma) ** 2) * taper;
      points.push(`${px(rail.edge + rail.amplitude * value)} ${px(y)}`);
    }
    if (points.length < 2) return '';
    const firstY = points[0].split(' ')[1];
    const lastY = points[points.length - 1].split(' ')[1];
    return `M${px(rail.under)} ${firstY}L${points.join('L')}L${px(rail.under)} ${lastY}Z`;
  }

  function drawColumn(indices, sigmas) {
    const first = links[indices[0]];
    const last = links[indices[indices.length - 1]];
    const style = getComputedStyle(first);
    const border = parseFloat(style.borderLeftWidth);
    const center = (link) => link.offsetTop + link.offsetHeight / 2;
    const spacing = indices.length > 1
      ? (center(last) - center(first)) / (indices.length - 1)
      : first.offsetHeight;
    // The rail reaches a little into the free space above and below the labels.
    const sideGap = parseFloat(getComputedStyle(nav.closest('.side')).rowGap) || 0;
    const extend = Math.min(spacing / 2, sideGap * 0.55);
    // The line sits on whole device pixels, so its edges are sharp and never blend with a curve.
    const navLeft = nav.getBoundingClientRect().left;
    const scale = window.devicePixelRatio || 1;
    const lineLeft = Math.round((navLeft + first.offsetLeft) * scale) / scale - navLeft;
    const lineWidth = Math.max(1, Math.round(border * scale)) / scale;
    const rail = {
      edge: lineLeft + lineWidth, // Curve height is measured from the line's right edge.
      under: lineLeft + lineWidth / 2, // Curves close underneath the line, so no gap can open.
      amplitude: Math.max(4, parseFloat(style.paddingLeft) - LABEL_GAP),
      top: first.offsetTop - extend,
      bottom: last.offsetTop + last.offsetHeight + extend,
      reach: first.offsetHeight / 2 + extend,
    };

    indices.forEach((index) => {
      const weight = sigmas[index];
      const curve = curves[index];
      if (weight <= 0) {
        curve.setAttribute('d', '');
        return;
      }
      curve.setAttribute('d', curvePath(center(links[index]), weight, weight * MAX_SIGMA * spacing, rail));
      if (canMixColors) {
        curve.style.fill = `color-mix(in oklab, var(--accent) ${(weight * 100).toFixed(1)}%, var(--line))`;
      }
    });
    return `M${px(lineLeft)} ${px(rail.top)}H${px(rail.edge)}V${px(rail.bottom)}H${px(lineLeft)}Z`;
  }

  // Browsers round an SVG's origin to a device pixel, so it is placed there first.
  // The inner group cancels that shift, which keeps all drawing coordinates relative to the nav.
  function alignToPixels() {
    const box = nav.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const dx = Math.round(box.left * scale) / scale - box.left;
    const dy = Math.round(box.top * scale) / scale - box.top;
    const offset = `${dx} ${dy}`;
    if (offset === pixelOffset) return;
    pixelOffset = offset;
    svg.style.left = `${dx}px`;
    svg.style.top = `${dy}px`;
    group.setAttribute('transform', `translate(${-dx} ${-dy})`);
  }

  function draw(sigmas) {
    alignToPixels();
    // Very short windows place the labels in two columns, and each column gets its own rail.
    const columns = new Map();
    links.forEach((link, index) => {
      if (!columns.has(link.offsetLeft)) columns.set(link.offsetLeft, []);
      columns.get(link.offsetLeft).push(index);
    });
    let railPath = '';
    columns.forEach((indices) => { railPath += drawColumn(indices, sigmas); });
    base.setAttribute('d', railPath);
  }

  function rowCurvePath(mean, weight, sigma, line) {
    const step = Math.max(0.25, Math.min(1, sigma / 2));
    const samples = Math.ceil((4 * sigma) / step);
    const points = [];
    for (let k = -samples; k <= samples; k += 1) {
      const x = mean + k * step;
      if (x < line.left || x > line.right) continue;
      const value = weight * Math.exp(-0.5 * ((x - mean) / sigma) ** 2);
      points.push(`${px(x)} ${px(line.top - line.amplitude * value)}`);
    }
    if (points.length < 2) return '';
    const firstX = points[0].split(' ')[0];
    const lastX = points[points.length - 1].split(' ')[0];
    return `M${firstX} ${px(line.under)}L${points.join('L')}L${lastX} ${px(line.under)}Z`;
  }

  function drawRow(row, sigmas) {
    const scale = window.devicePixelRatio || 1;
    const boxRect = row.box.getBoundingClientRect();
    // The drawn line lies exactly on the bar's bottom border and is painted above the curves.
    const border = parseFloat(getComputedStyle(row.box).borderBottomWidth) || 0;
    const lineHeight = Math.max(1, Math.round(border * scale)) / scale;
    const lineBottom = Math.round(boxRect.height * scale) / scale;
    const lineTop = lineBottom - lineHeight;
    const gap = parseFloat(getComputedStyle(row.nav).columnGap) || 0;

    row.links.forEach((link, index) => {
      const weight = sigmas[index];
      const curve = row.curves[index];
      if (weight <= 0) {
        curve.setAttribute('d', '');
        return;
      }
      const rect = link.getBoundingClientRect();
      const textBottom = rect.bottom - boxRect.top - parseFloat(getComputedStyle(link).paddingBottom);
      const line = {
        top: lineTop,
        under: lineTop + lineHeight / 2, // Curves close underneath the line, so no gap can open.
        left: 0,
        right: boxRect.width,
        amplitude: Math.max(3, Math.min(ROW_HEIGHT, lineTop - textBottom - ROW_GAP)),
      };
      const mean = (rect.left + rect.right) / 2 - boxRect.left;
      curve.setAttribute('d', rowCurvePath(mean, weight, weight * ROW_SIGMA * (rect.width + gap), line));
      if (canMixColors) {
        curve.style.fill = `color-mix(in oklab, var(--accent) ${(weight * 100).toFixed(1)}%, var(--active-line))`;
      }
    });
    row.base.setAttribute('d', `M0 ${px(lineTop)}H${px(boxRect.width)}V${px(lineBottom)}H0Z`);
  }

  function render(sigmas) {
    if (desktop.matches) draw(sigmas);
    else rows.forEach((row) => drawRow(row, sigmas));
  }

  // The simple fixed bar gets a whole number of device pixels, so its bottom border stays sharp.
  function fitFixedBar() {
    const fixedBar = document.querySelector('.compact-bar');
    if (!fixedBar) return;
    fixedBar.style.removeProperty('height');
    if (desktop.matches || document.documentElement.classList.contains('has-header-morph')) return;
    const scale = window.devicePixelRatio || 1;
    fixedBar.style.height = `${Math.ceil(fixedBar.getBoundingClientRect().height * scale - 0.01) / scale}px`;
  }

  // Moves straight to the true state, for page load, layout changes, and reduced motion.
  function snap() {
    fitFixedBar();
    lastTime = null;
    position.value = readingLine();
    position.velocity = 0;
    const sigmas = relativeSigmas(position.value);
    sigmaStates.forEach((state, index) => {
      state.value = sigmas[index];
      state.velocity = 0;
    });
    render(sigmas);
  }

  function update(time) {
    frame = null;
    if (reducedMotion.matches) {
      snap();
      return;
    }
    const dt = lastTime === null ? 0 : Math.min(MAX_STEP, (time - lastTime) / 1000);
    lastTime = time;
    const target = readingLine();
    damp(position, target, dt);
    const sigmas = relativeSigmas(position.value);
    sigmaStates.forEach((state, index) => damp(state, sigmas[index], dt));
    const settled = isSettled(position, target, 0.05)
      && sigmaStates.every((state, index) => isSettled(state, sigmas[index], 0.001));
    if (settled) {
      snap();
      return;
    }
    render(sigmaStates.map((state) => Math.max(0, Math.min(1, state.value))));
    frame = requestAnimationFrame(update);
  }

  function schedule() {
    if (frame === null) frame = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', snap);
  window.addEventListener('pageshow', snap);
  desktop.addEventListener('change', snap);
  reducedMotion.addEventListener('change', snap);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    observer.observe(nav);
    observer.observe(document.body);
    rows.forEach((row) => {
      observer.observe(row.nav);
      observer.observe(row.box);
    });
  }
  document.fonts?.ready.then(snap);
  document.fonts?.addEventListener?.('loadingdone', snap); // A late web font moves the text.
  snap();
})();
