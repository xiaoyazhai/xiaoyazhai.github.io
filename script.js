// ── Cross-page zoom sync ──────────────────────────────────────────
(function () {
    // Skip zoom on touch devices: CSS zoom causes layout jank on mobile
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

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

// Build the banner from the current year's publication cards on this page.
function loadPubScrollBanner() {
    const banner = document.querySelector('.pub-scroll-banner');
    const track = banner && banner.querySelector('.pub-scroll-track');
    const yearHeading = document.getElementById('year-2026');
    if (!track || !yearHeading) return;

    const cards = [...yearHeading.nextElementSibling.querySelectorAll('.faculty-card')];
    if (cards.length === 0) {
        banner.style.display = 'none';
        return;
    }

    const journalCodes = {
        'Computers & Structures': 'C&S',
        'Computers and Structures': 'C&S',
        'International Journal of Mechanical Sciences': 'IJMS',
        'Advances in Engineering Software': 'AES',
        'Computer Aided Geometric Design': 'CAGD',
        'Computer Methods in Applied Mechanics and Engineering': 'CMAME',
        'International Journal for Numerical Methods in Engineering': 'IJNME',
        'Thin-Walled Structures': 'TWS',
        'Smart Materials in Manufacturing': 'SMM',
        'Nature Communications': 'NC'
    };

    const makeGroup = (duplicate) => {
        const group = document.createElement('div');
        group.className = 'pub-scroll-group';
        if (duplicate) group.setAttribute('aria-hidden', 'true');

        cards.forEach((card) => {
            const title = card.querySelector('.publication-title').textContent.trim().replace(/^\d+\.\s*/, '');
            const venue = card.querySelector('.publication-venue').textContent.trim();
            const journal = venue.replace(/,\s*2026\s*$/, '');
            const code = journalCodes[journal] || journal.split(/\s+/).map((word) => word[0]).join('').slice(0, 5).toUpperCase();
            const paperLink = [...card.querySelectorAll('.publication-links a')]
                .find((link) => link.textContent.trim() === 'Paper' && link.getAttribute('href'));

            const item = document.createElement('a');
            item.className = 'pub-scroll-item';
            item.href = paperLink ? paperLink.getAttribute('href') : '#year-2026';
            item.title = `${title} — ${venue}`;
            if (paperLink && /^https?:\/\//.test(item.href)) {
                item.target = '_blank';
                item.rel = 'noopener noreferrer';
            }
            if (duplicate) item.tabIndex = -1;

            const cover = document.createElement('div');
            cover.className = 'pub-scroll-journal';
            cover.dataset.journal = code;
            cover.setAttribute('aria-hidden', 'true');
            const coverLabel = document.createElement('span');
            coverLabel.className = 'pub-scroll-journal-label';
            coverLabel.textContent = 'JOURNAL';
            const coverCode = document.createElement('span');
            coverCode.className = 'pub-scroll-journal-code';
            coverCode.textContent = code;
            const coverYear = document.createElement('span');
            coverYear.className = 'pub-scroll-journal-year';
            coverYear.textContent = '2026';
            cover.append(coverLabel, coverCode, coverYear);

            const info = document.createElement('div');
            info.className = 'pub-scroll-info';
            const venueText = document.createElement('div');
            venueText.className = 'pub-scroll-venue';
            venueText.textContent = venue;
            const titleText = document.createElement('div');
            titleText.className = 'pub-scroll-title';
            titleText.textContent = title;
            info.append(venueText, titleText);
            item.append(cover, info);
            group.appendChild(item);
        });
        return group;
    };

    track.replaceChildren(makeGroup(false), makeGroup(true));
    track.style.animationDuration = (cards.length * 8) + 's';
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

// Back-to-top button (global, works on all pages)
(function () {
    var btn = document.getElementById('back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', function () {
        if (window.scrollY > 300) {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        } else {
            btn.style.opacity = '0';
            btn.style.pointerEvents = 'none';
        }
    });
})();

// ── Footer globe: IP geolocation red dot ──────
(function initFooterGlobe() {
    document.addEventListener('DOMContentLoaded', function () {
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
