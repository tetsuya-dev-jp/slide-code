/**
 * Slide Data Manager
 * Manages slide data, navigation, and events
 */

export class SlideManager {
    constructor() {
        this.slides = [];
        this.currentIndex = 0;
        this.listeners = new Set();
    }

    /**
     * Load slides data
     * @param {Array} slides - Array of slide objects
     */
    load(slides) {
        this.slides = slides;
        this.currentIndex = 0;
        this.emit();
    }

    /**
     * Get current slide
     * @returns {Object|null}
     */
    current() {
        return this.slides[this.currentIndex] || null;
    }

    /**
     * Get total slide count
     */
    get total() {
        return this.slides.length;
    }

    /**
     * Get current 1-based index
     */
    get position() {
        return this.currentIndex + 1;
    }

    /**
     * Navigate to next slide
     */
    next() {
        if (this.currentIndex < this.slides.length - 1) {
            this.currentIndex++;
            this.emit();
            return true;
        }
        return false;
    }

    /**
     * Navigate to previous slide
     */
    prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.emit();
            return true;
        }
        return false;
    }

    /**
     * Go to specific slide index (0-based)
     */
    goTo(index) {
        if (index >= 0 && index < this.slides.length) {
            this.currentIndex = index;
            this.emit();
            return true;
        }
        return false;
    }

    /**
     * Subscribe to slide changes
     * @param {Function} callback
     * @returns {Function} unsubscribe function
     */
    onChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Notify all listeners
     */
    emit() {
        const slide = this.current();
        const info = {
            slide,
            index: this.currentIndex,
            position: this.position,
            total: this.total,
            hasPrev: this.currentIndex > 0,
            hasNext: this.currentIndex < this.slides.length - 1,
        };
        this.listeners.forEach(cb => cb(info));
    }
}
