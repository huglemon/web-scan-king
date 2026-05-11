import { loadImage } from './image'

export type PdfPageInput = {
  dataUrl: string
  name: string
}

export type PdfRect = {
  x: number
  y: number
  width: number
  height: number
}

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const DEFAULT_MARGIN_MM = 8

export function calculateContainRect(
  imageWidth: number,
  imageHeight: number,
  pageWidth = A4_WIDTH_MM,
  pageHeight = A4_HEIGHT_MM,
  margin = DEFAULT_MARGIN_MM,
): PdfRect {
  const availableWidth = pageWidth - margin * 2
  const availableHeight = pageHeight - margin * 2
  const scale = Math.min(
    availableWidth / imageWidth,
    availableHeight / imageHeight,
  )
  const width = imageWidth * scale
  const height = imageHeight * scale

  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  }
}

export async function exportPagesToPdf(
  pages: PdfPageInput[],
  fileName = 'scan-document.pdf',
) {
  const blob = await createPagesPdfBlob(pages, fileName)

  downloadPdfBlob(blob, fileName)
}

export async function createPagesPdfBlob(
  pages: PdfPageInput[],
  fileName = 'scan-document.pdf',
) {
  if (pages.length === 0) {
    throw new Error('没有可导出的页面')
  }

  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF('p', 'mm', 'a4')
  pdf.setProperties({
    title: fileName.replace(/\.pdf$/i, ''),
    subject: 'inWind Docs Scan document export',
    creator: 'inWind Docs Scan',
  })

  for (const [index, page] of pages.entries()) {
    const image = await loadImage(page.dataUrl)

    if (index > 0) {
      pdf.addPage('a4', 'p')
    }

    const rect = calculateContainRect(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
    )

    pdf.addImage(
      page.dataUrl,
      getImageFormat(page.dataUrl),
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    )
  }

  return pdf.output('blob')
}

function getImageFormat(dataUrl: string) {
  if (dataUrl.startsWith('data:image/png')) {
    return 'PNG'
  }

  return 'JPEG'
}

function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
