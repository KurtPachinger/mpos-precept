//importScripts('mpos.js')
self.onmessage = function (e) {
  console.log('WW data:', e.data)
  switch (e.data.msg) {
    case 'atlas':
      postMessage('data...')
      break
  }

  //devnook.github.io/OffscreenCanvasDemo/use-with-lib.html
}
