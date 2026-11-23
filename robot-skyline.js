// Footer easter egg: to-scale robots stand spread along the page's bottom line.
// Clicking one sends it along the line until it vanishes at the end.
// The fixed arms are collected by a forklift instead.
(() => {
  const data = window.ROBOT_SKYLINE;
  const main = document.querySelector('main');
  const footer = main && main.querySelector('footer');
  if (!data || !footer) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_PX_PER_MM = 0.06;
  const NARROW_LINE_FILL = 0.88; // Share of a narrow line the robots may use at their tightest.
  const DUTY = 0.6;
  const ACCELERATION = 1400; // mm/s²
  const PLAYBACK_SPEED = 2.2; // Real speeds feel slow across a full-width line.
  const LIFT_SECONDS = 1.5; // In playback time, like the hold below.
  const HOLD_SECONDS = 0.4;
  const FORK_MIN_PAST_BASE = 60; // mm
  const FORK_CLEAR_LENGTH = 700; // mm from fork tip to just before the load guard
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const { width: minWidth, height: H, forklift: truck } = data;

  const el = (name, attrs = {}, parent) => {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (parent) parent.appendChild(node);
    return node;
  };
  const degrees = (radians) => (radians * 180) / Math.PI;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const smooth = (u) => u * u * (3 - 2 * u);

  const stage = document.createElement('div');
  stage.className = 'robot-skyline';
  const svg = el('svg', { role: 'group', 'aria-label': 'Robots standing on the bottom line of the page' }, stage);
  const defs = el('defs', {}, svg);

  // A thin outline in the page color keeps a moving robot readable as it passes others.
  const halo = el('filter', {
    id: 'robot-skyline-halo', x: '-10%', y: '-10%', width: '120%', height: '120%',
  }, defs);
  const dilate = el('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 10, result: 'grown' }, halo);
  el('feFlood', { class: 'robot-skyline-halo', result: 'page' }, halo);
  el('feComposite', { in: 'page', in2: 'grown', operator: 'in', result: 'outline' }, halo);
  const merge = el('feMerge', {}, halo);
  el('feMergeNode', { in: 'outline' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);

  function buildLeg(leg, phase, parent) {
    const thigh = el('g', {}, parent);
    el('path', { d: leg.thigh, 'fill-rule': 'evenodd' }, thigh);
    const shank = el('g', {}, thigh);
    el('path', { d: leg.shank, 'fill-rule': 'evenodd' }, shank);

    const [hx, hy] = leg.hip;
    const [kx, ky] = leg.knee;
    const [fx, fy] = leg.foot;
    const upper = Math.hypot(kx - hx, ky - hy);
    const lower = Math.hypot(fx - kx, fy - ky);
    const thighRest = Math.atan2(ky - hy, kx - hx);
    const shankRest = Math.atan2(fy - ky, fx - kx);
    const bend = wrapAngle(thighRest - Math.atan2(fy - hy, fx - hx)) >= 0 ? 1 : -1;
    return { leg, phase, thigh, shank, upper, lower, thighRest, shankRest, bend };
  }

  function poseLeg(state, robot, cycle, bob) {
    const { leg, upper, lower, bend } = state;
    const u = (cycle + state.phase) % 1;
    let offsetX;
    let offsetY = -bob;
    if (u < DUTY) {
      offsetX = robot.stride * (0.5 - u / DUTY);
    } else {
      const swing = (u - DUTY) / (1 - DUTY);
      offsetX = robot.stride * (smooth(swing) - 0.5);
      offsetY -= robot.lift * Math.sin(Math.PI * swing);
    }
    const dx = leg.foot[0] + robot.dir * offsetX - leg.hip[0];
    const dy = leg.foot[1] + offsetY - leg.hip[1];
    const reach = clamp(Math.hypot(dx, dy), Math.abs(upper - lower) + 1, (upper + lower) * 0.995);
    const aim = Math.atan2(dy, dx);
    const inner = Math.acos(clamp((upper * upper + reach * reach - lower * lower) / (2 * upper * reach), -1, 1));
    const thighAngle = aim + bend * inner;
    const kneeX = leg.hip[0] + upper * Math.cos(thighAngle);
    const kneeY = leg.hip[1] + upper * Math.sin(thighAngle);
    const footX = leg.hip[0] + reach * Math.cos(aim);
    const footY = leg.hip[1] + reach * Math.sin(aim);
    const thighTurn = thighAngle - state.thighRest;
    const shankTurn = Math.atan2(footY - kneeY, footX - kneeX) - state.shankRest - thighTurn;
    state.thigh.setAttribute('transform', `rotate(${degrees(thighTurn).toFixed(2)} ${leg.hip[0]} ${leg.hip[1]})`);
    state.shank.setAttribute('transform', `rotate(${degrees(shankTurn).toFixed(2)} ${leg.knee[0]} ${leg.knee[1]})`);
  }

  const buildWheels = (wheels, parent) => wheels.map((wheel) => ({
    wheel,
    node: el('path', { d: wheel.d, 'fill-rule': 'evenodd' }, parent),
  }));
  const spin = (wheels, distance) => wheels.forEach(({ wheel, node }) => {
    const turn = degrees(distance / wheel.r) % 360;
    node.setAttribute('transform', `rotate(${turn.toFixed(1)} ${wheel.c[0]} ${wheel.c[1]})`);
  });

  const layer = el('g', {}, svg);
  const allRobots = data.robots.map((robot) => {
    const node = el('g', {
      class: 'skyline-robot',
      role: 'button',
      tabindex: 0,
      'aria-label': `Send ${robot.label} to the end of the line`,
    }, layer);
    el('title', {}, node).textContent = robot.label;
    const slotGroup = el('g', {}, node);
    const pose = el('g', {}, slotGroup);
    const legs = [];
    // Far-side legs go behind the body and step in opposite phase to the near side.
    (robot.legs || []).forEach((leg, index) => legs.push(buildLeg(leg, index === 0 ? 0.5 : 0, pose)));
    el('path', { d: robot.body, 'fill-rule': 'evenodd' }, pose);
    (robot.legs || []).forEach((leg, index) => legs.push(buildLeg(leg, index === 0 ? 0 : 0.5, pose)));
    const entry = {
      ...robot,
      node,
      slotGroup,
      pose,
      legs,
      slot: 0,
      wheelNodes: buildWheels(robot.wheels || [], pose),
      travelled: 0,
      speedNow: 0,
      cycle: 0,
      moving: false,
    };
    node.addEventListener('click', () => launch(entry));
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      launch(entry);
    });
    return entry;
  });
  const robots = [...allRobots];

  // Robots keep one real-world scale and share the free space of the line equally.
  // The drawn line matches the content tables, but robots can keep walking to the page edges.
  let lineStart = 0;
  let lineEnd = minWidth;
  let stageEnd = minWidth;
  function fitToContentArea() {
    const style = getComputedStyle(main);
    stage.style.marginLeft = `-${style.paddingLeft}`;
    stage.style.marginRight = `-${style.paddingRight}`;
    const width = stage.clientWidth || minWidth * MAX_PX_PER_MM;
    const table = document.querySelector('#cv .timeline');
    const inset = table
      ? clamp(table.getBoundingClientRect().left - stage.getBoundingClientRect().left, 0, width)
      : parseFloat(style.paddingLeft);
    const publications = document.querySelector('#publications .pubs');
    const endInset = publications
      ? clamp(stage.getBoundingClientRect().right - publications.getBoundingClientRect().right, 0, width - inset)
      : parseFloat(style.paddingRight);
    stage.style.setProperty('--skyline-line-start', `${inset}px`);
    stage.style.setProperty('--skyline-line-end', `${endInset}px`);
    const lineWidth = width - inset - endInset;
    const scale = Math.min(MAX_PX_PER_MM, (lineWidth / minWidth) * NARROW_LINE_FILL);
    lineStart = inset / scale;
    lineEnd = (width - endInset) / scale;
    stageEnd = width / scale;
    svg.setAttribute('viewBox', `0 ${-H} ${stageEnd} ${H}`);
    dilate.setAttribute('radius', (1.2 / scale).toFixed(1));

    const occupied = allRobots.reduce((sum, robot) => sum + robot.w, 0);
    const gap = (lineEnd - lineStart - occupied) / allRobots.length;
    let x = lineStart + gap / 2;
    allRobots.forEach((robot) => {
      if (robot.haul) {
        const moved = x - robot.slot;
        robot.haul.x += moved;
        robot.haul.target += moved;
      }
      robot.slot = x;
      robot.slotGroup.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
      if (robot.haul) renderHaul(robot);
      x += robot.w + gap;
    });
  }

  const active = new Set();
  let frameId = 0;
  let lastTime = 0;

  function remove(robot) {
    const hadFocus = document.activeElement === robot.node;
    active.delete(robot);
    (robot.haul ? robot.haul.group : robot.node).remove();
    robot.haul = null;
    robots.splice(robots.indexOf(robot), 1);
    if (hadFocus && robots.length) robots[0].node.focus({ preventScroll: true });
  }

  function renderTraveller(robot) {
    const top = robot.speedNow / (robot.speed * 1000);
    let bob = 0;
    let lean = 0;
    if (robot.mode === 'walk') {
      bob = -Math.abs(Math.sin(robot.cycle * Math.PI * 2)) * robot.lift * 0.09 * top;
    } else if (robot.mode === 'drive') {
      bob = Math.sin(robot.travelled / 70) * 2.5 * top;
    } else if (robot.mode === 'glide') {
      lean = robot.dir * (1.6 * top + Math.sin(robot.travelled / 240) * 0.5 * top);
    }
    robot.pose.setAttribute(
      'transform',
      `translate(${(robot.dir * robot.travelled).toFixed(1)} ${bob.toFixed(1)}) rotate(${lean.toFixed(2)} ${robot.w / 2} 0)`,
    );
    robot.legs.forEach((leg) => poseLeg(leg, robot, robot.cycle, bob));
    spin(robot.wheelNodes, robot.dir * robot.travelled);
  }

  function stepTraveller(robot, dt) {
    const topSpeed = robot.speed * 1000;
    robot.speedNow = Math.min(topSpeed, robot.speedNow + ACCELERATION * dt);
    const step = robot.speedNow * dt;
    robot.travelled += step;
    if (robot.stride) robot.cycle = (robot.cycle + (step * DUTY) / robot.stride) % 1;
    const left = robot.dir > 0
      ? stageEnd - (robot.slot + robot.travelled)
      : robot.slot + robot.w - robot.travelled;
    if (left <= 0) {
      remove(robot);
      return;
    }
    // Robots fade at the open right end and simply pass behind the sidebar on the left.
    if (robot.dir > 0) robot.node.style.opacity = Math.min(1, left / (robot.w * 0.6)).toFixed(3);
    renderTraveller(robot);
  }

  function renderHaul(robot) {
    const { haul } = robot;
    haul.truck.setAttribute('transform', `translate(${haul.x.toFixed(1)} 0) scale(${haul.facing} 1)`);
    haul.forks.setAttribute('transform', `translate(0 ${(-haul.raised).toFixed(1)})`);
    spin(haul.wheels, haul.rolled);
    // The arm stays where it stands until the forks have picked it up.
    const carried = Math.max(0, haul.raised - truck.forkTop);
    const towed = haul.phase === 'leave' ? haul.x - haul.target : 0;
    robot.pose.setAttribute('transform', `translate(${towed.toFixed(1)} ${(-carried).toFixed(1)})`);
  }

  function stepHaul(robot, dt) {
    const { haul } = robot;
    if (haul.phase === 'arrive') {
      const remaining = Math.abs(haul.target - haul.x);
      haul.speed = Math.min(truck.speed, haul.speed + ACCELERATION * dt, Math.sqrt(2 * ACCELERATION * remaining) + 20);
      const step = Math.min(remaining, haul.speed * dt);
      haul.x += haul.facing * step;
      haul.rolled += step;
      if (remaining - step < 0.5) {
        haul.x = haul.target;
        haul.speed = 0;
        haul.phase = 'lift';
        haul.clock = 0;
      }
    } else if (haul.phase === 'lift') {
      haul.clock += dt;
      const u = Math.min(1, haul.clock / LIFT_SECONDS);
      haul.raised = smooth(u) * truck.liftBy;
      if (u === 1) {
        haul.phase = 'hold';
        haul.clock = 0;
      }
    } else if (haul.phase === 'hold') {
      haul.clock += dt;
      if (haul.clock >= HOLD_SECONDS) haul.phase = 'leave';
    } else {
      haul.speed = Math.min(truck.speed, haul.speed + ACCELERATION * dt);
      const step = haul.speed * dt;
      haul.x -= haul.facing * step;
      haul.rolled -= step;
      const towed = haul.x - haul.target;
      const left = haul.facing > 0
        ? Math.max(haul.x, robot.slot + robot.w + towed)
        : stageEnd - Math.min(haul.x, robot.slot + towed);
      if (left <= 0) {
        remove(robot);
        return;
      }
      if (haul.facing < 0) haul.group.style.opacity = Math.min(1, left / (robot.w * 0.6)).toFixed(3);
    }
    renderHaul(robot);
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000) * PLAYBACK_SPEED;
    lastTime = now;
    [...active].forEach((robot) => (robot.haul ? stepHaul(robot, dt) : stepTraveller(robot, dt)));
    frameId = active.size ? requestAnimationFrame(tick) : 0;
  }

  // Fork tips pass under the base, while the mast stays clear of the arm's overhang.
  function forkTarget(robot, facing) {
    if (facing > 0) {
      const underBase = robot.slot + robot.base[1] + FORK_MIN_PAST_BASE;
      return Math.max(underBase, Math.min(robot.slot + robot.base[1] + truck.reach, robot.slot + FORK_CLEAR_LENGTH));
    }
    const underBase = robot.slot + robot.base[0] - FORK_MIN_PAST_BASE;
    return Math.min(underBase, Math.max(robot.slot + robot.base[0] - truck.reach, robot.slot + robot.w - FORK_CLEAR_LENGTH));
  }

  // The truck drives in from the nearer end of the line, forks first.
  function startHaul(robot) {
    const facing = robot.slot + robot.w / 2 < (lineStart + lineEnd) / 2 ? 1 : -1;
    const group = el('g', { class: 'skyline-haul', filter: 'url(#robot-skyline-halo)' }, layer);
    const vehicle = el('g', { class: 'skyline-forklift', 'aria-hidden': 'true' }, group);
    el('path', { d: truck.body, 'fill-rule': 'evenodd' }, vehicle);
    const forks = el('g', {}, vehicle);
    el('path', { d: truck.lift, 'fill-rule': 'evenodd' }, forks);
    const wheels = buildWheels(truck.wheels, vehicle);
    const hadFocus = document.activeElement === robot.node;
    group.appendChild(robot.node);
    if (hadFocus) robot.node.focus({ preventScroll: true });
    robot.haul = {
      group,
      truck: vehicle,
      forks,
      wheels,
      facing,
      x: facing > 0 ? 0 : stageEnd,
      target: forkTarget(robot, facing),
      speed: 0,
      rolled: 0,
      raised: 0,
      clock: 0,
      phase: 'arrive',
    };
    renderHaul(robot);
  }

  function launch(robot) {
    if (robot.moving) return;
    robot.moving = true;
    robot.node.setAttribute('aria-disabled', 'true');

    if (reducedMotion.matches) {
      robot.node.classList.add('is-fading');
      window.setTimeout(() => remove(robot), 260);
      return;
    }

    if (robot.mode === 'haul') {
      startHaul(robot);
    } else {
      // HoLLiE drives sideways to the nearer end. The others go the way they face.
      if (robot.mode === 'glide') robot.dir = robot.slot + robot.w / 2 < (lineStart + lineEnd) / 2 ? -1 : 1;
      // Draw the moving robot on top of the others without losing keyboard focus.
      const hadFocus = document.activeElement === robot.node;
      layer.appendChild(robot.node);
      if (hadFocus) robot.node.focus({ preventScroll: true });
      robot.node.setAttribute('filter', 'url(#robot-skyline-halo)');
    }

    active.add(robot);
    if (!frameId) {
      lastTime = performance.now();
      frameId = requestAnimationFrame(tick);
    }
  }

  footer.classList.add('has-skyline');
  footer.prepend(stage);
  fitToContentArea();
  window.addEventListener('resize', fitToContentArea);
})();
