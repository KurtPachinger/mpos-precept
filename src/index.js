import './styles.scss'
import mpos from './mpos.js'

// mode: standalone
mpos.init()
mpos.gen()
mpos.add.dom().then(function (grade) {
  console.log('grade', grade)
})

// mode: proxy
/*
import { Scene, PerspectiveCamera, WebGLRenderer, MeshBasicMaterial, BoxGeometry, Mesh } from 'three'
const container = document.getElementById('THREE')
const scene = new Scene()
var camera = new PerspectiveCamera(45, 1, 0.01, 1920 * 16)
camera.position.z = 640
var renderer = new WebGLRenderer()
renderer.setClearColor(0x00ff00, 0)
renderer.setSize(container.offsetWidth, container.offsetHeight)
container.appendChild(renderer.domElement)

const test = new Mesh(new BoxGeometry(320, 320, 320), new MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 }))
scene.add(test)
renderer.render(scene, camera)

//mpos.init({ scene: scene, camera: camera, renderer: renderer })
window.camera = camera
window.scene = scene
window.renderer = renderer
*/
