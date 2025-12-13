/**
 * Stylelint Configuration
 * Enforces CSS/LESS code style consistency for frontend files
 */

module.exports = {
    extends: ['stylelint-config-standard', 'stylelint-config-standard-less'],
    plugins: ['stylelint-less', 'stylelint-order'],
    rules: {
        // ==================== Property Ordering ====================
        // Enforce alphabetical ordering of CSS properties (similar to ESLint sort-keys-fix)
        'order/properties-alphabetical-order': true,
        
        // Color format - allow short hex
        'color-hex-length': 'short',
        
        // Allow rgba() syntax
        'alpha-value-notation': 'number',
        'color-function-notation': 'legacy',
        
        // Font family quotes - allow common conventions
        'font-family-name-quotes': 'always-where-recommended',
        
        // Allow vendor prefixes
        'property-no-vendor-prefix': null,
        'value-no-vendor-prefix': null,
        
        // Selector formatting
        'selector-class-pattern': null,
        'selector-id-pattern': null,
        'no-descending-specificity': null,
        
        // Shorthand properties
        'shorthand-property-no-redundant-values': null,
        
        // Allow empty sources
        'no-empty-source': null,
    },
};
