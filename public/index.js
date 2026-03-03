import { mpos } from './mpos.js'

//
// Await
//const mp = setInterval(() => {
//  if (
//    typeof window.mpos !== "undefined" &&
//    document.readyState === "complete" &&
//    !document.hidden
//  ) {
//    clearInterval(mp);

// Load template
const uri = 'xml_suite.html'
mpos.fnVar('load', uri, { io: 'xml', node: 'main' }).then((fetch) => {
  // Options may set Proxy (scene,camera,renderer) and config
  const options = {}
  if (uri === 'xml_adslot.html') {
    // Proxy {scene, camera, renderer}
    // or (new) init options configurations
    options.config = {
      camera: 'Orthographic'
      //renderer: document.querySelector('#adspace')
    }
  }

  // init with event listeners
  mpos.init(options).then((res) => {
    // Add DOM content (and run inline scripts)
    mpos.mod.add()
  })
})
//  }
//}, 250);

//
// User events (native or synthetic)
document.body.addEventListener(
  'click',
  (e) => {
    const target = e.target
    if (!['mp'].includes(e.target.id)) {
      target.classList.toggle('active')
    }

    if (target.nodeName === 'VIDEO') {
      if (target.paused) target.play()
      else target.pause()
    }
  },
  false
)
