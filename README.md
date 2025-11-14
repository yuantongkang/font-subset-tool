# Font Subset Tool

[中文文档](README.zh-CN.md) | English

A web-based font subsetting tool that uses opentype.js library and Web Workers to process font files and generate optimized subset fonts with corresponding CSS files.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Usage](#usage)
  - [1. Upload Font File](#1-upload-font-file)
  - [2. Preview Font](#2-preview-font)
  - [3. Configure Subset](#3-configure-subset)
  - [4. Generate Subset](#4-generate-subset)
  - [5. Download Results](#5-download-results)
- [Generated Files](#generated-files)
- [Browser Compatibility](#browser-compatibility)
- [GitHub Actions Usage](#github-actions-usage)
  - [How to Use](#how-to-use)
  - [Examples](#examples)
- [Project Structure](#project-structure)
- [Development](#development)
  - [Local Development](#local-development)
  - [Dependencies](#dependencies)
- [Notes](#notes)
- [Technical Implementation Details](#technical-implementation-details)
  - [Font Parsing](#font-parsing)
  - [Subsetting Algorithm](#subsetting-algorithm)
  - [Performance Optimization](#performance-optimization)
- [License](#license)
- [Contributing](#contributing)

## Features

- 🎯 **Font Subsetting**: Generate font files containing only the required characters based on input
- 🎨 **Live Preview**: Real-time font preview after uploading
- 📊 **Unicode Range**: Automatically generate optimized Unicode ranges
- 💾 **Multiple Formats**: Support TTF, OTF, WOFF, WOFF2 formats
- 📦 **Complete Package Download**: One-click download of ZIP package containing fonts, CSS, and documentation
- 📱 **Responsive Design**: Optimized for desktop and mobile devices

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Font Processing**: [opentype.js](https://opentype.js.org/) - Professional font parsing and manipulation library (pure JavaScript)
- **Performance**: Web Workers - Background processing to avoid blocking the main thread
- **File Processing**: [JSZip](https://stuk.github.io/jszip/) - Client-side ZIP file generation
- **File Saving**: [FileSaver.js](https://github.com/eligrey/FileSaver.js/) - Client-side file saving

## Usage

### 1. Upload Font File
- Drag and drop a font file to the upload area, or click the "Select File" button
- Supports TTF, OTF, WOFF, WOFF2 formats

### 2. Preview Font
- Enter text to preview in the preview text box
- Adjust font weight and style to see the effect

### 3. Configure Subset
- Select subset strategy:
  - **Include All Characters**: Use all characters in the font
  - **Common Characters**: Include only letters, numbers, and punctuation
  - **Chinese Characters**: Include only Chinese characters
  - **Custom Character Range**: Manually specify Unicode range
- Select split strategy:
  - **Single File**: All characters in one file
  - **Split by Unicode Range**: Intelligently split by Unicode blocks
  - **Split by Character Count**: Split into multiple files by specified character count
- Select output format (WOFF2 recommended)
- Configure font weight and style

### 4. Generate Subset
- Click the "Generate Subset Font" button
- Wait for processing to complete

### 5. Download Results
- Copy the generated CSS and Unicode Range
- Click "Download Complete Package" to get a ZIP package containing all files

## Generated Files

The downloaded ZIP package contains:

```
font-subset-package.zip
├── fonts/
│   ├── [font-name]-subset-1.[format]
│   ├── [font-name]-subset-2.[format]
│   └── ... (multiple split files)
├── styles/
│   └── font.css
└── README.txt
```

Each font file contains:
- Filename: `[font-name]-subset-[number].[format]`
- Character count: Number of characters in each file
- Unicode Range: Character range included in the file

## Browser Compatibility

Due to the use of **Import Maps** and **ES Modules**, the following browser versions are required:

- Chrome 89+ (supports Import Maps)
- Edge 89+
- Safari 16.4+
- Firefox 108+

For older browsers that don't support Import Maps, you can use the [es-module-shims](https://github.com/guybedford/es-module-shims) polyfill.

## GitHub Actions Usage

This project supports automatic font subsetting through GitHub Actions. After forking this repository, you can use the GitHub Actions feature.

### How to Use

1. **Fork this repository** to your GitHub account

2. **Run Actions**:
   - Go to the "Actions" tab of the repository
   - Select the "Font Subset Processing" workflow
   - Click the "Run workflow" button
   - Fill in the following parameters:
     - **font_url** (required): Download URL of the font file
     - **split_strategy** (optional): Split strategy
       - `single`: Single file (default)
       - `byRange`: Split by Unicode range
       - `byCount`: Split by character count
     - **subset_strategy** (optional): Subset strategy
       - `all`: Include all characters (default)
       - `common`: Common characters only (letters, numbers, punctuation)
       - `chinese`: Chinese characters only
       - `custom`: Custom Unicode range
     - **output_format** (optional): Output format
       - `ttf`, `otf`, `woff`, `woff2` (default: `woff2`)
     - **split_count** (optional): Character count per file when using `byCount` strategy (default: 1000)
     - **custom_range** (optional): Custom Unicode range, format like `U+4E00-9FFF,U+0020-007E`
     - **font_weight** (optional): Font weight, 100-900 (default: 400)
     - **font_style** (optional): Font style, `normal` or `italic` (default: `normal`)

3. **Download Results**:
   - After the workflow completes, download Artifacts from the Actions page
   - `font-subset-package`: Contains the complete ZIP package
   - `font-subset-output`: Contains individual font files and CSS files

### Examples

**Example 1: Process Chinese font, split by Unicode range**
```
font_url: https://example.com/font.ttf
split_strategy: byRange
subset_strategy: chinese
output_format: woff2
```

**Example 2: Process common characters, split by count**
```
font_url: https://example.com/font.ttf
split_strategy: byCount
subset_strategy: common
split_count: 500
output_format: woff2
```

**Example 3: Custom Unicode range**
```
font_url: https://example.com/font.ttf
split_strategy: single
subset_strategy: custom
custom_range: U+4E00-9FFF,U+0020-007E
output_format: woff2
```

## Project Structure

```
font-subset-tool/
├── index.html              # Main page
├── style.css               # Stylesheet
├── app.js                  # Main logic (web version)
├── font-worker.js          # Web Worker for font processing
├── i18n.js                 # Internationalization
├── package.json            # Node.js dependencies (for web version)
├── .github/
│   ├── workflows/
│   │   └── font-subset.yml # GitHub Actions workflow
│   └── scripts/
│       ├── process-font.py # Font processing script (Python)
│       └── requirements.txt # Python dependencies
├── README.md               # Project documentation (English)
└── README.zh-CN.md         # Project documentation (Chinese)
```

## Development

### Local Development

1. Clone or download the project files
2. Run with a local server (recommended):
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx serve .

   # Using PHP
   php -S localhost:8000
   ```
3. Open `http://localhost:8000` in your browser

### Dependencies

**Web version** uses **Import Maps** to manage dependencies, importing via ES modules:

- [opentype.js](https://opentype.js.org/) - Font parsing and manipulation
- [JSZip](https://stuk.github.io/jszip/) - ZIP file generation
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) - File saving

Dependencies are provided via `esm.sh` CDN in ES module format, no build tools required.

**GitHub Actions version** uses Python and pip to manage dependencies:

- [fonttools](https://github.com/fonttools/fonttools) - Professional font processing library (pyftsubset)
- Python's built-in libraries for ZIP generation

Install dependencies:
```bash
pip install -r .github/scripts/requirements.txt
```

> **Note**: The GitHub Actions workflow now uses Python instead of Node.js for better memory efficiency when processing large font files. The web version still uses opentype.js for browser compatibility.

## Notes

1. **Font License**: Please ensure you have the right to use and modify the uploaded font files
2. **File Size**: Large font files may require longer processing time
3. **Browser Limitations**: Some browsers may have file size limitations
4. **Font Format**: WOFF2 format typically provides the best compression

## Technical Implementation Details

### Font Parsing
Uses the opentype.js library to parse font files and obtain font information and character mappings.

### Subsetting Algorithm
1. Extract user-input characters
2. Get Unicode code points of characters
3. Create new font files containing only these characters
4. Generate optimized Unicode ranges

### Performance Optimization
- Use Web Workers to process large font files
- Implement progressive loading and progress display
- Optimize memory usage and garbage collection

## License

MIT License

## Contributing

Issues and Pull Requests are welcome to improve this tool.
