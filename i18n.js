// 国际化翻译文件
export const i18n = {
    zh: {
        // 页面标题和描述
        title: '字体子集化工具',
        description: '上传字体文件，生成优化的子集字体和 CSS',
        footer: '基于 opentype.js 和 Web Workers 的字体子集化工具',
        
        // 上传区域
        uploadTitle: '拖放字体文件到这里',
        uploadDescription: '支持 TTF, OTF, WOFF, WOFF2 格式',
        selectFile: '选择文件',
        
        // 字体预览
        previewTitle: '字体预览',
        fontName: '字体名称',
        fontFamily: '字体家族',
        fontFormat: '字体格式',
        totalGlyphs: '字符总数',
        previewText: '预览文本',
        previewPlaceholder: '输入要预览的文本...',
        previewDefaultText: '请在上方输入预览文本',
        unknownFont: '未知字体',
        unknownFamily: '未知家族',
        unknownFormat: '未知格式',
        
        // 配置区域
        configTitle: '子集化配置',
        subsetStrategy: '子集策略',
        subsetAll: '包含所有字符',
        subsetCommon: '常用字符 (字母、数字、标点)',
        subsetChinese: '中文字符',
        subsetCustom: '自定义字符范围',
        customRange: '自定义 Unicode 范围',
        customRangePlaceholder: '例如: U+0020-007E, U+4E00-9FFF',
        customRangeFormat: '格式: U+XXXX-YYYY, U+ZZZZ',
        outputFormat: '输出格式',
        formatWoff2: 'WOFF2 (推荐)',
        formatWoff: 'WOFF',
        formatTtf: 'TTF',
        fontWeight: '字体粗细',
        weightNormal: '正常 (Normal)',
        weightBold: '粗体 (Bold)',
        weightLighter: '更细 (Lighter)',
        weightBolder: '更粗 (Bolder)',
        fontStyle: '字体样式',
        styleNormal: '正常 (Normal)',
        styleItalic: '斜体 (Italic)',
        styleOblique: '倾斜 (Oblique)',
        splitStrategy: '分割策略',
        splitSingle: '单个文件',
        splitByRange: '按 Unicode 范围分割',
        splitByCount: '按字符数量分割',
        splitCount: '每个文件字符数',
        detectedChars: '检测到 {count} 个可用字符，将自动分析并生成最优子集',
        
        // 操作按钮
        generateBtn: '生成子集字体',
        processing: '处理……',
        processingFont: '正在处理字体...',
        processingAnalyzing: '正在分析字体...',
        processingGrouping: '正在按 Unicode 范围分组...',
        processingCreatingSubset: '正在创建第 {current}/{total} 个子集...',
        processingPackaging: '正在打包字体文件...',
        processingZipGenerating: '正在生成 ZIP 包...',
        processingLog: '处理日志',
        clearLog: '清空',
        noLogs: '暂无日志',
        
        // 结果区域
        resultTitle: '生成结果',
        resultSummary: '成功生成 {fileCount} 个字体文件，共包含 {totalChars} 个字符',
        cssCode: 'CSS 代码',
        copyCss: '复制 CSS',
        fileList: '文件列表',
        downloadPackage: '下载完整包',
        packing: '正在打包...',
        generatingZip: '正在生成 ZIP...',
        downloading: '正在下载...',
        charCount: '字符数',
        unicodeRange: 'Unicode Range',
        
        // 消息提示
        invalidFontFile: '请上传有效的字体文件 (TTF, OTF, WOFF, WOFF2)',
        fontParseError: '字体文件解析失败，请检查文件格式',
        uploadFontFirst: '请先上传字体文件',
        noCharsFound: '没有找到符合策略的字符',
        subsetError: '子集生成失败: {error}',
        copied: '已复制到剪贴板',
        copyFailed: '复制失败',
        generateFirst: '请先生成子集字体',
        packageError: '打包失败: {error}',
        woff2NotSupported: '警告：浏览器环境无法直接生成 WOFF2 格式，使用 TTF 格式',
        otfNotSupported: '警告：opentype.js 不支持直接导出 OTF，使用 TTF 格式',
        workerInitFailed: 'Worker 初始化失败: {error}，将使用主线程处理（速度可能较慢）',
        displayResultsError: '显示结果失败: {error}，但数据已保存'
    },
    en: {
        // Page title and description
        title: 'Font Subset Tool',
        description: 'Upload font files and generate optimized subset fonts and CSS',
        footer: 'Font subset tool based on opentype.js and Web Workers',
        
        // Upload area
        uploadTitle: 'Drag and drop font files here',
        uploadDescription: 'Supports TTF, OTF, WOFF, WOFF2 formats',
        selectFile: 'Select File',
        
        // Font preview
        previewTitle: 'Font Preview',
        fontName: 'Font Name',
        fontFamily: 'Font Family',
        fontFormat: 'Font Format',
        totalGlyphs: 'Total Glyphs',
        previewText: 'Preview Text',
        previewPlaceholder: 'Enter text to preview...',
        previewDefaultText: 'Please enter preview text above',
        unknownFont: 'Unknown Font',
        unknownFamily: 'Unknown Family',
        unknownFormat: 'Unknown Format',
        
        // Configuration area
        configTitle: 'Subset Configuration',
        subsetStrategy: 'Subset Strategy',
        subsetAll: 'Include All Characters',
        subsetCommon: 'Common Characters (Letters, Numbers, Punctuation)',
        subsetChinese: 'Chinese Characters',
        subsetCustom: 'Custom Character Range',
        customRange: 'Custom Unicode Range',
        customRangePlaceholder: 'e.g.: U+0020-007E, U+4E00-9FFF',
        customRangeFormat: 'Format: U+XXXX-YYYY, U+ZZZZ',
        outputFormat: 'Output Format',
        formatWoff2: 'WOFF2 (Recommended)',
        formatWoff: 'WOFF',
        formatTtf: 'TTF',
        fontWeight: 'Font Weight',
        weightNormal: 'Normal',
        weightBold: 'Bold',
        weightLighter: 'Lighter',
        weightBolder: 'Bolder',
        fontStyle: 'Font Style',
        styleNormal: 'Normal',
        styleItalic: 'Italic',
        styleOblique: 'Oblique',
        splitStrategy: 'Split Strategy',
        splitSingle: 'Single File',
        splitByRange: 'Split by Unicode Range',
        splitByCount: 'Split by Character Count',
        splitCount: 'Characters per File',
        detectedChars: 'Detected {count} available characters, will automatically analyze and generate optimal subset',
        
        // Action buttons
        generateBtn: 'Generate Subset Font',
        processing: 'Processing...',
        processingFont: 'Processing font...',
        processingAnalyzing: 'Analyzing font...',
        processingGrouping: 'Grouping codepoints...',
        processingCreatingSubset: 'Creating subset {current}/{total}...',
        processingPackaging: 'Packaging font files...',
        processingZipGenerating: 'Generating ZIP bundle...',
        processingLog: 'Processing Log',
        clearLog: 'Clear',
        noLogs: 'No logs',
        
        // Result area
        resultTitle: 'Generation Result',
        resultSummary: 'Successfully generated {fileCount} font files, containing {totalChars} characters in total',
        cssCode: 'CSS Code',
        copyCss: 'Copy CSS',
        fileList: 'File List',
        downloadPackage: 'Download Package',
        packing: 'Packing...',
        generatingZip: 'Generating ZIP...',
        downloading: 'Downloading...',
        charCount: 'Character Count',
        unicodeRange: 'Unicode Range',
        
        // Messages
        invalidFontFile: 'Please upload a valid font file (TTF, OTF, WOFF, WOFF2)',
        fontParseError: 'Font file parsing failed, please check the file format',
        uploadFontFirst: 'Please upload a font file first',
        noCharsFound: 'No characters found matching the strategy',
        subsetError: 'Subset generation failed: {error}',
        copied: 'Copied to clipboard',
        copyFailed: 'Copy failed',
        generateFirst: 'Please generate subset font first',
        packageError: 'Package failed: {error}',
        woff2NotSupported: 'Warning: Browser environment cannot directly generate WOFF2 format, using TTF format',
        otfNotSupported: 'Warning: opentype.js does not support direct OTF export, using TTF format',
        workerInitFailed: 'Worker initialization failed: {error}, will use main thread (may be slower)',
        displayResultsError: 'Failed to display results: {error}, but data has been saved'
    }
};

// 国际化工具函数
export class I18nManager {
    constructor() {
        // 从 localStorage 获取语言设置，默认为英文
        this.currentLang = localStorage.getItem('language') || 'en';
        this.translations = i18n[this.currentLang] || i18n.en;
    }
    
    // 获取翻译文本，支持占位符替换
    t(key, params = {}) {
        let text = this.translations[key] || key;
        
        // 替换占位符 {key}
        if (params && typeof params === 'object') {
            Object.keys(params).forEach(paramKey => {
                text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), params[paramKey]);
            });
        }
        
        return text;
    }
    
    // 切换语言
    setLanguage(lang) {
        if (i18n[lang]) {
            this.currentLang = lang;
            this.translations = i18n[lang];
            localStorage.setItem('language', lang);
            this.updatePage();
            return true;
        }
        return false;
    }
    
    // 获取当前语言
    getLanguage() {
        return this.currentLang;
    }
    
    // 更新页面文本
    updatePage() {
        // 更新所有带有 data-i18n 属性的元素（排除 select 中的 option）
        document.querySelectorAll('[data-i18n]:not(select option)').forEach(element => {
            // 检查元素是否仍然存在于 DOM 中
            if (!element || !element.isConnected) {
                return;
            }
            
            try {
                const key = element.getAttribute('data-i18n');
                if (!key) {
                    return;
                }
                
                const params = element.getAttribute('data-i18n-params');
                let translationParams = {};
                
                if (params) {
                    try {
                        translationParams = JSON.parse(params);
                    } catch (e) {
                        // 如果解析失败，尝试从元素属性获取参数
                        const paramKeys = params.split(',');
                        paramKeys.forEach(paramKey => {
                            const value = element.getAttribute(`data-i18n-${paramKey.trim()}`);
                            if (value) {
                                translationParams[paramKey.trim()] = value;
                            }
                        });
                    }
                }
                
                // 再次检查元素是否存在（可能在处理过程中被移除）
                if (element && element.isConnected) {
                    element.textContent = this.t(key, translationParams);
                }
            } catch (e) {
                console.warn('更新国际化文本失败:', e, element);
            }
        });
        
        // 更新所有 select 中的 option 文本
        document.querySelectorAll('select option[data-i18n]').forEach(option => {
            if (!option || !option.isConnected) {
                return;
            }
            try {
                const key = option.getAttribute('data-i18n');
                if (key && option.isConnected) {
                    option.textContent = this.t(key);
                }
            } catch (e) {
                console.warn('更新 option 文本失败:', e, option);
            }
        });
        
        // 更新所有带有 data-i18n-placeholder 属性的元素
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            if (!element || !element.isConnected) {
                return;
            }
            try {
                const key = element.getAttribute('data-i18n-placeholder');
                if (key && element.isConnected) {
                    element.placeholder = this.t(key);
                }
            } catch (e) {
                console.warn('更新 placeholder 失败:', e, element);
            }
        });
        
        // 更新所有带有 data-i18n-title 属性的元素
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            if (!element || !element.isConnected) {
                return;
            }
            try {
                const key = element.getAttribute('data-i18n-title');
                if (key && element.isConnected) {
                    element.title = this.t(key);
                }
            } catch (e) {
                console.warn('更新 title 失败:', e, element);
            }
        });
        
        // 更新页面标题（title 元素在 head 中，需要特殊处理）
        const titleElement = document.querySelector('head title');
        if (titleElement) {
            // 如果 title 有 data-i18n 属性，使用它；否则直接使用 'title' key
            const titleKey = titleElement.getAttribute('data-i18n') || 'title';
            titleElement.textContent = this.t(titleKey);
        }
        
        // 更新 HTML lang 属性
        document.documentElement.lang = this.currentLang === 'zh' ? 'zh-CN' : 'en';
    }
}

// 创建全局实例
export const i18nManager = new I18nManager();

