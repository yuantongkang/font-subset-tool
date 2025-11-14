#!/usr/bin/env node

/**
 * Font Subset Processing Script for GitHub Actions
 * This script processes font files and generates subsets based on specified strategies
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const opentype = require('opentype.js');
const archiver = require('archiver');

// Parse command line arguments
const args = process.argv.slice(2);
const config = {};

for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key && value) {
        config[key] = value;
    }
}

// Required parameters
const FONT_URL = config.font_url;
const SPLIT_STRATEGY = config.split_strategy || 'single';
const SUBSET_STRATEGY = config.subset_strategy || 'all';
const OUTPUT_FORMAT = config.output_format || 'woff2';
const SPLIT_COUNT = config.split_count ? parseInt(config.split_count) : 1000;
const CUSTOM_RANGE = config.custom_range || '';
const FONT_WEIGHT = config.font_weight || '400';
const FONT_STYLE = config.font_style || 'normal';
const OUTPUT_DIR = config.output_dir || 'output';

// Validate required parameters
if (!FONT_URL) {
    console.error('Error: font_url is required');
    process.exit(1);
}

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(path.join(OUTPUT_DIR, 'fonts'))) {
    fs.mkdirSync(path.join(OUTPUT_DIR, 'fonts'), { recursive: true });
}
if (!fs.existsSync(path.join(OUTPUT_DIR, 'styles'))) {
    fs.mkdirSync(path.join(OUTPUT_DIR, 'styles'), { recursive: true });
}

/**
 * Download font file from URL
 */
function downloadFont(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const outputPath = path.join(OUTPUT_DIR, 'input-font' + path.extname(parsedUrl.pathname));

        console.log(`Downloading font from: ${url}`);
        const file = fs.createWriteStream(outputPath);

        client.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Handle redirect
                return downloadFont(response.headers.location).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download font: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`Font downloaded to: ${outputPath}`);
                resolve(outputPath);
            });
        }).on('error', (err) => {
            fs.unlinkSync(outputPath);
            reject(err);
        });
    });
}

/**
 * Get codepoints based on subset strategy
 */
function getCodepointsByStrategy(font, strategy, availableCodepoints) {
    switch (strategy) {
        case 'all':
            return [...availableCodepoints];

        case 'common':
            return availableCodepoints.filter(codepoint => {
                return (codepoint >= 0x0020 && codepoint <= 0x007E) || // Basic Latin
                       (codepoint >= 0x00A0 && codepoint <= 0x00FF) || // Latin Supplement
                       (codepoint >= 0x2000 && codepoint <= 0x206F);   // General Punctuation
            });

        case 'chinese':
            return availableCodepoints.filter(codepoint => {
                return (codepoint >= 0x4E00 && codepoint <= 0x9FFF) || // CJK Unified Ideographs
                       (codepoint >= 0x3400 && codepoint <= 0x4DBF) || // CJK Extension A
                       (codepoint >= 0x20000 && codepoint <= 0x2A6DF); // CJK Extension B
            });

        case 'custom':
            return parseCustomRange(CUSTOM_RANGE, availableCodepoints);

        default:
            return [...availableCodepoints];
    }
}

/**
 * Parse custom Unicode range
 */
function parseCustomRange(rangeString, availableCodepoints) {
    if (!rangeString.trim()) return [];

    const ranges = rangeString.split(',').map(r => r.trim());
    const result = [];

    for (const range of ranges) {
        if (range.includes('-')) {
            const [startStr, endStr] = range.split('-');
            const start = parseInt(startStr.replace('U+', ''), 16);
            const end = parseInt(endStr.replace('U+', ''), 16);

            for (let i = start; i <= end; i++) {
                if (availableCodepoints.includes(i)) {
                    result.push(i);
                }
            }
        } else {
            const codepoint = parseInt(range.replace('U+', ''), 16);
            if (availableCodepoints.includes(codepoint)) {
                result.push(codepoint);
            }
        }
    }

    return [...new Set(result)];
}

/**
 * Split codepoints based on strategy
 */
function splitCodepoints(codepoints, strategy) {
    switch (strategy) {
        case 'single':
            return [codepoints];

        case 'byRange':
            return splitByUnicodeRange(codepoints);

        case 'byCount':
            return splitByCharacterCount(codepoints, SPLIT_COUNT);

        default:
            return [codepoints];
    }
}

/**
 * Split by Unicode range
 */
function splitByUnicodeRange(codepoints) {
    if (codepoints.length === 0) return [];

    const sortedCodepoints = [...codepoints].sort((a, b) => a - b);
    const groups = [];
    let currentGroup = [sortedCodepoints[0]];
    const blockSize = 1024;

    for (let i = 1; i < sortedCodepoints.length; i++) {
        const currentCodepoint = sortedCodepoints[i];
        const lastCodepoint = currentGroup[currentGroup.length - 1];

        const currentBlock = Math.floor(currentCodepoint / blockSize);
        const lastBlock = Math.floor(lastCodepoint / blockSize);

        if (currentCodepoint === lastCodepoint + 1 || currentBlock === lastBlock) {
            currentGroup.push(currentCodepoint);
        } else {
            groups.push(currentGroup);
            currentGroup = [currentCodepoint];
        }
    }

    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    return groups;
}

/**
 * Split by character count
 */
function splitByCharacterCount(codepoints, maxCount) {
    const groups = [];
    for (let i = 0; i < codepoints.length; i += maxCount) {
        groups.push(codepoints.slice(i, i + maxCount));
    }
    return groups;
}

/**
 * Create subset font
 */
function createSubsetFont(font, codepoints, outputFormat) {
    const codepointSet = new Set(codepoints);
    const subsetGlyphs = [];
    const glyphIndexMap = new Map();

    // Include .notdef (index 0)
    const notdefGlyph = font.glyphs.get(0);
    subsetGlyphs.push(notdefGlyph);
    glyphIndexMap.set(0, 0);

    // Collect matching glyphs
    for (let i = 1; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        if (glyph.unicode !== undefined && codepointSet.has(glyph.unicode)) {
            subsetGlyphs.push(glyph);
            glyphIndexMap.set(i, subsetGlyphs.length - 1);
        }
    }

    // Create new font
    const fontFamily = font.names.fontFamily ? font.names.fontFamily.en : 'SubsetFont';
    const styleName = font.names.fontSubfamily ? font.names.fontSubfamily.en : 'Regular';

    const subsetFont = new opentype.Font({
        familyName: fontFamily,
        styleName: styleName,
        unitsPerEm: font.unitsPerEm || 1000,
        ascender: font.ascender || 800,
        descender: font.descender || -200,
        glyphs: subsetGlyphs
    });

    // Export font
    let fontData;
    if (outputFormat === 'ttf' || outputFormat === 'otf') {
        fontData = subsetFont.toArrayBuffer();
    } else {
        // For WOFF/WOFF2, we'll export as TTF for now
        // Full WOFF2 support would require additional libraries
        console.warn(`Warning: ${outputFormat.toUpperCase()} format not fully supported, exporting as TTF`);
        fontData = subsetFont.toArrayBuffer();
    }

    return fontData;
}

/**
 * Generate Unicode range string
 */
function generateUnicodeRange(codepoints) {
    if (codepoints.length === 0) return 'U+0000-FFFF';

    const sortedCodepoints = [...codepoints].sort((a, b) => a - b);
    const ranges = [];
    let start = sortedCodepoints[0];
    let end = start;

    for (let i = 1; i < sortedCodepoints.length; i++) {
        if (sortedCodepoints[i] === end + 1) {
            end = sortedCodepoints[i];
        } else {
            if (start === end) {
                ranges.push(`U+${start.toString(16).toUpperCase().padStart(4, '0')}`);
            } else {
                ranges.push(`U+${start.toString(16).toUpperCase().padStart(4, '0')}-${end.toString(16).toUpperCase().padStart(4, '0')}`);
            }
            start = sortedCodepoints[i];
            end = start;
        }
    }

    if (start === end) {
        ranges.push(`U+${start.toString(16).toUpperCase().padStart(4, '0')}`);
    } else {
        ranges.push(`U+${start.toString(16).toUpperCase().padStart(4, '0')}-${end.toString(16).toUpperCase().padStart(4, '0')}`);
    }

    return ranges.join(', ');
}

/**
 * Generate CSS code
 */
function generateCSS(fontFiles, format, fontWeight, fontStyle, fontFamily, fontFileName) {
    let css = '';

    fontFiles.forEach((file, index) => {
        const fontUrl = `./fonts/${fontFileName}-subset-${index + 1}.${format}`;
        const unicodeRange = generateUnicodeRange(file.codepoints);

        css += `@font-face {
    font-family: '${fontFamily}';
    src: url('${fontUrl}') format('${format}');
    font-weight: ${fontWeight};
    font-style: ${fontStyle};
    unicode-range: ${unicodeRange};
    font-display: swap;
}

`;
    });

    return css.trim();
}

/**
 * Main processing function
 */
async function main() {
    try {
        // Download font
        const fontPath = await downloadFont(FONT_URL);
        const fontBuffer = fs.readFileSync(fontPath);
        
        // Parse font
        console.log('Parsing font...');
        const font = opentype.parse(fontBuffer.buffer);

        // Get available codepoints
        const availableCodepoints = [];
        for (let i = 0; i < font.glyphs.length; i++) {
            const glyph = font.glyphs.get(i);
            if (glyph.unicode !== undefined) {
                availableCodepoints.push(glyph.unicode);
            }
        }
        console.log(`Found ${availableCodepoints.length} characters in font`);

        // Get codepoints by strategy
        const codepoints = getCodepointsByStrategy(font, SUBSET_STRATEGY, availableCodepoints);
        console.log(`Selected ${codepoints.length} characters using strategy: ${SUBSET_STRATEGY}`);

        if (codepoints.length === 0) {
            throw new Error('No characters found for the selected strategy');
        }

        // Split codepoints
        const codepointGroups = splitCodepoints(codepoints, SPLIT_STRATEGY);
        console.log(`Split into ${codepointGroups.length} groups using strategy: ${SPLIT_STRATEGY}`);

        // Create subset fonts
        const fontFiles = [];
        const fontFamily = font.names.fontFamily ? font.names.fontFamily.en : 'SubsetFont';
        const fontFileName = path.basename(fontPath, path.extname(fontPath));

        for (let i = 0; i < codepointGroups.length; i++) {
            console.log(`Creating subset ${i + 1}/${codepointGroups.length}...`);
            const subsetBuffer = createSubsetFont(font, codepointGroups[i], OUTPUT_FORMAT);
            
            const outputFileName = `${fontFileName}-subset-${i + 1}.${OUTPUT_FORMAT}`;
            const outputPath = path.join(OUTPUT_DIR, 'fonts', outputFileName);
            fs.writeFileSync(outputPath, Buffer.from(subsetBuffer));
            
            fontFiles.push({
                buffer: subsetBuffer,
                codepoints: codepointGroups[i],
                index: i,
                fileName: outputFileName
            });
        }

        // Generate CSS
        const cssCode = generateCSS(fontFiles, OUTPUT_FORMAT, FONT_WEIGHT, FONT_STYLE, fontFamily, fontFileName);
        fs.writeFileSync(path.join(OUTPUT_DIR, 'styles', 'font.css'), cssCode);

        // Generate README
        const readme = `Font Subset Package

Generated by Font Subset Tool

Configuration:
- Font URL: ${FONT_URL}
- Subset Strategy: ${SUBSET_STRATEGY}
- Split Strategy: ${SPLIT_STRATEGY}
- Output Format: ${OUTPUT_FORMAT}
- Font Weight: ${FONT_WEIGHT}
- Font Style: ${FONT_STYLE}

Files:
- fonts/: ${fontFiles.length} subset font files
- styles/font.css: CSS style definitions

File Details:
${fontFiles.map((file, index) => `- ${file.fileName}: ${file.codepoints.length} characters (${generateUnicodeRange(file.codepoints)})`).join('\n')}

Total Characters: ${codepoints.length}

Usage:
1. Copy the fonts and styles folders to your project
2. Include styles/font.css in your HTML
3. Use font-family: '${fontFamily}'
`;

        fs.writeFileSync(path.join(OUTPUT_DIR, 'README.txt'), readme);

        // Create ZIP archive
        console.log('Creating ZIP archive...');
        const zipPath = path.join(OUTPUT_DIR, `${fontFileName}-subset-package.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve, reject) => {
            output.on('close', () => {
                console.log(`ZIP archive created: ${zipPath} (${archive.pointer()} bytes)`);
                resolve();
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);

            // Add files
            fontFiles.forEach(file => {
                archive.file(path.join(OUTPUT_DIR, 'fonts', file.fileName), { name: `fonts/${file.fileName}` });
            });
            archive.file(path.join(OUTPUT_DIR, 'styles', 'font.css'), { name: 'styles/font.css' });
            archive.file(path.join(OUTPUT_DIR, 'README.txt'), { name: 'README.txt' });

            archive.finalize();
        });

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run main function
main();

