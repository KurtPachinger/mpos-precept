//importScripts('mpos.js')
self.onmessage = function (e) {
  console.log('WW data:', e.data)
  switch (e.data.msg) {
    case 'atlas':
      postMessage('data...')
      break
  }

  // batch, send next on receipt, requestIdleCallback
}

//
//import init from './scene.js'
//function init( canvas, width, height, pixelRatio, path ) {

/*
renderer = new THREE.WebGLRenderer( { antialias: true, canvas: canvas } );
renderer.setPixelRatio( pixelRatio );
renderer.setSize( width, height, false );

animate();
*/
//}
/*
self.onmessage = function (message) {
  const data = message.data
  init(data.drawingSurface, data.width, data.height, data.pixelRatio, data.path)
}
*/
