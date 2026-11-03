(function (root) {
  'use strict';
  // Domestic live link published on YTN's official live page, checked 2026-11-03.
  var defaultURL = 'https://www.youtube.com/watch?v=aZyD6EPl6KU';
  function source(value) {
    var url;
    try { url = new URL(String(value).trim()); } catch (_) { throw new Error('뉴스는 유튜브 영상 또는 라이브 주소를 입력하세요.'); }
    var host = url.hostname.toLowerCase(), id = '';
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) {
      if (host === 'youtu.be') id = url.pathname.slice(1);
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].indexOf(host) !== -1) {
        if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
        else { var match = url.pathname.match(/^\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/); if (match) id = match[1]; }
      }
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('뉴스는 유튜브 영상 또는 라이브의 공유 주소를 입력하세요.');
    return {
      watchURL: 'https://www.youtube.com/watch?v=' + id,
      embedURL: 'https://www.youtube.com/embed/' + id + '?autoplay=1&mute=1&playsinline=1&rel=0',
    };
  }
  root.TransitNews = { defaultURL: defaultURL, source: source };
})(globalThis);
