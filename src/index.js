import './styles.scss'
import mpos from './mpos.js'

mpos.init()
mpos.gen(8)
window.onload = mpos.add.dom().then((res) => {
  console.log(res)
  mpos.var.animate()
})
