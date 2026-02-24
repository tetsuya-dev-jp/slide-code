/**
 * Grid Resizer
 * Handles drag-to-resize for CSS Grid-based splitters
 * Supports both vertical (column) and horizontal (row) splitters
 */

export class Resizer {
    constructor(contentEl) {
        this.contentEl = contentEl;
        this.splitters = [];
        this.cleanupFns = [];
    }

    /**
     * Remove all existing splitters from DOM and clean up event listeners
     */
    reset() {
        this.cleanupFns.forEach(fn => fn());
        this.cleanupFns = [];
        this.splitters.forEach(s => s.el.remove());
        this.splitters = [];
    }

    /**
     * Build splitters for a layout definition
     * @param {Object} layout - Layout definition from layout.js
     * @param {string[]} paneOrder - Current pane order
     * @param {Object} paneVisibility - { code: bool, shell: bool, markdown: bool }
     */
    buildSplitters(layout, paneOrder, paneVisibility) {
        this.reset();

        layout.splitters.forEach(splitterDef => {
            const el = document.createElement('div');
            el.className = `grid-splitter grid-splitter-${splitterDef.type === 'vertical' ? 'v' : 'h'}`;
            el.style.gridArea = splitterDef.id;
            this.contentEl.appendChild(el);

            if (splitterDef.type === 'vertical') {
                this.addVerticalGrid(el, splitterDef);
            } else {
                this.addHorizontalGrid(el, splitterDef);
            }

            this.splitters.push({ el, def: splitterDef });
        });
    }

    /**
     * Add vertical (column) resize behavior on CSS Grid
     */
    addVerticalGrid(splitterEl, splitterDef) {
        const onMouseDown = (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const computedStyle = getComputedStyle(this.contentEl);
            const columns = computedStyle.gridTemplateColumns.split(' ');
            const startColumns = columns.map(c => parseFloat(c));

            document.body.classList.add('resizing-h');
            splitterEl.classList.add('dragging');

            const splitterId = splitterDef.id;
            // Find the splitter's column index in the grid template
            const areas = computedStyle.gridTemplateAreas;
            const firstRow = areas.split('"')[1]; // Get first row areas
            const areaList = firstRow.trim().split(/\s+/);
            const splitterColIdx = areaList.indexOf(splitterId);

            if (splitterColIdx === -1) {
                return;
            }

            // Find adjacent columns (non-splitter)
            let leftColIdx = splitterColIdx - 1;
            let rightColIdx = splitterColIdx + 1;

            // In multi-row layouts, the splitter might span. Find actual usable neighbors.
            while (leftColIdx >= 0 && areaList[leftColIdx].startsWith('sp')) leftColIdx--;
            while (rightColIdx < areaList.length && areaList[rightColIdx].startsWith('sp')) rightColIdx++;

            if (leftColIdx < 0 || rightColIdx >= startColumns.length) return;

            const startLeft = startColumns[leftColIdx];
            const startRight = startColumns[rightColIdx];
            const minSize = 100;

            const onMouseMove = (e) => {
                const dx = e.clientX - startX;
                const newLeft = startLeft + dx;
                const newRight = startRight - dx;

                if (newLeft >= minSize && newRight >= minSize) {
                    const newColumns = [...startColumns];
                    newColumns[leftColIdx] = newLeft;
                    newColumns[rightColIdx] = newRight;
                    this.contentEl.style.gridTemplateColumns = newColumns.map(c => c + 'px').join(' ');
                }
            };

            const onMouseUp = () => {
                document.body.classList.remove('resizing-h');
                splitterEl.classList.remove('dragging');
                // Convert pixel sizes to fr units for flexibility
                this.normalizeGridTemplate('columns');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        splitterEl.addEventListener('mousedown', onMouseDown);
        this.cleanupFns.push(() => splitterEl.removeEventListener('mousedown', onMouseDown));
    }

    /**
     * Add horizontal (row) resize behavior on CSS Grid
     */
    addHorizontalGrid(splitterEl, splitterDef) {
        const onMouseDown = (e) => {
            e.preventDefault();
            const startY = e.clientY;
            const computedStyle = getComputedStyle(this.contentEl);
            const rows = computedStyle.gridTemplateRows.split(' ');
            const startRows = rows.map(r => parseFloat(r));

            document.body.classList.add('resizing-v');
            splitterEl.classList.add('dragging');

            const splitterId = splitterDef.id;
            // Find the splitter's row index
            const areas = computedStyle.gridTemplateAreas;
            const rowAreas = areas.match(/"([^"]+)"/g).map(r => r.replace(/"/g, '').trim().split(/\s+/));

            let splitterRowIdx = -1;
            for (let r = 0; r < rowAreas.length; r++) {
                if (rowAreas[r].includes(splitterId)) {
                    splitterRowIdx = r;
                    break;
                }
            }

            if (splitterRowIdx === -1) return;

            let topRowIdx = splitterRowIdx - 1;
            let bottomRowIdx = splitterRowIdx + 1;

            if (topRowIdx < 0 || bottomRowIdx >= startRows.length) return;

            const startTop = startRows[topRowIdx];
            const startBottom = startRows[bottomRowIdx];
            const minSize = 80;

            const onMouseMove = (e) => {
                const dy = e.clientY - startY;
                const newTop = startTop + dy;
                const newBottom = startBottom - dy;

                if (newTop >= minSize && newBottom >= minSize) {
                    const newRows = [...startRows];
                    newRows[topRowIdx] = newTop;
                    newRows[bottomRowIdx] = newBottom;
                    this.contentEl.style.gridTemplateRows = newRows.map(r => r + 'px').join(' ');
                }
            };

            const onMouseUp = () => {
                document.body.classList.remove('resizing-v');
                splitterEl.classList.remove('dragging');
                this.normalizeGridTemplate('rows');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        splitterEl.addEventListener('mousedown', onMouseDown);
        this.cleanupFns.push(() => splitterEl.removeEventListener('mousedown', onMouseDown));
    }

    /**
     * Convert pixel-based grid tracks to fr units (keeping splitter tracks at fixed px)
     */
    normalizeGridTemplate(dimension) {
        const computedStyle = getComputedStyle(this.contentEl);
        const tracks = dimension === 'columns'
            ? computedStyle.gridTemplateColumns.split(' ')
            : computedStyle.gridTemplateRows.split(' ');

        const sizes = tracks.map(t => parseFloat(t));
        const splitterSize = 5; // fixed splitter width

        // Find non-splitter tracks (fr candidates) and splitter tracks
        const normalized = sizes.map((size, idx) => {
            // Splitter tracks are the small ones (~5px)
            if (size <= splitterSize + 1) {
                return `${splitterSize}px`;
            }
            return `${size}fr`;
        });

        if (dimension === 'columns') {
            this.contentEl.style.gridTemplateColumns = normalized.join(' ');
        } else {
            this.contentEl.style.gridTemplateRows = normalized.join(' ');
        }
    }
}
