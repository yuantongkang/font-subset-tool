#!/usr/bin/env python3
"""
Font Subset Processing Script for GitHub Actions
This script processes font files and generates subsets using fonttools (pyftsubset)
Memory-efficient alternative to opentype.js
"""

import os
import sys
import argparse
import urllib.request
import urllib.parse
import zipfile
import shutil
from pathlib import Path
from fontTools.subset import Subsetter, Options, save_font
from fontTools.ttLib import TTFont
import tempfile

def download_font(url, output_dir):
    """Download font file from URL"""
    print(f"Downloading font from: {url}")
    parsed_url = urllib.parse.urlparse(url)
    ext = os.path.splitext(parsed_url.path)[1] or '.ttf'
    output_path = os.path.join(output_dir, f'input-font{ext}')
    
    # Handle redirects
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'Mozilla/5.0')
    
    with urllib.request.urlopen(req) as response:
        # Check for redirect
        if response.getcode() in (301, 302, 303, 307, 308):
            redirect_url = response.headers.get('Location')
            if redirect_url:
                return download_font(redirect_url, output_dir)
        
        with open(output_path, 'wb') as f:
            shutil.copyfileobj(response, f)
    
    print(f"Font downloaded to: {output_path}")
    return output_path

def get_codepoints_by_strategy(font, strategy, custom_range=''):
    """Get codepoints based on subset strategy"""
    # Get all available codepoints from font
    available_codepoints = set()
    for table in font.get('cmap', []).tables:
        if hasattr(table, 'cmap'):
            available_codepoints.update(table.cmap.keys())
    
    available_codepoints = sorted(list(available_codepoints))
    
    if strategy == 'all':
        return available_codepoints
    
    elif strategy == 'common':
        # Basic Latin, Latin Supplement, General Punctuation
        return [cp for cp in available_codepoints 
                if (0x0020 <= cp <= 0x007E) or 
                   (0x00A0 <= cp <= 0x00FF) or 
                   (0x2000 <= cp <= 0x206F)]
    
    elif strategy == 'chinese':
        # CJK Unified Ideographs and extensions
        return [cp for cp in available_codepoints 
                if (0x4E00 <= cp <= 0x9FFF) or 
                   (0x3400 <= cp <= 0x4DBF) or 
                   (0x20000 <= cp <= 0x2A6DF)]
    
    elif strategy == 'custom':
        return parse_custom_range(custom_range, available_codepoints)
    
    else:
        return available_codepoints

def parse_custom_range(range_string, available_codepoints):
    """Parse custom Unicode range"""
    if not range_string.strip():
        return []
    
    result = set()
    ranges = [r.strip() for r in range_string.split(',')]
    
    for range_str in ranges:
        if '-' in range_str:
            start_str, end_str = range_str.split('-')
            start = int(start_str.replace('U+', ''), 16)
            end = int(end_str.replace('U+', ''), 16)
            for cp in range(start, end + 1):
                if cp in available_codepoints:
                    result.add(cp)
        else:
            cp = int(range_str.replace('U+', ''), 16)
            if cp in available_codepoints:
                result.add(cp)
    
    return sorted(list(result))

def split_codepoints(codepoints, strategy, split_count=1000):
    """Split codepoints based on strategy"""
    if strategy == 'single':
        return [codepoints]
    
    elif strategy == 'byRange':
        return split_by_unicode_range(codepoints)
    
    elif strategy == 'byCount':
        return split_by_character_count(codepoints, split_count)
    
    else:
        return [codepoints]

def split_by_unicode_range(codepoints):
    """Split by Unicode range"""
    if not codepoints:
        return []
    
    groups = []
    current_group = [codepoints[0]]
    block_size = 1024
    
    for i in range(1, len(codepoints)):
        current_cp = codepoints[i]
        last_cp = current_group[-1]
        
        current_block = current_cp // block_size
        last_block = last_cp // block_size
        
        if current_cp == last_cp + 1 or current_block == last_block:
            current_group.append(current_cp)
        else:
            groups.append(current_group)
            current_group = [current_cp]
    
    if current_group:
        groups.append(current_group)
    
    return groups

def split_by_character_count(codepoints, max_count):
    """Split by character count"""
    groups = []
    for i in range(0, len(codepoints), max_count):
        groups.append(codepoints[i:i + max_count])
    return groups

def create_subset_font(font_path, codepoints, output_path, output_format):
    """Create subset font using fonttools"""
    # Read font
    font = TTFont(font_path)
    
    # Create subsetter
    options = Options()
    options.layout_features = ['*']  # Keep all layout features
    options.hinting = True  # Keep hinting
    options.desubroutinize = False
    options.name_IDs = ['*']  # Keep all name IDs
    options.name_legacy = True
    options.name_languages = ['*']
    
    subsetter = Subsetter(options=options)
    
    # Set unicodes to subset
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    
    # Save font
    if output_format == 'woff2':
        font.flavor = 'woff2'
    elif output_format == 'woff':
        font.flavor = 'woff'
    elif output_format == 'otf':
        # OTF is same as TTF for our purposes
        pass
    
    font.save(output_path)
    font.close()
    
    return output_path

def generate_unicode_range(codepoints):
    """Generate Unicode range string"""
    if not codepoints:
        return 'U+0000-FFFF'
    
    ranges = []
    start = codepoints[0]
    end = start
    
    for i in range(1, len(codepoints)):
        if codepoints[i] == end + 1:
            end = codepoints[i]
        else:
            if start == end:
                ranges.append(f"U+{start:04X}")
            else:
                ranges.append(f"U+{start:04X}-{end:04X}")
            start = codepoints[i]
            end = start
    
    if start == end:
        ranges.append(f"U+{start:04X}")
    else:
        ranges.append(f"U+{start:04X}-{end:04X}")
    
    return ', '.join(ranges)

def generate_css(font_files, format, font_weight, font_style, font_family, font_file_name):
    """Generate CSS code"""
    css_parts = []
    
    for index, file_info in enumerate(font_files):
        font_url = f"./fonts/{font_file_name}-subset-{index + 1}.{format}"
        unicode_range = generate_unicode_range(file_info['codepoints'])
        
        css_parts.append(f"""@font-face {{
    font-family: '{font_family}';
    src: url('{font_url}') format('{format}');
    font-weight: {font_weight};
    font-style: {font_style};
    unicode-range: {unicode_range};
    font-display: swap;
}}""")
    
    return '\n\n'.join(css_parts)

def get_font_family_name(font_path):
    """Get font family name from font file"""
    try:
        font = TTFont(font_path)
        name_table = font.get('name')
        if name_table:
            family_name = name_table.getDebugName(1) or name_table.getDebugName(4) or 'SubsetFont'
        else:
            family_name = 'SubsetFont'
        font.close()
        return family_name
    except:
        return 'SubsetFont'

def main():
    parser = argparse.ArgumentParser(description='Process font files and generate subsets')
    parser.add_argument('--font_url', required=True, help='Font file download URL')
    parser.add_argument('--split_strategy', default='single', choices=['single', 'byRange', 'byCount'],
                       help='Split strategy')
    parser.add_argument('--subset_strategy', default='all', choices=['all', 'common', 'chinese', 'custom'],
                       help='Subset strategy')
    parser.add_argument('--output_format', default='woff2', choices=['ttf', 'otf', 'woff', 'woff2'],
                       help='Output format')
    parser.add_argument('--split_count', type=int, default=1000,
                       help='Characters per file when using byCount strategy')
    parser.add_argument('--custom_range', default='',
                       help='Custom Unicode range (e.g., U+4E00-9FFF,U+0020-007E)')
    parser.add_argument('--font_weight', default='400',
                       help='Font weight (100-900)')
    parser.add_argument('--font_style', default='normal', choices=['normal', 'italic'],
                       help='Font style')
    parser.add_argument('--output_dir', default='output',
                       help='Output directory')
    
    args = parser.parse_args()
    
    # Create output directories
    os.makedirs(args.output_dir, exist_ok=True)
    os.makedirs(os.path.join(args.output_dir, 'fonts'), exist_ok=True)
    os.makedirs(os.path.join(args.output_dir, 'styles'), exist_ok=True)
    
    try:
        # Download font
        font_path = download_font(args.font_url, args.output_dir)
        
        # Parse font to get available codepoints
        print('Parsing font...')
        font = TTFont(font_path)
        available_codepoints = get_codepoints_by_strategy(font, args.subset_strategy, args.custom_range)
        font.close()
        
        print(f"Found {len(available_codepoints)} characters using strategy: {args.subset_strategy}")
        
        if not available_codepoints:
            raise ValueError('No characters found for the selected strategy')
        
        # Split codepoints
        codepoint_groups = split_codepoints(available_codepoints, args.split_strategy, args.split_count)
        print(f"Split into {len(codepoint_groups)} groups using strategy: {args.split_strategy}")
        
        # Get font family name
        font_family = get_font_family_name(font_path)
        font_file_name = os.path.splitext(os.path.basename(font_path))[0]
        
        # Create subset fonts
        font_files = []
        for i, codepoint_group in enumerate(codepoint_groups):
            print(f"Creating subset {i + 1}/{len(codepoint_groups)}...")
            output_file_name = f"{font_file_name}-subset-{i + 1}.{args.output_format}"
            output_path = os.path.join(args.output_dir, 'fonts', output_file_name)
            
            create_subset_font(font_path, codepoint_group, output_path, args.output_format)
            
            font_files.append({
                'codepoints': codepoint_group,
                'index': i,
                'file_name': output_file_name
            })
        
        # Generate CSS
        css_code = generate_css(font_files, args.output_format, args.font_weight, 
                               args.font_style, font_family, font_file_name)
        css_path = os.path.join(args.output_dir, 'styles', 'font.css')
        with open(css_path, 'w', encoding='utf-8') as f:
            f.write(css_code)
        
        # Generate README
        readme_lines = [
            "Font Subset Package",
            "",
            "Generated by Font Subset Tool",
            "",
            "Configuration:",
            f"- Font URL: {args.font_url}",
            f"- Subset Strategy: {args.subset_strategy}",
            f"- Split Strategy: {args.split_strategy}",
            f"- Output Format: {args.output_format}",
            f"- Font Weight: {args.font_weight}",
            f"- Font Style: {args.font_style}",
            "",
            "Files:",
            f"- fonts/: {len(font_files)} subset font files",
            "- styles/font.css: CSS style definitions",
            "",
            "File Details:"
        ]
        
        for file_info in font_files:
            unicode_range = generate_unicode_range(file_info['codepoints'])
            readme_lines.append(
                f"- {file_info['file_name']}: {len(file_info['codepoints'])} characters ({unicode_range})"
            )
        
        readme_lines.extend([
            "",
            f"Total Characters: {len(available_codepoints)}",
            "",
            "Usage:",
            "1. Copy the fonts and styles folders to your project",
            f"2. Include styles/font.css in your HTML",
            f"3. Use font-family: '{font_family}'"
        ])
        
        readme_path = os.path.join(args.output_dir, 'README.txt')
        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(readme_lines))
        
        # Create ZIP archive
        print('Creating ZIP archive...')
        zip_path = os.path.join(args.output_dir, f"{font_file_name}-subset-package.zip")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_info in font_files:
                file_path = os.path.join(args.output_dir, 'fonts', file_info['file_name'])
                zipf.write(file_path, f"fonts/{file_info['file_name']}")
            zipf.write(css_path, 'styles/font.css')
            zipf.write(readme_path, 'README.txt')
        
        zip_size = os.path.getsize(zip_path)
        print(f"ZIP archive created: {zip_path} ({zip_size} bytes)")
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()

