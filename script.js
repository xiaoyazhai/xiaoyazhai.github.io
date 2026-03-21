// ── Cross-page zoom sync ──────────────────────────────────────────
(function () {
    var KEY = 'topopt_zoom';
    var MIN = 0.8, MAX = 1.3, STEP = 0.1;
    var current = Math.min(MAX, Math.max(MIN, parseFloat(localStorage.getItem(KEY)) || 1));

    // Apply immediately (before DOMContentLoaded to reduce flash)
    document.documentElement.style.zoom = current;

    function applyZoom(z) {
        current = parseFloat(Math.min(MAX, Math.max(MIN, z)).toFixed(2));
        document.documentElement.style.zoom = current;
        localStorage.setItem(KEY, current);
        var btnIn  = document.getElementById('zoom-in');
        var btnOut = document.getElementById('zoom-out');
        if (btnIn)  btnIn.disabled  = current >= MAX;
        if (btnOut) btnOut.disabled = current <= MIN;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var wrap = document.createElement('div');
        wrap.className = 'zoom-controls';
        wrap.innerHTML =
            '<button id="zoom-out" class="zoom-btn" title="缩小 (Ctrl+-)">A-</button>' +
            '<button id="zoom-in"  class="zoom-btn" title="放大 (Ctrl+=)">A+</button>';
        document.body.appendChild(wrap);

        document.getElementById('zoom-out').addEventListener('click', function () { applyZoom(current - STEP); });
        document.getElementById('zoom-in' ).addEventListener('click', function () { applyZoom(current + STEP); });
        applyZoom(current); // sync disabled state
    });

    // Keyboard shortcuts: Ctrl+= zoom in, Ctrl+- zoom out, Ctrl+0 reset
    document.addEventListener('keydown', function (e) {
        if (!e.ctrlKey) return;
        if (e.key === '=' || e.key === '+') { e.preventDefault(); applyZoom(current + STEP); }
        if (e.key === '-')                  { e.preventDefault(); applyZoom(current - STEP); }
        if (e.key === '0')                  { e.preventDefault(); applyZoom(1); }
    });

    // Intercept Ctrl+scroll (and trackpad pinch) → apply custom zoom instead of browser zoom
    document.addEventListener('wheel', function (e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        var delta = e.deltaY < 0 ? STEP : -STEP;
        applyZoom(current + delta);
    }, { passive: false });

    // Real-time sync: when another tab changes the zoom, apply it here immediately
    window.addEventListener('storage', function (e) {
        if (e.key !== KEY) return;
        var z = Math.min(MAX, Math.max(MIN, parseFloat(e.newValue) || 1));
        current = z;
        document.documentElement.style.zoom = z;
        var btnIn  = document.getElementById('zoom-in');
        var btnOut = document.getElementById('zoom-out');
        if (btnIn)  btnIn.disabled  = z >= MAX;
        if (btnOut) btnOut.disabled = z <= MIN;
    });
})();

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar scroll effect
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
});

// Active nav link on scroll
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-menu a');

window.addEventListener('scroll', () => {
    let current = '';

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;

        if (window.pageYOffset >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

// Load news
async function loadNews() {
    try {
        const response = await fetch('data/news.json');
        const data = await response.json();

        // Get the 3 most recent news items
        const recentNews = data.news.slice(0, 3);

        const newsContainer = document.getElementById('news-list');
        newsContainer.innerHTML = '';

        recentNews.forEach(item => {
            const newsItem = document.createElement('div');
            newsItem.className = 'news-item';

            // Format date
            const date = new Date(item.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            newsItem.innerHTML = `
                <div class="news-item-header">
                    <div class="news-date">${formattedDate}</div>
                </div>
                <div class="news-content">
                    <h3>${item.title}</h3>
                    <p>${item.description}</p>
                </div>
            `;

            newsContainer.appendChild(newsItem);
        });
    } catch (error) {
        console.error('Error loading news:', error);
        document.getElementById('news-list').innerHTML =
            '<p style="text-align: center; color: #999;">Unable to load news at this time.</p>';
    }
}

// Load publications
async function loadPublications() {
    try {
        const response = await fetch('data/publications.json');
        const data = await response.json();

        // Get the 3 most recent publications
        const recentPublications = data.publications.slice(0, 3);

        const pubContainer = document.getElementById('publications-list');
        pubContainer.innerHTML = '';

        recentPublications.forEach(pub => {
            const pubItem = document.createElement('div');
            pubItem.className = 'publication-item';

            let linksHTML = '';
            if (pub.links) {
                linksHTML = '<div class="publication-links">';
                if (pub.links.paper) linksHTML += `<a href="${pub.links.paper}" class="publication-link">Paper</a>`;
                if (pub.links.code) linksHTML += `<a href="${pub.links.code}" class="publication-link">Code</a>`;
                if (pub.links.slides) linksHTML += `<a href="${pub.links.slides}" class="publication-link">Slides</a>`;
                if (pub.links.bibtex) linksHTML += `<a href="${pub.links.bibtex}" class="publication-link">BibTeX</a>`;
                linksHTML += '</div>';
            }

            const awardBadge = pub.award ? ` <span style="color: #f59e0b; font-weight: 600;">🏆 ${pub.award}</span>` : '';

            pubItem.innerHTML = `
                <div class="publication-title">${pub.title}</div>
                <div class="publication-authors">${pub.authors}</div>
                <div class="publication-venue">${pub.venue} ${pub.year}${awardBadge}</div>
                ${linksHTML}
            `;

            pubContainer.appendChild(pubItem);
        });
    } catch (error) {
        console.error('Error loading publications:', error);
        document.getElementById('publications-list').innerHTML =
            '<p style="text-align: center; color: #999;">Unable to load publications at this time.</p>';
    }
}

// Load publication scroll banner
async function loadPubScrollBanner() {
    const banner = document.getElementById('pub-scroll-banner');
    const track  = document.getElementById('pub-scroll-track');
    if (!track) return;

    try {
        const response = await fetch('data/publications.json');
        const data = await response.json();
        const pubs = data.publications;

        if (!pubs || pubs.length === 0) {
            banner.style.display = 'none';
            return;
        }

        const gradients = [
            'linear-gradient(135deg,#2563eb,#7c3aed)',
            'linear-gradient(135deg,#0891b2,#0d9488)',
            'linear-gradient(135deg,#7c3aed,#c026d3)',
            'linear-gradient(135deg,#059669,#0891b2)',
            'linear-gradient(135deg,#dc2626,#ea580c)',
            'linear-gradient(135deg,#d97706,#84cc16)',
            'linear-gradient(135deg,#6366f1,#8b5cf6)',
        ];
        const icons = ['📄','🔬','🧠','⚙️','🏗️','📊','🔧'];

        // Duplicate items for seamless infinite loop
        const items = [...pubs, ...pubs];

        items.forEach((pub, i) => {
            const idx  = i % pubs.length;
            const grad = gradients[idx % gradients.length];
            const icon = icons[idx % icons.length];

            const link = pub.links && pub.links.paper ? pub.links.paper : '#';

            let thumbHTML;
            if (pub.image) {
                thumbHTML = `<img src="${pub.image}" alt=""
                    onerror="this.parentElement.innerHTML='<div class=\\'pub-scroll-thumb-grad\\'
                    style=\\'background:${grad}\\'>${icon}</div>'">`;
            } else {
                thumbHTML = `<div class="pub-scroll-thumb-grad" style="background:${grad}">${icon}</div>`;
            }

            const a = document.createElement('a');
            a.className = 'pub-scroll-item';
            a.href   = link;
            a.target = (link !== '#') ? '_blank' : '_self';
            a.rel    = 'noopener noreferrer';
            a.innerHTML = `
                <div class="pub-scroll-thumb">${thumbHTML}</div>
                <div class="pub-scroll-info">
                    <div class="pub-scroll-venue">${pub.venue} ${pub.year}${pub.award ? ' 🏆' : ''}</div>
                    <div class="pub-scroll-title">${pub.title}</div>
                </div>`;
            track.appendChild(a);
        });

        // Adjust animation speed based on item count
        track.style.animationDuration = (pubs.length * 10) + 's';

    } catch (error) {
        console.error('Error loading pub scroll banner:', error);
        if (banner) banner.style.display = 'none';
    }
}

// Intersection Observer for fade-in animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all cards and sections
document.addEventListener('DOMContentLoaded', () => {
    // Load dynamic content
    loadPubScrollBanner();
    loadNews();
    loadPublications();

    // Animate cards on scroll
    const animateElements = document.querySelectorAll('.research-card, .publication-item, .opensource-card, .teaching-card, .news-item');
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Mobile menu toggle
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');

if (navToggle) {
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });
}

// ── Footer globe: visitor counter + IP geolocation red dot ──────
(function initFooterGlobe() {
    var KEY  = 'ustc_topopt_vc';
    var SEED = 15843;
    var data = JSON.parse(localStorage.getItem(KEY) || '{"n":0,"t":0}');
    var now  = Date.now();
    if (now - data.t > 30 * 60 * 1000) {
        data.n++;
        data.t = now;
        localStorage.setItem(KEY, JSON.stringify(data));
    }
    var total = SEED + data.n;

    function animateCount(el, target) {
        var cur = Math.max(0, target - 60);
        var timer = setInterval(function () {
            cur += 2;
            if (cur >= target) { cur = target; clearInterval(timer); }
            el.textContent = cur.toLocaleString();
        }, 16);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var countEl = document.getElementById('visit-count');
        if (countEl) animateCount(countEl, total);

        var dot   = document.getElementById('visitor-dot');
        var locEl = document.getElementById('visitor-loc');

        fetch('https://ipapi.co/json/')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var lat     = parseFloat(d.latitude)  || 0;
                var city    = d.city         || '';
                var country = d.country_name || '';
                // Map latitude (−90…+90) → top (100%…0%) within globe circle
                var yPct = ((90 - lat) / 180 * 100).toFixed(1);
                if (dot) {
                    dot.style.top     = yPct + '%';
                    dot.style.display = 'block';
                }
                if (locEl && (city || country)) {
                    locEl.textContent = '📍 ' + [city, country].filter(Boolean).join(', ');
                }
            })
            .catch(function () {
                if (dot)   { dot.style.top = '45%'; dot.style.display = 'block'; }
                if (locEl) { locEl.textContent = ''; }
            });
    });
})();

// Contact form submission
const contactForm = document.querySelector('.contact-form form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Thank you for your message! We will get back to you soon.');
        contactForm.reset();
    });
}
