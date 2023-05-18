# mpos-precept
Imposter layout to represent DOM rects as THREE bounds.

### Process
```mermaid
flowchart LR

window-.-selector
subgraph selector
 direction TB
 child--softmax-->parent
 parent--depth-->child
end
selector---box-->type

precount-.-type
subgraph type
  direction LR
  b("1x: semantic, viewport, hardmax")
  canvas("2x: img, text")
  css3d("3x: video, form")
end

canvas-->html2canvas
css3d-->CSS3DRenderer
```
