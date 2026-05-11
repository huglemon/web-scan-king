import type {
  ChangeEvent,
  DragEvent,
  PointerEvent as ReactPointerEvent,
  UIEvent,
} from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Camera,
  X,
  Crop,
  Download,
  FileDown,
  FileImage,
  ImagePlus,
  Layers3,
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  ScanLine,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import './App.css'
import {
  calculateContainedFrameSize,
  type FrameSize,
  type FrameEdgeKey,
  mapClientPointToImagePoint,
  moveFrameEdge,
} from './lib/frame'
import {
  DEFAULT_ENHANCE_STRENGTH,
  FILTER_PRESETS,
  type ScanFilterId,
  createPageName,
  downloadBlob,
  downloadDataUrl,
  filterSupportsEnhanceStrength,
  formatBytes,
  getFilterPreset,
  loadImage,
  normalizeEnhanceStrength,
  normalizeRotation,
  readFileAsDataUrl,
  renderImageVariant,
} from './lib/image'
import { createPagesPdfBlob, exportPagesToPdf } from './lib/pdf'
import {
  autoExtractDocument,
  type CornerKey,
  type CornerPoint,
  type CornerPoints,
  isOpenCvReady,
  loadOpenCv,
  manualExtractDocument,
} from './lib/scan'
import { createZipFromDataUrls } from './lib/zip'

type ScanPage = {
  id: string
  name: string
  originalDataUrl: string
  baseDataUrl: string
  outputDataUrl: string
  sourceSize: number
  originalWidth: number
  originalHeight: number
  width: number
  height: number
  filter: ScanFilterId
  enhanceStrength: number
  rotation: number
  scanned: boolean
  cropCorners?: CornerPoints
}

type BusyState = {
  pageId?: string
  label: string
}

type DraftStrengthState = {
  pageId: string
  filter: ScanFilterId
  value: number
} | null

type PdfPreviewState = {
  url: string
  fileName: string
} | null

type MobileToolTab = 'quick' | 'filters' | 'pages' | 'export'
type FrameDragState =
  | { type: 'corner'; corner: CornerKey }
  | {
      type: 'edge'
      edge: FrameEdgeKey
      startPoint: CornerPoint
      startCorners: CornerPoints
    }

const DEFAULT_FILTER: ScanFilterId = 'clean'
const MOBILE_FILTER_IDS = new Set<ScanFilterId>([
  'original',
  'clean',
  'gray',
  'contrast',
  'mono',
])
const MOBILE_FILTER_PRESETS = FILTER_PRESETS.filter((preset) =>
  MOBILE_FILTER_IDS.has(preset.id),
)
const IS_WECHAT_BROWSER =
  /MicroMessenger/i.test(globalThis.navigator?.userAgent ?? '')

const CORNERS: Array<{ key: CornerKey; label: string }> = [
  { key: 'topLeftCorner', label: '左上角' },
  { key: 'topRightCorner', label: '右上角' },
  { key: 'bottomRightCorner', label: '右下角' },
  { key: 'bottomLeftCorner', label: '左下角' },
]
const FRAME_EDGES: Array<{
  key: FrameEdgeKey
  label: string
  from: CornerKey
  to: CornerKey
}> = [
  { key: 'topEdge', label: '上边', from: 'topLeftCorner', to: 'topRightCorner' },
  {
    key: 'rightEdge',
    label: '右边',
    from: 'topRightCorner',
    to: 'bottomRightCorner',
  },
  {
    key: 'bottomEdge',
    label: '下边',
    from: 'bottomLeftCorner',
    to: 'bottomRightCorner',
  },
  { key: 'leftEdge', label: '左边', from: 'topLeftCorner', to: 'bottomLeftCorner' },
]

function App() {
  const [pages, setPages] = useState<ScanPage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyState | null>(null)
  const [notice, setNotice] = useState('导入图片后即可开始处理')
  const [autoCropOnImport, setAutoCropOnImport] = useState(false)
  const [mobileToolTab, setMobileToolTab] = useState<MobileToolTab>('quick')
  const [mobilePreviewIndex, setMobilePreviewIndex] = useState(0)
  const [frameEditorPageId, setFrameEditorPageId] = useState<string | null>(
    null,
  )
  const [draftCorners, setDraftCorners] = useState<CornerPoints | null>(null)
  const [frameDrag, setFrameDrag] = useState<FrameDragState | null>(null)
  const [frameImageSize, setFrameImageSize] = useState<FrameSize | null>(null)
  const [draftStrength, setDraftStrength] = useState<DraftStrengthState>(null)
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const frameCanvasRef = useRef<HTMLDivElement>(null)
  const frameImageRef = useRef<HTMLDivElement>(null)
  const mobilePreviewRef = useRef<HTMLDivElement>(null)

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedId) ?? pages[0] ?? null,
    [pages, selectedId],
  )
  const selectedIndex = selectedPage
    ? pages.findIndex((page) => page.id === selectedPage.id)
    : -1
  const mobileDisplayIndex =
    mobilePreviewIndex >= pages.length ? pages.length : selectedIndex
  const totalSize = pages.reduce((sum, page) => sum + page.sourceSize, 0)
  const isFrameEditing = Boolean(
    selectedPage &&
      draftCorners &&
      selectedPage.id === frameEditorPageId &&
      !busy,
  )
  const selectedPreset = selectedPage
    ? getFilterPreset(selectedPage.filter)
    : null
  const showEnhanceStrength = selectedPage
    ? filterSupportsEnhanceStrength(selectedPage.filter)
    : false
  const activeDraftStrength =
    draftStrength &&
    selectedPage &&
    draftStrength.pageId === selectedPage.id &&
    draftStrength.filter === selectedPage.filter
      ? draftStrength.value
      : null
  const visibleEnhanceStrength =
    activeDraftStrength ??
    selectedPage?.enhanceStrength ??
    DEFAULT_ENHANCE_STRENGTH

  useEffect(() => {
    return () => {
      if (pdfPreview?.url) {
        URL.revokeObjectURL(pdfPreview.url)
      }
    }
  }, [pdfPreview?.url])

  useEffect(() => {
    const preview = mobilePreviewRef.current

    if (!preview || selectedIndex < 0 || isFrameEditing) {
      return
    }

    preview.scrollTo({
      left: preview.clientWidth * selectedIndex,
      behavior: 'auto',
    })
    setMobilePreviewIndex(selectedIndex)
  }, [selectedIndex, pages.length, isFrameEditing])

  useEffect(() => {
    if (!isFrameEditing || !selectedPage) {
      return
    }

    const canvas = frameCanvasRef.current

    if (!canvas) {
      return
    }

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect()
      const size = calculateContainedFrameSize(
        rect.width,
        rect.height,
        selectedPage.originalWidth,
        selectedPage.originalHeight,
      )

      setFrameImageSize((current) =>
        current &&
        size &&
        Math.abs(current.width - size.width) < 0.5 &&
        Math.abs(current.height - size.height) < 0.5
          ? current
          : size,
      )
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(canvas)
    window.addEventListener('resize', updateSize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [
    isFrameEditing,
    selectedPage,
    selectedPage?.originalWidth,
    selectedPage?.originalHeight,
  ])

  async function addImagePage(dataUrl: string, name: string, sourceSize = 0) {
    const image = await loadImage(dataUrl)
    const originalWidth = image.naturalWidth || image.width
    const originalHeight = image.naturalHeight || image.height
    const rendered = await renderImageVariant(dataUrl, DEFAULT_FILTER)
    const page: ScanPage = {
      id: createId(),
      name,
      originalDataUrl: dataUrl,
      baseDataUrl: dataUrl,
      outputDataUrl: rendered.dataUrl,
      sourceSize,
      originalWidth,
      originalHeight,
      width: rendered.width,
      height: rendered.height,
      filter: DEFAULT_FILTER,
      enhanceStrength: DEFAULT_ENHANCE_STRENGTH,
      rotation: 0,
      scanned: false,
    }

    setPages((current) => [...current, page])
    setSelectedId(page.id)
    setNotice(`已添加 ${name}`)
    return page
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    await importFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  async function handleCameraFiles(event: ChangeEvent<HTMLInputElement>) {
    await importFiles(Array.from(event.target.files ?? []), '拍摄页')
    event.target.value = ''
  }

  async function importFiles(inputFiles: File[], fallbackName = '扫描页') {
    const files = inputFiles.filter((file) => file.type.startsWith('image/'))

    if (files.length === 0) {
      setNotice('请选择 JPG、PNG、WebP 等图片文件')
      return
    }

    setBusy({ label: `正在导入 ${files.length} 张图片` })

    try {
      const importedPages: ScanPage[] = []

      for (const [index, file] of files.entries()) {
        const dataUrl = await readFileAsDataUrl(file)
        const page = await addImagePage(
          dataUrl,
          createPageName(pages.length + index, file.name || fallbackName),
          file.size,
        )
        importedPages.push(page)
      }

      if (autoCropOnImport) {
        const result = await autoCropPages(importedPages)

        if (result.failed > 0) {
          setNotice(
            `已导入 ${files.length} 张，其中 ${result.completed} 张完成自动裁切`,
          )
          return
        }

        setNotice(`导入并自动裁切完成：${files.length} 张图片`)
        return
      }

      setNotice(`导入完成：${files.length} 张图片`)
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    await importFiles(Array.from(event.dataTransfer.files))
  }

  function handleMobilePreviewScroll(event: UIEvent<HTMLDivElement>) {
    const { clientWidth, scrollLeft } = event.currentTarget

    if (clientWidth <= 0 || pages.length === 0 || isFrameEditing) {
      return
    }

    const nextIndex = Math.min(
      pages.length,
      Math.max(0, Math.round(scrollLeft / clientWidth)),
    )
    setMobilePreviewIndex(nextIndex)

    const nextPage = nextIndex < pages.length ? pages[nextIndex] : null

    if (nextPage && nextPage.id !== selectedId) {
      setSelectedId(nextPage.id)
    }
  }

  async function applyVariant(
    page: ScanPage,
    updates: Partial<
      Pick<ScanPage, 'baseDataUrl' | 'filter' | 'rotation' | 'enhanceStrength'>
    >,
  ) {
    const nextBase = updates.baseDataUrl ?? page.baseDataUrl
    const nextFilter = updates.filter ?? page.filter
    const nextRotation = updates.rotation ?? page.rotation
    const nextStrength = normalizeEnhanceStrength(
      updates.enhanceStrength ?? page.enhanceStrength,
    )
    const rendered = await renderImageVariant(
      nextBase,
      nextFilter,
      nextRotation,
      undefined,
      nextStrength,
    )

    setPages((current) =>
      current.map((item) =>
        item.id === page.id
          ? {
              ...item,
              ...updates,
              enhanceStrength: nextStrength,
              outputDataUrl: rendered.dataUrl,
              width: rendered.width,
              height: rendered.height,
            }
          : item,
      ),
    )
  }

  async function handleFilterChange(filter: ScanFilterId) {
    if (!selectedPage) {
      return
    }

    const preset = getFilterPreset(filter)
    const nextStrength =
      preset.defaultStrength ?? selectedPage.enhanceStrength
    setBusy({ pageId: selectedPage.id, label: '正在应用滤镜' })

    try {
      await applyVariant(selectedPage, { filter, enhanceStrength: nextStrength })
      setNotice(`已切换到 ${preset.label}`)
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function applyEnhanceStrength(value: number) {
    if (!selectedPage || !filterSupportsEnhanceStrength(selectedPage.filter)) {
      return
    }

    const nextStrength = normalizeEnhanceStrength(value)
    setDraftStrength(null)

    if (nextStrength === selectedPage.enhanceStrength) {
      return
    }

    setBusy({ pageId: selectedPage.id, label: '正在调整增强强度' })

    try {
      await applyVariant(selectedPage, { enhanceStrength: nextStrength })
      setNotice(`增强强度已调整到 ${nextStrength}%`)
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function rotatePage(page: ScanPage, degrees: -90 | 90) {
    setBusy({
      pageId: page.id,
      label: degrees > 0 ? '正在右转页面' : '正在左转页面',
    })

    try {
      await applyVariant(page, {
        rotation: normalizeRotation(page.rotation + degrees),
      })
      setNotice(degrees > 0 ? '页面已向右旋转' : '页面已向左旋转')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function handleAutoScan() {
    if (!selectedPage) {
      return
    }

    setBusy({ pageId: selectedPage.id, label: '正在识别纸张边缘' })

    try {
      await autoCropPage(selectedPage)
      setNotice('已自动裁切并记录边框，可进入手动边框继续微调')
    } catch (error) {
      setNotice(`${getErrorMessage(error)}，已保留原图处理`)
    } finally {
      setBusy(null)
    }
  }

  async function autoCropPages(importedPages: ScanPage[]) {
    let completed = 0
    let failed = 0

    for (const page of importedPages) {
      setBusy({ pageId: page.id, label: `正在自动裁切：${page.name}` })

      try {
        await autoCropPage(page)
        completed += 1
      } catch {
        failed += 1
      }
    }

    return { completed, failed }
  }

  async function autoCropPage(page: ScanPage) {
    setFrameEditorPageId(null)
    setDraftCorners(null)

    if (!isOpenCvReady()) {
      setNotice('正在准备自动裁切，首次可能需要几秒')
      await loadOpenCv()
    }

    const extracted = await autoExtractDocument(page.originalDataUrl)
    await applyVariant(
      {
        ...page,
        baseDataUrl: extracted.dataUrl,
        rotation: 0,
      },
      {
        baseDataUrl: extracted.dataUrl,
        rotation: 0,
      },
    )
    setPages((current) =>
      current.map((item) =>
        item.id === page.id
          ? { ...item, scanned: true, cropCorners: extracted.cropCorners }
          : item,
      ),
    )
  }

  function openFrameEditor() {
    if (!selectedPage) {
      return
    }

    setFrameImageSize(null)
    setFrameEditorPageId(selectedPage.id)
    setDraftCorners(
      cloneCorners(selectedPage.cropCorners ?? getDefaultCorners(selectedPage)),
    )
    setNotice('拖动四个角点贴合纸张边缘，然后点击应用边框')
  }

  async function handleApplyFrame() {
    if (!selectedPage || !draftCorners) {
      return
    }

    const savedCorners = cloneCorners(draftCorners)
    setBusy({ pageId: selectedPage.id, label: '正在应用手动边框' })

    try {
      if (!isOpenCvReady()) {
        setNotice('正在准备边框矫正，首次可能需要几秒')
        await loadOpenCv()
      }

      const extracted = await manualExtractDocument(
        selectedPage.originalDataUrl,
        savedCorners,
      )
      await applyVariant(
        {
          ...selectedPage,
          baseDataUrl: extracted.dataUrl,
          rotation: 0,
        },
        {
          baseDataUrl: extracted.dataUrl,
          rotation: 0,
        },
      )
      setPages((current) =>
        current.map((page) =>
          page.id === selectedPage.id
            ? { ...page, scanned: true, cropCorners: savedCorners }
            : page,
        ),
      )
      setFrameEditorPageId(null)
      setDraftCorners(null)
      setFrameDrag(null)
      setNotice('已按手动边框完成透视矫正')
    } catch (error) {
      setNotice(`${getErrorMessage(error)}，请微调边框后重试`)
    } finally {
      setBusy(null)
    }
  }

  function handleCancelFrameEditor() {
    setFrameEditorPageId(null)
    setDraftCorners(null)
    setFrameDrag(null)
    setNotice('已退出手动边框编辑')
  }

  function handleResetFrameCorners() {
    if (!selectedPage) {
      return
    }

    setDraftCorners(getDefaultCorners(selectedPage))
    setNotice('边框已重置到图片四周')
  }

  async function handleResetPage() {
    if (!selectedPage) {
      return
    }

    setFrameEditorPageId(null)
    setDraftCorners(null)
    setBusy({ pageId: selectedPage.id, label: '正在还原页面' })

    try {
      await applyVariant(
        {
          ...selectedPage,
          baseDataUrl: selectedPage.originalDataUrl,
          rotation: 0,
        },
        {
          baseDataUrl: selectedPage.originalDataUrl,
          rotation: 0,
          enhanceStrength: DEFAULT_ENHANCE_STRENGTH,
        },
      )
      setPages((current) =>
        current.map((page) =>
          page.id === selectedPage.id
            ? {
                ...page,
                scanned: false,
                cropCorners: undefined,
                enhanceStrength: DEFAULT_ENHANCE_STRENGTH,
              }
            : page,
        ),
      )
      setNotice('已还原到原始图片')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function deletePage(pageId: string) {
    setPages((current) => current.filter((page) => page.id !== pageId))
    setSelectedId((current) => {
      if (current !== pageId) {
        return current
      }

      const nextPage = pages.find((page) => page.id !== pageId)
      return nextPage?.id ?? null
    })
    setNotice('页面已删除')
  }

  function movePage(pageId: string, offset: -1 | 1) {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === pageId)
      const nextIndex = index + offset

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const next = [...current]
      const [page] = next.splice(index, 1)
      next.splice(nextIndex, 0, page)
      return next
    })
  }

  function startCornerDrag(
    event: ReactPointerEvent<Element>,
    corner: CornerKey,
  ) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setFrameDrag({ type: 'corner', corner })
    updateDraftCorner(corner, event.clientX, event.clientY)
  }

  function startEdgeDrag(
    event: ReactPointerEvent<SVGLineElement>,
    edge: FrameEdgeKey,
  ) {
    event.preventDefault()

    if (!draftCorners) {
      return
    }

    const point = getImagePointFromClient(event.clientX, event.clientY)

    if (!point) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    setFrameDrag({
      type: 'edge',
      edge,
      startPoint: point,
      startCorners: cloneCorners(draftCorners),
    })
  }

  function handleFrameMove(event: ReactPointerEvent<HTMLElement | SVGElement>) {
    if (!frameDrag) {
      return
    }

    if (frameDrag.type === 'corner') {
      updateDraftCorner(frameDrag.corner, event.clientX, event.clientY)
      return
    }

    updateDraftEdge(frameDrag, event.clientX, event.clientY)
  }

  function updateDraftCorner(corner: CornerKey, clientX: number, clientY: number) {
    const point = getImagePointFromClient(clientX, clientY)

    if (!point) {
      return
    }

    setDraftCorners((current) =>
      current
        ? {
            ...current,
            [corner]: point,
          }
        : current,
    )
  }

  function updateDraftEdge(
    drag: Extract<FrameDragState, { type: 'edge' }>,
    clientX: number,
    clientY: number,
  ) {
    if (!selectedPage) {
      return
    }

    const point = getImagePointFromClient(clientX, clientY)

    if (!point) {
      return
    }

    setDraftCorners(
      moveFrameEdge(
        drag.edge,
        drag.startCorners,
        {
          x: point.x - drag.startPoint.x,
          y: point.y - drag.startPoint.y,
        },
        selectedPage.originalWidth,
        selectedPage.originalHeight,
      ),
    )
  }

  function getImagePointFromClient(clientX: number, clientY: number) {
    const rect = frameImageRef.current?.getBoundingClientRect()

    if (!rect || !selectedPage || rect.width === 0 || rect.height === 0) {
      return null
    }

    return mapClientPointToImagePoint(
      clientX,
      clientY,
      rect,
      selectedPage.originalWidth,
      selectedPage.originalHeight,
    )
  }

  function exportCurrentImage() {
    if (!selectedPage) {
      return
    }

    const pageNumber = selectedIndex >= 0 ? selectedIndex + 1 : 1

    downloadDataUrl(
      selectedPage.outputDataUrl,
      `${getExportBaseName(selectedPage.name, `scan-page-${pageNumber}`)}.jpg`,
    )
    setNotice('当前页面已导出为图片')
  }

  async function exportCurrentPdf() {
    if (!selectedPage) {
      return
    }

    const pageNumber = selectedIndex >= 0 ? selectedIndex + 1 : 1
    const fileName =
      `${getExportBaseName(selectedPage.name, `scan-page-${pageNumber}`)}.pdf`

    setBusy({ pageId: selectedPage.id, label: '正在生成当前页 PDF' })

    try {
      const pdfPages = [
        {
          dataUrl: selectedPage.outputDataUrl,
          name: selectedPage.name,
        },
      ]

      if (IS_WECHAT_BROWSER) {
        const blob = await createPagesPdfBlob(pdfPages, fileName)
        openPdfPreview(blob, fileName)
        setNotice('已生成 PDF 预览，微信内不再触发下载')
        return
      }

      await exportPagesToPdf(pdfPages, fileName)
      setNotice('当前页面已导出为 PDF')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function exportAllImages() {
    if (pages.length === 0) {
      return
    }

    setBusy({ label: '正在打包全部图片' })

    try {
      const zipBlob = createZipFromDataUrls(
        pages.map((page, index) => ({
          name: `${getExportBaseName(page.name, `scan-page-${index + 1}`)}.jpg`,
          dataUrl: page.outputDataUrl,
        })),
      )

      downloadBlob(zipBlob, `scan-images-${getExportDate()}.zip`)
      setNotice('全部页面图片已打包导出')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function exportAllPdf() {
    if (pages.length === 0) {
      return
    }

    setBusy({ label: '正在生成全部页面 PDF' })

    try {
      const pdfPages = pages.map((page) => ({
        dataUrl: page.outputDataUrl,
        name: page.name,
      }))
      const fileName = `scan-${new Date().toISOString().slice(0, 10)}.pdf`

      if (IS_WECHAT_BROWSER) {
        const blob = await createPagesPdfBlob(pdfPages, fileName)
        openPdfPreview(blob, fileName)
        setNotice('已生成多页 PDF 预览，微信内不再触发下载')
        return
      }

      await exportPagesToPdf(pdfPages, fileName)
      setNotice('全部页面 PDF 已生成')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function openPdfPreview(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)

    setPdfPreview((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return { url, fileName }
    })
  }

  function closePdfPreview() {
    setPdfPreview((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return null
    })
  }

  const previewState =
    isFrameEditing && selectedPage ? 'editing' : selectedPage ? 'page' : 'empty'

  return (
    <main className="scanner-shell" data-frame-editing={isFrameEditing}>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
      />
      <input
        ref={cameraInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraFiles}
      />

      <aside className="side-panel left-panel" aria-label="导入和导出">
        <div className="brand-block">
          <div className="brand-mark">
            <ScanLine aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">inWind Docs Scan</p>
            <h1>乘风文档扫描</h1>
          </div>
        </div>

        <div className="action-stack">
          <button
            className="primary-action"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={Boolean(busy)}
          >
            <ImagePlus aria-hidden="true" />
            上传图片
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={Boolean(busy)}
          >
            <Camera aria-hidden="true" />
            拍摄导入
          </button>
        </div>

        <label className="option-toggle">
          <input
            type="checkbox"
            checked={autoCropOnImport}
            onChange={(event) => setAutoCropOnImport(event.currentTarget.checked)}
            disabled={Boolean(busy)}
          />
          <span>
            导入后自动裁切
            <small>适用于上传、拖入和拍摄导入</small>
          </span>
        </label>

        <div className="metric-grid">
          <div>
            <span>{pages.length}</span>
            <p>页面</p>
          </div>
          <div>
            <span>{formatBytes(totalSize)}</span>
            <p>原始体积</p>
          </div>
        </div>

        <div className="export-stack">
          {!IS_WECHAT_BROWSER && (
            <button
              type="button"
              onClick={exportCurrentImage}
              disabled={!selectedPage || Boolean(busy)}
              title="导出当前页 JPG"
            >
              <Download aria-hidden="true" />
              当前页图片
            </button>
          )}
          <button
            type="button"
            onClick={() => void exportAllPdf()}
            disabled={pages.length === 0 || Boolean(busy)}
            title={IS_WECHAT_BROWSER ? '预览所有页面 PDF' : '导出所有页面 PDF'}
          >
            <FileDown aria-hidden="true" />
            {IS_WECHAT_BROWSER ? '预览 PDF' : '多页 PDF'}
          </button>
        </div>

      </aside>

      <section className="workspace" aria-label="扫描工作区">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">处理状态</p>
            <h2>{selectedPage ? selectedPage.name : '等待导入文档'}</h2>
          </div>
          <div className="status-pill" data-busy={Boolean(busy)}>
            {busy ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            <span>{busy?.label ?? notice}</span>
          </div>
        </header>

        <div
          className="preview-stage"
          data-preview-state={previewState}
          ref={selectedPage && !isFrameEditing ? mobilePreviewRef : undefined}
          aria-busy={Boolean(busy)}
          onScroll={selectedPage && !isFrameEditing ? handleMobilePreviewScroll : undefined}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => void handleDrop(event)}
        >
          {isFrameEditing && selectedPage && draftCorners ? (
            <div className="frame-editor">
              <div
                ref={frameCanvasRef}
                className="frame-editor-canvas"
              >
                <div
                  ref={frameImageRef}
                  className="frame-editor-image"
                  style={getFrameImageStyle(frameImageSize)}
                  onPointerMove={handleFrameMove}
                  onPointerUp={() => setFrameDrag(null)}
                  onPointerCancel={() => setFrameDrag(null)}
                >
                  <img src={selectedPage.originalDataUrl} alt={selectedPage.name} />
                  <div className="frame-overlay">
                    <svg
                      className="frame-polygon"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <polygon points={toSvgPoints(draftCorners, selectedPage)} />
                      {FRAME_EDGES.map((edge) => (
                        <line
                          key={edge.key}
                          className="frame-edge-hitbox"
                          {...getEdgeLineProps(edge, draftCorners, selectedPage)}
                          onPointerDown={(event) => startEdgeDrag(event, edge.key)}
                          onPointerMove={handleFrameMove}
                          onPointerUp={() => setFrameDrag(null)}
                          onPointerCancel={() => setFrameDrag(null)}
                          aria-label={`拖动${edge.label}`}
                        />
                      ))}
                    </svg>
                    {CORNERS.map((corner) => (
                      <button
                        key={corner.key}
                        className="corner-handle"
                        type="button"
                        style={getCornerStyle(draftCorners[corner.key], selectedPage)}
                        onPointerDown={(event) => startCornerDrag(event, corner.key)}
                        onPointerMove={handleFrameMove}
                        onPointerUp={() => setFrameDrag(null)}
                        onPointerCancel={() => setFrameDrag(null)}
                        aria-label={`拖动${corner.label}`}
                        title={`拖动${corner.label}`}
                      >
                        <span />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="frame-editor-actions">
                <span>拖动四角或四边贴合纸张边缘</span>
                <button type="button" onClick={handleResetFrameCorners}>
                  重置边框
                </button>
                <button type="button" onClick={handleCancelFrameEditor}>
                  退出
                </button>
                <button
                  className="apply-frame-action"
                  type="button"
                  onClick={() => void handleApplyFrame()}
                >
                  应用边框
                </button>
              </div>
            </div>
          ) : selectedPage ? (
            <>
              <div className="preview-image-frame desktop-preview-frame">
                <img
                  className="desktop-preview-image"
                  src={selectedPage.outputDataUrl}
                  alt={selectedPage.name}
                />
              </div>
              {pages.map((page, index) => (
                <section
                  className="mobile-page-slide"
                  data-selected={page.id === selectedPage.id}
                  key={page.id}
                  aria-label={`第 ${index + 1} 页`}
                >
                  <div className="preview-image-frame mobile-page-image-frame">
                    <img src={page.outputDataUrl} alt={page.name} />
                  </div>
                </section>
              ))}
              <section
                className="mobile-page-slide mobile-import-slide"
                aria-label="继续导入"
              >
                <div className="mobile-import-card">
                  <ImagePlus aria-hidden="true" />
                  <strong>继续导入页面</strong>
                  <div className="mobile-import-actions">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={Boolean(busy)}
                    >
                      <ImagePlus aria-hidden="true" />
                      上传图片
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={Boolean(busy)}
                    >
                      <Camera aria-hidden="true" />
                      拍摄导入
                    </button>
                  </div>
                </div>
              </section>
              {busy?.pageId === selectedPage.id && (
                <div className="preview-busy">
                  <LoaderCircle aria-hidden="true" className="spin" />
                  <span>{busy.label}</span>
                </div>
              )}
            </>
          ) : (
            <div className="empty-sheet">
              <div className="sheet-art">
                <span />
                <span />
                <span />
                <b />
              </div>
              <h2>拖入或上传图片开始扫描</h2>
              <p>支持多图导入、拍照、增强、旋转和 PDF 导出。</p>
              <div className="mobile-empty-actions">
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={Boolean(busy)}
                >
                  <ImagePlus aria-hidden="true" />
                  上传图片
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={Boolean(busy)}
                >
                  <Camera aria-hidden="true" />
                  拍摄导入
                </button>
              </div>
              <label className="empty-auto-crop-toggle">
                <input
                  type="checkbox"
                  checked={autoCropOnImport}
                  onChange={(event) =>
                    setAutoCropOnImport(event.currentTarget.checked)
                  }
                  disabled={Boolean(busy)}
                />
                <span>导入后自动裁切</span>
              </label>
            </div>
          )}
        </div>

        {pages.length > 0 && !isFrameEditing && (
          <div className="mobile-page-strip">
            <span>
              {mobileDisplayIndex >= pages.length
                ? `${pages.length} 页 · 继续导入`
                : `${mobileDisplayIndex + 1} / ${pages.length}`}
            </span>
            {mobileDisplayIndex < pages.length && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(busy)}
              >
                <ImagePlus aria-hidden="true" />
                继续导入
              </button>
            )}
          </div>
        )}

        <div className="tool-band">
          <div className="tool-group">
            <button
              type="button"
              onClick={() => void handleAutoScan()}
              disabled={!selectedPage || Boolean(busy)}
              title="自动识别纸张边缘"
            >
              <Wand2 aria-hidden="true" />
              自动裁切
            </button>
            <button
              type="button"
              onClick={openFrameEditor}
              disabled={!selectedPage || Boolean(busy)}
              title="手动拖动四角边框并透视矫正"
            >
              <Crop aria-hidden="true" />
              手动边框
            </button>
            <button
              type="button"
              onClick={() => selectedPage && void rotatePage(selectedPage, -90)}
              disabled={!selectedPage || Boolean(busy)}
              title="向左旋转当前页面"
            >
              <RotateCcw aria-hidden="true" />
              左转
            </button>
            <button
              type="button"
              onClick={() => selectedPage && void rotatePage(selectedPage, 90)}
              disabled={!selectedPage || Boolean(busy)}
              title="向右旋转当前页面"
            >
              <RotateCw aria-hidden="true" />
              右转
            </button>
            <button
              type="button"
              onClick={() => void handleResetPage()}
              disabled={!selectedPage || Boolean(busy)}
              title="还原到原始图片"
            >
              <RefreshCcw aria-hidden="true" />
              还原
            </button>
          </div>

          <div className="enhance-panel">
            <div className="filter-tabs" role="tablist" aria-label="扫描滤镜">
              {FILTER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedPage?.filter === preset.id}
                  onClick={() => void handleFilterChange(preset.id)}
                  disabled={!selectedPage || Boolean(busy)}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {showEnhanceStrength && selectedPage && selectedPreset && (
              <label className="strength-control">
                <span>
                  增强强度
                  <b>{visibleEnhanceStrength}%</b>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={visibleEnhanceStrength}
                  disabled={Boolean(busy)}
                  aria-label={`${selectedPreset.label}增强强度`}
                  onChange={(event) =>
                    setDraftStrength({
                      pageId: selectedPage.id,
                      filter: selectedPage.filter,
                      value: normalizeEnhanceStrength(
                        event.currentTarget.valueAsNumber,
                      ),
                    })
                  }
                  onPointerUp={(event) =>
                    void applyEnhanceStrength(event.currentTarget.valueAsNumber)
                  }
                  onKeyUp={(event) =>
                    void applyEnhanceStrength(event.currentTarget.valueAsNumber)
                  }
                  onBlur={(event) =>
                    void applyEnhanceStrength(event.currentTarget.valueAsNumber)
                  }
                />
              </label>
            )}
          </div>
        </div>

        <footer className="workspace-footer">
          <span>
            {selectedPage ? `${selectedPage.width} x ${selectedPage.height}` : '无页面'}
          </span>
          <span>{selectedPage?.scanned ? '已透视矫正' : '待裁切'}</span>
        </footer>

        <div
          className="mobile-bottom-tools"
          data-active-tab={mobileToolTab}
          aria-label="移动端工具栏"
        >
          <div className="mobile-tool-tabs" role="tablist" aria-label="工具分类">
            <button
              type="button"
              role="tab"
              aria-selected={mobileToolTab === 'quick'}
              onClick={() => setMobileToolTab('quick')}
            >
              <ScanLine aria-hidden="true" />
              常用
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileToolTab === 'filters'}
              onClick={() => setMobileToolTab('filters')}
            >
              <Sparkles aria-hidden="true" />
              滤镜
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileToolTab === 'pages'}
              onClick={() => setMobileToolTab('pages')}
            >
              <Layers3 aria-hidden="true" />
              页面
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileToolTab === 'export'}
              onClick={() => setMobileToolTab('export')}
            >
              <FileDown aria-hidden="true" />
              导出
            </button>
          </div>

          {mobileToolTab === 'quick' && (
            <div className="mobile-tool-panel" role="tabpanel">
              <div className="mobile-action-row">
                <button
                  type="button"
                  onClick={() => void handleAutoScan()}
                  disabled={!selectedPage || Boolean(busy)}
                  title="自动识别纸张边缘"
                >
                  <Wand2 aria-hidden="true" />
                  自动裁切
                </button>
                <button
                  type="button"
                  onClick={openFrameEditor}
                  disabled={!selectedPage || Boolean(busy)}
                  title="手动拖动四角边框并透视矫正"
                >
                  <Crop aria-hidden="true" />
                  手动边框
                </button>
                <button
                  type="button"
                  onClick={() => selectedPage && void rotatePage(selectedPage, -90)}
                  disabled={!selectedPage || Boolean(busy)}
                  title="向左旋转当前页面"
                >
                  <RotateCcw aria-hidden="true" />
                  左转
                </button>
                <button
                  type="button"
                  onClick={() => selectedPage && void rotatePage(selectedPage, 90)}
                  disabled={!selectedPage || Boolean(busy)}
                  title="向右旋转当前页面"
                >
                  <RotateCw aria-hidden="true" />
                  右转
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetPage()}
                  disabled={!selectedPage || Boolean(busy)}
                  title="还原到原始图片"
                >
                  <RefreshCcw aria-hidden="true" />
                  还原
                </button>
              </div>
            </div>
          )}

          {mobileToolTab === 'filters' && (
            <div className="mobile-tool-panel" role="tabpanel">
              <div className="mobile-filter-row" role="tablist" aria-label="扫描滤镜">
                {MOBILE_FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedPage?.filter === preset.id}
                    onClick={() => void handleFilterChange(preset.id)}
                    disabled={!selectedPage || Boolean(busy)}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mobileToolTab === 'pages' && (
            <div className="mobile-tool-panel mobile-pages-panel" role="tabpanel">
              <div className="mobile-page-manager">
                {pages.length === 0 && (
                  <div className="mobile-page-empty">
                    <FileImage aria-hidden="true" />
                    <span>还没有页面</span>
                  </div>
                )}

                {pages.map((page, index) => (
                  <article
                    key={page.id}
                    className="mobile-page-item"
                    data-selected={page.id === selectedPage?.id}
                  >
                    <button
                      className="mobile-page-thumb"
                      type="button"
                      onClick={() => setSelectedId(page.id)}
                      aria-label={`选择第 ${index + 1} 页`}
                    >
                      <img src={page.outputDataUrl} alt="" />
                    </button>
                    <div className="mobile-page-info">
                      <strong>{index + 1}. {page.name}</strong>
                      <span>{page.scanned ? '已裁切' : '未裁切'} · {page.rotation}°</span>
                    </div>
                    <div className="mobile-page-actions">
                      <button
                        type="button"
                        onClick={() => movePage(page.id, -1)}
                        disabled={index === 0 || Boolean(busy)}
                        title="上移"
                      >
                        <ArrowUp aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePage(page.id, 1)}
                        disabled={index === pages.length - 1 || Boolean(busy)}
                        title="下移"
                      >
                        <ArrowDown aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void rotatePage(page, -90)}
                        disabled={Boolean(busy)}
                        title="左转"
                      >
                        <RotateCcw aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void rotatePage(page, 90)}
                        disabled={Boolean(busy)}
                        title="右转"
                      >
                        <RotateCw aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePage(page.id)}
                        disabled={Boolean(busy)}
                        title="删除"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {mobileToolTab === 'export' && (
            <div className="mobile-tool-panel" role="tabpanel">
              <div className="mobile-export-row">
                {!IS_WECHAT_BROWSER && (
                  <button
                    type="button"
                    onClick={exportCurrentImage}
                    disabled={!selectedPage || Boolean(busy)}
                    title="导出当前页 JPG"
                  >
                    <Download aria-hidden="true" />
                    当前页图片
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void exportCurrentPdf()}
                  disabled={!selectedPage || Boolean(busy)}
                  title={IS_WECHAT_BROWSER ? '预览当前页 PDF' : '导出当前页 PDF'}
                >
                  <FileDown aria-hidden="true" />
                  {IS_WECHAT_BROWSER ? '预览当前页 PDF' : '当前页 PDF'}
                </button>
                {!IS_WECHAT_BROWSER && (
                  <button
                    type="button"
                    onClick={() => void exportAllImages()}
                    disabled={pages.length === 0 || Boolean(busy)}
                    title="导出全部页面图片"
                  >
                    <FileImage aria-hidden="true" />
                    全部图片
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void exportAllPdf()}
                  disabled={pages.length === 0 || Boolean(busy)}
                  title={IS_WECHAT_BROWSER ? '预览全部页面 PDF' : '导出全部页面 PDF'}
                >
                  <FileDown aria-hidden="true" />
                  {IS_WECHAT_BROWSER ? '预览全部 PDF' : '全部 PDF'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="side-panel page-panel" aria-label="页面列表">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">文档页面</p>
            <h2>排序与管理</h2>
          </div>
          <Layers3 aria-hidden="true" />
        </div>

        <div className="page-list">
          {pages.length === 0 && (
            <div className="page-empty">
              <FileImage aria-hidden="true" />
              <p>还没有页面</p>
            </div>
          )}

          {pages.map((page, index) => (
            <article
              key={page.id}
              className="page-card"
              data-selected={page.id === selectedPage?.id}
            >
              <button
                className="page-preview"
                type="button"
                onClick={() => setSelectedId(page.id)}
              >
                <img src={page.outputDataUrl} alt="" />
              </button>
              <div className="page-meta">
                <strong>
                  {index + 1}. {page.name}
                </strong>
                <span>
                  {page.scanned ? '已裁切' : '未裁切'} · {page.filter} ·{' '}
                  {page.rotation}°
                </span>
              </div>
              <div className="page-actions">
                <button
                  type="button"
                  onClick={() => movePage(page.id, -1)}
                  disabled={index === 0 || Boolean(busy)}
                  title="上移"
                >
                  <ArrowUp aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => movePage(page.id, 1)}
                  disabled={index === pages.length - 1 || Boolean(busy)}
                  title="下移"
                >
                  <ArrowDown aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void rotatePage(page, -90)}
                  disabled={Boolean(busy)}
                  title="左转"
                >
                  <RotateCcw aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void rotatePage(page, 90)}
                  disabled={Boolean(busy)}
                  title="右转"
                >
                  <RotateCw aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => deletePage(page.id)}
                  disabled={Boolean(busy)}
                  title="删除"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </aside>

      {pdfPreview && (
        <div className="pdf-preview-overlay" role="dialog" aria-modal="true">
          <div className="pdf-preview-panel">
            <header className="pdf-preview-header">
              <div>
                <p className="eyebrow">PDF 预览</p>
                <h2>{pdfPreview.fileName}</h2>
              </div>
              <button
                type="button"
                onClick={closePdfPreview}
                title="关闭 PDF 预览"
                aria-label="关闭 PDF 预览"
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <iframe
              title={pdfPreview.fileName}
              src={pdfPreview.url}
              className="pdf-preview-frame"
            />
            {IS_WECHAT_BROWSER && (
              <p className="pdf-preview-note">
                微信内已隐藏图片下载。若需要作为文件转发，请使用浏览器打开或后续接入服务端文件链接。
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function getDefaultCorners(page: ScanPage): CornerPoints {
  const marginX = page.originalWidth * 0.07
  const marginY = page.originalHeight * 0.07

  return {
    topLeftCorner: { x: marginX, y: marginY },
    topRightCorner: { x: page.originalWidth - marginX, y: marginY },
    bottomLeftCorner: { x: marginX, y: page.originalHeight - marginY },
    bottomRightCorner: {
      x: page.originalWidth - marginX,
      y: page.originalHeight - marginY,
    },
  }
}

function cloneCorners(corners: CornerPoints): CornerPoints {
  return {
    topLeftCorner: { ...corners.topLeftCorner },
    topRightCorner: { ...corners.topRightCorner },
    bottomLeftCorner: { ...corners.bottomLeftCorner },
    bottomRightCorner: { ...corners.bottomRightCorner },
  }
}

function toSvgPoints(corners: CornerPoints, page: ScanPage) {
  return [
    corners.topLeftCorner,
    corners.topRightCorner,
    corners.bottomRightCorner,
    corners.bottomLeftCorner,
  ]
    .map((point) => {
      const x = (point.x / page.originalWidth) * 100
      const y = (point.y / page.originalHeight) * 100
      return `${x},${y}`
    })
    .join(' ')
}

function getCornerStyle(point: CornerPoint, page: ScanPage) {
  return {
    left: `${(point.x / page.originalWidth) * 100}%`,
    top: `${(point.y / page.originalHeight) * 100}%`,
  }
}

function getEdgeLineProps(
  edge: (typeof FRAME_EDGES)[number],
  corners: CornerPoints,
  page: ScanPage,
) {
  const from = corners[edge.from]
  const to = corners[edge.to]

  return {
    x1: (from.x / page.originalWidth) * 100,
    y1: (from.y / page.originalHeight) * 100,
    x2: (to.x / page.originalWidth) * 100,
    y2: (to.y / page.originalHeight) * 100,
  }
}

function getFrameImageStyle(size: FrameSize | null) {
  if (!size) {
    return undefined
  }

  return {
    width: `${size.width}px`,
    height: `${size.height}px`,
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function getExportDate() {
  return new Date().toISOString().slice(0, 10)
}

function getExportBaseName(name: string, fallback: string) {
  const safeName = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)

  return safeName || fallback
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return '操作失败，请重试'
}

export default App
