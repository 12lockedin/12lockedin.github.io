document.addEventListener('DOMContentLoaded', function() {
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

    // Funcionalidad de la barra lateral
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const content = document.querySelector('.content');

    if (sidebarToggle && sidebar && content) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
            sidebarToggle.classList.toggle('hidden');
            content.classList.toggle('with-sidebar');
            
            // Guardar el estado en localStorage
            const isSidebarHidden = sidebar.classList.contains('hidden');
            localStorage.setItem('sidebarHidden', isSidebarHidden);
        });

        // Recuperar el estado guardado
        const isSidebarHidden = localStorage.getItem('sidebarHidden') === 'true';
        if (isSidebarHidden) {
            sidebar.classList.add('hidden');
            sidebarToggle.classList.add('hidden');
            content.classList.remove('with-sidebar');
        }
    }

    // Funcionalidad de búsqueda
    const searchInput = document.querySelector('.search-input');
    const postsListItems = document.querySelectorAll('.posts-list-item');

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
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
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