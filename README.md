# 乘风文档扫描 / inWind Docs Scan

轻量 Web 版文档扫描工具。目标是把“上传图片 / 拍照 → 扫描增强 → 多页管理 → 导出图片或 PDF”放在浏览器本地完成。

## 功能

- 上传多张图片
- 拍摄或选择图片导入
- 多页预览、排序、删除
- 原图、清晰、灰度、增强、黑白滤镜
- 自动裁切与透视矫正
- 手动四角边框调整：自动识别效果不佳时可拖动四角后透视矫正
- 单页左转 / 右转，以及页面列表中的快捷左转 / 右转
- 当前页 JPG 导出
- 多页 PDF 导出
- 浏览器本地处理，不主动上传文件

## 技术栈

- React + TypeScript + Vite
- 浏览器端文档裁切与透视矫正
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

1. OCR / Searchable PDF：可接入 `tesseract.js` 或服务端 OCR。
2. 离线裁切组件：将裁切依赖自托管，减少外部资源依赖。
3. PDF 压缩策略：按 A4 目标尺寸降采样，控制移动端内存和文件体积。
4. PWA：加入安装、离线缓存和移动端分享入口。
