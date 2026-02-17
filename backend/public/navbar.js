document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    const navbarHTML = `
    <nav id="app-navbar">
        <div class="nav-left">
            <div class="menu-toggle" onclick="toggleSidebar()">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </div>
            <a href="/index.html" class="nav-logo">
                <div style="width: 32px; height: 32px; background: #0ea5e9; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">Y</div>
                <span>YarnTracker <span style="font-weight: 300; opacity: 0.7;">Pro</span></span>
            </a>
        </div>
        
        <div class="nav-links">
            
            <a href="/admin.html" class="nav-item ${currentPage === 'admin.html' ? 'active' : ''}">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                Admin Approvals
            </a>
            <a href="/index.html" class="nav-item ${currentPage === 'index.html' || currentPage === '' ? 'active' : ''}">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                Dashboard
            </a>
            <a href="/dashboard.html" class="nav-item ${currentPage === 'dashboard.html' ? 'active' : ''}">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                Place Order
            </a>
            <a href="/gallery.html" class="nav-item ${currentPage === 'gallery.html' ? 'active' : ''}">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
                QR Gallery
            </a>
            <a href="/testing.html" class="nav-item ${currentPage === 'testing.html' ? 'active' : ''}">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
                QR for Testing
            </a>
        </div>
        
       
    </nav>
    `;

    const sidebarHTML = `
    <!-- Global Side Drawer - outside all containers -->
    <div id="sidebar-overlay" class="sidebar-overlay" onclick="toggleSidebar()"></div>
    <div id="side-drawer">
        <div class="drawer-header">
            <div class="nav-logo">
                <div style="width: 32px; height: 32px; background: #0ea5e9; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">Y</div>
                <span>YarnTracker <span style="font-weight: 300; opacity: 0.7;">Pro</span></span>
            </div>
            <div class="drawer-close" onclick="toggleSidebar()">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </div>
        </div>
        
        <div class="drawer-nav">
            <a href="/settings.html" class="drawer-link ${currentPage === 'settings.html' ? 'active' : ''}">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                Settings
            </a>
        </div>
    </div>
    `;

    // Global toggle function
    window.toggleSidebar = () => {
        const drawer = document.getElementById('side-drawer');
        const overlay = document.getElementById('sidebar-overlay');
        if (drawer && overlay) {
            drawer.classList.toggle('active');
            overlay.classList.toggle('active');
            document.body.style.overflow = drawer.classList.contains('active') ? 'hidden' : '';
        }
    };

    // Prepend navbar to body
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
    // Append sidebar elements to body (at the very end to be physically on top)
    document.body.insertAdjacentHTML('beforeend', sidebarHTML);

    // Force Light Theme consistency
    document.documentElement.setAttribute('data-theme', 'light');

    // INITIALIZE CUSTOM DROPDOWNS
    setupCustomDropdowns();

    // Use a more efficient approach for dynamic elements - only run if a select is added
    const observer = new MutationObserver((mutations) => {
        let shouldRefresh = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1 && (node.nodeName === 'SELECT' || node.querySelector?.('select'))) {
                    shouldRefresh = true;
                    break;
                }
            }
            if (shouldRefresh) break;
        }
        if (shouldRefresh) setupCustomDropdowns();
    });
    observer.observe(document.body, { childList: true, subtree: true });
});

/**
 * Replaces native <select> elements with custom styled dropdowns
 * Uses "Portal" strategy (appends to body) to avoid z-index clipping
 */
function setupCustomDropdowns() {
    const accents = { orange: '#f97316' };

    document.querySelectorAll('select:not(.custom-dropdown-processed)').forEach(select => {
        select.classList.add('custom-dropdown-processed');

        // Create custom wrapper (Anchor)
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.verticalAlign = 'middle';
        wrapper.style.width = select.style.width || 'fit-content';
        wrapper.style.minWidth = '120px';
        if (select.style.maxWidth) wrapper.style.maxWidth = select.style.maxWidth;

        // Hide native select
        select.style.display = 'none';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);

        // Trigger Element
        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.style.cssText = `
            background: white; border: 1px solid #cbd5e1; border-radius: 8px; 
            padding: 0.5rem 2rem 0.5rem 1rem; cursor: pointer; color: #334155; 
            position: relative; user-select: none; font-size: 0.9rem; width: 100%;
            display: flex; align-items: center; white-space: nowrap; overflow: hidden;
            box-sizing: border-box;
        `;

        const arrow = document.createElement('div');
        arrow.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
        arrow.style.cssText = `position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none;`;
        trigger.appendChild(arrow);

        const textSpan = document.createElement('span');
        textSpan.textContent = select.options[select.selectedIndex]?.text || select.getAttribute('placeholder') || 'Select...';
        trigger.appendChild(textSpan);
        wrapper.appendChild(trigger);

        // Sync trigger text when native select changes
        const nativeObserver = new MutationObserver(() => {
            textSpan.textContent = select.options[select.selectedIndex]?.text || '';
        });
        nativeObserver.observe(select, { childList: true, subtree: true, attributes: true });

        // OPEN DROPDOWN FUNCTION
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();

            // Close any existing open dropdowns
            document.querySelectorAll('.custom-options-portal').forEach(el => el.remove());

            // Calculate positioning
            const rect = wrapper.getBoundingClientRect();

            // Create Portal Menu
            const optionsList = document.createElement('div');
            optionsList.className = 'custom-options-portal';
            optionsList.style.cssText = `
                position: absolute; 
                top: ${rect.bottom + window.scrollY + 4}px; 
                left: ${rect.left + window.scrollX}px; 
                width: ${rect.width}px;
                min-width: 120px;
                background: white; border: 1px solid #e2e8f0; border-radius: 8px; 
                z-index: 2147483647; /* MAX Z-INDEX */
                box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.15);
                max-height: 250px; overflow-y: auto;
                animation: fadeIn 0.1s ease-out;
            `;

            // Populate Options
            Array.from(select.options).forEach(opt => {
                const optDiv = document.createElement('div');
                optDiv.textContent = opt.text;
                optDiv.style.cssText = `padding: 8px 12px; cursor: pointer; color: #334155; transition: all 0.1s; font-size: 0.9rem;`;

                // Highlight Selected
                if (select.value === opt.value) {
                    optDiv.style.backgroundColor = accents.orange;
                    optDiv.style.color = 'white';
                }

                // Interaction
                optDiv.addEventListener('mouseenter', () => {
                    if (select.value !== opt.value) {
                        optDiv.style.backgroundColor = accents.orange;
                        optDiv.style.color = 'white';
                    }
                });
                optDiv.addEventListener('mouseleave', () => {
                    if (select.value !== opt.value) {
                        optDiv.style.backgroundColor = 'white';
                        optDiv.style.color = '#334155';
                    }
                });

                optDiv.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    select.value = opt.value;
                    textSpan.textContent = opt.text;
                    optionsList.remove(); // Close

                    // Trigger native event
                    const event = new Event('change', { bubbles: true });
                    select.dispatchEvent(event);
                    const inputEvent = new Event('input', { bubbles: true });
                    select.dispatchEvent(inputEvent);
                });

                optionsList.appendChild(optDiv);
            });

            // Prevent scrollbar interaction from closing the menu
            optionsList.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            document.body.appendChild(optionsList);

            // Scroll handling to close if user scrolls away (BUT ignored if scrolling inside the dropdown)
            const scrollHandler = (e) => {
                if (optionsList.contains(e.target) || e.target === optionsList) {
                    return; // Ignore scroll events inside the dropdown
                }
                optionsList.remove();
                window.removeEventListener('scroll', scrollHandler, { capture: true });
            };
            // Use capture:true to detect outside scrolls, but filter inside scrollHandler
            window.addEventListener('scroll', scrollHandler, { capture: true });

            // Close on click outside
            const clickHandler = () => {
                optionsList.remove();
                window.removeEventListener('scroll', scrollHandler, { capture: true }); // Clean up scroll listener too
            };
            setTimeout(() => document.addEventListener('click', clickHandler, { once: true }), 0);
        });
    });
}
