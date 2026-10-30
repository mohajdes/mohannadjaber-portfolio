document.addEventListener('DOMContentLoaded', () => {
    // --- Reusable Components (Header & Footer) ---
    const headerPlaceholder = document.getElementById('header-placeholder');
    const footerPlaceholder = document.getElementById('footer-placeholder');

    if (headerPlaceholder) {
        headerPlaceholder.innerHTML = `
            <header class="header">
                <div class="container">
                    <nav class="header-nav">
                        <a href="index.html" class="logo">M.AJ</a>
                        <div class="nav-links" id="nav-links">
                            <a href="index.html" class="nav-link">Home</a>
                            <a href="work.html" class="nav-link">Work</a>
                            <a href="hire.html" class="nav-link">Hire Me</a>
                        </div>
                        <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle menu">
                            <svg class="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                            </svg>
                        </button>
                    </nav>
                </div>
            </header>
        `;
    }

    if (footerPlaceholder) {
        footerPlaceholder.innerHTML = `
            <footer class="footer">
                <div class="container">
                    <div class="footer-content">
                        <p>&copy; ${new Date().getFullYear()} Mohannad A.J. Portfolio</p>
                        <div class="footer-social-links">
                            <a href="https://www.facebook.com/mohannadesigns" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                            </a>
                            <a href="https://www.instagram.com/mhndalij" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                            </a>
                            <a href="https://wa.me/201061422479" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                            </a>
                        </div>
                        <p class="footer-text-right">Website Was Developed by Me BTW</p>
                    </div>
                </div>
            </footer>
        `;
    }

    // --- Mobile Menu Logic ---
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const navLinks = document.getElementById('nav-links');
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // --- Active Nav Link ---
    const currentPage = window.location.pathname.split('/').pop();
    const navLinksA = document.querySelectorAll('.nav-link');
    navLinksA.forEach(link => {
        if (link.getAttribute('href') === currentPage || (currentPage === '' && link.getAttribute('href') === 'index.html')) {
            link.classList.add('active');
        }
    });

    // --- Scroll Animations ---
    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1
    });
    animatedElements.forEach(el => observer.observe(el));


    // --- Page-Specific Logic ---
    if (document.body.id === 'work-page') {
        initWorkPage();
    }
    if (document.body.id === 'project-page') {
        initProjectPage();
    }
});


function initWorkPage() {
    const projectGrid = document.getElementById('project-grid');
    const filterContainer = document.getElementById('filter-container');
    const projectCategories = ['All', 'Logo', 'Social Media', 'Packaging', 'Printing'];
    let activeFilter = 'All';

    function renderProjects(filter) {
        projectGrid.innerHTML = '';
        const filteredProjects = filter === 'All'
            ? projects
            : projects.filter(p => p.category === filter);

        filteredProjects.forEach((project, index) => {
            const card = document.createElement('a');
            card.href = `project.html?id=${project.id}`;
            card.className = 'project-card';
            card.style.setProperty('--delay', `${index * 0.02}s`);
            card.innerHTML = `
                <img src="${project.coverImage}" alt="${project.title}">
                <div class="project-card-overlay"></div>
                <div class="project-card-content">
                    <span class="project-card-tag">${project.tag}</span>
                    <h3 class="project-card-title">${project.title}</h3>
                </div>
            `;
            projectGrid.appendChild(card);
        });
    }

    function renderFilters() {
        projectCategories.forEach(category => {
            const button = document.createElement('button');
            button.className = 'filter-button';
            button.textContent = category;
            if (category === activeFilter) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => {
                activeFilter = category;
                document.querySelectorAll('.filter-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                renderProjects(activeFilter);
            });
            filterContainer.appendChild(button);
        });
    }

    renderFilters();
    renderProjects(activeFilter);
}

function initProjectPage() {
    const container = document.getElementById('project-detail-container');
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('id');
    const project = projects.find(p => p.id === projectId);

    if (project) {
        document.title = `${project.title} | Mohannad A.J.`;
        let imagesHTML = project.images.map((img, index) => 
            `<div class="animate-on-scroll" style="--delay: ${0.2 + index * 0.1}s">
                <img src="${img}" alt="${project.title} - view ${index + 1}">
            </div>`
        ).join('');

        let videoHTML = project.video ? 
            `<div class="animate-on-scroll">
                <video src="${project.video}" controls autoplay muted loop></video>
            </div>` 
            : '';

        container.innerHTML = `
            <a href="work.html" class="back-link">&larr; Back to Work</a>
            <header class="project-header">
                <p class="project-header-category animate-fade-in-up">${project.category}</p>
                <h1 class="project-header-title animate-fade-in-up" style="--delay: 0.1s">${project.title}</h1>
                <p class="project-header-description animate-fade-in-up" style="--delay: 0.2s">${project.description}</p>
            </header>
            <div class="project-gallery">
                ${videoHTML}
                ${imagesHTML}
            </div>
        `;
        
        // Re-run observer for dynamically added elements
        const animatedElements = container.querySelectorAll('.animate-on-scroll');
         const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1
        });
        animatedElements.forEach(el => observer.observe(el));


    } else {
        container.innerHTML = `<h1 class="page-title">Project not found.</h1><a href="work.html" class="back-link">Return to Work</a>`;
    }
}