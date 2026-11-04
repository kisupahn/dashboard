(function (root) {
  'use strict';
  function clip(points, signed, keepPositive) {
    var result = [];
    points.forEach(function (a, index) {
      var b = points[(index + 1) % points.length], da = signed(a), db = signed(b);
      var insideA = keepPositive ? da >= 0 : da <= 0, insideB = keepPositive ? db >= 0 : db <= 0;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        var t = da / (da - db);
        result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    });
    return result;
  }
  function geometry(width, height, progress) {
    var t = Math.max(0.000001, Math.min(1, progress));
    var corner = { x: width * (1 - 2.12 * t), y: height * (1 - 2.12 * Math.pow(t, .96)) };
    var normal = { x: width - corner.x, y: height - corner.y };
    var middle = { x: (width + corner.x) / 2, y: (height + corner.y) / 2 };
    var lengthSquared = normal.x * normal.x + normal.y * normal.y;
    function signed(p) { return (p.x - middle.x) * normal.x + (p.y - middle.y) * normal.y; }
    var rectangle = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    var flat = clip(rectangle, signed, false), lifted = clip(rectangle, signed, true);
    var crease = lifted.filter(function (p) { return Math.abs(signed(p)) < .001; });
    var folded = lifted.map(function (p) {
      var distance = 2 * signed(p) / lengthSquared;
      return { x: p.x - distance * normal.x, y: p.y - distance * normal.y };
    });
    return { flat: flat, folded: folded, crease: crease, corner: corner };
  }
  function roundedPath(points, radius) {
    if (points.length < 3) return '';
    function toward(a, b) {
      var distance = Math.hypot(b.x - a.x, b.y - a.y), amount = Math.min(.12, radius / (distance || 1));
      return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
    }
    var path = '';
    points.forEach(function (p, index) {
      var before = toward(p, points[(index + points.length - 1) % points.length]);
      var after = toward(p, points[(index + 1) % points.length]);
      path += (index ? ' L ' : 'M ') + before.x + ' ' + before.y + ' Q ' + p.x + ' ' + p.y + ' ' + after.x + ' ' + after.y;
    });
    return path + ' Z';
  }
  var sequence = 0;
  function start(options) {
    var doc = root.document, sheet = options.sheet, board = options.board;
    if (!doc.createElementNS || !sheet.cloneNode || !root.requestAnimationFrame) return null;
    if (root.CSS && root.CSS.supports && !root.CSS.supports('clip-path', 'polygon(0 0, 100% 0, 100% 100%)')) return null;
    var width = sheet.offsetWidth, height = sheet.offsetHeight;
    if (!width || !height) return null;
    var layer = doc.createElement('div'); layer.className = 'page-curl-layer'; layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('inert', '');
    layer.style.width = width + 'px'; layer.style.height = height + 'px';
    var page = sheet.cloneNode(true);
    page.removeAttribute('id'); page.querySelectorAll('[id]').forEach(function (node) { node.removeAttribute('id'); });
    page.classList.add('page-curl-current'); page.style.width = width + 'px'; page.style.height = height + 'px';
    layer.appendChild(page);
    function svgNode(name, attrs) {
      var node = doc.createElementNS('http://www.w3.org/2000/svg', name);
      Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); }); return node;
    }
    var svg = svgNode('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height });
    var defs = svgNode('defs'), id = 'menu-curl-' + (++sequence);
    var gradient = svgNode('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse' });
    [['0%', '#b9aa92'], ['7%', '#e4d8c3'], ['18%', '#fffdf7'], ['55%', '#f7f0e2'], ['100%', '#d5c5a8']].forEach(function (stop) {
      gradient.appendChild(svgNode('stop', { offset: stop[0], 'stop-color': stop[1] }));
    });
    defs.appendChild(gradient);
    var grain = svgNode('pattern', { id: id + '-grain', patternUnits: 'userSpaceOnUse', width: '240', height: '240' });
    grain.appendChild(svgNode('image', { href: 'paper-grain.svg?v=20261104.14', width: '240', height: '240' }));
    defs.appendChild(grain); svg.appendChild(defs);
    var shadow = svgNode('path', { fill: '#372819', opacity: '.24', 'class': 'page-curl-shadow' });
    var back = svgNode('path', { fill: 'url(#' + id + ')', stroke: '#b9aa90', 'stroke-width': '1.1' });
    var texture = svgNode('path', { fill: 'url(#' + id + '-grain)', opacity: '.7' });
    var highlight = svgNode('path', { fill: 'none', stroke: '#fffdf8', 'stroke-width': '2', opacity: '.7' });
    svg.appendChild(shadow); svg.appendChild(back); svg.appendChild(texture); svg.appendChild(highlight); layer.appendChild(svg);
    var frame, stopped = false, started;
    function cleanup() { if (frame != null) root.cancelAnimationFrame(frame); layer.remove(); }
    function finish() { if (stopped) return; stopped = true; cleanup(); options.complete(); }
    function draw(progress) {
      var g = geometry(width, height, progress);
      page.style.clipPath = 'polygon(' + (g.flat.length ? g.flat.map(function (p) { return p.x + 'px ' + p.y + 'px'; }).join(',') : '0 0,0 0,0 0') + ')';
      var path = roundedPath(g.folded, Math.min(width, height) * .045);
      back.setAttribute('d', path); texture.setAttribute('d', path); shadow.setAttribute('d', path);
      shadow.setAttribute('transform', 'translate(' + (8 + 16 * Math.sin(progress * Math.PI)) + ' 12)');
      if (g.crease.length >= 2) {
        var a = g.crease[0], b = g.crease[g.crease.length - 1];
        var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        gradient.setAttribute('x1', mid.x); gradient.setAttribute('y1', mid.y);
        gradient.setAttribute('x2', g.corner.x); gradient.setAttribute('y2', g.corner.y);
        highlight.setAttribute('d', 'M ' + a.x + ' ' + a.y + ' Q ' + mid.x + ' ' + mid.y + ' ' + b.x + ' ' + b.y);
      } else highlight.setAttribute('d', '');
    }
    function tick(time) {
      if (stopped) return;
      if (started == null) started = time;
      var t = Math.min(1, (time - started) / 2200);
      var ease = t * t * t * (t * (t * 6 - 15) + 10);
      try { draw(ease); } catch (_) { finish(); return; }
      if (t >= 1) finish(); else frame = root.requestAnimationFrame(tick);
    }
    try { draw(0); board.appendChild(layer); options.advance(); frame = root.requestAnimationFrame(tick); }
    catch (error) { stopped = true; cleanup(); throw error; }
    return { cancel: function () { if (stopped) return; stopped = true; cleanup(); } };
  }
  root.TransitPageCurl = { geometry: geometry, start: start };
})(globalThis);
