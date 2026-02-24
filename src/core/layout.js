/**
 * Layout Manager
 * Manages flexible pane layouts using CSS Grid
 * Supports 5 layout presets and drag-and-drop pane swapping
 */

// ============================
// Layout Presets
// ============================

export const LAYOUTS = {
    'three-col': {
        name: '3列',
        icon: '⫼',
        // [A] [B] [C]  — 3 equal columns
        gridTemplate: {
            columns: '1fr 5px 1fr 5px 1fr',
            rows: '1fr',
            areas: '"slot0 sp0 slot1 sp1 slot2"',
        },
        slots: 3,
        splitters: [
            { id: 'sp0', type: 'vertical', between: [0, 1] },
            { id: 'sp1', type: 'vertical', between: [1, 2] },
        ],
    },

    'left-stack': {
        name: '左2段+右',
        icon: '⫿',
        // [A] stacked on top of [B], [C] on right
        gridTemplate: {
            columns: '1fr 5px 1fr',
            rows: '1fr 5px 1fr',
            areas: '"slot0 sp1 slot2" "sp0 sp1 slot2" "slot1 sp1 slot2"',
        },
        slots: 3,
        splitters: [
            { id: 'sp0', type: 'horizontal', between: [0, 1] },
            { id: 'sp1', type: 'vertical', between: ['left', 2] },
        ],
    },

    'right-stack': {
        name: '左+右2段',
        icon: '⫾',
        // [A] on left, [B] stacked on [C] on right
        gridTemplate: {
            columns: '1fr 5px 1fr',
            rows: '1fr 5px 1fr',
            areas: '"slot0 sp1 slot1" "slot0 sp1 sp0" "slot0 sp1 slot2"',
        },
        slots: 3,
        splitters: [
            { id: 'sp0', type: 'horizontal', between: [1, 2] },
            { id: 'sp1', type: 'vertical', between: [0, 'right'] },
        ],
    },

    'top-bottom': {
        name: '上+下2列',
        icon: '⬓',
        // [A] spans top, [B] [C] on bottom row
        gridTemplate: {
            columns: '1fr 5px 1fr',
            rows: '1fr 5px 1fr',
            areas: '"slot0 slot0 slot0" "sp0 sp0 sp0" "slot1 sp1 slot2"',
        },
        slots: 3,
        splitters: [
            { id: 'sp0', type: 'horizontal', between: [0, 'bottom'] },
            { id: 'sp1', type: 'vertical', between: [1, 2] },
        ],
    },

    'bottom-top': {
        name: '上2列+下',
        icon: '⬒',
        // [A] [B] on top row, [C] spans bottom
        gridTemplate: {
            columns: '1fr 5px 1fr',
            rows: '1fr 5px 1fr',
            areas: '"slot0 sp1 slot1" "sp0 sp0 sp0" "slot2 slot2 slot2"',
        },
        slots: 3,
        splitters: [
            { id: 'sp0', type: 'horizontal', between: ['top', 2] },
            { id: 'sp1', type: 'vertical', between: [0, 1] },
        ],
    },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);

// Default pane assignment: which pane goes in which slot
const DEFAULT_PANE_ORDER = ['code', 'shell', 'markdown'];

export class LayoutManager {
    constructor(contentEl) {
        this.contentEl = contentEl;
        this.currentLayoutId = 'three-col';
        this.paneOrder = [...DEFAULT_PANE_ORDER]; // ['code', 'shell', 'markdown']
        this.listeners = [];

        this.restore();
    }

    /**
     * Get current layout definition
     */
    get layout() {
        return LAYOUTS[this.currentLayoutId];
    }

    /**
     * Switch to a different layout preset
     */
    setLayout(layoutId) {
        if (!LAYOUTS[layoutId]) return;
        this.currentLayoutId = layoutId;
        this.save();
        this.apply();
        this.emit();
    }

    /**
     * Swap two panes by their slot indices
     */
    swapPanes(slotA, slotB) {
        if (slotA === slotB) return;
        const temp = this.paneOrder[slotA];
        this.paneOrder[slotA] = this.paneOrder[slotB];
        this.paneOrder[slotB] = temp;
        this.save();
        this.apply();
        this.emit();
    }

    /**
     * Swap two panes by their pane names
     */
    swapPanesByName(paneA, paneB) {
        const idxA = this.paneOrder.indexOf(paneA);
        const idxB = this.paneOrder.indexOf(paneB);
        if (idxA === -1 || idxB === -1) return;
        this.swapPanes(idxA, idxB);
    }

    /**
     * Get which pane is in which slot
     * @returns {{ code: number, shell: number, markdown: number }}
     */
    getPaneSlots() {
        const result = {};
        this.paneOrder.forEach((pane, i) => {
            result[pane] = i;
        });
        return result;
    }

    /**
     * Apply the current layout to the DOM
     */
    apply() {
        const layout = this.layout;
        const { gridTemplate } = layout;

        // Apply CSS Grid template to content element
        this.contentEl.style.display = 'grid';
        this.contentEl.style.gridTemplateColumns = gridTemplate.columns;
        this.contentEl.style.gridTemplateRows = gridTemplate.rows;
        this.contentEl.style.gridTemplateAreas = gridTemplate.areas;

        // Assign grid-area to each pane based on paneOrder
        this.paneOrder.forEach((paneName, slotIndex) => {
            const paneEl = this.getPaneElement(paneName);
            if (paneEl) {
                paneEl.style.gridArea = `slot${slotIndex}`;
            }
        });
    }

    /**
     * Get pane DOM element by name
     */
    getPaneElement(paneName) {
        const idMap = {
            code: 'paneCode',
            shell: 'paneShell',
            markdown: 'paneMarkdown',
        };
        return document.getElementById(idMap[paneName]);
    }

    /**
     * Register a change listener
     */
    onChange(cb) {
        this.listeners.push(cb);
    }

    emit() {
        this.listeners.forEach(cb => cb({
            layoutId: this.currentLayoutId,
            layout: this.layout,
            paneOrder: [...this.paneOrder],
        }));
    }

    /**
     * Save to localStorage
     */
    save() {
        localStorage.setItem('codestage-layout', JSON.stringify({
            layoutId: this.currentLayoutId,
            paneOrder: this.paneOrder,
        }));
    }

    /**
     * Restore from localStorage
     */
    restore() {
        try {
            const data = JSON.parse(localStorage.getItem('codestage-layout'));
            if (data && LAYOUTS[data.layoutId]) {
                this.currentLayoutId = data.layoutId;
            }
            if (data && Array.isArray(data.paneOrder) && data.paneOrder.length === 3) {
                this.paneOrder = data.paneOrder;
            }
        } catch {
            // use defaults
        }
    }
}
