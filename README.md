# mpos-precept
Imposter layout to represent DOM rects as THREE bounds.

### Process
```mermaid
flowchart TB

subgraph type
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
