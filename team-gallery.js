(function () {
    var tabs = Array.from(document.querySelectorAll('.team-gallery-tab'));
    var photoPanel = document.getElementById('group-photo-panel');
    var alumniPanel = document.getElementById('alumni-panel');
    var carousel = document.getElementById('group-photo-carousel');
    var track = document.getElementById('group-photo-track');
    var dots = document.getElementById('group-photo-dots');
    if (!photoPanel || !alumniPanel || !carousel || !track || !dots) return;

    var slides = Array.from(track.children);
    var total = slides.length;
    var current = 0;
    var position = 1;
    var busy = false;
    var timer = null;
    var touchStartX = 0;
    var touchDeltaX = 0;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function stopAuto() {
        if (timer) clearInterval(timer);
        timer = null;
    }

    function startAuto() {
        if (!timer && !photoPanel.hidden && !document.hidden && !reducedMotion) {
            timer = setInterval(next, 4000);
        }
    }

    function selectTab(index) {
        tabs.forEach(function (tab, i) {
            tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
            tab.tabIndex = i === index ? 0 : -1;
        });
        photoPanel.hidden = index !== 0;
        alumniPanel.hidden = index !== 1;
        if (index === 0) startAuto();
        else {
            stopAuto();
            position = current + 1;
            track.style.transition = 'none';
            track.style.transform = 'translateX(' + (-position * 100) + '%)';
            busy = false;
        }
    }

    tabs.forEach(function (tab, index) {
        tab.addEventListener('click', function () { selectTab(index); });
        tab.addEventListener('keydown', function (event) {
            var nextIndex;
            if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = tabs.length - 1;
            else return;
            event.preventDefault();
            selectTab(nextIndex);
            tabs[nextIndex].focus();
        });
    });

    if (total < 2) return;

    var firstClone = slides[0].cloneNode(true);
    var lastClone = slides[total - 1].cloneNode(true);
    firstClone.setAttribute('aria-hidden', 'true');
    lastClone.setAttribute('aria-hidden', 'true');
    track.appendChild(firstClone);
    track.insertBefore(lastClone, slides[0]);
    track.style.transition = 'none';
    track.style.transform = 'translateX(-100%)';

    slides.forEach(function (slide, index) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'group-photo-dot';
        dot.setAttribute('aria-label', 'Show group photo ' + (index + 1));
        dot.addEventListener('click', function () { goTo(index); restartAuto(); });
        dots.appendChild(dot);
    });

    function updateDots() {
        Array.from(dots.children).forEach(function (dot, index) {
            dot.classList.toggle('active', index === current);
            if (index === current) dot.setAttribute('aria-current', 'true');
            else dot.removeAttribute('aria-current');
        });
        slides.forEach(function (slide, index) {
            slide.setAttribute('aria-hidden', index === current ? 'false' : 'true');
        });
    }

    function slideTo(nextPosition) {
        track.style.transition = 'transform 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        track.style.transform = 'translateX(' + (-nextPosition * 100) + '%)';
    }

    function goTo(index) {
        if (busy || index === current) return;
        busy = true;
        current = index;
        position = current + 1;
        slideTo(position);
        updateDots();
    }

    function next() {
        if (busy) return;
        busy = true;
        position++;
        current = (current + 1) % total;
        slideTo(position);
        updateDots();
    }

    function prev() {
        if (busy) return;
        busy = true;
        position--;
        current = (current - 1 + total) % total;
        slideTo(position);
        updateDots();
    }

    function restartAuto() {
        stopAuto();
        startAuto();
    }

    track.addEventListener('transitionend', function (event) {
        if (event.target !== track || event.propertyName !== 'transform') return;
        if (position >= total + 1 || position <= 0) {
            position = position >= total + 1 ? 1 : total;
            track.style.transition = 'none';
            track.style.transform = 'translateX(' + (-position * 100) + '%)';
        }
        busy = false;
    });

    document.getElementById('group-photo-next').addEventListener('click', function () { next(); restartAuto(); });
    document.getElementById('group-photo-prev').addEventListener('click', function () { prev(); restartAuto(); });
    carousel.addEventListener('mouseenter', stopAuto);
    carousel.addEventListener('mouseleave', startAuto);
    carousel.addEventListener('focusin', stopAuto);
    carousel.addEventListener('focusout', function (event) {
        if (!carousel.contains(event.relatedTarget)) startAuto();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stopAuto();
        else startAuto();
    });

    track.addEventListener('touchstart', function (event) {
        if (busy) return;
        touchStartX = event.touches[0].clientX;
        touchDeltaX = 0;
        stopAuto();
    }, { passive: true });
    track.addEventListener('touchmove', function (event) {
        if (busy) return;
        touchDeltaX = event.touches[0].clientX - touchStartX;
        track.style.transition = 'none';
        track.style.transform = 'translateX(calc(' + (-position * 100) + '% + ' + touchDeltaX + 'px))';
    }, { passive: true });
    track.addEventListener('touchend', function () {
        if (busy) return;
        if (touchDeltaX < -50) next();
        else if (touchDeltaX > 50) prev();
        else slideTo(position);
        touchDeltaX = 0;
        startAuto();
    });

    updateDots();
    startAuto();
})();
