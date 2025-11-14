// 导入依赖
import * as opentype from 'opentype';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { i18nManager } from './i18n.js';

// 全局变量
let currentFont = null;
let fontBuffer = null;
let fontFileName = '';
let availableCodepoints = [];
let fontWorker = null; // 保留单个 Worker 用于字体解析和码点分割
let fontWorkerPool = null; // Worker Pool 用于并行生成子集
let fontInfo = null; // 存储字体信息（从 Worker 获取）

let processingDetailState = null;
let processingLogs = [];
const processingDetailMessages = {
    analyzing: {
        zh: '正在分析字体...',
        en: 'Analyzing font...'
    },
    grouping: {
        zh: '正在按 Unicode 范围分组...',
        en: 'Grouping codepoints...'
    },
    creatingSubset: {
        zh: '正在创建第 {current}/{total} 个子集...',
        en: 'Creating subset {current}/{total}...'
    },
    packagingFiles: {
        zh: '正在打包字体文件...',
        en: 'Packaging font files...'
    },
    zipGenerating: {
        zh: '正在生成 ZIP 包...',
        en: 'Generating ZIP bundle...'
    },
    fontLoaded: {
        zh: '字体文件加载完成',
        en: 'Font file loaded'
    },
    analysisComplete: {
        zh: '字体分析完成，找到 {count} 个字符',
        en: 'Font analysis complete, found {count} characters'
    },
    groupingComplete: {
        zh: '分组完成，共 {count} 组',
        en: 'Grouping complete, {count} groups'
    },
    subsetCreated: {
        zh: '子集 {current}/{total} 创建完成',
        en: 'Subset {current}/{total} created'
    },
    cssGenerated: {
        zh: 'CSS 代码生成完成',
        en: 'CSS code generated'
    },
    zipComplete: {
        zh: 'ZIP 包生成完成',
        en: 'ZIP bundle generated'
    },
    downloadComplete: {
        zh: '下载完成',
        en: 'Download complete'
    },
    fontParseError: {
        zh: '字体文件解析失败: {error}',
        en: 'Font file parsing failed: {error}'
    },
    workerError: {
        zh: 'Worker 处理错误: {error}',
        en: 'Worker processing error: {error}'
    },
    subsetError: {
        zh: '子集生成失败: {error}',
        en: 'Subset generation failed: {error}'
    },
    packageError: {
        zh: '打包失败: {error}',
        en: 'Package failed: {error}'
    }
};

function formatProcessingDetail(key, params = {}) {
    const templates = processingDetailMessages[key];
    if (!templates) return '';
    const lang = i18nManager.getLanguage();
    const template = templates[lang] || templates.en || '';
    return template.replace(/\{(\w+)\}/g, (_, name) => {
        return params[name] !== undefined ? params[name] : '';
    });
}

function renderProcessingDetail() {
    const detailEl = document.getElementById('processingDetail');
    if (!detailEl) return;
    if (processingDetailState) {
        detailEl.textContent = formatProcessingDetail(processingDetailState.key, processingDetailState.params);
    } else {
        detailEl.textContent = '';
    }
}

function setProcessingDetail(key, params = {}) {
    if (!key) {
        processingDetailState = null;
    } else {
        processingDetailState = { key, params };
    }
    renderProcessingDetail();
}

// 添加日志记录功能
function addLog(key, params = {}, type = 'info') {
    const timestamp = new Date();
    const timeStr = timestamp.toLocaleTimeString('zh-CN', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
    });
    
    const message = formatProcessingDetail(key, params);
    const logEntry = {
        time: timeStr,
        message: message,
        type: type, // 'info', 'success', 'warning', 'error'
        key: key,
        params: params
    };
    
    processingLogs.push(logEntry);
    renderLog();
    
    // 自动滚动到底部
    const logContent = document.getElementById('logContent');
    if (logContent) {
        setTimeout(() => {
            logContent.scrollTop = logContent.scrollHeight;
        }, 0);
    }
}

// 渲染日志
function renderLog() {
    const logContent = document.getElementById('logContent');
    if (!logContent) return;
    
    if (processingLogs.length === 0) {
        logContent.innerHTML = '<div class="log-empty" data-i18n="noLogs">暂无日志</div>';
        return;
    }
    
    logContent.innerHTML = processingLogs.map(log => {
        const typeClass = `log-${log.type}`;
        return `
            <div class="log-entry ${typeClass}">
                <span class="log-time">[${log.time}]</span>
                <span class="log-message">${log.message}</span>
            </div>
        `;
    }).join('');
}

// 清空日志
function clearLog() {
    processingLogs = [];
    renderLog();
}

// 暴露到全局
window.clearLog = clearLog;

// Worker Pool 管理器
class FontWorkerPool {
    constructor(maxWorkers = null) {
        // 根据 CPU 核心数或任务数量确定 Worker 数量
        // 默认使用 navigator.hardwareConcurrency，如果没有则使用 4
        this.maxWorkers = maxWorkers || (navigator.hardwareConcurrency || 4);
        // 限制最大 Worker 数量，避免创建过多
        this.maxWorkers = Math.min(this.maxWorkers, 8);
        this.workers = [];
        this.taskQueue = [];
        this.activeTasks = new Map(); // taskId -> { worker, resolve, reject }
        this.nextTaskId = 0;
        this.initialized = false;
    }

    // 初始化 Worker Pool
    async initialize(fontBuffer) {
        if (this.initialized) {
            // 如果已初始化，更新所有 Worker 的字体缓存
            await this.updateFontBuffer(fontBuffer);
            return;
        }

        console.log(`初始化 Worker Pool，创建 ${this.maxWorkers} 个 Worker`);
        
        // 创建多个 Worker
        const initPromises = [];
        for (let i = 0; i < this.maxWorkers; i++) {
            try {
                const worker = new Worker('font-worker.js');
                const workerId = i;
                
                // 设置消息处理器
                worker.addEventListener('message', (e) => {
                    this.handleWorkerMessage(workerId, e);
                });
                
                worker.addEventListener('error', (error) => {
                    console.error(`Worker ${workerId} 错误:`, error);
                    this.handleWorkerError(workerId, error);
                });
                
                this.workers.push({
                    worker,
                    id: workerId,
                    busy: false
                });
                
                // 初始化 Worker，加载字体
                initPromises.push(
                    new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error(`Worker ${workerId} 初始化超时`));
                        }, 30000);
                        
                        const messageHandler = (e) => {
                            if (e.data.type === 'fontParsed' || e.data.type === 'error') {
                                clearTimeout(timeout);
                                worker.removeEventListener('message', messageHandler);
                                if (e.data.type === 'error') {
                                    reject(new Error(e.data.data.message));
                                } else {
                                    resolve();
                                }
                            }
                        };
                        
                        worker.addEventListener('message', messageHandler);
                        
                        // 发送字体数据（使用副本，避免转移所有权）
                        const bufferCopy = fontBuffer.slice(0);
                        worker.postMessage({
                            type: 'parseFont',
                            data: { buffer: bufferCopy }
                        }, [bufferCopy]);
                    })
                );
            } catch (error) {
                console.error(`创建 Worker ${i} 失败:`, error);
            }
        }
        
        try {
            await Promise.all(initPromises);
            this.initialized = true;
            console.log(`Worker Pool 初始化完成，共 ${this.workers.length} 个 Worker`);
        } catch (error) {
            console.error('Worker Pool 初始化失败:', error);
            // 清理已创建的 Worker
            this.workers.forEach(({ worker }) => worker.terminate());
            this.workers = [];
            throw error;
        }
    }

    // 更新所有 Worker 的字体缓存
    async updateFontBuffer(fontBuffer) {
        const updatePromises = this.workers.map(({ worker }) => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('更新字体缓存超时'));
                }, 10000);
                
                const messageHandler = (e) => {
                    if (e.data.type === 'fontParsed' || e.data.type === 'error') {
                        clearTimeout(timeout);
                        worker.removeEventListener('message', messageHandler);
                        if (e.data.type === 'error') {
                            reject(new Error(e.data.data.message));
                        } else {
                            resolve();
                        }
                    }
                };
                
                worker.addEventListener('message', messageHandler);
                const bufferCopy = fontBuffer.slice(0);
                worker.postMessage({
                    type: 'parseFont',
                    data: { buffer: bufferCopy }
                }, [bufferCopy]);
            });
        });
        
        await Promise.all(updatePromises);
    }

    // 处理 Worker 消息
    handleWorkerMessage(workerId, e) {
        const { type, data, taskId } = e.data;
        
        if (type === 'subsetCreated' && taskId !== undefined) {
            // 子集创建完成
            const task = this.activeTasks.get(taskId);
            if (task) {
                const { resolve, workerInfo } = task;
                workerInfo.busy = false;
                this.activeTasks.delete(taskId);
                resolve(data.buffer);
                // 处理下一个任务
                this.processNextTask();
            }
        } else if (type === 'error' && taskId !== undefined) {
            // 任务错误
            const task = this.activeTasks.get(taskId);
            if (task) {
                const { reject, workerInfo } = task;
                workerInfo.busy = false;
                this.activeTasks.delete(taskId);
                reject(new Error(data.message));
                // 处理下一个任务
                this.processNextTask();
            }
        }
    }

    // 处理 Worker 错误
    handleWorkerError(workerId, error) {
        console.error(`Worker ${workerId} 发生错误:`, error);
        // 找到使用该 Worker 的任务并拒绝
        for (const [taskId, task] of this.activeTasks.entries()) {
            if (task.workerInfo.id === workerId) {
                task.reject(new Error(`Worker ${workerId} 错误: ${error.message || '未知错误'}`));
                task.workerInfo.busy = false;
                this.activeTasks.delete(taskId);
            }
        }
    }

    // 处理下一个任务
    processNextTask() {
        if (this.taskQueue.length === 0) return;
        
        // 找到空闲的 Worker
        const availableWorker = this.workers.find(w => !w.busy);
        if (!availableWorker) return;
        
        // 获取下一个任务
        const task = this.taskQueue.shift();
        this.executeTask(availableWorker, task);
    }

    // 执行任务
    executeTask(workerInfo, task) {
        workerInfo.busy = true;
        const taskId = this.nextTaskId++;
        
        this.activeTasks.set(taskId, {
            workerInfo,
            resolve: task.resolve,
            reject: task.reject
        });
        
        // 发送任务到 Worker
        workerInfo.worker.postMessage({
            type: 'createSubset',
            data: {
                subsetCodepoints: task.codepoints,
                outputFormat: task.outputFormat,
                index: task.index,
                total: task.total,
                taskId: taskId // 添加任务 ID
            }
        });
    }

    // 添加任务到队列
    async createSubset(codepoints, outputFormat, index, total) {
        return new Promise((resolve, reject) => {
            const task = {
                codepoints,
                outputFormat,
                index,
                total,
                resolve,
                reject
            };
            
            // 尝试立即执行，如果没有空闲 Worker 则加入队列
            const availableWorker = this.workers.find(w => !w.busy);
            if (availableWorker) {
                this.executeTask(availableWorker, task);
            } else {
                this.taskQueue.push(task);
            }
        });
    }

    // 清理资源
    terminate() {
        this.workers.forEach(({ worker }) => worker.terminate());
        this.workers = [];
        this.taskQueue = [];
        this.activeTasks.clear();
        this.initialized = false;
    }
}

// 初始化 Web Worker（用于字体解析和码点分割）
function initFontWorker() {
    if (!fontWorker) {
        try {
            fontWorker = new Worker('font-worker.js');
            
            // 处理 Worker 消息
            fontWorker.addEventListener('message', function(e) {
                const { type, data } = e.data;
                
                switch (type) {
                    case 'fontParsed':
                        handleFontParsed(data);
                        break;
                    case 'codepointsSplit':
                        handleCodepointsSplit(data);
                        break;
                    case 'subsetCreated':
                        handleSubsetCreated(data);
                        break;
                    case 'error':
                        handleWorkerError(data);
                        break;
                }
            });
            
            fontWorker.addEventListener('error', function(error) {
                console.error('Worker 错误:', error);
                const errorMsg = error.message || error.filename || '未知错误';
                addLog('workerError', { error: errorMsg }, 'error');
                console.warn('Worker 初始化失败，将使用主线程处理。错误详情:', error);
                // 显示 alert 提示用户
                alert(i18nManager.t('workerInitFailed', { error: errorMsg }));
                fontWorker = null;
            });
        } catch (error) {
            console.error('无法创建 Worker:', error);
            // 如果 Worker 不可用，继续使用主线程
        }
    }
}

// 处理字体解析完成
let fontParseResolve = null;
function handleFontParsed(data) {
    fontInfo = data.fontInfo;
    availableCodepoints = data.codepoints;
    
    // 更新 UI
    displayFontInfo();
    showSections();
    updatePreview();
    
    // 显示检测到的字符数量
    const detectedCharsEl = document.getElementById('detectedChars');
    if (detectedCharsEl) {
        detectedCharsEl.textContent = availableCodepoints.length;
        const parent = detectedCharsEl.parentElement;
        if (parent && parent.hasAttribute('data-i18n')) {
            parent.setAttribute('data-i18n-params', JSON.stringify({ count: availableCodepoints.length }));
            const translatedText = i18nManager.t('detectedChars', { count: availableCodepoints.length });
            parent.innerHTML = translatedText.replace('{count}', `<span id="detectedChars">${availableCodepoints.length}</span>`);
        }
    }
    
    addLog('analysisComplete', { count: availableCodepoints.length }, 'success');
    
    if (fontParseResolve) {
        fontParseResolve();
        fontParseResolve = null;
    }
}

// 处理码点分割完成
let splitResolve = null;
let splitGroups = null;
function handleCodepointsSplit(data) {
    splitGroups = data.groups;
    addLog('groupingComplete', { count: splitGroups.length }, 'success');
    
    if (splitResolve) {
        splitResolve(splitGroups);
        splitResolve = null;
    }
}

// 处理子集创建完成
let subsetResolves = new Map();
let completedSubsets = 0;
let totalSubsets = 0;
function handleSubsetCreated(data) {
    const { buffer, index, total } = data;
    addLog('subsetCreated', { current: index + 1, total: total }, 'success');
    
    // 更新完成的子集数量
    completedSubsets++;
    totalSubsets = total;
    
    // 实时更新处理详情文字
    setProcessingDetail('creatingSubset', { current: completedSubsets, total: totalSubsets });
    
    if (subsetResolves.has(index)) {
        const resolve = subsetResolves.get(index);
        resolve(buffer);
        subsetResolves.delete(index);
    }
}

// 处理 Worker 错误
function handleWorkerError(data) {
    console.error('Worker 错误:', data);
    addLog('workerError', { error: data.message }, 'error');
    
    // 如果有等待的 Promise，reject 它们
    if (fontParseResolve) {
        fontParseResolve = null;
    }
    if (splitResolve) {
        splitResolve = null;
    }
    subsetResolves.forEach((resolve) => {
        // 这里应该 reject，但为了简化，我们使用一个错误处理
    });
    subsetResolves.clear();
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化国际化
    i18nManager.updatePage();
    updateSelectOptions();
    // 设置语言按钮初始状态
    const currentLang = i18nManager.getLanguage();
    document.getElementById('langZh').classList.toggle('active', currentLang === 'zh');
    document.getElementById('langEn').classList.toggle('active', currentLang === 'en');
    // 初始化 Worker
    initFontWorker();
    initializeEventListeners();
});

// 页面卸载时清理 Worker Pool
window.addEventListener('beforeunload', function() {
    if (fontWorkerPool) {
        fontWorkerPool.terminate();
        fontWorkerPool = null;
    }
    if (fontWorker) {
        fontWorker.terminate();
        fontWorker = null;
    }
});

// 更新 select 选项的文本
function updateSelectOptions() {
    // 更新所有 select 中的 option 文本
    document.querySelectorAll('select option[data-i18n]').forEach(option => {
        const key = option.getAttribute('data-i18n');
        option.textContent = i18nManager.t(key);
    });
}

// 语言切换函数（暴露到全局）
window.switchLanguage = function(lang) {
    if (i18nManager.setLanguage(lang)) {
        updateSelectOptions();
        // 更新语言按钮状态
        document.getElementById('langZh').classList.toggle('active', lang === 'zh');
        document.getElementById('langEn').classList.toggle('active', lang === 'en');
        // 更新动态内容
        updateDynamicContent();
    }
};

// 更新动态内容
function updateDynamicContent() {
    // 更新检测到的字符数
    const detectedCharsEl = document.getElementById('detectedChars');
    if (detectedCharsEl && availableCodepoints.length > 0) {
        detectedCharsEl.textContent = availableCodepoints.length;
        const parent = detectedCharsEl.closest('[data-i18n]');
        if (parent) {
            parent.setAttribute('data-i18n-params', JSON.stringify({ count: availableCodepoints.length }));
            i18nManager.updatePage();
        }
    }

    // 更新结果摘要
    if (window.fileInfo) {
        const resultSummary = document.querySelector('.result-summary p');
        if (resultSummary) {
            resultSummary.setAttribute('data-i18n-params', JSON.stringify({
                fileCount: window.fileInfo.fileCount,
                totalChars: window.fileInfo.totalChars
            }));
            i18nManager.updatePage();
        }
    }

        // 保证语言切换时能刷新处理详情
        renderProcessingDetail();
        // 重新渲染日志以更新语言
        renderLog();
    }

function initializeEventListeners() {
    // 文件上传事件
    const fontFileInput = document.getElementById('fontFile');
    const uploadArea = document.getElementById('uploadArea');

    fontFileInput.addEventListener('change', handleFileSelect);

    // 拖放事件
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFontFile(files[0]);
        }
    });

    // 预览文本输入事件
    const previewText = document.getElementById('previewText');
    previewText.addEventListener('input', updatePreview);

    // 子集策略变化事件
    const subsetStrategy = document.getElementById('subsetStrategy');
    subsetStrategy.addEventListener('change', handleSubsetStrategyChange);

    // 分割策略变化事件
    const splitStrategy = document.getElementById('splitStrategy');
    splitStrategy.addEventListener('change', handleSplitStrategyChange);

    // 配置变化事件
    document.getElementById('fontWeight').addEventListener('change', updatePreview);
    document.getElementById('fontStyle').addEventListener('change', updatePreview);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFontFile(file);
    }
}

function handleFontFile(file) {
    const validTypes = ['font/ttf', 'font/otf', 'application/font-woff', 'application/font-woff2'];
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];

    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(fileExtension) && !validTypes.includes(file.type)) {
        alert(i18nManager.t('invalidFontFile'));
        return;
    }

    fontFileName = file.name.replace(fileExtension, '');

    const reader = new FileReader();
    reader.onload = function(e) {
        fontBuffer = e.target.result;
        loadFont(fontBuffer);
    };
    reader.readAsArrayBuffer(file);
}

async function loadFont(buffer) {
    addLog('fontLoaded');
    
    // 如果 Worker 可用，使用 Worker 处理
    if (fontWorker) {
        // 保存 buffer 的副本，因为 Transferable Objects 会转移所有权
        fontBuffer = buffer.slice(0);
        
        // 初始化或更新 Worker Pool
        try {
            if (!fontWorkerPool) {
                fontWorkerPool = new FontWorkerPool();
            }
            await fontWorkerPool.initialize(buffer);
            console.log('Worker Pool 初始化成功，将使用并行处理');
        } catch (error) {
            console.warn('Worker Pool 初始化失败，将使用单个 Worker:', error);
            addLog('workerError', { error: `Worker Pool 初始化失败: ${error.message}` }, 'warning');
            // 清理失败的 Worker Pool
            if (fontWorkerPool) {
                try {
                    fontWorkerPool.terminate();
                } catch (e) {
                    console.error('清理 Worker Pool 失败:', e);
                }
                fontWorkerPool = null;
            }
            // 继续使用单个 Worker
        }
        
        fontWorker.postMessage({
            type: 'parseFont',
            data: { buffer: buffer }
        }, [buffer]); // 转移 ArrayBuffer 的所有权以提升性能
    } else {
        // 降级到主线程处理
        try {
            currentFont = opentype.parse(buffer);
            analyzeFontCharacters();
            displayFontInfo();
            showSections();
            updatePreview();
        } catch (error) {
            console.error('字体加载失败:', error);
            addLog('fontParseError', { error: error.message }, 'error');
            alert(i18nManager.t('fontParseError'));
        }
    }
}

function analyzeFontCharacters() {
    if (!currentFont) return;

    availableCodepoints = [];
    console.log('开始分析字体字符，总字形数:', currentFont.glyphs.length);

    // 分析字体中的所有字符
    for (let i = 0; i < currentFont.glyphs.length; i++) {
        const glyph = currentFont.glyphs.get(i);
        if (glyph.unicode !== undefined) {
            availableCodepoints.push(glyph.unicode);
        }
    }

    console.log('分析完成，找到字符数:', availableCodepoints.length);
    addLog('analysisComplete', { count: availableCodepoints.length }, 'success');
    // 显示检测到的字符数量
    const detectedCharsEl = document.getElementById('detectedChars');
    if (detectedCharsEl) {
        detectedCharsEl.textContent = availableCodepoints.length;
        // 更新父元素的国际化参数并重新渲染
        const parent = detectedCharsEl.parentElement;
        if (parent && parent.hasAttribute('data-i18n')) {
            parent.setAttribute('data-i18n-params', JSON.stringify({ count: availableCodepoints.length }));
            // 获取翻译文本并替换数字部分
            const translatedText = i18nManager.t('detectedChars', { count: availableCodepoints.length });
            // 将 {count} 占位符替换为实际的 span 元素
            parent.innerHTML = translatedText.replace('{count}', `<span id="detectedChars">${availableCodepoints.length}</span>`);
        }
    }
}

function displayFontInfo() {
    // 优先使用从 Worker 获取的字体信息
    if (fontInfo) {
        document.getElementById('fontName').textContent = fontInfo.fullName || i18nManager.t('unknownFont');
        document.getElementById('fontFamily').textContent = fontInfo.familyName || i18nManager.t('unknownFamily');
        document.getElementById('fontFormat').textContent = getFontFormat();
        document.getElementById('totalGlyphs').textContent = fontInfo.totalGlyphs || 0;
    } else if (currentFont) {
        // 降级到主线程的字体信息
        document.getElementById('fontName').textContent = currentFont.names.fullName ? currentFont.names.fullName.en : i18nManager.t('unknownFont');
        document.getElementById('fontFamily').textContent = currentFont.names.fontFamily ? currentFont.names.fontFamily.en : i18nManager.t('unknownFamily');
        document.getElementById('fontFormat').textContent = getFontFormat();
        document.getElementById('totalGlyphs').textContent = currentFont.glyphs.length;
    }
}

function getFontFormat() {
    if (!fontBuffer) return i18nManager.t('unknownFormat');

    const view = new DataView(fontBuffer);
    const signature = view.getUint32(0, false);

    if (signature === 0x774F4646) return 'WOFF';
    if (signature === 0x774F4632) return 'WOFF2';
    if (signature === 0x00010000 || signature === 0x74727565) return 'TTF/OTF';

    return i18nManager.t('unknownFormat');
}

function showSections() {
    document.getElementById('previewSection').style.display = 'block';
    document.getElementById('configSection').style.display = 'block';
    document.getElementById('actionSection').style.display = 'block';
}

function updatePreview() {
    if (!fontBuffer) return;

    const previewText = document.getElementById('previewText').value;
    const fontWeight = document.getElementById('fontWeight').value;
    const fontStyle = document.getElementById('fontStyle').value;

    const previewDisplay = document.getElementById('previewDisplay');

    // 创建字体 URL
    const fontUrl = URL.createObjectURL(new Blob([fontBuffer]));

    // 获取字体名称
    const fontFamilyName = fontInfo ? fontInfo.familyName : 
                          (currentFont && currentFont.names.fontFamily ? currentFont.names.fontFamily.en : 'CustomFont');

    // 应用字体样式
    previewDisplay.style.fontFamily = `'${fontFamilyName}', sans-serif`;
    previewDisplay.style.fontWeight = fontWeight;
    previewDisplay.style.fontStyle = fontStyle;

    // 创建字体定义
    const fontFace = `
        @font-face {
            font-family: '${fontFamilyName}';
            src: url('${fontUrl}') format('${getFontFormat().toLowerCase()}');
            font-weight: ${fontWeight};
            font-style: ${fontStyle};
        }
    `;

    // 添加字体到页面
    const style = document.createElement('style');
    style.textContent = fontFace;
    document.head.appendChild(style);

    previewDisplay.textContent = previewText || i18nManager.t('previewDefaultText');

    // 清理 URL
    setTimeout(() => URL.revokeObjectURL(fontUrl), 1000);
}

function handleSubsetStrategyChange() {
    const strategy = document.getElementById('subsetStrategy').value;
    const customRangeGroup = document.getElementById('customRangeGroup');

    if (strategy === 'custom') {
        customRangeGroup.style.display = 'block';
    } else {
        customRangeGroup.style.display = 'none';
    }
}

function handleSplitStrategyChange() {
    const strategy = document.getElementById('splitStrategy').value;
    const splitCountGroup = document.getElementById('splitCountGroup');

    if (strategy === 'byCount') {
        splitCountGroup.style.display = 'block';
    } else {
        splitCountGroup.style.display = 'none';
    }
}

async function generateSubset() {
    // 检查字体是否已加载（支持 Worker 和主线程两种方式）
    const isFontLoaded = (fontBuffer && (currentFont || fontInfo || availableCodepoints.length > 0));
    if (!isFontLoaded) {
        alert(i18nManager.t('uploadFontFirst'));
        return;
    }

    // 清空之前的日志
    clearLog();
    addLog('analyzing');

    const strategy = document.getElementById('subsetStrategy').value;
    const splitStrategy = document.getElementById('splitStrategy').value;
    const outputFormat = document.getElementById('outputFormat').value;
    const fontWeight = document.getElementById('fontWeight').value;
    const fontStyle = document.getElementById('fontStyle').value;

    console.log('开始生成子集，策略:', strategy, '分割策略:', splitStrategy);
    showLoading(true);
    setProcessingDetail('analyzing');

    try {
        // 根据策略获取要包含的码点
        const allCodepoints = getCodepointsByStrategy(strategy);
        console.log('获取到码点数量:', allCodepoints.length);

        if (allCodepoints.length === 0) {
            alert(i18nManager.t('noCharsFound'));
            setProcessingDetail();
            return;
        }

        showLoading(true, 10);
        setProcessingDetail('grouping');
        addLog('grouping');

        // 根据分割策略分割码点
        let codepointGroups;
        if (fontWorker) {
            // 使用 Worker 分割码点
            const splitCount = splitStrategy === 'byCount' ? parseInt(document.getElementById('splitCount').value) : undefined;
            codepointGroups = await new Promise((resolve) => {
                splitResolve = resolve;
                fontWorker.postMessage({
                    type: 'splitCodepoints',
                    data: {
                        codepoints: allCodepoints,
                        strategy: splitStrategy,
                        splitCount: splitCount
                    }
                });
            });
        } else {
            // 降级到主线程处理
            codepointGroups = await splitCodepointsAsync(allCodepoints, splitStrategy);
        }
        console.log('分割成组数:', codepointGroups.length);

        showLoading(true, 30);

        // 创建多个子集字体
        const fontFiles = [];
        const totalGroups = codepointGroups.length;
        console.log('开始创建字体文件，总组数:', totalGroups);

        // 并行创建子集字体（使用 Worker Pool 时）
        if (fontWorkerPool && fontWorkerPool.initialized) {
            // 重置计数器
            completedSubsets = 0;
            totalSubsets = totalGroups;
            
            // 设置初始处理详情
            setProcessingDetail('creatingSubset', { current: 0, total: totalGroups });
            addLog('creatingSubset', { current: 0, total: totalGroups });
            
            console.log(`使用 Worker Pool 并行处理 ${totalGroups} 个子集`);
            
            // 使用 Worker Pool 并行处理所有子集
            const subsetPromises = codepointGroups.map((group, i) => {
                return fontWorkerPool.createSubset(group, outputFormat, i, totalGroups)
                    .then(buffer => {
                        // 更新进度
                        completedSubsets++;
                        const progress = 30 + Math.floor(completedSubsets / totalGroups * 60);
                        setProcessingDetail('creatingSubset', { current: completedSubsets, total: totalGroups });
                        showLoading(true, progress);
                        addLog('subsetCreated', { current: completedSubsets, total: totalGroups }, 'success');
                        return { buffer, index: i };
                    });
            });
            
            // 等待所有子集创建完成
            const subsetResults = await Promise.all(subsetPromises);
            
            // 按索引排序并组装字体文件
            subsetResults.sort((a, b) => a.index - b.index);
            for (let i = 0; i < subsetResults.length; i++) {
                fontFiles.push({
                    buffer: subsetResults[i].buffer,
                    codepoints: codepointGroups[i],
                    index: i
                });
            }
        } else if (fontWorker) {
            // 降级到单个 Worker（串行处理）
            // 重置计数器
            completedSubsets = 0;
            totalSubsets = totalGroups;
            
            // 设置初始处理详情
            setProcessingDetail('creatingSubset', { current: 0, total: totalGroups });
            addLog('creatingSubset', { current: 0, total: totalGroups });
            
            // 使用单个 Worker 处理（虽然发送了多个请求，但会串行处理）
            const subsetPromises = codepointGroups.map((group, i) => {
                return new Promise((resolve) => {
                    subsetResolves.set(i, resolve);
                    
                    fontWorker.postMessage({
                        type: 'createSubset',
                        data: {
                            subsetCodepoints: group,
                            outputFormat: outputFormat,
                            index: i,
                            total: totalGroups
                        }
                    });
                });
            });
            
            // 等待所有子集创建完成
            const subsetBuffers = await Promise.all(subsetPromises);
            
            // 按顺序组装字体文件
            for (let i = 0; i < totalGroups; i++) {
                fontFiles.push({
                    buffer: subsetBuffers[i],
                    codepoints: codepointGroups[i],
                    index: i
                });
                
                // 更新进度
                const progress = 30 + Math.floor((i + 1) / totalGroups * 60);
                showLoading(true, progress);
            }
        } else {
            // 降级到主线程顺序处理
            for (let i = 0; i < totalGroups; i++) {
                console.log(`创建字体文件 ${i + 1}/${totalGroups}`);
                setProcessingDetail('creatingSubset', { current: i + 1, total: totalGroups });
                addLog('creatingSubset', { current: i + 1, total: totalGroups });
                const subsetBuffer = await createSubsetFont(codepointGroups[i], outputFormat);
                fontFiles.push({
                    buffer: subsetBuffer,
                    codepoints: codepointGroups[i],
                    index: i
                });
                addLog('subsetCreated', { current: i + 1, total: totalGroups }, 'success');

                // 更新进度
                const progress = 30 + Math.floor((i + 1) / totalGroups * 60);
                console.log(`进度更新: ${progress}%`);
                showLoading(true, progress);
            }
        }

        showLoading(true, 95);

        // 生成 CSS 和文件信息
        const cssCode = generateCSS(fontFiles, outputFormat, fontWeight, fontStyle);
        const fileInfo = generateFileInfo(fontFiles);
        addLog('cssGenerated', {}, 'success');

        // 显示结果
        displayResults(cssCode, fileInfo, fontFiles);
        setProcessingDetail();

        showLoading(true, 100);

    } catch (error) {
        console.error('子集生成失败:', error);
        addLog('subsetError', { error: error.message }, 'error');
        alert(i18nManager.t('subsetError', { error: error.message }));
    } finally {
        setTimeout(() => showLoading(false), 500);
    }
}

function getCodepointsByStrategy(strategy) {
    switch (strategy) {
        case 'all':
            return [...availableCodepoints];

        case 'common':
            return availableCodepoints.filter(codepoint => {
                // 基本拉丁字母、数字、标点符号
                return (codepoint >= 0x0020 && codepoint <= 0x007E) || // 基本拉丁
                       (codepoint >= 0x00A0 && codepoint <= 0x00FF) || // 拉丁补充
                       (codepoint >= 0x2000 && codepoint <= 0x206F);   // 常用标点
            });

        case 'chinese':
            return availableCodepoints.filter(codepoint => {
                // 中文字符范围
                return (codepoint >= 0x4E00 && codepoint <= 0x9FFF) || // 基本汉字
                       (codepoint >= 0x3400 && codepoint <= 0x4DBF) || // 扩展A
                       (codepoint >= 0x20000 && codepoint <= 0x2A6DF); // 扩展B
            });

        case 'custom':
            const customRange = document.getElementById('customRange').value;
            return parseCustomRange(customRange);

        default:
            return [...availableCodepoints];
    }
}

function parseCustomRange(rangeString) {
    if (!rangeString.trim()) return [];

    const ranges = rangeString.split(',').map(r => r.trim());
    const result = [];

    for (const range of ranges) {
        if (range.includes('-')) {
            // 处理范围 U+XXXX-YYYY
            const [startStr, endStr] = range.split('-');
            const start = parseInt(startStr.replace('U+', ''), 16);
            const end = parseInt(endStr.replace('U+', ''), 16);

            for (let i = start; i <= end; i++) {
                if (availableCodepoints.includes(i)) {
                    result.push(i);
                }
            }
        } else {
            // 处理单个字符 U+XXXX
            const codepoint = parseInt(range.replace('U+', ''), 16);
            if (availableCodepoints.includes(codepoint)) {
                result.push(codepoint);
            }
        }
    }

    return [...new Set(result)]; // 去重
}

function splitCodepoints(codepoints, strategy) {
    switch (strategy) {
        case 'single':
            return [codepoints];

        case 'byRange':
            return splitByUnicodeRange(codepoints);

        case 'byCount':
            const splitCount = parseInt(document.getElementById('splitCount').value);
            return splitByCharacterCount(codepoints, splitCount);

        default:
            return [codepoints];
    }
}

async function splitCodepointsAsync(codepoints, strategy) {
    if (strategy === 'byRange') {
        // 对于按范围分割，使用异步分批处理
        return await splitByUnicodeRangeAsync(codepoints);
    } else {
        // 其他策略使用原来的同步方法，但通过 setTimeout 延迟执行
        return new Promise((resolve) => {
            setTimeout(() => {
                const result = splitCodepoints(codepoints, strategy);
                resolve(result);
            }, 0);
        });
    }
}

// 异步版本的 Unicode 范围分割，避免阻塞主线程
async function splitByUnicodeRangeAsync(codepoints) {
    if (codepoints.length === 0) return [];

    console.log('开始按 Unicode 范围分割，字符数:', codepoints.length);
    
    return new Promise((resolve) => {
        // 先进行排序（对于大量数据，排序也可能阻塞，所以也异步处理）
        setTimeout(() => {
            const sortedCodepoints = [...codepoints].sort((a, b) => a - b);
            console.log('排序完成，开始分组');
            
            // 分批处理分组逻辑，避免阻塞主线程
            const groups = [];
            let currentGroup = [sortedCodepoints[0]];
            const blockSize = 1024;
            let processedCount = 1;
            const totalCount = sortedCodepoints.length;
            const batchSize = 1000; // 每批处理 1000 个码点
            
            function processBatch(startIndex) {
                const endIndex = Math.min(startIndex + batchSize, totalCount);
                
                for (let i = startIndex; i < endIndex; i++) {
                    const currentCodepoint = sortedCodepoints[i];
                    const lastCodepoint = currentGroup[currentGroup.length - 1];
                    
                    const currentBlock = Math.floor(currentCodepoint / blockSize);
                    const lastBlock = Math.floor(lastCodepoint / blockSize);
                    
                    // 如果码点连续或在同一 Unicode 块内，则放在同一组
                    if (currentCodepoint === lastCodepoint + 1 || currentBlock === lastBlock) {
                        currentGroup.push(currentCodepoint);
                    } else {
                        groups.push(currentGroup);
                        currentGroup = [currentCodepoint];
                    }
                    processedCount++;
                }
                
                // 如果还有未处理的数据，继续分批处理
                if (endIndex < totalCount) {
                    // 使用 setTimeout 让出主线程，避免阻塞
                    setTimeout(() => processBatch(endIndex), 0);
                } else {
                    // 处理完成，添加最后一组
                    if (currentGroup.length > 0) {
                        groups.push(currentGroup);
                    }
                    console.log('分割完成，组数:', groups.length);
                    resolve(groups);
                }
            }
            
            // 开始处理第一批
            processBatch(1);
        }, 0);
    });
}

// 保留同步版本作为备用（用于非异步场景）
function splitByUnicodeRange(codepoints) {
    if (codepoints.length === 0) return [];

    console.log('开始按 Unicode 范围分割，字符数:', codepoints.length);
    const sortedCodepoints = [...codepoints].sort((a, b) => a - b);
    const groups = [];
    let currentGroup = [sortedCodepoints[0]];

    for (let i = 1; i < sortedCodepoints.length; i++) {
        const currentCodepoint = sortedCodepoints[i];
        const lastCodepoint = currentGroup[currentGroup.length - 1];

        // 优化分组逻辑：使用更大的 Unicode 块范围（1024 个码点）
        const blockSize = 1024;
        const currentBlock = Math.floor(currentCodepoint / blockSize);
        const lastBlock = Math.floor(lastCodepoint / blockSize);

        // 如果码点连续或在同一 Unicode 块内，则放在同一组
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

    console.log('分割完成，组数:', groups.length);
    return groups;
}

function splitByCharacterCount(codepoints, maxCount) {
    const groups = [];
    for (let i = 0; i < codepoints.length; i += maxCount) {
        groups.push(codepoints.slice(i, i + maxCount));
    }
    return groups;
}

function createSubsetFont(codepoints, outputFormat) {
    return new Promise((resolve, reject) => {
        try {
            console.log('开始创建子集字体，字符数:', codepoints.length);

            if (!currentFont) {
                throw new Error('字体未加载');
            }

            // 创建码点集合，用于快速查找
            const codepointSet = new Set(codepoints);
            
            // 收集需要包含的字形
            const subsetGlyphs = [];
            const glyphIndexMap = new Map(); // 旧索引到新索引的映射
            
            // 必须包含的字形：.notdef (索引 0)
            const notdefGlyph = currentFont.glyphs.get(0);
            subsetGlyphs.push(notdefGlyph);
            glyphIndexMap.set(0, 0);
            
            // 遍历所有字形，找到匹配的码点
            // 对于大量字形，分批处理以避免阻塞
            const totalGlyphs = currentFont.glyphs.length;
            const batchSize = 1000; // 每批处理 1000 个字形
            
            function processBatch(startIndex) {
                const endIndex = Math.min(startIndex + batchSize, totalGlyphs);
                
                for (let i = startIndex; i < endIndex; i++) {
                    const glyph = currentFont.glyphs.get(i);
                    
                    // 检查字形是否有对应的 Unicode 码点
                    if (glyph.unicode !== undefined && codepointSet.has(glyph.unicode)) {
                        subsetGlyphs.push(glyph);
                        glyphIndexMap.set(i, subsetGlyphs.length - 1);
                    }
                }
                
                // 如果还有未处理的字形，继续分批处理
                if (endIndex < totalGlyphs) {
                    // 使用 setTimeout 让出主线程，避免阻塞
                    setTimeout(() => processBatch(endIndex), 0);
                } else {
                    // 所有字形处理完成，继续创建字体
                    console.log(`子集包含 ${subsetGlyphs.length} 个字形（原始字体有 ${totalGlyphs} 个字形）`);
                    createFontObject();
                }
            }
            
            // 开始处理第一批
            processBatch(1);
            
            function createFontObject() {
                // 使用 opentype.js 创建新的字体对象
                const fontFamily = currentFont.names.fontFamily ? currentFont.names.fontFamily.en : 'SubsetFont';
                const fullName = currentFont.names.fullName ? currentFont.names.fullName.en : fontFamily;
                
                console.log('正在创建字体对象...');
                
                // 创建新的字体对象
                const subsetFont = new opentype.Font({
                    familyName: fontFamily,
                    styleName: currentFont.names.fontSubfamily ? currentFont.names.fontSubfamily.en : 'Regular',
                    unitsPerEm: currentFont.unitsPerEm || 1000,
                    ascender: currentFont.ascender || 800,
                    descender: currentFont.descender || -200,
                    glyphs: subsetGlyphs
                });

                console.log('字体对象创建完成，开始导出为二进制数据...');
                
                // 将导出操作放在下一个事件循环中，避免阻塞
                setTimeout(() => {
                    try {
                        // 导出字体为二进制数据
                        let fontData;
                        
                        if (outputFormat === 'ttf') {
                            // 导出为 TTF 格式
                            fontData = subsetFont.toArrayBuffer();
                            console.log(`子集字体创建完成，TTF 大小: ${(fontData.byteLength / 1024).toFixed(2)} KB`);
            } else if (outputFormat === 'otf') {
                // opentype.js 不支持直接导出 OTF，导出为 TTF
                console.warn(i18nManager.t('otfNotSupported'));
                fontData = subsetFont.toArrayBuffer();
                        } else {
                // WOFF/WOFF2 格式需要额外的转换库
                // 暂时导出为 TTF，然后提示用户
                console.warn(i18nManager.t('woff2NotSupported'));
                fontData = subsetFont.toArrayBuffer();
                        }

                        resolve(fontData);
                    } catch (error) {
                        console.error('导出字体失败:', error);
                        reject(error);
                    }
                }, 0);
            }

        } catch (error) {
            console.error('创建子集字体失败:', error);
            console.error('错误详情:', error.stack);
            
            // 如果子集化失败，返回原始字体作为降级方案
            console.warn('使用原始字体作为降级方案');
            const fontData = new Uint8Array(fontBuffer);
            resolve(fontData.buffer);
        }
    });
}

function generateCSS(fontFiles, format, fontWeight, fontStyle) {
    const fontFamily = fontInfo ? fontInfo.familyName : 
                      (currentFont && currentFont.names.fontFamily ? currentFont.names.fontFamily.en : 'SubsetFont');
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

function generateUnicodeRange(codepoints) {
    if (codepoints.length === 0) return 'U+0000-FFFF';

    // 对码点进行排序
    const sortedCodepoints = [...codepoints].sort((a, b) => a - b);

    // 生成 Unicode range
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

    // 添加最后一个范围
    if (start === end) {
        ranges.push(`U+${start.toString(16).toUpperCase().padStart(4, '0')}`);
    } else {
        ranges.push(`U+${start.toString(16).toUpperCase().padStart(4, '0')}-${end.toString(16).toUpperCase().padStart(4, '0')}`);
    }

    return ranges.join(', ');
}

function generateFileInfo(fontFiles) {
    let totalChars = 0;
    const fileList = [];

    fontFiles.forEach((file, index) => {
        const charCount = file.codepoints.length;
        totalChars += charCount;
        const unicodeRange = generateUnicodeRange(file.codepoints);

        fileList.push({
            name: `${fontFileName}-subset-${index + 1}`,
            charCount: charCount,
            unicodeRange: unicodeRange
        });
    });

    return {
        fileCount: fontFiles.length,
        totalChars: totalChars,
        files: fileList
    };
}

// HTML 转义函数
function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 生成 demo HTML 文件
function generateDemoHTML(fontFamily, fontWeight, fontStyle, fileInfo) {
    // 生成示例文本（根据字符范围）
    let sampleText = '';
    let sampleTextZh = '';
    let sampleTextEn = '';
    
    // 尝试从文件信息中提取一些示例字符
    if (fileInfo && fileInfo.files && fileInfo.files.length > 0) {
        // 使用第一个文件的 Unicode 范围作为参考
        const firstFile = fileInfo.files[0];
        if (firstFile.unicodeRange) {
            // 检查是否包含中文字符
            if (firstFile.unicodeRange.includes('4E00') || firstFile.unicodeRange.includes('9FFF') || 
                firstFile.unicodeRange.includes('3400') || firstFile.unicodeRange.includes('4DBF')) {
                sampleTextZh = '字体子集化演示 - 中文字符示例：你好世界，这是一段测试文本。';
            }
            // 检查是否包含拉丁字符
            if (firstFile.unicodeRange.includes('0020') || firstFile.unicodeRange.includes('007E') ||
                firstFile.unicodeRange.includes('00A0') || firstFile.unicodeRange.includes('00FF')) {
                sampleTextEn = 'Font Subset Demo - English Sample: The quick brown fox jumps over the lazy dog. 0123456789';
            }
        }
    }
    
    // 如果没有检测到，使用默认文本
    if (!sampleTextZh && !sampleTextEn) {
        sampleTextEn = 'Font Subset Demo - Sample Text: ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789';
        sampleTextZh = '字体子集化演示 - 中文字符示例';
    }
    
    sampleText = sampleTextEn + (sampleTextZh ? '\n' + sampleTextZh : '');
    
    // 转义 HTML 特殊字符
    const escapedSampleText = escapeHTML(sampleText);
    const escapedFontFamily = escapeHTML(fontFamily);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>字体子集演示 - ${escapedFontFamily}</title>
    <link rel="stylesheet" href="styles/font.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: '${escapedFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-weight: ${fontWeight};
            font-style: ${fontStyle};
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: ${fontWeight};
        }
        
        .header p {
            font-size: 1.2em;
            opacity: 0.9;
        }
        
        .content {
            padding: 40px;
        }
        
        .section {
            margin-bottom: 40px;
        }
        
        .section h2 {
            font-size: 1.8em;
            margin-bottom: 20px;
            color: #667eea;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        
        .demo-text {
            font-size: 1.5em;
            line-height: 1.8;
            padding: 30px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #667eea;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .info-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .info-card h3 {
            color: #667eea;
            margin-bottom: 10px;
            font-size: 1.2em;
        }
        
        .info-card p {
            color: #666;
            line-height: 1.6;
        }
        
        .sizes {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-top: 20px;
        }
        
        .size-demo {
            flex: 1;
            min-width: 200px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            text-align: center;
        }
        
        .size-demo .size-label {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 10px;
        }
        
        .size-12 { font-size: 12px; }
        .size-16 { font-size: 16px; }
        .size-24 { font-size: 24px; }
        .size-32 { font-size: 32px; }
        .size-48 { font-size: 48px; }
        .size-64 { font-size: 64px; }
        
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 0.9em;
        }
        
        @media (max-width: 768px) {
            .header h1 {
                font-size: 1.8em;
            }
            
            .demo-text {
                font-size: 1.2em;
            }
            
            .content {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${fontFamily}</h1>
            <p>字体子集化演示页面</p>
        </div>
        
        <div class="content">
            <div class="section">
                <h2>字体预览</h2>
                <div class="demo-text">${escapedSampleText}</div>
            </div>
            
            <div class="section">
                <h2>不同字号展示</h2>
                <div class="sizes">
                    <div class="size-demo">
                        <div class="size-label">12px</div>
                        <div class="size-12">字体示例 Text Sample</div>
                    </div>
                    <div class="size-demo">
                        <div class="size-label">16px</div>
                        <div class="size-16">字体示例 Text Sample</div>
                    </div>
                    <div class="size-demo">
                        <div class="size-label">24px</div>
                        <div class="size-24">字体示例 Text Sample</div>
                    </div>
                    <div class="size-demo">
                        <div class="size-label">32px</div>
                        <div class="size-32">字体示例 Text Sample</div>
                    </div>
                    <div class="size-demo">
                        <div class="size-label">48px</div>
                        <div class="size-48">字体示例</div>
                    </div>
                    <div class="size-demo">
                        <div class="size-label">64px</div>
                        <div class="size-64">字体示例</div>
                    </div>
                </div>
            </div>
            
            <div class="section">
                <h2>字体信息</h2>
                <div class="info-grid">
                    <div class="info-card">
                        <h3>字体家族</h3>
                        <p>${escapedFontFamily}</p>
                    </div>
                    <div class="info-card">
                        <h3>字体粗细</h3>
                        <p>${fontWeight}</p>
                    </div>
                    <div class="info-card">
                        <h3>字体样式</h3>
                        <p>${fontStyle}</p>
                    </div>
                    <div class="info-card">
                        <h3>文件数量</h3>
                        <p>${fileInfo.fileCount} 个子集文件</p>
                    </div>
                    <div class="info-card">
                        <h3>总字符数</h3>
                        <p>${fileInfo.totalChars} 个字符</p>
                    </div>
                </div>
            </div>
            
            <div class="section">
                <h2>使用方法</h2>
                <div class="info-card">
                    <h3>在您的项目中使用</h3>
                    <p style="margin-top: 10px;">
                        1. 将 <code>fonts</code> 和 <code>styles</code> 文件夹复制到您的项目中<br>
                        2. 在 HTML 中引入 CSS 文件：<code>&lt;link rel="stylesheet" href="styles/font.css"&gt;</code><br>
                        3. 使用字体：<code>font-family: '${escapedFontFamily}';</code>
                    </p>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>由字体子集化工具生成 | 生成时间: ${new Date().toLocaleString('zh-CN')}</p>
        </div>
    </div>
</body>
</html>`;
}

function displayResults(cssCode, fileInfo, fontFiles) {
    try {
        // 安全地获取和设置 DOM 元素，添加空值检查
        const cssCodeEl = document.getElementById('cssCode');
        if (!cssCodeEl) {
            console.error('找不到 cssCode 元素');
            return;
        }
        cssCodeEl.textContent = cssCode || '';

        // 显示文件信息
        const fileCountEl = document.getElementById('fileCount');
        const totalCharsEl = document.getElementById('totalChars');
        if (fileCountEl) {
            fileCountEl.textContent = fileInfo.fileCount || 0;
        } else {
            console.warn('找不到 fileCount 元素');
        }
        if (totalCharsEl) {
            totalCharsEl.textContent = fileInfo.totalChars || 0;
        } else {
            console.warn('找不到 totalChars 元素');
        }

        // 显示文件列表
        const fileListElement = document.getElementById('fileList');
        if (!fileListElement) {
            console.error('找不到 fileList 元素');
            return;
        }
        fileListElement.innerHTML = '';

        if (fileInfo.files && Array.isArray(fileInfo.files)) {
            fileInfo.files.forEach(file => {
                try {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    fileItem.innerHTML = `
                        <strong>${file.name || '未知文件'}</strong><br>
                        ${i18nManager.t('charCount')}: ${file.charCount || 0}<br>
                        ${i18nManager.t('unicodeRange')}: ${file.unicodeRange || 'N/A'}
                    `;
                    fileListElement.appendChild(fileItem);
                } catch (e) {
                    console.warn('添加文件项失败:', e, file);
                }
            });
        }
        
        // 更新结果摘要的国际化
        const resultSummary = document.querySelector('.result-summary p');
        if (resultSummary && resultSummary.isConnected) {
            try {
                resultSummary.setAttribute('data-i18n-params', JSON.stringify({
                    fileCount: fileInfo.fileCount || 0,
                    totalChars: fileInfo.totalChars || 0
                }));
                // 只更新结果摘要元素，避免更新整个页面时出错
                const summaryKey = resultSummary.getAttribute('data-i18n');
                if (summaryKey && resultSummary.isConnected) {
                    const params = JSON.parse(resultSummary.getAttribute('data-i18n-params') || '{}');
                    resultSummary.textContent = i18nManager.t(summaryKey, params);
                }
            } catch (e) {
                console.warn('更新结果摘要失败:', e);
            }
        }

        // 保存字体文件到全局变量
        window.fontFiles = fontFiles;
        window.fileInfo = fileInfo;

        // 显示结果区域
        const resultSection = document.getElementById('resultSection');
        if (!resultSection) {
            console.error('找不到 resultSection 元素');
            return;
        }
        resultSection.style.display = 'block';

        // 滚动到结果区域
        try {
            resultSection.scrollIntoView({
                behavior: 'smooth'
            });
        } catch (e) {
            // 如果 scrollIntoView 不支持，使用降级方案
            console.warn('scrollIntoView 不支持，使用降级方案:', e);
            try {
                window.scrollTo(0, resultSection.offsetTop);
            } catch (e2) {
                console.warn('滚动失败:', e2);
            }
        }
    } catch (error) {
        console.error('displayResults 函数执行失败:', error);
        // 即使出错，也尝试保存数据
        try {
            window.fontFiles = fontFiles;
            window.fileInfo = fileInfo;
        } catch (e) {
            console.error('保存数据失败:', e);
        }
        // 显示错误提示
        alert(i18nManager.t('displayResultsError', { error: error.message }));
    }
}

function showLoading(show, progress = 0) {
    const loading = document.getElementById('loading');
    const generateBtn = document.getElementById('generateBtn');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    if (show) {
        loading.style.display = 'flex';
        generateBtn.disabled = true;
        generateBtn.textContent = i18nManager.t('processing');

        if (progressBar && progressText) {
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
        }
    } else {
        loading.style.display = 'none';
        generateBtn.disabled = false;
        generateBtn.textContent = i18nManager.t('generateBtn');

        if (progressBar && progressText) {
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
        }
        setProcessingDetail();
    }
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;

    navigator.clipboard.writeText(text).then(() => {
        alert(i18nManager.t('copied'));
    }).catch(err => {
        console.error('复制失败:', err);
        alert(i18nManager.t('copyFailed'));
    });
}

async function downloadPackage() {
    if (!window.fontFiles) {
        alert(i18nManager.t('generateFirst'));
        return;
    }

    const outputFormat = document.getElementById('outputFormat').value;
    const cssCode = document.getElementById('cssCode').textContent;
    const downloadBtn = document.getElementById('downloadBtn');

    // 显示加载状态
    const originalText = downloadBtn.textContent;
    downloadBtn.disabled = true;
    downloadBtn.textContent = i18nManager.t('packing');

    try {
        console.log('开始创建 ZIP 文件...');
        const zip = new JSZip();
        setProcessingDetail('packagingFiles');

        // 分批添加字体文件，避免一次性处理太多文件导致阻塞
        const totalFiles = window.fontFiles.length;
        console.log(`准备添加 ${totalFiles} 个字体文件`);

        // 使用异步方式添加文件，每批处理几个文件后让出主线程
        // 根据文件数量动态调整批次大小
        const batchSize = totalFiles > 100 ? 5 : 10; // 文件多时使用更小的批次
        
        for (let i = 0; i < totalFiles; i += batchSize) {
            const endIndex = Math.min(i + batchSize, totalFiles);
            
            // 添加当前批次的文件
            for (let j = i; j < endIndex; j++) {
                const file = window.fontFiles[j];
                // 直接使用 buffer，避免创建额外的 Blob（如果可能）
                zip.file(`fonts/${fontFileName}-subset-${j + 1}.${outputFormat}`, file.buffer);
            }
            
            // 更新进度
            const progress = Math.floor((endIndex / totalFiles) * 50); // 文件添加占 50% 进度
            downloadBtn.textContent = `${i18nManager.t('packing')} ${progress}%`;
            
            // 让出主线程，避免阻塞
            // 使用 requestIdleCallback 如果可用，否则使用 setTimeout
            if (endIndex < totalFiles) {
                if (window.requestIdleCallback) {
                    await new Promise(resolve => {
                        requestIdleCallback(() => resolve(), { timeout: 10 });
                    });
                } else {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
        }

        console.log('字体文件添加完成，添加 CSS 和 README...');

        // 添加 CSS 文件
        zip.file('styles/font.css', cssCode);

        // 生成 demo HTML 文件
        const fontFamilyName = fontInfo ? fontInfo.familyName : 
                              (currentFont && currentFont.names.fontFamily ? currentFont.names.fontFamily.en : 'SubsetFont');
        const fontWeight = document.getElementById('fontWeight').value;
        const fontStyle = document.getElementById('fontStyle').value;
        const demoHTML = generateDemoHTML(fontFamilyName, fontWeight, fontStyle, window.fileInfo);
        zip.file('index.html', demoHTML);

        // 添加说明文件
        const readme = `字体子集化工具生成的文件

包含内容：
- fonts/: ${window.fileInfo.fileCount} 个子集字体文件
- styles/font.css: CSS 样式定义
- index.html: 字体预览演示页面

文件详情：
${window.fileInfo.files.map(file => `- ${file.name}.${outputFormat}: ${file.charCount} 个字符 (${file.unicodeRange})`).join('\n')}

总字符数: ${window.fileInfo.totalChars}

使用方法：
1. 将 fonts 和 styles 文件夹放入项目
2. 在 HTML 中引入 styles/font.css
3. 使用 font-family: '${fontFamilyName}'
4. 或者直接打开 index.html 查看演示效果`;

        zip.file('README.txt', readme);

        downloadBtn.textContent = `${i18nManager.t('generatingZip')} 50%`;

        // 生成 ZIP 文件，使用进度回调显示进度
        console.log('开始生成 ZIP 文件...');
        const startTime = performance.now();
        
        // 使用较低的压缩级别以提高速度，减少阻塞时间
        // 对于字体文件，压缩率已经很高，使用较低级别可以显著提高速度
        setProcessingDetail('zipGenerating');
        addLog('zipGenerating');
        const content = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 3 // 使用较低压缩级别（1-9），提高速度，减少阻塞
            }
        }, (metadata) => {
            // 更新进度（生成 ZIP 占 50% 进度）
            if (metadata && metadata.percent !== undefined) {
                const progress = 50 + Math.floor(metadata.percent / 2);
                downloadBtn.textContent = `${i18nManager.t('generatingZip')} ${progress}%`;
            }
        });

        const endTime = performance.now();
        console.log(`ZIP 文件生成完成，耗时: ${(endTime - startTime).toFixed(2)}ms`);
        addLog('zipComplete', { duration: `${(endTime - startTime).toFixed(2)}ms` }, 'success');

        downloadBtn.textContent = i18nManager.t('downloading');

        // 下载文件
        saveAs(content, `${fontFileName}-subset-package.zip`);
        
        console.log('下载完成！');
        addLog('downloadComplete', {}, 'success');
        setProcessingDetail();
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;

    } catch (error) {
        console.error('打包失败:', error);
        addLog('packageError', { error: error.message }, 'error');
        alert(i18nManager.t('packageError', { error: error.message }));
        setProcessingDetail();
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;
    }
}

// 将函数暴露到全局作用域，以便 HTML 中的 onclick 可以访问
window.generateSubset = generateSubset;
window.copyToClipboard = copyToClipboard;
window.downloadPackage = downloadPackage;
