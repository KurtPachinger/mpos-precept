# mpos-precept
Imposter layout to represent DOM rects as THREE bounds.

### Process
```mermaid
flowchart TB

window-.-selector
subgraph selector
 direction TB
 child--softmax-->parent
 parent--depth-->child
end


grade("Pre-grade. Classify ancestors to hide node.")
  

grade-.-b
selector--userData-->Box3-->a



subgraph type
  direction TB

  a("1x: semantic, viewport, hardmax")
  a-.-tag{blacklist}
  a-->b{interactive}
  b---canvas("2x: img, text")
  b---css3d("3x: form, video")

end

canvas-->html2canvas
css3d-->CSS3DRenderer
```

### structure 
- `blacklist` (block) -- `.ignore,style,script,link,meta,base,keygen,canvas[data-engine],param,source,track,area,br,wbr`
- `whitelist` (allow) -- `div,span,main,section,article,nav,header,footer,aside,figure,details,li,ul,ol`
### composite
- `html2canvas` (legible) -- `canvas,img,svg,h1,h2,h3,h4,h5,h6,p,li,ul,ol,dt,dd`
- `CSS3DRenderer` (interactive) -- `iframe,frame,embed,object,table,form,details,video,audio`
- `mixed-content` (test resource) -- `canvas,svg,object,embed,audio`
- `dimensions` (track, crash) -- `1 > n < 3840`
