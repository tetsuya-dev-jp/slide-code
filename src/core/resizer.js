/**
 * Pane Resizer
 * Handles drag-to-resize for vertical and horizontal splitters
 */

export class Resizer {
    constructor() {
        this.splitters = [];
    }

    /**
     * Initialize a vertical splitter
     * @param {HTMLElement} splitter - The splitter element
     * @param {HTMLElement} leftEl - Left pane element
     * @param {HTMLElement} rightEl - Right pane element
     * @param {Object} options - { minSize: number }
     */
    addVertical(splitter, leftEl, rightEl, options = {}) {
        const minSize = options.minSize || 150;
        let startX, startLeftWidth, startRightWidth;

        const onMouseDown = (e) => {
            e.preventDefault();
            startX = e.clientX;
            const parentWidth = splitter.parentElement.getBoundingClientRect().width;
            startLeftWidth = leftEl.getBoundingClientRect().width;
            startRightWidth = rightEl.getBoundingClientRect().width;

            document.body.classList.add('resizing-h');
            splitter.classList.add('dragging');

            const onMouseMove = (e) => {
                const dx = e.clientX - startX;
                const newLeftWidth = startLeftWidth + dx;
                const newRightWidth = startRightWidth - dx;

                if (newLeftWidth >= minSize && newRightWidth >= minSize) {
                    const totalFlex = startLeftWidth + startRightWidth;
                    leftEl.style.flex = `${newLeftWidth / totalFlex} 1 0px`;
                    rightEl.style.flex = `${newRightWidth / totalFlex} 1 0px`;
                }
            };

            const onMouseUp = () => {
                document.body.classList.remove('resizing-h');
                splitter.classList.remove('dragging');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        splitter.addEventListener('mousedown', onMouseDown);
        this.splitters.push({ splitter, leftEl, rightEl, type: 'vertical' });
    }

    /**
     * Initialize a horizontal splitter
     * @param {HTMLElement} splitter - The splitter element
     * @param {HTMLElement} topEl - Top pane element
     * @param {HTMLElement} bottomEl - Bottom pane element
     * @param {Object} options - { minSize: number }
     */
    addHorizontal(splitter, topEl, bottomEl, options = {}) {
        const minSize = options.minSize || 100;
        let startY, startTopHeight, startBottomHeight;

        const onMouseDown = (e) => {
            e.preventDefault();
            startY = e.clientY;
            startTopHeight = topEl.getBoundingClientRect().height;
            startBottomHeight = bottomEl.getBoundingClientRect().height;

            document.body.classList.add('resizing-v');
            splitter.classList.add('dragging');

            const onMouseMove = (e) => {
                const dy = e.clientY - startY;
                const newTopHeight = startTopHeight + dy;
                const newBottomHeight = startBottomHeight - dy;

                if (newTopHeight >= minSize && newBottomHeight >= minSize) {
                    const totalFlex = startTopHeight + startBottomHeight;
                    topEl.style.flex = `${newTopHeight / totalFlex} 1 0px`;
                    bottomEl.style.flex = `${newBottomHeight / totalFlex} 1 0px`;
                }
            };

            const onMouseUp = () => {
                document.body.classList.remove('resizing-v');
                splitter.classList.remove('dragging');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        splitter.addEventListener('mousedown', onMouseDown);
        this.splitters.push({ splitter, topEl, bottomEl, type: 'horizontal' });
    }
}
