document.addEventListener('DOMContentLoaded', function() {
    const SIDEBAR_HIDDEN_KEY = 'sidebarHidden';
    
    // Lazy loading fallback para navegadores que no lo soportan
    if (!('loading' in HTMLImageElement.prototype)) {
        const images = document.querySelectorAll('img[loading="lazy"]');
        images.forEach(img => {
            if (img.dataset.src) {
                img.src = img.dataset.src;
            }
        });
    }

    // Cache elements
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const content = document.querySelector('.content');
    const searchInput = document.querySelector('.search-input');
    const postsListItems = document.querySelectorAll('.posts-list-item');
    const anchors = document.querySelectorAll('a[href^="#"]');

    // Función para ajustar las posiciones según la altura del nav
    function adjustPositions() {
        const nav = document.querySelector('.site-nav');
        const sidebar = document.querySelector('.sidebar');
        const content = document.querySelector('.content');
        
        if (nav) {
            const navHeight = nav.offsetHeight;
            
            // Ajustar sidebar si existe
            if (sidebar) {
                sidebar.style.top = `${navHeight}px`;
                sidebar.style.height = `calc(100vh - ${navHeight}px)`;
            }
            
            // Ajustar contenido
            if (content) {
                content.style.marginTop = `calc(${navHeight}px + 1rem)`;
            }
        }
    }

    // Ajustar posiciones inicialmente
    adjustPositions();

    // Ajustar cuando cambie el tamaño de la ventana
    window.addEventListener('resize', adjustPositions);

    // Ajustar después de que las fuentes se hayan cargado
    document.fonts.ready.then(adjustPositions);
    
    // Función simplificada para manejar el estado del sidebar
    function toggleSidebar(isHidden) {
        if (isHidden === undefined) {
            isHidden = !sidebar.classList.contains('hidden');
        }
        
        sidebar.classList.toggle('hidden', isHidden);
        sidebarToggle.classList.toggle('active', !isHidden);
        content.classList.toggle('content--with-sidebar', !isHidden);
        
        // Actualizar ARIA y título
        sidebarToggle.setAttribute('aria-expanded', !isHidden);
        sidebarToggle.setAttribute('title', 
            isHidden ? 'Mostrar barra lateral' : 'Ocultar barra lateral'
        );
        
        // Guardar estado
        localStorage.setItem(SIDEBAR_HIDDEN_KEY, isHidden);
    }

    // Configurar eventos del sidebar
    if (sidebarToggle && sidebar && content) {
        // Click en el botón de toggle
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
        
        // Click fuera del sidebar
        document.addEventListener('click', (e) => {
            if (!sidebar.classList.contains('hidden') && 
                !sidebar.contains(e.target) && 
                !sidebarToggle.contains(e.target)) {
                toggleSidebar(true);
            }
        });
        
        // Prevenir que los clicks dentro del sidebar lo cierren
        sidebar.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !sidebar.classList.contains('hidden')) {
                toggleSidebar(true);
            }
        });
        
        // Restaurar estado guardado
        const savedState = localStorage.getItem(SIDEBAR_HIDDEN_KEY);
        if (savedState === 'true') {
            toggleSidebar(true);
        }
    }

    // Funcionalidad de búsqueda
    if (searchInput && postsListItems.length) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            postsListItems.forEach(item => {
                const title = item.querySelector('.posts-list-link').textContent.toLowerCase();
                const isVisible = title.includes(searchTerm);
                item.style.display = isVisible ? 'block' : 'none';
            });
        });
    }

    // Suavizar el scroll al hacer clic en links internos
    anchors.forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});