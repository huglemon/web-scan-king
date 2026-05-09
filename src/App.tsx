import type {
  ChangeEvent,
  DragEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Camera,
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
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import './App.css'
import {
  FILTER_PRESETS,
  type ScanFilterId,
  createPageName,
  downloadDataUrl,
  formatBytes,
  loadImage,
  normalizeRotation,
  readFileAsDataUrl,
  renderImageVariant,
} from './lib/image'
import { exportPagesToPdf } from './lib/pdf'
import {
  autoExtractDocument,
  type CornerKey,
  type CornerPoint,
  type CornerPoints,
  isOpenCvReady,
  loadOpenCv,
  manualExtractDocument,
} from './lib/scan'

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
  rotation: number
  scanned: boolean
  cropCorners?: CornerPoints
}

type BusyState = {
  pageId?: string
  label: string
}

const DEFAULT_FILTER: ScanFilterId = 'clean'

const CORNERS: Array<{ key: CornerKey; label: string }> = [
  { key: 'topLeftCorner', label: '左上角' },
  { key: 'topRightCorner', label: '右上角' },
  { key: 'bottomRightCorner', label: '右下角' },
  { key: 'bottomLeftCorner', label: '左下角' },
]

function App() {
  const [pages, setPages] = useState<ScanPage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyState | null>(null)
  const [notice, setNotice] = useState('导入图片后即可开始处理')
  const [cameraActive, setCameraActive] = useState(false)
  const [openCvState, setOpenCvState] = useState(
    isOpenCvReady() ? 'ready' : 'idle',
  )
  const [frameEditorPageId, setFrameEditorPageId] = useState<string | null>(
    null,
  )
  const [draftCorners, setDraftCorners] = useState<CornerPoints | null>(null)
  const [draggingCorner, setDraggingCorner] = useState<CornerKey | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameCanvasRef = useRef<HTMLDivElement>(null)

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedId) ?? pages[0] ?? null,
    [pages, selectedId],
  )
  const totalSize = pages.reduce((sum, page) => sum + page.sourceSize, 0)
  const isFrameEditing = Boolean(
    selectedPage &&
      draftCorners &&
      selectedPage.id === frameEditorPageId &&
      !busy,
  )

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

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
      rotation: 0,
      scanned: false,
    }

    setPages((current) => [...current, page])
    setSelectedId(page.id)
    setNotice(`已添加 ${name}`)
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    await importFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  async function importFiles(inputFiles: File[]) {
    const files = inputFiles.filter((file) => file.type.startsWith('image/'))

    if (files.length === 0) {
      setNotice('请选择 JPG、PNG、WebP 等图片文件')
      return
    }

    setBusy({ label: `正在导入 ${files.length} 张图片` })

    try {
      for (const [index, file] of files.entries()) {
        const dataUrl = await readFileAsDataUrl(file)
        await addImagePage(
          dataUrl,
          createPageName(pages.length + index, file.name),
          file.size,
        )
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

  async function applyVariant(
    page: ScanPage,
    updates: Partial<Pick<ScanPage, 'baseDataUrl' | 'filter' | 'rotation'>>,
  ) {
    const nextBase = updates.baseDataUrl ?? page.baseDataUrl
    const nextFilter = updates.filter ?? page.filter
    const nextRotation = updates.rotation ?? page.rotation
    const rendered = await renderImageVariant(nextBase, nextFilter, nextRotation)

    setPages((current) =>
      current.map((item) =>
        item.id === page.id
          ? {
              ...item,
              ...updates,
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

    setBusy({ pageId: selectedPage.id, label: '正在应用滤镜' })

    try {
      await applyVariant(selectedPage, { filter })
      setNotice(
        `已切换到 ${FILTER_PRESETS.find((item) => item.id === filter)?.label}`,
      )
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

    setFrameEditorPageId(null)
    setDraftCorners(null)
    setBusy({ pageId: selectedPage.id, label: '正在识别纸张边缘' })

    try {
      if (!isOpenCvReady()) {
        setOpenCvState('loading')
        setNotice('正在加载 OpenCV.js，首次可能需要几秒')
        await loadOpenCv()
      }

      setOpenCvState('ready')
      const extracted = await autoExtractDocument(selectedPage.originalDataUrl)
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
          page.id === selectedPage.id ? { ...page, scanned: true } : page,
        ),
      )
      setNotice('已自动裁切并完成透视矫正')
    } catch (error) {
      setNotice(`${getErrorMessage(error)}，已保留原图处理`)
      setOpenCvState(isOpenCvReady() ? 'ready' : 'idle')
    } finally {
      setBusy(null)
    }
  }

  function openFrameEditor() {
    if (!selectedPage) {
      return
    }

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
        setOpenCvState('loading')
        setNotice('正在加载 OpenCV.js，首次可能需要几秒')
        await loadOpenCv()
      }

      setOpenCvState('ready')
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
      setNotice('已按手动边框完成透视矫正')
    } catch (error) {
      setNotice(`${getErrorMessage(error)}，请微调边框后重试`)
      setOpenCvState(isOpenCvReady() ? 'ready' : 'idle')
    } finally {
      setBusy(null)
    }
  }

  function handleCancelFrameEditor() {
    setFrameEditorPageId(null)
    setDraftCorners(null)
    setDraggingCorner(null)
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
        },
      )
      setPages((current) =>
        current.map((page) =>
          page.id === selectedPage.id
            ? { ...page, scanned: false, cropCorners: undefined }
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

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice('当前浏览器不支持摄像头调用')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      streamRef.current = stream
      setCameraActive(true)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setNotice('摄像头已开启，调整画面后点击拍摄')
    } catch (error) {
      setNotice(getErrorMessage(error))
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  async function captureFrame() {
    const video = videoRef.current

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setNotice('摄像头画面还没有准备好')
      return
    }

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      setNotice('当前浏览器不支持 Canvas 截图')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    setBusy({ label: '正在保存拍摄页' })

    try {
      await addImagePage(
        canvas.toDataURL('image/jpeg', 0.92),
        `拍摄页 ${pages.length + 1}`,
      )
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
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: CornerKey,
  ) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingCorner(corner)
    updateDraftCorner(corner, event.clientX, event.clientY)
  }

  function handleCornerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!draggingCorner) {
      return
    }

    updateDraftCorner(draggingCorner, event.clientX, event.clientY)
  }

  function updateDraftCorner(corner: CornerKey, clientX: number, clientY: number) {
    const rect = frameCanvasRef.current?.getBoundingClientRect()

    if (!rect || !selectedPage || rect.width === 0 || rect.height === 0) {
      return
    }

    const x = clamp(
      ((clientX - rect.left) / rect.width) * selectedPage.originalWidth,
      0,
      selectedPage.originalWidth,
    )
    const y = clamp(
      ((clientY - rect.top) / rect.height) * selectedPage.originalHeight,
      0,
      selectedPage.originalHeight,
    )

    setDraftCorners((current) =>
      current
        ? {
            ...current,
            [corner]: { x, y },
          }
        : current,
    )
  }

  function exportCurrentPng() {
    if (!selectedPage) {
      return
    }

    downloadDataUrl(
      selectedPage.outputDataUrl,
      `${selectedPage.name || 'scan-page'}.jpg`,
    )
    setNotice('当前页面已导出为图片')
  }

  async function exportPdf() {
    if (pages.length === 0) {
      return
    }

    setBusy({ label: '正在生成 PDF' })

    try {
      await exportPagesToPdf(
        pages.map((page) => ({
          dataUrl: page.outputDataUrl,
          name: page.name,
        })),
        `scan-${new Date().toISOString().slice(0, 10)}.pdf`,
      )
      setNotice('PDF 已生成')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="scanner-shell">
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
      />

      <aside className="side-panel left-panel" aria-label="导入和导出">
        <div className="brand-block">
          <div className="brand-mark">
            <ScanLine aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Web Scan King</p>
            <h1>本地文档扫描台</h1>
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
            onClick={cameraActive ? stopCamera : startCamera}
            disabled={Boolean(busy)}
          >
            {cameraActive ? <X aria-hidden="true" /> : <Camera aria-hidden="true" />}
            {cameraActive ? '关闭相机' : '打开相机'}
          </button>
        </div>

        <div className="camera-box" data-active={cameraActive}>
          <video ref={videoRef} playsInline muted />
          {!cameraActive && (
            <div className="camera-placeholder">
              <Camera aria-hidden="true" />
              <span>相机预览</span>
            </div>
          )}
        </div>

        <button
          className="capture-action"
          type="button"
          onClick={captureFrame}
          disabled={!cameraActive || Boolean(busy)}
        >
          <FileImage aria-hidden="true" />
          拍摄当前画面
        </button>

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
          <button
            type="button"
            onClick={exportCurrentPng}
            disabled={!selectedPage || Boolean(busy)}
            title="导出当前页 JPG"
          >
            <Download aria-hidden="true" />
            当前页图片
          </button>
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={pages.length === 0 || Boolean(busy)}
            title="导出所有页面 PDF"
          >
            <FileDown aria-hidden="true" />
            多页 PDF
          </button>
        </div>

        <div className="privacy-note">
          <ShieldCheck aria-hidden="true" />
          <p>图片处理在浏览器本地完成。自动裁切首次会加载 OpenCV.js。</p>
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
          aria-busy={Boolean(busy)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => void handleDrop(event)}
        >
          {isFrameEditing && selectedPage && draftCorners ? (
            <div className="frame-editor">
              <div
                ref={frameCanvasRef}
                className="frame-editor-canvas"
                onPointerMove={handleCornerMove}
                onPointerUp={() => setDraggingCorner(null)}
                onPointerCancel={() => setDraggingCorner(null)}
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
                  </svg>
                  {CORNERS.map((corner) => (
                    <button
                      key={corner.key}
                      className="corner-handle"
                      type="button"
                      style={getCornerStyle(draftCorners[corner.key], selectedPage)}
                      onPointerDown={(event) => startCornerDrag(event, corner.key)}
                      onPointerMove={handleCornerMove}
                      onPointerUp={() => setDraggingCorner(null)}
                      onPointerCancel={() => setDraggingCorner(null)}
                      aria-label={`拖动${corner.label}`}
                      title={`拖动${corner.label}`}
                    >
                      <span />
                    </button>
                  ))}
                </div>
              </div>
              <div className="frame-editor-actions">
                <span>拖动四个角点贴合纸张边缘</span>
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
              <img src={selectedPage.outputDataUrl} alt={selectedPage.name} />
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
            </div>
          )}
        </div>

        <div className="tool-band">
          <div className="tool-group">
            <button
              type="button"
              onClick={() => void handleAutoScan()}
              disabled={!selectedPage || Boolean(busy)}
              title="使用 jscanify / OpenCV.js 自动识别纸张"
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
        </div>

        <footer className="workspace-footer">
          <span>
            OpenCV:{' '}
            {openCvState === 'ready'
              ? '已就绪'
              : openCvState === 'loading'
                ? '加载中'
                : '按需加载'}
          </span>
          <span>
            {selectedPage ? `${selectedPage.width} x ${selectedPage.height}` : '无页面'}
          </span>
          <span>{selectedPage?.scanned ? '已透视矫正' : '原图/滤镜模式'}</span>
        </footer>
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return '操作失败，请重试'
}

export default App
