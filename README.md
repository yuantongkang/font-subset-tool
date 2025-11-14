# 字体子集化工具

一个基于 Web 技术的字体子集化工具，使用 WASM 技术处理字体文件，生成优化的子集字体和对应的 CSS 文件。

## 功能特性

- 🎯 **字体子集化**: 根据输入的字符生成只包含所需字符的字体文件
- 🎨 **实时预览**: 上传字体后实时预览字体效果
- 📊 **Unicode Range**: 自动生成优化的 Unicode Range
- 💾 **多种格式**: 支持 TTF、OTF、WOFF、WOFF2 格式
- 📦 **完整包下载**: 一键下载包含字体、CSS 和说明文件的压缩包
- 📱 **响应式设计**: 适配桌面和移动设备

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **字体处理**: [opentype.js](https://opentype.js.org/) - 专业的字体解析和操作库
- **文件处理**: [JSZip](https://stuk.github.io/jszip/) - 客户端 ZIP 文件生成
- **文件保存**: [FileSaver.js](https://github.com/eligrey/FileSaver.js/) - 客户端文件保存

## 使用方法

### 1. 上传字体文件
- 拖放字体文件到上传区域，或点击"选择文件"按钮
- 支持 TTF、OTF、WOFF、WOFF2 格式

### 2. 预览字体
- 在预览文本框中输入要预览的文本
- 调整字体粗细和样式查看效果

### 3. 配置子集
- 选择子集策略：
  - **包含所有字符**: 使用字体中的所有字符
  - **常用字符**: 仅包含字母、数字和标点符号
  - **中文字符**: 仅包含中文字符
  - **自定义字符范围**: 手动指定 Unicode 范围
- 选择分割策略：
  - **单个文件**: 所有字符在一个文件中
  - **按 Unicode 范围分割**: 智能按 Unicode 块分割
  - **按字符数量分割**: 按指定字符数分割成多个文件
- 选择输出格式（推荐 WOFF2）
- 配置字体粗细和样式

### 4. 生成子集
- 点击"生成子集字体"按钮
- 等待处理完成

### 5. 下载结果
- 复制生成的 CSS 和 Unicode Range
- 点击"下载完整包"获取包含所有文件的 ZIP 包

## 生成的文件

下载的 ZIP 包包含：

```
font-subset-package.zip
├── fonts/
│   ├── [字体名称]-subset-1.[格式]
│   ├── [字体名称]-subset-2.[格式]
│   └── ... (多个分割文件)
├── styles/
│   └── font.css
└── README.txt
```

每个字体文件都包含：
- 文件名：`[字体名称]-subset-[序号].[格式]`
- 字符数：每个文件包含的字符数量
- Unicode Range：文件包含的字符范围

## 浏览器兼容性

由于使用了 **Import Maps** 和 **ES 模块**，需要以下浏览器版本：

- Chrome 89+ (支持 Import Maps)
- Edge 89+
- Safari 16.4+
- Firefox 108+

对于不支持 Import Maps 的旧版浏览器，可以使用 [es-module-shims](https://github.com/guybedford/es-module-shims) polyfill。

## GitHub Actions 使用

本项目支持通过 GitHub Actions 自动处理字体子集化。Fork 本仓库后，即可使用 GitHub Actions 功能。

### 使用方法

1. **Fork 本仓库**到你的 GitHub 账号

2. **运行 Actions**：
   - 进入仓库的 "Actions" 标签页
   - 选择 "Font Subset Processing" 工作流
   - 点击 "Run workflow" 按钮
   - 填写以下参数：
     - **font_url** (必填): 字体文件的下载 URL
     - **split_strategy** (可选): 分割策略
       - `single`: 单个文件（默认）
       - `byRange`: 按 Unicode 范围分割
       - `byCount`: 按字符数量分割
     - **subset_strategy** (可选): 子集策略
       - `all`: 包含所有字符（默认）
       - `common`: 仅常用字符（字母、数字、标点）
       - `chinese`: 仅中文字符
       - `custom`: 自定义 Unicode 范围
     - **output_format** (可选): 输出格式
       - `ttf`, `otf`, `woff`, `woff2` (默认: `woff2`)
     - **split_count** (可选): 使用 `byCount` 策略时，每个文件的字符数（默认: 1000）
     - **custom_range** (可选): 自定义 Unicode 范围，格式如 `U+4E00-9FFF,U+0020-007E`
     - **font_weight** (可选): 字体粗细，100-900（默认: 400）
     - **font_style** (可选): 字体样式，`normal` 或 `italic`（默认: `normal`）

3. **下载结果**：
   - 工作流运行完成后，在 Actions 页面下载 Artifacts
   - `font-subset-package`: 包含完整的 ZIP 压缩包
   - `font-subset-output`: 包含单独的字体文件和 CSS 文件

### 示例

**示例 1: 处理中文字体，按 Unicode 范围分割**
```
font_url: https://example.com/font.ttf
split_strategy: byRange
subset_strategy: chinese
output_format: woff2
```

**示例 2: 处理常用字符，按数量分割**
```
font_url: https://example.com/font.ttf
split_strategy: byCount
subset_strategy: common
split_count: 500
output_format: woff2
```

**示例 3: 自定义 Unicode 范围**
```
font_url: https://example.com/font.ttf
split_strategy: single
subset_strategy: custom
custom_range: U+4E00-9FFF,U+0020-007E
output_format: woff2
```

## 项目结构

```
font-subset-tool/
├── index.html              # 主页面
├── style.css               # 样式文件
├── app.js                  # 主要逻辑
├── process-font.js         # GitHub Actions 处理脚本
├── package.json            # Node.js 依赖配置
├── .github/
│   └── workflows/
│       └── font-subset.yml # GitHub Actions 工作流
└── README.md               # 项目说明
```

## 开发说明

### 本地运行

1. 克隆或下载项目文件
2. 使用本地服务器运行（推荐）：
   ```bash
   # 使用 Python
   python -m http.server 8000

   # 使用 Node.js
   npx serve .

   # 使用 PHP
   php -S localhost:8000
   ```
3. 在浏览器中访问 `http://localhost:8000`

### 依赖库

**Web 版本**使用 **Import Maps** 来管理依赖，通过 ES 模块方式导入：

- [opentype.js](https://opentype.js.org/) - 字体解析和操作
- [JSZip](https://stuk.github.io/jszip/) - ZIP 文件生成
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) - 文件保存

依赖通过 `esm.sh` CDN 以 ES 模块格式提供，无需构建工具即可使用。

**GitHub Actions 版本**使用 Node.js 和 npm 管理依赖：

- [opentype.js](https://opentype.js.org/) - 字体解析和操作
- [archiver](https://www.npmjs.com/package/archiver) - ZIP 文件生成

安装依赖：
```bash
npm install
```

## 注意事项

1. **字体版权**: 请确保您有权使用和修改上传的字体文件
2. **文件大小**: 大字体文件可能需要较长的处理时间
3. **浏览器限制**: 某些浏览器可能对文件大小有限制
4. **字体格式**: WOFF2 格式通常提供最佳的压缩效果

## 技术实现细节

### 字体解析
使用 opentype.js 库解析字体文件，获取字体信息和字符映射。

### 子集化算法
1. 提取用户输入的字符
2. 获取字符的 Unicode 码点
3. 创建只包含这些字符的新字体文件
4. 生成优化的 Unicode Range

### 性能优化
- 使用 Web Workers 处理大字体文件
- 实现渐进式加载和进度显示
- 优化内存使用和垃圾回收

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个工具。