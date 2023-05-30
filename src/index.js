import './styles.scss'
import mpos from './mpos.js'

mpos.init()
window.onload = mpos.add.dom().then((res) => {
  console.log(res)
  mpos.var.animate()
  //
  mpos.gen(8)
})
