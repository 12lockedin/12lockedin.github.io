document.addEventListener('DOMContentLoaded', function() {
    const SIDEBAR_HIDDEN_KEY = 'sidebarHidden';
    // Lazy loading fallback para navegadores que no lo soportan
    if (!('loading' in HTMLImageElement.prototype)) {
        const images = document.querySelectorAll('img[loading="lazy"]');
        // Aquí podrías implementar un IntersectionObserver o tu propia lógica de lazy loading
        images.forEach(img => {
            if (img.dataset.src) {
                img.src = img.dataset.src;
            }
        });
    }

    // Cache elements that do not change
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const content = document.querySelector('.content');
    const searchInput = document.querySelector('.search-input');
    const postsListItems = document.querySelectorAll('.posts-list-item');
    const anchors = document.querySelectorAll('a[href^="#"]');
    
    // Función para manejar el estado del sidebar
    function toggleSidebar(isHidden) {
        sidebar.classList.toggle('hidden', isHidden);
        sidebarToggle.classList.toggle('active', !isHidden);
        content.classList.toggle('content--with-sidebar', !isHidden);
        
        // Actualizar ARIA y título
        sidebarToggle.setAttribute('aria-expanded', !isHidden);
        sidebarToggle.setAttribute('title', isHidden ? 'Mostrar barra lateral' : 'Ocultar barra lateral');
        
        // Guardar estado
        localStorage.setItem(SIDEBAR_HIDDEN_KEY, isHidden);
        
        // Disparar evento de resize para manejar posibles cambios en el layout
        window.dispatchEvent(new Event('resize'));
    }

    // Evento click del botón
    if (sidebarToggle && sidebar && content) {
        sidebarToggle.addEventListener('click', () => {
            const isCurrentlyHidden = sidebar.classList.contains('hidden');
            toggleSidebar(!isCurrentlyHidden);
        });
        
        // Manejar tecla Escape para cerrar el sidebar
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
    
    // Manejar cambios de tamaño de ventana
    let timeout;
    window.addEventListener('resize', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (window.innerWidth <= 768 && !sidebar.classList.contains('hidden')) {
                toggleSidebar(true);
            }
        }, 250);
    });

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