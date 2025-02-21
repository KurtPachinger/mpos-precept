//importScripts('mpos.js')
self.onmessage = function (e) {
  console.log('WW data:', e.data)
  switch (e.data.msg) {
    case 'atlas':
      break
  }
  postMessage('message...')

  // batch, send next on receipt, requestIdleCallback
}
