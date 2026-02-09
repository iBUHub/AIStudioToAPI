/**
 * Escape special HTML characters to prevent XSS attacks.
 * Use this when rendering user-provided content with dangerouslyUseHTMLString.
 *
 * Author: Ellinav, iBenzene, bbbugg
 *
 * @param {*} value - The value to escape (will be converted to string)
 * @returns {string} - HTML-safe string
 */
export const escapeHtml = value =>
    String(value).replace(
        /[&<>"']/g,
        char =>
            ({
                '"': '&quot;',
                '&': '&amp;',
                "'": '&#x27;',
                '<': '&lt;',
                '>': '&gt;',
            })[char]
    );

export default escapeHtml;
