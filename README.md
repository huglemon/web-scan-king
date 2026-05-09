# Web Scan King

轻量 Web 版文档扫描工具。目标是把“上传图片 / 拍照 → 扫描增强 → 多页管理 → 导出图片或 PDF”放在浏览器本地完成。

## 功能

- 上传多张图片
- 调用摄像头拍摄页面
- 多页预览、排序、删除
- 原图、清晰、灰度、增强、黑白滤镜
- 自动裁切与透视矫正入口：`jscanify + OpenCV.js`
- 当前页 JPG 导出
- 多页 PDF 导出：`jsPDF` 按需加载
- 浏览器本地处理，不主动上传文件

## 技术栈

- React + TypeScript + Vite
- jscanify / OpenCV.js
- jsPDF
- lucide-react
- Vitest + Testing Library

## 本地运行

```bash
npm install
npm run dev -- --host 127.0.0.1
```

默认地址：

```text
http://127.0.0.1:5173/
```

## 验证命令

```bash
npm run test -- --run
npm run lint
npm run build
```

## 后续迭代建议

1. 手动四角点调整：给自动识别失败的页面提供可拖拽角点。
2. OCR / Searchable PDF：可接入 `tesseract.js` 或服务端 OCR。
3. 离线 OpenCV：将 `opencv.js` 自托管到 `public/vendor/opencv/`，减少 CDN 依赖。
4. PDF 压缩策略：按 A4 目标尺寸降采样，控制移动端内存和文件体积。
5. PWA：加入安装、离线缓存和移动端分享入口。
