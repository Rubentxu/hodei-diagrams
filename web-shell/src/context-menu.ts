export interface ContextMenuItem {
    label: string;
    action: () => void;
    disabled?: boolean;
    separator?: boolean; // renders a divider before this item
}

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
    // Remove any existing context menu
    document.querySelectorAll('.context-menu').forEach(el => el.remove());
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('data-testid', 'context-menu');
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    for (const item of items) {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'context-menu-separator';
            menu.appendChild(sep);
        }
        const btn = document.createElement('button');
        btn.className = 'context-menu-item';
        btn.textContent = item.label;
        btn.disabled = item.disabled ?? false;
        btn.addEventListener('click', () => {
            item.action();
            menu.remove();
        });
        menu.appendChild(btn);
    }
    
    document.body.appendChild(menu);
    
    // Close on click elsewhere or Escape
    const closeHandler = () => {
        menu.remove();
        document.removeEventListener('click', closeHandler);
        document.removeEventListener('contextmenu', closeHandler);
    };
    setTimeout(() => {
        document.addEventListener('click', closeHandler);
        document.addEventListener('contextmenu', closeHandler);
    }, 0);
}
