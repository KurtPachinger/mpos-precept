# mpos-precept
Imposter layout to represent DOM rects as THREE bounds.

### Process
```mermaid
flowchart LR

precount-.-type
subgraph type
  direction LR
  b("1x: semantic, viewport, hardmax")
  canvas("2x: img, text")
  css3d("3x: video, form")
end

window-.-selector
subgraph selector
 direction TB
 child--maxnode-->parent
 parent--depth-->child


end
selector---box-->type

canvas-->html2canvas
css3d-->CSS3DRenderer
```
