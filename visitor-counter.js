// Count one page view per production page load. Busuanzi writes the
// site-wide total into #busuanzi_site_pv when that element is present.
(function () {
    if (window.location.hostname !== 'xiaoyazhai.github.io') return;

    var script = document.createElement('script');
    script.src = 'https://cdn.busuanzi.cc/busuanzi/3.6.9/busuanzi.min.js';
    script.async = true;
    document.head.appendChild(script);
})();
