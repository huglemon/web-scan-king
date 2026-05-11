export type WechatPdfPreviewFile = {
  url: string
  fileName: string
  size: number
}

type WechatPreviewResult = {
  errMsg?: string
  err_msg?: string
}

type WechatInvoke = (
  api: string,
  params: Record<string, unknown>,
  callback?: (result: WechatPreviewResult) => void,
) => void

type WechatBridge = {
  invoke: WechatInvoke
}

type WechatSdk = {
  invoke?: WechatInvoke
  previewFile?: (
    params: Record<string, unknown> & {
      success?: (result: WechatPreviewResult) => void
      fail?: (result: WechatPreviewResult) => void
    },
  ) => void
}

declare global {
  interface Window {
    WeixinJSBridge?: WechatBridge
    wx?: WechatSdk
    jWeixin?: WechatSdk
  }
}

export function isWechatBrowser(userAgent = globalThis.navigator?.userAgent ?? '') {
  return /MicroMessenger/i.test(userAgent)
}

export async function openWechatPdfPreview(
  file: WechatPdfPreviewFile,
  timeoutMs = 1800,
) {
  const params = {
    url: file.url,
    name: file.fileName,
    size: file.size,
    fileType: 'pdf',
    fileName: file.fileName,
    fileSize: file.size,
  }
  const sdk = globalThis.window?.wx ?? globalThis.window?.jWeixin

  if (sdk?.previewFile) {
    await invokePreviewFileApi(
      (callback) =>
        sdk.previewFile?.({
          ...params,
          success: callback,
          fail: callback,
        }),
      timeoutMs,
    )
    return
  }

  if (sdk?.invoke) {
    await invokePreviewFileApi(
      (callback) => sdk.invoke?.('previewFile', params, callback),
      timeoutMs,
    )
    return
  }

  const bridge = await waitForWeixinBridge(timeoutMs)

  await invokePreviewFileApi(
    (callback) => bridge.invoke('previewFile', params, callback),
    timeoutMs,
  )
}

function invokePreviewFileApi(
  invoke: (callback: (result: WechatPreviewResult) => void) => void,
  timeoutMs: number,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const timeout = globalThis.window.setTimeout(() => {
      finish(new Error('微信文件预览接口无响应'))
    }, timeoutMs)

    const finish = (error?: Error) => {
      if (settled) {
        return
      }

      settled = true
      globalThis.window.clearTimeout(timeout)

      if (error) {
        reject(error)
        return
      }

      resolve()
    }

    try {
      invoke((result) => {
        const message = String(result?.errMsg ?? result?.err_msg ?? '').toLowerCase()

        if (!message || message.includes(':ok')) {
          finish()
          return
        }

        finish(new Error(`微信文件预览失败：${message}`))
      })
    } catch (error) {
      finish(error instanceof Error ? error : new Error('微信文件预览调用失败'))
    }
  })
}

function waitForWeixinBridge(timeoutMs: number) {
  return new Promise<WechatBridge>((resolve, reject) => {
    if (globalThis.window?.WeixinJSBridge) {
      resolve(globalThis.window.WeixinJSBridge)
      return
    }

    if (!globalThis.document) {
      reject(new Error('当前环境不支持微信文件预览'))
      return
    }

    const timeout = globalThis.window.setTimeout(() => {
      cleanup()
      reject(new Error('微信文件预览接口不可用'))
    }, timeoutMs)

    const handleReady = () => {
      const bridge = globalThis.window?.WeixinJSBridge

      cleanup()

      if (bridge) {
        resolve(bridge)
        return
      }

      reject(new Error('微信文件预览接口不可用'))
    }

    const cleanup = () => {
      globalThis.window.clearTimeout(timeout)
      globalThis.document.removeEventListener('WeixinJSBridgeReady', handleReady)
    }

    globalThis.document.addEventListener('WeixinJSBridgeReady', handleReady)
  })
}
