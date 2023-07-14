import './styles.scss'
import mpos from './mpos.js'

mpos.init()
mpos.gen()
mpos.add.dom().then(function (grade) {
  console.log('grade', grade)
})
