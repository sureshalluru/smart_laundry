/**
 * Print HTML content using a hidden iframe.
 * Works on mobile/tablet browsers (iOS Safari, Android Chrome) where window.open() is unreliable.
 * The browser's print dialog will show any Bluetooth/WiFi printers paired at the OS level.
 *
 * @param {string} htmlContent - Full HTML document string to print
 * @param {Object} options - Optional settings
 * @param {number} options.delay - Delay in ms before triggering print (default: 500ms, allows content to render)
 * @returns {Promise<void>}
 */
export const printViaIframe = (htmlContent, options = {}) => {
    const { delay = 500 } = options;

    return new Promise((resolve, reject) => {
        try {
            // Remove any existing print iframe
            const existingFrame = document.getElementById('print-iframe');
            if (existingFrame) {
                existingFrame.remove();
            }

            // Create hidden iframe
            const iframe = document.createElement('iframe');
            iframe.id = 'print-iframe';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = 'none';
            iframe.style.opacity = '0';

            document.body.appendChild(iframe);

            const iframeDoc = iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(htmlContent);
            iframeDoc.close();

            // Wait for content to render (images, QR codes, fonts), then print
            setTimeout(() => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (e) {
                    console.error('Print failed:', e);
                    reject(e);
                }

                // Clean up iframe after a short delay (let print dialog close)
                setTimeout(() => {
                    iframe.remove();
                    resolve();
                }, 1000);
            }, delay);
        } catch (error) {
            reject(error);
        }
    });
};
