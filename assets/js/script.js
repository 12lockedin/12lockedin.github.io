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
            sidebar.classList.toggle('hidden');
            sidebarToggle.classList.toggle('active');
    if (sidebarToggle && sidebar && content) {
        sidebarToggle.addEventListener('click', () => {
            const isHidden = sidebar.classList.toggle('hidden');
            sidebarToggle.classList.toggle('active');
            sidebarToggle.setAttribute('aria-expanded', !isHidden);
            content.classList.toggle('with-sidebar');
            
            // Actualizar el título del botón según el estado
            sidebarToggle.title = isHidden ? 'Mostrar barra lateral' : 'Ocultar barra lateral';
            
            // Guardar el estado en localStorage
            localStorage.setItem(SIDEBAR_HIDDEN_KEY, isHidden);
        });

        // Recuperar el estado guardado
        const isSidebarHidden = localStorage.getItem(SIDEBAR_HIDDEN_KEY) === 'true';
        if (isSidebarHidden) {
            sidebar.classList.add('hidden');
            sidebarToggle.classList.add('hidden');
            content.classList.remove('with-sidebar');
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