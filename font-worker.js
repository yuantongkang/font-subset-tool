// 字体处理 Web Worker
// 在 Worker 中导入 opentype.js
// 使用 UMD 版本以便在 Worker 中使用
try {
    importScripts('https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js');
} catch (e) {
    // 如果第一个 CDN 失败，尝试备用 CDN
    console.error('Failed to load opentype.js from jsdelivr, trying unpkg:', e);
    try {
        importScripts('https://unpkg.com/opentype.js@1.3.4/dist/opentype.min.js');
    } catch (e2) {
        console.error('Failed to load opentype.js from unpkg:', e2);
        throw new Error('无法加载 opentype.js 库');
    }
}

// opentype.js 在 Worker 中可能通过不同的方式暴露
// 检查可用的全局变量（在 importScripts 之后）
let opentype;
if (typeof self !== 'undefined' && self.opentype) {
    opentype = self.opentype;
} else if (typeof globalThis !== 'undefined' && globalThis.opentype) {
    opentype = globalThis.opentype;
} else {
    // 某些构建版本可能直接暴露为全局变量
    try {
        // 检查是否直接可用
        if (typeof opentype !== 'undefined') {
            // 已经可用
        } else {
            throw new Error('opentype.js 未正确加载到全局作用域');
        }
    } catch (e) {
        console.error('opentype.js 加载检查失败:', e);
        opentype = null;
    }
}

// 验证 opentype.js 是否可用
if (!opentype || !opentype.parse || !opentype.Font) {
    console.error('opentype.js 未正确加载，可用属性:', Object.keys(self || {}).filter(k => k.includes('opentype')));
    throw new Error('opentype.js 库未正确加载，请检查网络连接或 CDN 可用性');
}

let cachedFont = null;
let cachedFontBuffer = null;

// 处理主线程发送的消息
self.addEventListener('message', async function(e) {
    const { type, data } = e.data;
    
    try {
        switch (type) {
            case 'parseFont': {
                // 解析字体文件
                const fontBuffer = data.buffer;
                if (!opentype || !opentype.parse) {
                    throw new Error('opentype.js 未正确加载');
                }
                const font = opentype.parse(fontBuffer);
                
                // 缓存字体和缓冲区
                cachedFont = font;
                cachedFontBuffer = fontBuffer;
                
                // 分析字体字符
                const codepoints = [];
                for (let i = 0; i < font.glyphs.length; i++) {
                    const glyph = font.glyphs.get(i);
                    if (glyph.unicode !== undefined) {
                        codepoints.push(glyph.unicode);
                    }
                }
                
                self.postMessage({
                    type: 'fontParsed',
                    data: {
                        fontInfo: {
                            familyName: font.names.fontFamily ? font.names.fontFamily.en : 'Unknown',
                            fullName: font.names.fullName ? font.names.fullName.en : 'Unknown',
                            styleName: font.names.fontSubfamily ? font.names.fontSubfamily.en : 'Regular',
                            unitsPerEm: font.unitsPerEm || 1000,
                            ascender: font.ascender || 800,
                            descender: font.descender || -200,
                            totalGlyphs: font.glyphs.length
                        },
                        codepoints: codepoints
                    }
                });
                break;
            }
                
            case 'splitCodepoints': {
                // 分割码点
                const { codepoints, strategy, splitCount } = data;
                const groups = splitCodepoints(codepoints, strategy, splitCount);
                
                self.postMessage({
                    type: 'codepointsSplit',
                    data: { groups }
                });
                break;
            }
                
            case 'createSubset': {
                // 创建子集字体
                const { subsetCodepoints, outputFormat, index, total, taskId } = data;
                try {
                    const subsetBuffer = await createSubsetFont(subsetCodepoints, outputFormat);
                    
                    // 将 ArrayBuffer 转换为可传输的格式
                    self.postMessage({
                        type: 'subsetCreated',
                        data: {
                            buffer: subsetBuffer,
                            index: index,
                            total: total
                        },
                        taskId: taskId // 返回任务 ID，用于 Worker Pool 匹配任务
                    }, [subsetBuffer]); // 转移 ArrayBuffer 的所有权
                } catch (error) {
                    // 如果出错，发送错误消息
                    self.postMessage({
                        type: 'error',
                        data: {
                            message: error.message,
                            stack: error.stack
                        },
                        taskId: taskId
                    });
                }
                break;
            }
                
            case 'clearCache': {
                cachedFont = null;
                cachedFontBuffer = null;
                self.postMessage({ type: 'cacheCleared' });
                break;
            }
                
            default: {
                self.postMessage({
                    type: 'error',
                    data: { message: `Unknown message type: ${type}` }
                });
            }
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            data: {
                message: error.message,
                stack: error.stack
            }
        });
    }
});

// 分割码点函数
function splitCodepoints(codepoints, strategy, splitCount) {
    switch (strategy) {
        case 'single':
            return [codepoints];
            
        case 'byRange':
            return splitByUnicodeRange(codepoints);
            
        case 'byCount':
            return splitByCharacterCount(codepoints, splitCount);
            
        default:
            return [codepoints];
    }
}

// 按 Unicode 范围分割
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

// 按字符数量分割
function splitByCharacterCount(codepoints, maxCount) {
    const groups = [];
    for (let i = 0; i < codepoints.length; i += maxCount) {
        groups.push(codepoints.slice(i, i + maxCount));
    }
    return groups;
}

// 创建子集字体
async function createSubsetFont(codepoints, outputFormat) {
    if (!cachedFont) {
        throw new Error('字体未加载');
    }
    
    // 创建码点集合，用于快速查找
    const codepointSet = new Set(codepoints);
    
    // 收集需要包含的字形
    const subsetGlyphs = [];
    const glyphIndexMap = new Map();
    
    // 必须包含的字形：.notdef (索引 0)
    const notdefGlyph = cachedFont.glyphs.get(0);
    subsetGlyphs.push(notdefGlyph);
    glyphIndexMap.set(0, 0);
    
    // 遍历所有字形，找到匹配的码点
    const totalGlyphs = cachedFont.glyphs.length;
    for (let i = 1; i < totalGlyphs; i++) {
        const glyph = cachedFont.glyphs.get(i);
        
        // 检查字形是否有对应的 Unicode 码点
        if (glyph.unicode !== undefined && codepointSet.has(glyph.unicode)) {
            subsetGlyphs.push(glyph);
            glyphIndexMap.set(i, subsetGlyphs.length - 1);
        }
    }
    
    // 创建新的字体对象
    const fontFamily = cachedFont.names.fontFamily ? cachedFont.names.fontFamily.en : 'SubsetFont';
    const styleName = cachedFont.names.fontSubfamily ? cachedFont.names.fontSubfamily.en : 'Regular';
    
    if (!opentype || !opentype.Font) {
        throw new Error('opentype.js 未正确加载');
    }
    
    const subsetFont = new opentype.Font({
        familyName: fontFamily,
        styleName: styleName,
        unitsPerEm: cachedFont.unitsPerEm || 1000,
        ascender: cachedFont.ascender || 800,
        descender: cachedFont.descender || -200,
        glyphs: subsetGlyphs
    });
    
    // 导出字体为二进制数据
    let fontData;
    
    if (outputFormat === 'ttf') {
        fontData = subsetFont.toArrayBuffer();
    } else if (outputFormat === 'otf') {
        // opentype.js 不支持直接导出 OTF，导出为 TTF
        fontData = subsetFont.toArrayBuffer();
    } else {
        // WOFF/WOFF2 格式需要额外的转换库
        // 暂时导出为 TTF
        fontData = subsetFont.toArrayBuffer();
    }
    
    return fontData;
}

